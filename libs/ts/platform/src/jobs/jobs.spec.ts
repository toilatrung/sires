// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import type { Meter, ObservableCallback, ObservableResult } from '@opentelemetry/api';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMessagingStack, type MessagingTestStack } from '../outbox/messaging.testkit';
import { uuidv7 } from '../tenancy/uuid';
import { runDailyCleanup, runHourlyCleanup } from './cleanup';
import { acquireLease, releaseLease } from './lease';
import { OUTBOX_AGE_METRIC, oldestUnpublishedOutboxAgeSeconds, registerOutboxAgeMetric } from './metrics';

const ACCOUNT = uuidv7();

describe('lease, job dọn và metric outbox trên PostgreSQL thật (PID-00002 S05)', () => {
  let stack: MessagingTestStack;
  const admin = <R extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: unknown[]) =>
    stack.database.admin<R>(text, values);

  /** Inserts an outbox row created `createdAgo` and published `publishedAgo` (null: unpublished). */
  const outbox = async (kind: 'event' | 'audit', createdAgo: string, publishedAgo: string | null) => {
    const id = uuidv7();
    await admin(
      `INSERT INTO app.outbox (id, account_id, kind, routing_key, aggregate_type, aggregate_id, aggregate_version, payload, created_at, published_at)
       VALUES ($1, $2, $3, $4, 'task', $1, 1, '{}', now() - $5::interval, now() - $6::interval)`,
      [id, ACCOUNT, kind, kind === 'audit' ? 'audit.recorded' : 'task.activated', createdAgo, publishedAgo],
    );
    return id;
  };
  const exists = async (table: string, column: string, id: string) =>
    (await admin(`SELECT 1 FROM app.${table} WHERE ${column} = $1`, [id])).length === 1;

  beforeAll(async () => {
    stack = await startMessagingStack({ rabbit: false });
  }, 300_000);

  afterAll(async () => {
    await stack?.stop();
  });

  beforeEach(async () => {
    await admin('DELETE FROM app.job_lock; DELETE FROM app.outbox; DELETE FROM app.inbox; DELETE FROM app.idempotency_key');
  });

  it('không xóa dòng chưa publish (EC18, CTX-AUDIT-001-AC05, NFR-RET-008-AC01)', async () => {
    const oldUnpublishedEvent = await outbox('event', '30 days', null);
    const oldUnpublishedAudit = await outbox('audit', '30 days', null);
    const publishedLongAgo = await outbox('audit', '26 hours', '25 hours');
    const publishedRecently = await outbox('event', '24 hours', '23 hours');

    // Two pods: the second one finds the hourly lease taken and does nothing.
    expect(await runHourlyCleanup(stack.systemDb, { owner: 'pod-b' })).toEqual({ ran: true, outbox: 1, idempotencyKeys: 0 });
    const second = await outbox('event', '30 hours', '25 hours');
    expect(await runHourlyCleanup(stack.systemDb, { owner: 'pod-c' })).toEqual({ ran: false, outbox: 0, idempotencyKeys: 0 });
    expect(await exists('outbox', 'id', second)).toBe(true);

    expect(await exists('outbox', 'id', oldUnpublishedEvent)).toBe(true);
    expect(await exists('outbox', 'id', oldUnpublishedAudit)).toBe(true);
    expect(await exists('outbox', 'id', publishedLongAgo)).toBe(false);
    expect(await exists('outbox', 'id', publishedRecently)).toBe(true);
  });

  it('dọn đúng hạn từng bảng (P7)', async () => {
    // Batches: more rows than one DELETE takes.
    await admin(
      `INSERT INTO app.outbox (id, account_id, kind, routing_key, payload, created_at, published_at)
       SELECT app.uuid_v7(), $1, 'command', 'agent.run', '{}', now() - interval '3 days', now() - interval '2 days'
       FROM generate_series(1, 12000)`,
      [ACCOUNT],
    );
    const insertKey = (key: string, expiresIn: string) =>
      admin(
        "INSERT INTO app.idempotency_key (account_id, key, operation, request_hash, response_status, expires_at) VALUES ($1, $2, 'createNote', '\\x00', 201, now() + $3::interval)",
        [ACCOUNT, key, expiresIn],
      );
    await insertKey('expired-key', '-1 minute');
    await insertKey('live-key-1', '1 minute');
    const insertInbox = (eventId: string, ago: string) =>
      admin("INSERT INTO app.inbox (consumer, event_id, account_id, routing_key, processed_at) VALUES ('planning', $1, $2, 'task.activated', now() - $3::interval)", [
        eventId,
        ACCOUNT,
        ago,
      ]);
    const oldInbox = uuidv7();
    const recentInbox = uuidv7();
    await insertInbox(oldInbox, '8 days');
    await insertInbox(recentInbox, '6 days');

    expect(await runHourlyCleanup(stack.systemDb, { owner: 'pod-a' })).toEqual({ ran: true, outbox: 12000, idempotencyKeys: 1 });
    expect(await exists('idempotency_key', 'key', 'expired-key')).toBe(false);
    expect(await exists('idempotency_key', 'key', 'live-key-1')).toBe(true);
    // The hourly job leaves the inbox alone; the daily job keeps 7 days.
    expect(await exists('inbox', 'event_id', oldInbox)).toBe(true);
    expect(await runDailyCleanup(stack.systemDb, { owner: 'pod-a' })).toEqual({ ran: true, inbox: 1 });
    expect(await runDailyCleanup(stack.systemDb, { owner: 'pod-b' })).toEqual({ ran: false, inbox: 0 });
    expect(await exists('inbox', 'event_id', oldInbox)).toBe(false);
    expect(await exists('inbox', 'event_id', recentInbox)).toBe(true);
    const leases = await admin<{ name: string; hours: number }>(
      'SELECT name, round(extract(epoch FROM lease_until - now()) / 3600)::int AS hours FROM app.job_lock ORDER BY name',
    );
    expect(leases).toEqual([
      { name: 'cleanup.daily', hours: 24 },
      { name: 'cleanup.hourly', hours: 1 },
    ]);
  });

  it('lease: giữ, gia hạn, nhường (database 9.4)', async () => {
    const lease = { name: 'outbox-relay', ttlMs: 30_000 };
    expect(await acquireLease(stack.systemDb, { ...lease, owner: 'pod-a' })).toBe(true);
    expect(await acquireLease(stack.systemDb, { ...lease, owner: 'pod-b' })).toBe(false);
    expect(await acquireLease(stack.systemDb, { ...lease, owner: 'pod-a' })).toBe(true);
    await releaseLease(stack.systemDb, lease.name, 'pod-b');
    expect(await acquireLease(stack.systemDb, { ...lease, owner: 'pod-b' })).toBe(false);
    await releaseLease(stack.systemDb, lease.name, 'pod-a');
    expect(await acquireLease(stack.systemDb, { ...lease, owner: 'pod-b' })).toBe(true);
  });

  it('đo tuổi outbox chưa publish (P8)', async () => {
    expect(await oldestUnpublishedOutboxAgeSeconds(stack.systemDb)).toBe(0);
    await outbox('event', '2 hours', '1 hour');
    expect(await oldestUnpublishedOutboxAgeSeconds(stack.systemDb)).toBe(0);
    await outbox('event', '45 seconds', null);
    await outbox('event', '5 seconds', null);

    const callbacks: ObservableCallback[] = [];
    const registered: { name: string; unit?: string }[] = [];
    const meter = {
      createObservableGauge: (name: string, options?: { unit?: string }) => {
        registered.push({ name, unit: options?.unit });
        return {
          addCallback: (callback: ObservableCallback) => callbacks.push(callback),
          removeCallback: (callback: ObservableCallback) => callbacks.splice(callbacks.indexOf(callback), 1),
        };
      },
    } as unknown as Meter;
    const unregister = registerOutboxAgeMetric(stack.systemDb, meter);
    expect(registered).toEqual([{ name: OUTBOX_AGE_METRIC, unit: 's' }]);
    const observed: number[] = [];
    await callbacks[0]({ observe: (value: number) => observed.push(value) } as ObservableResult);
    expect(observed).toHaveLength(1);
    expect(observed[0]).toBeGreaterThanOrEqual(45);
    expect(observed[0]).toBeLessThan(60);
    unregister();
    expect(callbacks).toEqual([]);
  });
});
