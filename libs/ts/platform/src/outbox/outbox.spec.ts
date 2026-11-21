// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { context, ROOT_CONTEXT, trace, TraceFlags } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { connect } from 'amqplib';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { withAccountTransaction } from '../tenancy/transaction';
import { uuidv7 } from '../tenancy/uuid';
import { eventRoutingKey, topicMatches } from './envelope';
import { recordQueue, settle, startMessagingStack, type MessagingTestStack } from './messaging.testkit';
import { writeCommand, writeEvent, type OutboxEventInput } from './outbox';
import { OutboxRelay, type OutboxRelayOptions } from './relay';

const ACCOUNT = uuidv7();
const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };

function taskActivated(overrides: Partial<OutboxEventInput> = {}): OutboxEventInput {
  return {
    producer: 'planning',
    type: 'task.activated',
    accountId: ACCOUNT,
    projectId: uuidv7(),
    actor: { type: 'researcher', accountId: ACCOUNT },
    aggregate: { type: 'task', id: uuidv7(), version: 2 },
    data: { taskId: uuidv7() },
    ...overrides,
  };
}

describe('outbox và relay trên PostgreSQL và RabbitMQ thật (PID-00002 S01)', { timeout: 30_000 }, () => {
  let stack: MessagingTestStack;
  const relays: OutboxRelay[] = [];

  const relay = (options: Partial<OutboxRelayOptions> = {}) => {
    const created = new OutboxRelay({ db: stack.systemDb, amqpUrl: stack.rabbit.amqpUrl, service: 'planning', logger: silent, ...options });
    relays.push(created);
    return created;
  };
  const write = (input: OutboxEventInput) => withAccountTransaction(stack.appDb, ACCOUNT, (tx) => writeEvent(tx, input));
  const outboxRow = async (id: string) =>
    (await stack.database.admin<{ published_at: Date | null; routing_key: string }>(
      'SELECT published_at, routing_key FROM app.outbox WHERE id = $1',
      [id],
    ))[0];

  beforeAll(async () => {
    stack = await startMessagingStack();
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  }, 300_000);

  afterEach(async () => {
    await Promise.all(relays.splice(0).map((created) => created.stop()));
  });

  afterAll(async () => {
    context.disable();
    await stack?.stop();
  }, 60_000);

  it('relay publish có confirm (PID-00002-AC06)', async () => {
    const queue = await recordQueue(stack.rabbit.amqpUrl, { patterns: ['task.#'] });
    const span = trace.wrapSpanContext({ traceId: '4bf92f3577b34da6a3ce929d0e0e4736', spanId: '00f067aa0ba902b7', traceFlags: TraceFlags.SAMPLED });
    const envelope = await context.with(trace.setSpan(ROOT_CONTEXT, span), () => write(taskActivated()));
    expect(envelope.traceparent).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');

    expect(await relay().runOnce()).toEqual({ leader: true, published: 1, failed: 0 });
    const [message] = await queue.waitFor(1);
    expect(message.fields).toMatchObject({ exchange: 'sires.events', routingKey: 'task.activated' });
    expect(message.properties).toMatchObject({
      messageId: envelope.id,
      deliveryMode: 2,
      contentType: 'application/json',
      headers: { message_id: envelope.id, traceparent: envelope.traceparent },
    });
    expect(JSON.parse(message.content.toString())).toEqual(envelope);
    expect((await outboxRow(envelope.id)).published_at).toBeInstanceOf(Date);
    await queue.close();
  });

  it('phát lại sau khi relay dừng (EC01)', async () => {
    const queue = await recordQueue(stack.rabbit.amqpUrl, { patterns: ['task.#'] });
    const envelope = await write(taskActivated());
    // The relay stops between the confirm and the commit of published_at: here setting published_at is refused
    // (FOR UPDATE still allowed through another column).
    await stack.database.admin('REVOKE UPDATE ON app.outbox FROM sires_test_system; GRANT UPDATE (traceparent) ON app.outbox TO sires_test_system');
    const crashing = relay();
    try {
      await expect(crashing.runOnce()).rejects.toThrow();
    } finally {
      await stack.database.admin('GRANT UPDATE ON app.outbox TO sires_test_system');
      await crashing.stop();
    }
    await queue.waitFor(1);
    expect((await outboxRow(envelope.id)).published_at).toBeNull();

    const restarted = relay();
    expect(await restarted.runOnce()).toEqual({ leader: true, published: 1, failed: 0 });
    const messages = await queue.waitFor(2);
    expect(messages.map((message) => message.properties.messageId)).toEqual([envelope.id, envelope.id]);
    expect(await restarted.runOnce()).toEqual({ leader: true, published: 0, failed: 0 });
    await queue.close();
  });

  it('chỉ một relay giữ lease (EC02)', async () => {
    const a = relay({ owner: 'pod-a' });
    const b = relay({ owner: 'pod-b' });
    expect((await a.runOnce()).leader).toBe(true);
    const envelope = await write(taskActivated());
    expect(await b.runOnce()).toEqual({ leader: false, published: 0, failed: 0 });
    expect((await outboxRow(envelope.id)).published_at).toBeNull();

    // pod-a stops renewing: once lease_until has passed, pod-b takes over.
    await stack.database.admin("UPDATE app.job_lock SET lease_until = now() - interval '1 second' WHERE name = 'outbox-relay'");
    expect(await b.runOnce()).toEqual({ leader: true, published: 1, failed: 0 });
    expect((await a.runOnce()).leader).toBe(false);
    const [lock] = await stack.database.admin<{ owner: string }>("SELECT owner FROM app.job_lock WHERE name = 'outbox-relay'");
    expect(lock.owner).toBe('pod-b');
  });

  it('broker không xác nhận (EC03)', async () => {
    // A full queue with overflow reject-publish makes the broker nack the publish.
    const admin = await connect(stack.rabbit.amqpUrl);
    const channel = await admin.createChannel();
    await channel.assertQueue('ec03.full', { durable: true, arguments: { 'x-max-length': 0, 'x-overflow': 'reject-publish' } });
    await channel.bindQueue('ec03.full', 'sires.events', 'ec03.#');
    const nacked = await write(taskActivated({ type: 'ec03.rejected' }));
    const relayA = relay();
    expect(await relayA.runOnce()).toEqual({ leader: true, published: 0, failed: 1 });
    expect((await outboxRow(nacked.id)).published_at).toBeNull();
    await channel.deleteQueue('ec03.full');
    expect(await relayA.runOnce()).toEqual({ leader: true, published: 1, failed: 0 });

    // The channel closes in the middle of a batch (exchange gone): no row is marked, the next run publishes all.
    const lost = [await write(taskActivated()), await write(taskActivated())];
    await channel.deleteExchange('sires.events');
    const broken = await relayA.runOnce();
    expect(broken).toEqual({ leader: true, published: 0, failed: 2 });
    for (const envelope of lost) expect((await outboxRow(envelope.id)).published_at).toBeNull();
    expect(await relayA.runOnce()).toEqual({ leader: true, published: 2, failed: 0 });
    await admin.close();
  });

  it('routing key trạng thái đích (EC04)', async () => {
    expect(eventRoutingKey('workflow.status_changed', { objectType: 'workflow', toState: 'Waiting for User' })).toBe(
      'workflow.status_changed.waiting_for_user',
    );
    expect(eventRoutingKey('project.lifecycle_changed', { change: 'archived' })).toBe('project.lifecycle_changed.archived');
    expect(eventRoutingKey('task.activated', { taskId: uuidv7() })).toBe('task.activated');
    expect(() => eventRoutingKey('workflow.status_changed', { toState: 'a.b' })).toThrow(TypeError);
    expect(topicMatches('workflow.status_changed.*', 'workflow.status_changed.waiting_for_user')).toBe(true);
    expect(topicMatches('workflow.#', 'workflow.status_changed.done')).toBe(true);
    expect(topicMatches('workflow.status_changed', 'workflow.status_changed.done')).toBe(false);

    const queue = await recordQueue(stack.rabbit.amqpUrl, { patterns: ['workflow.status_changed.waiting_for_user'] });
    const envelope = await write(
      taskActivated({
        producer: 'orchestration',
        type: 'workflow.status_changed',
        aggregate: { type: 'workflow', id: uuidv7(), version: 3 },
        data: { objectType: 'workflow', objectId: uuidv7(), fromState: 'Running', toState: 'Waiting for User' },
      }),
    );
    expect((await outboxRow(envelope.id)).routing_key).toBe('workflow.status_changed.waiting_for_user');
    await relay().runOnce();
    const [message] = await queue.waitFor(1);
    expect(message.fields.routingKey).toBe('workflow.status_changed.waiting_for_user');
    expect(JSON.parse(message.content.toString())).toMatchObject({ type: 'workflow.status_changed' });
    await queue.close();
  });

  it('thiếu aggregate (EC05)', async () => {
    const noteId = uuidv7();
    const partials: unknown[] = [
      undefined,
      { id: uuidv7(), version: 1 },
      { type: 'task', version: 1 },
      { type: 'task', id: uuidv7() },
      { type: 'task', id: uuidv7(), version: 0 },
    ];
    for (const aggregate of partials) {
      await expect(
        withAccountTransaction(stack.appDb, ACCOUNT, async (tx) => {
          await tx.execute(sql`INSERT INTO app.note (id, account_id, body) VALUES (${noteId}, ${ACCOUNT}, 'x')`);
          await writeEvent(tx, taskActivated({ aggregate: aggregate as OutboxEventInput['aggregate'] }));
        }),
      ).rejects.toThrow(/aggregate/);
    }
    // Rolled back: neither the change nor any outbox row.
    expect(await stack.database.admin('SELECT 1 FROM app.note WHERE id = $1', [noteId])).toEqual([]);
    expect(await stack.database.admin('SELECT 1 FROM app.outbox WHERE published_at IS NULL')).toEqual([]);
    // A command needs no aggregate.
    const commandId = await withAccountTransaction(stack.appDb, ACCOUNT, (tx) =>
      writeCommand(tx, { queue: 'knowledge.index', accountId: ACCOUNT, payload: { accountId: ACCOUNT, referenceId: uuidv7(), reason: 'new' } }),
    );
    expect(await stack.database.admin('SELECT kind, aggregate_type FROM app.outbox WHERE id = $1', [commandId])).toEqual([
      { kind: 'command', aggregate_type: null },
    ]);
    await stack.database.admin('DELETE FROM app.outbox WHERE id = $1', [commandId]);
  });

  it('lệnh tới queue (EC06)', async () => {
    const commands = await recordQueue(stack.rabbit.amqpUrl, { queue: 'agent.run' });
    const everyEvent = await recordQueue(stack.rabbit.amqpUrl, { patterns: ['#'] });
    const payload = { agentRunId: uuidv7(), accountId: ACCOUNT };
    const id = await withAccountTransaction(stack.appDb, ACCOUNT, (tx) =>
      writeCommand(tx, { queue: 'agent.run', accountId: ACCOUNT, payload }),
    );
    const commandRelay = relay();
    expect(await commandRelay.runOnce()).toEqual({ leader: true, published: 1, failed: 0 });
    const [message] = await commands.waitFor(1);
    expect(message.fields).toMatchObject({ exchange: '', routingKey: 'agent.run' });
    expect(message.properties).toMatchObject({ messageId: id, deliveryMode: 2, headers: { message_id: id } });
    expect(JSON.parse(message.content.toString())).toEqual(payload);
    await settle();
    expect(everyEvent.messages).toEqual([]);

    // No queue for the command yet: the broker returns it, the row stays unpublished for the next run.
    const orphan = await withAccountTransaction(stack.appDb, ACCOUNT, (tx) =>
      writeCommand(tx, { queue: 'sandbox.build', payload: { jobId: uuidv7() } }),
    );
    expect(await commandRelay.runOnce()).toEqual({ leader: true, published: 0, failed: 1 });
    expect((await outboxRow(orphan)).published_at).toBeNull();
    const sandbox = await recordQueue(stack.rabbit.amqpUrl, { queue: 'sandbox.build' });
    expect(await commandRelay.runOnce()).toEqual({ leader: true, published: 1, failed: 0 });
    await sandbox.waitFor(1);
    await Promise.all([commands.close(), everyEvent.close(), sandbox.close()]);
  });

  it('accountId khác tài khoản của giao dịch (G3, S04)', async () => {
    const other = uuidv7();
    const noteId = uuidv7();
    await expect(
      withAccountTransaction(stack.appDb, ACCOUNT, async (tx) => {
        await tx.execute(sql`INSERT INTO app.note (id, account_id, body) VALUES (${noteId}, ${ACCOUNT}, 'x')`);
        await writeEvent(tx, taskActivated({ accountId: other, actor: { type: 'researcher', accountId: other } }));
      }),
    ).rejects.toThrow('writeEvent: accountId is not the account of the transaction (app.account_id)');
    await expect(
      withAccountTransaction(stack.appDb, ACCOUNT, (tx) =>
        writeCommand(tx, { queue: 'knowledge.index', accountId: other, payload: { accountId: other, referenceId: uuidv7(), reason: 'new' } }),
      ),
    ).rejects.toThrow('writeCommand: accountId is not the account of the transaction (app.account_id)');
    // Rolled back before any INSERT: neither the change nor a row of the other account.
    expect(await stack.database.admin('SELECT 1 FROM app.note WHERE id = $1', [noteId])).toEqual([]);
    expect(await stack.database.admin('SELECT 1 FROM app.outbox WHERE account_id = $1', [other])).toEqual([]);

    // A `_system` transaction (consumer, job) has no app.account_id: it writes the account of the event it handles.
    const fromConsumer = await stack.systemDb.transaction((tx) =>
      writeEvent(tx, taskActivated({ accountId: other, actor: { type: 'system', component: 'consumer' } })),
    );
    expect(await stack.database.admin('SELECT account_id FROM app.outbox WHERE id = $1', [fromConsumer.id])).toEqual([{ account_id: other }]);
    await stack.database.admin('DELETE FROM app.outbox WHERE id = $1', [fromConsumer.id]);
  });

  it('vai trò _app chỉ ghi outbox, không đọc được', async () => {
    const denied = await withAccountTransaction(stack.appDb, ACCOUNT, (tx) => tx.execute(sql`SELECT 1 FROM app.outbox`)).catch(
      (error: Error) => error,
    );
    expect(String((denied as Error).cause)).toMatch(/permission denied/);
  });
});
