// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { context, ROOT_CONTEXT, trace, TraceFlags } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordQueue, settle, startMessagingStack, type MessagingTestStack } from '../outbox/messaging.testkit';
import { writeEvent } from '../outbox/outbox';
import { OutboxRelay } from '../outbox/relay';
import { withAccountTransaction } from '../tenancy/transaction';
import { uuidv7 } from '../tenancy/uuid';
import { emitAudit, type AuditInput } from './audit';
import * as auditApi from './index';

const ACCOUNT = uuidv7();
const PROJECT = uuidv7();
const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };

function approval(overrides: Partial<AuditInput> = {}): AuditInput {
  return {
    producer: 'planning',
    accountId: ACCOUNT,
    projectId: PROJECT,
    actor: { type: 'researcher', accountId: ACCOUNT },
    action: 'plan_version.approved',
    objectType: 'plan_version',
    objectId: uuidv7(),
    objectVersion: 3,
    fromState: 'Proposed',
    toState: 'Approved',
    apr: 'APR-01',
    summary: 'Researcher duyệt Plan Version 3',
    ...overrides,
  };
}

describe('audit-emit qua outbox trên PostgreSQL và RabbitMQ thật (PID-00002 S04)', { timeout: 30_000 }, () => {
  let stack: MessagingTestStack;
  let relay: OutboxRelay;
  const outboxRows = (ids: string[]) =>
    stack.database.admin<{ id: string; kind: string; routing_key: string; aggregate_type: string; aggregate_id: string; aggregate_version: number; payload: Record<string, unknown> }>(
      'SELECT id, kind, routing_key, aggregate_type, aggregate_id, aggregate_version, payload FROM app.outbox WHERE id = ANY($1::uuid[])',
      [ids],
    );

  beforeAll(async () => {
    stack = await startMessagingStack();
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    relay = new OutboxRelay({ db: stack.systemDb, amqpUrl: stack.rabbit.amqpUrl, service: 'planning', logger: silent });
  }, 300_000);

  afterAll(async () => {
    await relay?.stop();
    context.disable();
    await stack?.stop();
  }, 60_000);

  it('rollback không để lại outbox và Audit Event (PID-00002-AC01, DATA-PERSIST-001-AC01, NFR-DUR-001-AC01)', async () => {
    const everything = await recordQueue(stack.rabbit.amqpUrl, { patterns: ['#'] });
    const noteId = uuidv7();
    const written: string[] = [];
    await expect(
      withAccountTransaction(stack.appDb, ACCOUNT, async (tx) => {
        // The state change, its event and its Audit Event, then a failure before commit.
        await tx.execute(sql`INSERT INTO app.note (id, account_id, body) VALUES (${noteId}, ${ACCOUNT}, 'Approved')`);
        const event = await writeEvent(tx, {
          producer: 'planning',
          type: 'plan_version.status_changed',
          accountId: ACCOUNT,
          aggregate: { type: 'plan_version', id: noteId, version: 2 },
          data: { objectType: 'plan_version', objectId: noteId, toState: 'Approved' },
        });
        const audit = await emitAudit(tx, approval({ objectId: noteId }));
        written.push(event.id, audit.id);
        throw new Error('lỗi trước commit');
      }),
    ).rejects.toThrow('lỗi trước commit');
    expect(written).toHaveLength(2);
    expect(await outboxRows(written)).toEqual([]);
    expect(await stack.database.admin('SELECT 1 FROM app.note WHERE id = $1', [noteId])).toEqual([]);
    expect(await relay.runOnce()).toEqual({ leader: true, published: 0, failed: 0 });
    await settle();
    expect(everything.messages).toEqual([]);

    // Committed together: the change and its Audit Event are both there, and the relay publishes audit.recorded.
    const audited = await withAccountTransaction(stack.appDb, ACCOUNT, async (tx) => {
      await tx.execute(sql`INSERT INTO app.note (id, account_id, body) VALUES (${noteId}, ${ACCOUNT}, 'Approved')`);
      return emitAudit(tx, approval({ objectId: noteId }));
    });
    expect(await relay.runOnce()).toEqual({ leader: true, published: 1, failed: 0 });
    const [message] = await everything.waitFor(1);
    expect(message.fields).toMatchObject({ exchange: 'sires.events', routingKey: 'audit.recorded' });
    expect(message.properties.messageId).toBe(audited.id);
    expect(JSON.parse(message.content.toString())).toMatchObject({ id: audited.id, type: 'audit.recorded', data: audited });
    await everything.close();
  });

  it('đủ trường AuditEvent (CTX-AUDIT-001-AC01)', async () => {
    const span = trace.wrapSpanContext({ traceId: '0af7651916cd43dd8448eb211c80319c', spanId: 'b7ad6b7169203331', traceFlags: TraceFlags.SAMPLED });
    const input = approval();
    const event = await context.with(trace.setSpan(ROOT_CONTEXT, span), () =>
      withAccountTransaction(stack.appDb, ACCOUNT, (tx) => emitAudit(tx, input)),
    );
    expect(event).toEqual({
      id: expect.any(String),
      accountId: ACCOUNT,
      projectId: PROJECT,
      actor: { type: 'researcher', accountId: ACCOUNT },
      action: 'plan_version.approved',
      objectType: 'plan_version',
      objectId: input.objectId,
      objectVersion: 3,
      fromState: 'Proposed',
      toState: 'Approved',
      apr: 'APR-01',
      summary: 'Researcher duyệt Plan Version 3',
      correlationId: '0af7651916cd43dd8448eb211c80319c',
      at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    const [row] = await outboxRows([event.id]);
    expect(row.payload).toMatchObject({
      type: 'audit.recorded',
      producer: 'planning',
      accountId: ACCOUNT,
      projectId: PROJECT,
      actor: event.actor,
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      data: event,
    });
  });

  it('aggregate là chính Audit Event (H3, P6)', async () => {
    const event = await withAccountTransaction(stack.appDb, ACCOUNT, (tx) => emitAudit(tx, approval()));
    const [row] = await outboxRows([event.id]);
    expect(row).toMatchObject({
      id: event.id,
      kind: 'audit',
      routing_key: 'audit.recorded',
      aggregate_type: 'audit_event',
      aggregate_id: event.id,
      aggregate_version: 1,
    });
    expect(row.payload['aggregate']).toEqual({ type: 'audit_event', id: event.id, version: 1 });
    expect(row.payload['id']).toBe(event.id);
  });

  it('actor không hợp lệ (EC16, CTX-AUDIT-001-AC02)', async () => {
    const run = uuidv7();
    const invalid: unknown[] = [
      undefined,
      { type: 'researcher' },
      { type: 'agent', agentRunId: run },
      { type: 'agent', agent: 'synthesis' },
      { type: 'agent', agent: 'analysis', agentRunId: run },
      { type: 'agent', agent: 'synthesis', agentRunId: run, instance: 'A' },
      { type: 'system' },
      { type: 'robot', component: 'x' },
    ];
    const refused: string[] = [];
    for (const actor of invalid) {
      const objectId = uuidv7();
      refused.push(objectId);
      await expect(
        withAccountTransaction(stack.appDb, ACCOUNT, async (tx) => {
          await tx.execute(sql`INSERT INTO app.note (id, account_id, body) VALUES (${objectId}, ${ACCOUNT}, 'x')`);
          await emitAudit(tx, approval({ objectId, actor: actor as AuditInput['actor'] }));
        }),
      ).rejects.toThrow(/actor/);
      expect(await stack.database.admin('SELECT 1 FROM app.note WHERE id = $1', [objectId])).toEqual([]);
    }
    expect(
      await stack.database.admin("SELECT 1 FROM app.outbox WHERE payload->'data'->>'objectId' = ANY($1::text[])", [refused]),
    ).toEqual([]);
    // The three valid shapes.
    for (const actor of [
      { type: 'agent', agent: 'analysis', instance: 'B', agentRunId: run },
      { type: 'agent', agent: 'verification', agentRunId: run },
      { type: 'system', component: 'readiness' },
    ] as const) {
      const event = await withAccountTransaction(stack.appDb, ACCOUNT, (tx) => emitAudit(tx, approval({ actor })));
      expect(event.actor).toEqual(actor);
    }
  });

  it('che key trong summary (EC17, CTX-AUDIT-001-AC03)', async () => {
    const anthropicKey = 'sk-ant-api03-' + 'Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z'.repeat(2);
    const jwt = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJnYXRld2F5In0.c2lnbmF0dXJlLXZhbHVlLWhlcmU';
    const event = await withAccountTransaction(stack.appDb, ACCOUNT, (tx) =>
      emitAudit(tx, approval({ summary: `Thay key ${anthropicKey} bằng token ${jwt} cho provider` })),
    );
    expect(event.summary).toBe('Thay key [REDACTED] bằng token [REDACTED] cho provider');
    const [row] = await outboxRows([event.id]);
    expect(JSON.stringify(row.payload)).not.toContain('sk-ant-');
    expect(JSON.stringify(row.payload)).not.toContain(jwt);
  });

  it('accountId khác tài khoản của giao dịch (G3, S04)', async () => {
    const other = uuidv7();
    const objectId = uuidv7();
    await expect(
      withAccountTransaction(stack.appDb, ACCOUNT, async (tx) => {
        await tx.execute(sql`INSERT INTO app.note (id, account_id, body) VALUES (${objectId}, ${ACCOUNT}, 'x')`);
        await emitAudit(tx, approval({ objectId, accountId: other }));
      }),
    ).rejects.toThrow('emitAudit: accountId is not the account of the transaction (app.account_id)');
    expect(await stack.database.admin('SELECT 1 FROM app.note WHERE id = $1', [objectId])).toEqual([]);
    expect(await stack.database.admin('SELECT 1 FROM app.outbox WHERE account_id = $1', [other])).toEqual([]);
  });

  it('chỉ ghi thêm: không có API sửa hay xóa Audit Event (CTX-AUDIT-001-AC04)', () => {
    const functions = Object.entries(auditApi)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);
    expect(functions).toEqual(['emitAudit']);
  });
});
