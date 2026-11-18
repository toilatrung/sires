// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { connect, type Channel, type ChannelModel } from 'amqplib';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EventEnvelope } from '../outbox/envelope';
import { recordQueue, startMessagingStack, type MessagingTestStack } from '../outbox/messaging.testkit';
import { buildEnvelope } from '../outbox/outbox';
import { uuidv7 } from '../tenancy/uuid';
import { EventConsumer, type ConsumeOutcome, type EventHandler } from './consumer';
import { applyReplica, type ReplicaOutcome } from './replica';

const ACCOUNT = uuidv7();

/** A replica table shaped like replica.project_state (database 3.5), created by the test, not by the DDL (S02). */
const REPLICA_SQL = `
  CREATE TABLE replica.task_mirror (
    task_id         uuid PRIMARY KEY,
    account_id      uuid NOT NULL,
    status          text NOT NULL,
    source_version  bigint NOT NULL,
    synced_at       timestamptz NOT NULL DEFAULT now()
  );
  GRANT SELECT, INSERT, UPDATE, DELETE ON replica.task_mirror TO sires_test_system;
`;

function taskEvent(taskId: string, version: number, toState: string, id = uuidv7()): EventEnvelope {
  return buildEnvelope({
    id,
    producer: 'planning',
    type: 'task.status_changed',
    accountId: ACCOUNT,
    aggregate: { type: 'task', id: taskId, version },
    data: { objectType: 'task', objectId: taskId, toState },
  });
}

describe('consumer có inbox và helper replica trên PostgreSQL và RabbitMQ thật (PID-00002 S02)', { timeout: 30_000 }, () => {
  let stack: MessagingTestStack;
  let connection: ChannelModel;
  let publisher: Channel;
  const outcomes: { outcome: ConsumeOutcome; id: string | undefined }[] = [];
  const replicaOutcomes = new Map<string, ReplicaOutcome>();
  const failOnce = new Set<string>();
  const deliveries: { id: string; redelivered: boolean }[] = [];
  const consumers: EventConsumer[] = [];

  const handlers: EventHandler[] = [
    {
      // The effect: one note per event, and the replica row of the task.
      routingKeys: ['task.status_changed.*'],
      handle: async (event, tx, delivery) => {
        deliveries.push({ id: event.id, redelivered: delivery.redelivered });
        await tx.execute(sql`INSERT INTO app.note (id, account_id, body) VALUES (${uuidv7()}, ${event.accountId}, ${event.id})`);
        const data = event.data as { objectId: string; toState: string };
        replicaOutcomes.set(
          event.id,
          await applyReplica(tx, {
            table: 'task_mirror',
            key: { task_id: data.objectId },
            values: { account_id: event.accountId, status: data.toState, synced_at: new Date() },
            version: event.aggregate.version,
          }),
        );
        if (failOnce.delete(event.id)) throw new Error('handler lỗi lần đầu');
      },
    },
  ];

  const waitOutcomes = async (count: number) => {
    const deadline = Date.now() + 10_000;
    while (outcomes.length < count) {
      if (Date.now() > deadline) throw new Error(`only ${outcomes.length}/${count} outcomes`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return outcomes.slice(0, count).map((entry) => entry.outcome);
  };
  const publish = (routingKey: string, body: unknown, messageId: string) =>
    publisher.publish('sires.events', routingKey, Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)), {
      persistent: true,
      messageId,
      headers: { message_id: messageId },
    });
  const publishEvent = (event: EventEnvelope) =>
    publish(`task.status_changed.${String(event.data['toState']).toLowerCase()}`, event, event.id);
  const notesFor = async (eventId: string) =>
    (await stack.database.admin<{ total: number }>('SELECT count(*)::int AS total FROM app.note WHERE body = $1', [eventId]))[0].total;
  const mirror = async (taskId: string) =>
    (await stack.database.admin<{ status: string; source_version: string }>(
      'SELECT status, source_version FROM replica.task_mirror WHERE task_id = $1',
      [taskId],
    ))[0];
  const startConsumer = async (service: string, extra: Partial<ConstructorParameters<typeof EventConsumer>[0]> = {}) => {
    const consumer = new EventConsumer({
      service,
      db: stack.systemDb,
      amqpUrl: stack.rabbit.amqpUrl,
      handlers,
      onOutcome: (outcome, id) => outcomes.push({ outcome, id }),
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      ...extra,
    });
    await consumer.start();
    consumers.push(consumer);
    return consumer;
  };

  beforeAll(async () => {
    stack = await startMessagingStack();
    await stack.database.admin(REPLICA_SQL);
    connection = await connect(stack.rabbit.amqpUrl);
    publisher = await connection.createChannel();
    await startConsumer('planning');
  }, 300_000);

  afterAll(async () => {
    await Promise.all(consumers.map((consumer) => consumer.stop()));
    await connection?.close();
    await stack?.stop();
  }, 60_000);

  const reset = () => {
    outcomes.length = 0;
    deliveries.length = 0;
  };

  it('sự kiện trùng chỉ áp một lần (PID-00002-AC02, DATA-IDEMP-005-AC01)', async () => {
    reset();
    const event = taskEvent(uuidv7(), 1, 'Ready');
    publishEvent(event);
    publishEvent(event);
    expect(await waitOutcomes(2)).toEqual(['applied', 'duplicate']);
    expect(await notesFor(event.id)).toBe(1);
    expect(
      await stack.database.admin('SELECT consumer, routing_key FROM app.inbox WHERE event_id = $1', [event.id]),
    ).toEqual([{ consumer: 'planning', routing_key: 'task.status_changed.ready' }]);
  });

  it('bản cũ đến sau bị bỏ (PID-00002-AC03)', async () => {
    reset();
    const taskId = uuidv7();
    const v5 = taskEvent(taskId, 5, 'Running');
    publishEvent(v5);
    await waitOutcomes(1);
    expect(await mirror(taskId)).toEqual({ status: 'Running', source_version: '5' });

    const v4 = taskEvent(taskId, 4, 'Ready');
    publishEvent(v4);
    await waitOutcomes(2);
    expect(replicaOutcomes.get(v4.id)).toBe('skipped');
    expect(await mirror(taskId)).toEqual({ status: 'Running', source_version: '5' });

    const v6 = taskEvent(taskId, 6, 'Done');
    publishEvent(v6);
    await waitOutcomes(3);
    expect(replicaOutcomes.get(v6.id)).toBe('applied');
    expect(await mirror(taskId)).toEqual({ status: 'Done', source_version: '6' });
  });

  it('cùng version (EC09)', async () => {
    reset();
    const taskId = uuidv7();
    publishEvent(taskEvent(taskId, 3, 'Running'));
    await waitOutcomes(1);
    // Another event (another id, so not a duplicate for the inbox) carrying the version already applied.
    const same = taskEvent(taskId, 3, 'Blocked');
    publishEvent(same);
    expect(await waitOutcomes(2)).toEqual(['applied', 'applied']);
    expect(replicaOutcomes.get(same.id)).toBe('skipped');
    expect(await mirror(taskId)).toEqual({ status: 'Running', source_version: '3' });
  });

  it('handler lỗi rồi giao lại (EC07)', async () => {
    reset();
    const event = taskEvent(uuidv7(), 1, 'Ready');
    failOnce.add(event.id);
    publishEvent(event);
    expect(await waitOutcomes(2)).toEqual(['failed', 'applied']);
    expect(deliveries).toEqual([
      { id: event.id, redelivered: false },
      { id: event.id, redelivered: true },
    ]);
    // The failed attempt rolled back: one effect, one inbox row.
    expect(await notesFor(event.id)).toBe(1);
    expect(await stack.database.admin('SELECT 1 FROM app.inbox WHERE event_id = $1', [event.id])).toHaveLength(1);
  });

  it('vỏ sự kiện sai (EC08)', async () => {
    reset();
    const dead = await recordQueue(stack.rabbit.amqpUrl, { queue: 'ec08.dead' });
    const warnings: Record<string, unknown>[] = [];
    await startConsumer('ec08', {
      queueArguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': 'ec08.dead' },
      logger: { info: () => undefined, warn: (fields: Record<string, unknown>) => warnings.push(fields), error: () => undefined },
    } as Partial<ConstructorParameters<typeof EventConsumer>[0]>);
    const before = deliveries.length;
    const noAggregate = { ...taskEvent(uuidv7(), 1, 'Ready'), aggregate: undefined, data: { secretNote: 'nội dung riêng' } };
    const notJsonId = uuidv7();
    publish('task.status_changed.ready', noAggregate, noAggregate.id);
    publish('task.status_changed.ready', 'not json {', notJsonId);
    // Both queues get both messages: planning.events rejects them too.
    await waitOutcomes(4);
    expect(outcomes.map((entry) => entry.outcome)).toEqual(['rejected', 'rejected', 'rejected', 'rejected']);
    expect(deliveries.length).toBe(before);
    const deadLettered = await dead.waitFor(2);
    expect(deadLettered.map((message) => message.properties.messageId).sort()).toEqual([noAggregate.id, notJsonId].sort());
    expect(warnings.map((fields) => fields['message_id']).sort()).toEqual([noAggregate.id, notJsonId].sort());
    expect(JSON.stringify(warnings)).not.toContain('nội dung riêng');
    await dead.close();
  });
});
