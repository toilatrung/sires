// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { ConsumeMessage } from 'amqplib';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEnvelope, createServiceApp, generateServiceKeys, issueServiceToken,
  ServiceTokenClient, withAccountTransaction, type EventEnvelope,
} from '@sires/platform';
import { FakeBroker } from '@sires/testing';
import { ACCOUNT_A, ACCOUNT_B, RECORD_ID, startSampleDatabase } from './database.testkit';
import { SampleController, SampleModule } from './sample.module';
import { createSampleConsumer, SAMPLE_CONSUMER, SAMPLE_EVENT_TYPE, SampleService } from './sample.service';
import { sampleRecord } from './schema';

let database: Awaited<ReturnType<typeof startSampleDatabase>>;
let app: NestFastifyApplication;
let service: SampleService;
const keys = generateServiceKeys(['planning', 'workspace', 'library']);
const originalHandler = SampleController.prototype.ready;
const handler = vi.spyOn(SampleController.prototype, 'ready');
// Nest stores route/guard metadata on the method function; preserve it when instrumenting handler calls.
for (const key of Reflect.getMetadataKeys(originalHandler)) {
  Reflect.defineMetadata(key, Reflect.getMetadata(key, originalHandler), handler);
}

beforeAll(async () => {
  vi.stubEnv('OTEL_SDK_DISABLED', 'true');
  database = await startSampleDatabase();
  @Module({ imports: [SampleModule.forRoot(database.db, {
    service: 'planning', publicKeys: keys.publicKeys, signer: keys.signer('planning'),
  })] })
  class TestApplication {}
  app = await createServiceApp(TestApplication, { name: 'sample-service', port: 0 }, {
    logDestination: { write: () => undefined },
  });
  await app.listen(0, '127.0.0.1');
  service = app.get(SampleService);
}, 120_000);

afterAll(async () => { await app?.close(); await database?.stop(); vi.unstubAllEnvs(); });
beforeEach(async () => {
  await database.admin.query('TRUNCATE app.sample_record, app.outbox, app.inbox');
  await database.admin.query('INSERT INTO app.sample_record(id, account_id) VALUES ($1, $2)', [RECORD_ID, ACCOUNT_A]);
});

it('trạng thái, Audit Event và outbox cùng một giao dịch (PID-00006-AC01)', async () => {
  await service.activate(ACCOUNT_A, RECORD_ID);
  const record = (await database.admin.query('SELECT status, row_version, xmin::text FROM app.sample_record')).rows[0];
  expect(record).toMatchObject({ status: 'Active', row_version: 2 });
  const rows = (await database.admin.query('SELECT kind, routing_key, payload, xmin::text FROM app.outbox ORDER BY kind')).rows;
  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row.xmin)).toEqual([record.xmin, record.xmin]);
  expect(rows[0]).toMatchObject({ kind: 'audit', routing_key: 'audit.recorded',
    payload: { accountId: ACCOUNT_A, data: { action: 'sample_record.activated', objectId: RECORD_ID, objectVersion: 2,
      fromState: 'Created', toState: 'Active' } } });
  expect(rows[1]).toMatchObject({ kind: 'event', routing_key: 'sample_record.activated',
    payload: { type: 'sample_record.activated', aggregate: { type: 'sample_record', id: RECORD_ID, version: 2 },
      accountId: ACCOUNT_A, data: { sampleRecordId: RECORD_ID } } });
});

it('loại sự kiện riêng của mẫu, không có trong hợp đồng thật (spec 2.3; QC G2)', () => {
  expect(SAMPLE_EVENT_TYPE).toBe('sample_record.activated');
  const asyncapi = readFileSync(join(__dirname, '../../../../docs/api-design/events/asyncapi.yaml'), 'utf8');
  // Mọi `type` của hợp đồng nằm trong const của payload; loại của mẫu không được trùng loại nào.
  expect(asyncapi).toContain("const: task.activated");
  expect(asyncapi).not.toContain(SAMPLE_EVENT_TYPE);
});

it('lỗi giữa giao dịch không để lại dòng nào (EC01)', async () => {
  // Defer failure until COMMIT, after state, event and audit have all been written.
  await database.admin.query(`CREATE FUNCTION app.fail_sample_commit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'sample forced commit failure'; END $$;
    CREATE CONSTRAINT TRIGGER fail_sample_commit AFTER INSERT ON app.outbox
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.fail_sample_commit()`);
  try {
    await expect(service.activate(ACCOUNT_A, RECORD_ID)).rejects.toThrow();
    expect((await database.admin.query('SELECT status, row_version FROM app.sample_record')).rows)
      .toEqual([{ status: 'Created', row_version: 1 }]);
    expect((await database.admin.query('SELECT * FROM app.outbox')).rows).toEqual([]);
  } finally {
    await database.admin.query('DROP TRIGGER fail_sample_commit ON app.outbox; DROP FUNCTION app.fail_sample_commit()');
  }
});

function envelope(): EventEnvelope {
  return buildEnvelope({ producer: 'planning', type: SAMPLE_EVENT_TYPE, accountId: ACCOUNT_A,
    aggregate: { type: 'sample_record', id: RECORD_ID, version: 1 }, data: { sampleRecordId: RECORD_ID } });
}

/** Boundary adapter for FakeBroker: all inbox behaviour stays in the real public EventConsumer. */
function message(event: EventEnvelope, redelivered = false): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(event)),
    fields: { consumerTag: 'sample', deliveryTag: 1, redelivered, exchange: 'sires.events', routingKey: event.type },
    properties: { messageId: event.id },
  } as ConsumeMessage;
}

async function expectOneEffect(event: EventEnvelope) {
  expect((await database.admin.query('SELECT effects FROM app.sample_record')).rows).toEqual([{ effects: 1 }]);
  expect((await database.admin.query('SELECT consumer, event_id FROM app.inbox')).rows)
    .toEqual([{ consumer: SAMPLE_CONSUMER, event_id: event.id }]);
}

describe('inbox', () => {
  it('sự kiện trùng tác động đúng một lần (PID-00006-AC02)', async () => {
    const event = envelope();
    const consumer = createSampleConsumer(database.systemDb, 'amqp://unused');
    const outcomes: string[] = [];
    const broker = new FakeBroker<EventEnvelope>({ duplicateIds: [event.id] });
    broker.subscribe(SAMPLE_CONSUMER, SAMPLE_EVENT_TYPE, async (item, meta) => {
      outcomes.push(await consumer.handle(message(item, meta.redelivered)));
    });
    broker.publish(event);
    expect(await broker.flush()).toHaveLength(2);
    expect(outcomes).toEqual(['applied', 'duplicate']);
    await expectOneEffect(event);
  });

  it('sự kiện trùng đến sau (EC02)', async () => {
    const event = envelope();
    const consumer = createSampleConsumer(database.systemDb, 'amqp://unused');
    expect(await consumer.handle(message(event))).toBe('applied');
    expect(await consumer.handle(message(event, true))).toBe('duplicate');
    await expectOneEffect(event);
  });

  it('sự kiện trùng xử lý đồng thời (EC03)', async () => {
    const event = envelope();
    const consumer = createSampleConsumer(database.systemDb, 'amqp://unused');
    const outcomes = await Promise.all([consumer.handle(message(event)), consumer.handle(message(event, true))]);
    expect(outcomes.sort()).toEqual(['applied', 'duplicate']);
    await expectOneEffect(event);
  });
});

it('RLS chặn đọc chéo tài khoản (PID-00006-AC03)', async () => {
  expect(await withAccountTransaction(database.db, ACCOUNT_A, (tx) => tx.select().from(sampleRecord))).toHaveLength(1);
  expect(await withAccountTransaction(database.db, ACCOUNT_B, (tx) => tx.select().from(sampleRecord))).toEqual([]);
  expect((await database.app.query('SELECT current_user, rolbypassrls, rolsuper FROM pg_roles WHERE rolname=current_user')).rows)
    .toEqual([{ current_user: 'sires_sample_app', rolbypassrls: false, rolsuper: false }]);
});

it('thiếu ngữ cảnh tenant thấy 0 dòng (EC04)', async () => {
  await withAccountTransaction(database.db, ACCOUNT_A, (tx) => tx.select().from(sampleRecord));
  expect((await database.db.select().from(sampleRecord))).toEqual([]);
});

it('ghi chéo tài khoản bị từ chối (EC05)', async () => {
  await expect(withAccountTransaction(database.db, ACCOUNT_B, (tx) => tx.insert(sampleRecord)
    .values({ id: ACCOUNT_B, accountId: ACCOUNT_A }))).rejects.toMatchObject({ cause: { code: '42501' } });
  expect(await withAccountTransaction(database.db, ACCOUNT_B, (tx) => tx.update(sampleRecord)
    .set({ status: 'Active' }).where(eq(sampleRecord.id, RECORD_ID)).returning())).toEqual([]);
});

it('endpoint nội bộ kiểm token nội bộ (PID-00006-AC05)', async () => {
  handler.mockClear();
  const client = new ServiceTokenClient({ signer: keys.signer('workspace') });
  const authorization = await client.authorization('planning', { component: 'sample-test' });
  const url = `${await app.getUrl()}/internal/sample/ready`;
  const call = (header?: string) => fetch(url, { headers: header ? { authorization: header } : {} });
  try {
    const valid = await call(authorization);
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
    const tokenInput = { audience: 'planning', actor: { type: 'system', component: 'sample-test' } } as const;
    const wrongKey = generateServiceKeys(['workspace']).signer('workspace');
    const expired = await issueServiceToken(keys.signer('workspace'), { ...tokenInput, now: Date.now() - 600_000 });
    const wrongSignature = await issueServiceToken(wrongKey, tokenInput);
    for (const header of [undefined, `Bearer ${expired}`, `Bearer ${wrongSignature}`]) {
      const response = await call(header);
      expect(response.status).toBe(401);
      expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json/);
      expect(await response.json()).toMatchObject({ code: 'invalid_service_token', status: 401 });
      expect(handler).toHaveBeenCalledTimes(1);
    }
  } finally { handler.mockRestore(); }
});
