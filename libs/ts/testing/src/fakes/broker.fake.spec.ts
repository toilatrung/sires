// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { describe, expect, it } from 'vitest';
import { FakeBroker, topicMatches, type FakeBrokerFaults } from './broker.fake';

// Shape of internal/schemas.yaml#/EventEnvelope (not generated yet; PID-00007 adds AsyncAPI types).
interface TestEnvelope {
  id: string;
  type: string;
  schemaVersion: number;
  producer: string;
  occurredAt: string;
  accountId: string;
  aggregate: { type: string; id: string; version: number };
  data: Record<string, unknown>;
}

const ACCOUNT = '0190a000-0000-7000-8000-000000000001';

function envelope(n: number, type = 'task.activated'): TestEnvelope {
  const id = `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`;
  return {
    id,
    type,
    schemaVersion: 1,
    producer: 'planning',
    occurredAt: new Date(Date.UTC(2026, 10, 11, 0, 0, n)).toISOString(),
    accountId: ACCOUNT,
    aggregate: { type: 'task', id: '0190a000-0000-7000-8000-00000000aaaa', version: n },
    data: { n },
  };
}

/** Publishes `count` envelopes and returns what the consumer saw, plus an idempotent inbox result. */
async function run(faults: FakeBrokerFaults, count = 20) {
  const broker = new FakeBroker<TestEnvelope>(faults);
  const seen: { id: string; redelivered: boolean }[] = [];
  const inbox = new Set<string>();
  let applied = 0;
  broker.subscribe('research.task-replica', 'task.*', (e, meta) => {
    seen.push({ id: e.id, redelivered: meta.redelivered });
    if (inbox.has(e.id)) return;
    inbox.add(e.id);
    applied += 1;
  });
  for (let n = 1; n <= count; n += 1) broker.publish(envelope(n));
  await broker.flush();
  return { seen, applied, broker };
}

describe('FakeBroker', () => {
  it('tiêm trùng và lệch thứ tự (PID-00004-AC04)', async () => {
    // Explicit scenario: e2 is duplicated, then every window of 2 is reversed.
    const scripted = await run({ duplicateIds: [envelope(2).id], reorder: { window: 2, mode: 'reverse' } }, 4);
    expect(scripted.seen).toEqual([
      { id: envelope(2).id, redelivered: false },
      { id: envelope(1).id, redelivered: false },
      { id: envelope(3).id, redelivered: false },
      { id: envelope(2).id, redelivered: true },
      { id: envelope(4).id, redelivered: false },
    ]);
    expect(scripted.applied).toBe(4);

    // Seeded random scenario: duplicates and reordering happen, and the same seed gives the same deliveries.
    const faults: FakeBrokerFaults = { seed: 42, duplicateRate: 0.3, reorder: { window: 5 } };
    const first = await run(faults);
    const second = await run(faults);
    expect(second.seen).toEqual(first.seen);
    expect(first.seen.length).toBeGreaterThan(20);
    expect(first.seen.filter((s) => s.redelivered).length).toBe(first.seen.length - 20);
    const inPublishOrder = Array.from({ length: 20 }, (_, i) => envelope(i + 1).id);
    expect(first.seen.filter((s) => !s.redelivered).map((s) => s.id)).not.toEqual(inPublishOrder);
    // An idempotent consumer still applies each event exactly once.
    expect(first.applied).toBe(20);

    // A different seed gives a different (still deterministic) delivery order.
    const other = await run({ ...faults, seed: 7 });
    expect(other.seen).not.toEqual(first.seen);
    expect((await run({ ...faults, seed: 7 })).seen).toEqual(other.seen);
  });

  it('định tuyến theo type như topic exchange', async () => {
    expect(topicMatches('task.*', 'task.activated')).toBe(true);
    expect(topicMatches('task.*', 'task.state.changed')).toBe(false);
    expect(topicMatches('task.#', 'task.state.changed')).toBe(true);
    expect(topicMatches('#', 'reference.trusted')).toBe(true);

    const broker = new FakeBroker<TestEnvelope>();
    const tasks: string[] = [];
    const all: string[] = [];
    broker.subscribe('tasks', 'task.*', (e) => void tasks.push(e.type));
    broker.subscribe('all', '#', (e) => void all.push(e.type));
    broker.publish(envelope(1, 'task.activated'));
    broker.publish(envelope(2, 'reference.trusted'));
    expect(broker.pending).toBe(3);
    const delivered = await broker.flush();
    expect(delivered.map((d) => d.consumer)).toEqual(['tasks', 'all', 'all']);
    expect(tasks).toEqual(['task.activated']);
    expect(all).toEqual(['task.activated', 'reference.trusted']);
    expect(broker.pending).toBe(0);
  });

  it('lỗi handler được ghi và ném lại sau khi giao hết', async () => {
    const broker = new FakeBroker<TestEnvelope>();
    const got: number[] = [];
    broker.subscribe('flaky', 'task.*', (e) => {
      got.push(e.aggregate.version);
      if (e.aggregate.version === 1) throw new Error('boom');
    });
    broker.publish(envelope(1));
    broker.publish(envelope(2));
    await expect(broker.flush()).rejects.toBeInstanceOf(AggregateError);
    expect(got).toEqual([1, 2]);
    expect(broker.deliveries.map((d) => 'error' in d)).toEqual([true, false]);
  });
});
