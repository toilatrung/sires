// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { SpanKind, trace } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace';
import { connect, type Channel, type ChannelModel } from 'amqplib';
import { createServer, connect as connectTcp, type Server, type Socket } from 'node:net';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitAudit, type AuditEvent } from '../audit/audit';
import { correlationFields, createAccountHasher } from '../logging/context';
import { eventRoutingKey, type EventEnvelope } from '../outbox/envelope';
import { recordQueue, settle, startMessagingStack, type MessagingTestStack } from '../outbox/messaging.testkit';
import { buildEnvelope, writeEvent } from '../outbox/outbox';
import { OutboxRelay } from '../outbox/relay';
import { startTelemetry } from '../telemetry/telemetry';
import { withAccountTransaction } from '../tenancy/transaction';
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

const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };

function projectEvent(toState = 'Active', id = uuidv7()): EventEnvelope {
  const projectId = uuidv7();
  return buildEnvelope({
    id,
    producer: 'workspace',
    type: 'project.lifecycle_changed',
    accountId: ACCOUNT,
    projectId,
    aggregate: { type: 'project', id: projectId, version: 1 },
    data: { objectType: 'project', objectId: projectId, toState },
  });
}

interface LogEntry {
  level: 'info' | 'warn' | 'error';
  msg: string;
  fields: Record<string, unknown>;
}

/** Logger that records what the consumer logs. */
function recordingLogger(entries: LogEntry[]) {
  const at = (level: LogEntry['level']) => (fields: unknown, msg?: string) => {
    entries.push({ level, msg: msg ?? '', fields: fields as Record<string, unknown> });
  };
  return { info: at('info'), warn: at('warn'), error: at('error') };
}

async function waitUntil(condition: () => boolean | Promise<boolean>, what: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`timeout: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

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
  const publish = (routingKey: string, body: unknown, messageId: string, headers: Record<string, string> = {}) =>
    publisher.publish('sires.events', routingKey, Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)), {
      persistent: true,
      messageId,
      headers: { message_id: messageId, ...headers },
    });
  const publishEvent = (event: EventEnvelope, headers: Record<string, string> = {}) =>
    publish(eventRoutingKey(event.type, event.data), event, event.id, headers);
  /** The publisher connection of the test; the broker closes it in the G1 tests, which open it again. */
  const openPublisher = async () => {
    connection = await connect(stack.rabbit.amqpUrl);
    connection.on('error', () => undefined);
    publisher = await connection.createChannel();
  };
  const rabbitmqctl = async (...args: string[]) => {
    const result = await stack.rabbit.container.exec(['rabbitmqctl', ...args]);
    expect(result.exitCode, result.output).toBe(0);
  };
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
    await openPublisher();
    await startConsumer('planning');
  }, 300_000);

  afterAll(async () => {
    await Promise.all(consumers.map((consumer) => consumer.stop()));
    await connection?.close().catch(() => undefined);
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

  it('onOutcome ném lỗi không làm dừng consumer (QC Lần 2 G4)', async () => {
    reset();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    const warnings: string[] = [];
    const seen: ConsumeOutcome[] = [];
    try {
      const consumer = await startConsumer('outcome-throws', {
        onOutcome: (outcome: ConsumeOutcome) => {
          seen.push(outcome);
          throw new Error('metric lỗi');
        },
        logger: { info: () => undefined, warn: (_fields: unknown, msg?: string) => warnings.push(String(msg)), error: () => undefined },
      } as unknown as Partial<ConstructorParameters<typeof EventConsumer>[0]>);
      const first = taskEvent(uuidv7(), 1, 'Ready');
      const second = taskEvent(uuidv7(), 1, 'Ready');
      publishEvent(first);
      publishEvent(second);
      const deadline = Date.now() + 10_000;
      while (seen.length < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(seen).toEqual(['applied', 'applied']);
      expect(warnings.filter((msg) => msg === 'consumer: onOutcome lỗi')).toHaveLength(2);
      expect(unhandled).toEqual([]);
      expect(consumer.isConsuming).toBe(true);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('onOutcome async bị từ chối không gây unhandled rejection (QC PID-00002 Lần 3 G6)', async () => {
    reset();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    const warnings: string[] = [];
    const seen: ConsumeOutcome[] = [];
    try {
      const consumer = await startConsumer('outcome-rejects', {
        // One callback is an async function that throws, the other returns a rejected promise.
        onOutcome: (outcome: ConsumeOutcome) => {
          seen.push(outcome);
          if (seen.length === 1) return (async () => Promise.reject(new Error('metric async lỗi')))();
          return Promise.reject(new Error('metric bị từ chối'));
        },
        logger: { info: () => undefined, warn: (_fields: unknown, msg?: string) => warnings.push(String(msg)), error: () => undefined },
      } as unknown as Partial<ConstructorParameters<typeof EventConsumer>[0]>);
      publishEvent(taskEvent(uuidv7(), 1, 'Ready'));
      publishEvent(taskEvent(uuidv7(), 1, 'Ready'));
      const deadline = Date.now() + 10_000;
      while (seen.length < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(seen).toEqual(['applied', 'applied']);
      expect(warnings.filter((msg) => msg === 'consumer: onOutcome lỗi')).toHaveLength(2);
      expect(unhandled).toEqual([]);
      expect(consumer.isConsuming).toBe(true);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('handler giữ trace của message (G2, NFR-OBS-004, CTX-AUDIT-001)', async () => {
    const exporter = new InMemorySpanExporter();
    const telemetry = startTelemetry({ serviceName: 'orchestration', spanProcessor: new SimpleSpanProcessor({ exporter }) });
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const parentSpanId = '00f067aa0ba902b7';
    const seen: { event?: EventEnvelope; audit?: AuditEvent; logTraceId?: string; outcome?: ConsumeOutcome } = {};
    try {
      await startConsumer('tracing', {
        handlers: [
          {
            routingKeys: ['plan_version.status_changed.*'],
            handle: async (event, tx) => {
              const workflowId = uuidv7();
              seen.logTraceId = correlationFields(createAccountHasher('k').hash)['trace_id'];
              seen.event = await writeEvent(tx, {
                producer: 'orchestration',
                type: 'workflow.status_changed',
                accountId: event.accountId,
                aggregate: { type: 'workflow', id: workflowId, version: 1 },
                data: { objectType: 'workflow', objectId: workflowId, toState: 'Running' },
              });
              seen.audit = await emitAudit(tx, {
                producer: 'orchestration',
                accountId: event.accountId,
                actor: { type: 'system', component: 'orchestrator' },
                action: 'workflow.started',
                objectType: 'workflow',
                objectId: workflowId,
              });
            },
          },
        ],
        onOutcome: (outcome) => {
          seen.outcome = outcome;
        },
      });
      const planId = uuidv7();
      const approved = buildEnvelope({
        producer: 'planning',
        type: 'plan_version.status_changed',
        accountId: ACCOUNT,
        aggregate: { type: 'plan_version', id: planId, version: 2 },
        data: { objectType: 'plan_version', objectId: planId, toState: 'Approved' },
      });
      publishEvent(approved, { traceparent: `00-${traceId}-${parentSpanId}-01` });
      await waitUntil(() => seen.outcome !== undefined, 'tracing outcome');
      expect(seen.outcome).toBe('applied');

      // One CONSUMER span, child of the producer's span, on the same trace.
      const span = exporter.getFinishedSpans().find((finished) => finished.name === 'consume plan_version.status_changed.approved');
      expect(span).toBeDefined();
      expect(span?.kind).toBe(SpanKind.CONSUMER);
      expect(span?.spanContext().traceId).toBe(traceId);
      expect(span?.parentSpanContext?.spanId).toBe(parentSpanId);
      expect(span?.attributes).toMatchObject({
        'messaging.system': 'rabbitmq',
        'messaging.rabbitmq.destination.routing_key': 'plan_version.status_changed.approved',
        'messaging.message.id': approved.id,
        'sires.consume.outcome': 'applied',
      });
      const consumerTraceparent = `00-${traceId}-${span?.spanContext().spanId}-01`;
      // What the handler writes stays on the trace: event traceparent, Audit Event correlationId, logs' trace_id.
      expect(seen.event?.traceparent).toBe(consumerTraceparent);
      expect(seen.audit?.correlationId).toBe(traceId);
      expect(seen.logTraceId).toBe(traceId);
      const rows = await stack.database.admin<{ traceparent: string }>(
        'SELECT traceparent FROM app.outbox WHERE id = ANY($1::uuid[])',
        [[seen.event?.id, seen.audit?.id]],
      );
      expect(rows.map((row) => row.traceparent)).toEqual([consumerTraceparent, consumerTraceparent]);
      expect(trace.getActiveSpan()).toBeUndefined();
    } finally {
      await telemetry.shutdown();
      // The relay of a G1 test below publishes every unpublished row: leave none behind.
      const ids = [seen.event?.id, seen.audit?.id].filter((id): id is string => id !== undefined);
      await stack.database.admin('DELETE FROM app.outbox WHERE id = ANY($1::uuid[])', [ids]);
    }
  });

  it('lần kết nối đầu lỗi: start() không ném, thử lại có backoff rồi consume khi broker lên (QC PID-00002 G5)', { timeout: 60_000 }, async () => {
    // A TCP proxy to the broker that is not listening yet: the first attempt is refused, as when the broker is down.
    const broker = new URL(stack.rabbit.amqpUrl);
    const sockets = new Set<Socket>();
    const proxy: Server = createServer((client) => {
      const upstream = connectTcp(Number(broker.port), broker.hostname);
      for (const socket of [client, upstream]) {
        sockets.add(socket);
        socket.on('error', () => undefined);
        socket.on('close', () => sockets.delete(socket));
      }
      client.pipe(upstream).pipe(client);
    });
    const port = await new Promise<number>((resolve) => {
      const probe = createServer().listen(0, '127.0.0.1', () => {
        const { port: free } = probe.address() as { port: number };
        probe.close(() => resolve(free));
      });
    });
    const amqpUrl = `amqp://${broker.username}:${broker.password}@127.0.0.1:${port}${broker.pathname}`;
    const results: { outcome: ConsumeOutcome; id: string | undefined }[] = [];
    const logs: LogEntry[] = [];
    const consumer = new EventConsumer({
      service: 'late-broker',
      db: stack.systemDb,
      amqpUrl,
      handlers: [
        {
          routingKeys: ['project.lifecycle_changed.*'],
          handle: async (event, tx) => {
            await tx.execute(sql`INSERT INTO app.note (id, account_id, body) VALUES (${uuidv7()}, ${event.accountId}, ${event.id})`);
          },
        },
      ],
      reconnectDelayMs: 100,
      reconnectMaxDelayMs: 300,
      onOutcome: (outcome, id) => results.push({ outcome, id }),
      logger: recordingLogger(logs),
    });
    consumers.push(consumer);
    try {
      await expect(consumer.start()).resolves.toBeUndefined();
      expect(consumer.isConsuming).toBe(false);
      const first = logs.filter((entry) => entry.msg === 'consumer: kết nối AMQP lần đầu chưa được, sẽ thử lại');
      expect(first.map((entry) => entry.level)).toEqual(['warn']);
      expect(first[0]?.fields).toMatchObject({ queue: 'late-broker.events' });
      // Still refused for a while: the loop keeps trying.
      await waitUntil(() => logs.some((entry) => entry.msg === 'consumer: kết nối lại AMQP chưa được, thử lại'), 'a failed retry');

      await new Promise<void>((resolve) => proxy.listen(port, '127.0.0.1', resolve));
      await waitUntil(() => consumer.isConsuming, 'consumer up once the broker is reachable');
      expect(logs.filter((entry) => entry.msg === 'consumer: đã kết nối lại AMQP, consume tiếp')).toHaveLength(1);

      const event = projectEvent();
      publishEvent(event);
      await waitUntil(() => results.some((entry) => entry.id === event.id), 'event after the late connection');
      expect(results.filter((entry) => entry.id === event.id).map((entry) => entry.outcome)).toEqual(['applied']);
      expect(await notesFor(event.id)).toBe(1);
    } finally {
      await consumer.stop();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => proxy.close(resolve));
    }
  });

  it('kết nối lại sau khi broker đóng kết nối (G1, P3)', { timeout: 60_000 }, async () => {
    const results: { outcome: ConsumeOutcome; id: string | undefined }[] = [];
    const logs: LogEntry[] = [];
    const closeWhileHandling = new Set<string>();
    const handled: { id: string; redelivered: boolean }[] = [];
    const consumer = await startConsumer('recovery', {
      handlers: [
        {
          routingKeys: ['project.lifecycle_changed.*'],
          handle: async (event, tx, delivery) => {
            handled.push({ id: event.id, redelivered: delivery.redelivered });
            await tx.execute(sql`INSERT INTO app.note (id, account_id, body) VALUES (${uuidv7()}, ${event.accountId}, ${event.id})`);
            // The broker closes every connection while this message is applied and not yet acked.
            if (closeWhileHandling.delete(event.id)) await rabbitmqctl('close_all_connections', 'test G1');
          },
        },
      ],
      reconnectDelayMs: 100,
      reconnectMaxDelayMs: 500,
      onOutcome: (outcome, id) => results.push({ outcome, id }),
      logger: recordingLogger(logs),
    });
    const outcomesOf = (id: string) => results.filter((entry) => entry.id === id).map((entry) => entry.outcome);

    const first = projectEvent();
    publishEvent(first);
    await waitUntil(() => outcomesOf(first.id).length === 1, 'first event');
    expect(outcomesOf(first.id)).toEqual(['applied']);

    // Applied and committed, then the connection is gone before the ack: the broker gives the message again on the
    // new connection and the inbox drops it.
    const cut = projectEvent();
    closeWhileHandling.add(cut.id);
    publishEvent(cut);
    await waitUntil(() => outcomesOf(cut.id).length === 2, 'redelivery after reconnect');
    expect(outcomesOf(cut.id)).toEqual(['applied', 'duplicate']);
    expect(await notesFor(cut.id)).toBe(1);
    expect(await stack.database.admin('SELECT 1 FROM app.inbox WHERE consumer = $1 AND event_id = $2', ['recovery', cut.id])).toHaveLength(1);
    expect(handled.filter((entry) => entry.id === cut.id)).toEqual([{ id: cut.id, redelivered: false }]);

    await waitUntil(() => consumer.isConsuming, 'consumer back');
    await openPublisher();
    const after = projectEvent('Archived');
    publishEvent(after);
    await waitUntil(() => outcomesOf(after.id).length === 1, 'event after reconnect');
    expect(outcomesOf(after.id)).toEqual(['applied']);
    expect(await publisher.checkQueue('recovery.events')).toMatchObject({ messageCount: 0, consumerCount: 1 });

    const lost = logs.filter((entry) => entry.msg === 'consumer: mất kết nối AMQP, sẽ kết nối lại');
    expect(lost.map((entry) => entry.level)).toEqual(['warn']);
    expect(lost[0]?.fields).toMatchObject({ queue: 'recovery.events' });
    const back = logs.filter((entry) => entry.msg === 'consumer: đã kết nối lại AMQP, consume tiếp');
    expect(back.map((entry) => entry.level)).toEqual(['info']);

    // stop() after a recovery: no consumer left on the queue.
    await consumer.stop();
    expect(consumer.isConsuming).toBe(false);
    expect(await publisher.checkQueue('recovery.events')).toMatchObject({ consumerCount: 0 });
  });

  it('chờ broker khởi động lại rồi consume tiếp (G1, kiến trúc 11.6)', { timeout: 180_000 }, async () => {
    const results: { outcome: ConsumeOutcome; id: string | undefined }[] = [];
    const logs: LogEntry[] = [];
    const quitterLogs: LogEntry[] = [];
    const handler: EventHandler = {
      routingKeys: ['project.lifecycle_changed.*'],
      handle: async (event, tx) => {
        await tx.execute(sql`INSERT INTO app.note (id, account_id, body) VALUES (${uuidv7()}, ${event.accountId}, ${event.id})`);
      },
    };
    const reconnect = { reconnectDelayMs: 200, reconnectMaxDelayMs: 1_000 };
    const consumer = await startConsumer('restart', {
      handlers: [handler],
      ...reconnect,
      onOutcome: (outcome, id) => results.push({ outcome, id }),
      logger: recordingLogger(logs),
    });
    // Stopped during the outage: it must not come back.
    const quitter = await startConsumer('quitter', {
      handlers: [handler],
      ...reconnect,
      onOutcome: () => undefined,
      logger: recordingLogger(quitterLogs),
    });
    const relay = new OutboxRelay({ db: stack.systemDb, amqpUrl: stack.rabbit.amqpUrl, service: 'workspace', logger: silent });

    try {
      await rabbitmqctl('stop_app');
      await waitUntil(() => !consumer.isConsuming && !quitter.isConsuming, 'both consumers lose the broker');

      // The broker is down: the command still commits and its event waits in the outbox (architecture 11.6).
      const projectId = uuidv7();
      const written = await withAccountTransaction(stack.appDb, ACCOUNT, (tx) =>
        writeEvent(tx, {
          producer: 'workspace',
          type: 'project.lifecycle_changed',
          accountId: ACCOUNT,
          projectId,
          aggregate: { type: 'project', id: projectId, version: 2 },
          data: { objectType: 'project', objectId: projectId, toState: 'Archived' },
        }),
      );
      await expect(relay.runOnce()).rejects.toThrow();
      await quitter.stop();
      await settle(2_000);
      expect(consumer.isConsuming).toBe(false);
      expect(logs.some((entry) => entry.level === 'warn' && entry.msg === 'consumer: kết nối lại AMQP chưa được, thử lại')).toBe(true);

      await rabbitmqctl('start_app');
      await waitUntil(() => consumer.isConsuming, 'consumer back after start_app', 120_000);
      expect(await relay.runOnce()).toEqual({ leader: true, published: 1, failed: 0 });
      await waitUntil(() => results.some((entry) => entry.id === written.id), 'event after broker restart');
      expect(results.filter((entry) => entry.id === written.id).map((entry) => entry.outcome)).toEqual(['applied']);
      expect(await notesFor(written.id)).toBe(1);
      expect(await stack.database.admin('SELECT consumer FROM app.inbox WHERE event_id = $1', [written.id])).toEqual([{ consumer: 'restart' }]);
      expect(logs.filter((entry) => entry.msg === 'consumer: đã kết nối lại AMQP, consume tiếp')).toHaveLength(1);

      // The stopped consumer stayed down: its queue kept the event and has no consumer.
      await settle(1_500);
      await openPublisher();
      expect(quitter.isConsuming).toBe(false);
      expect(await publisher.checkQueue('quitter.events')).toMatchObject({ messageCount: 1, consumerCount: 0 });
      expect(quitterLogs.some((entry) => entry.msg === 'consumer: đã kết nối lại AMQP, consume tiếp')).toBe(false);
    } finally {
      await relay.stop();
    }
  });
});

describe('start() khi broker không tới được (QC PID-00002 G5)', () => {
  it('stop() trong lúc chờ backoff: dừng sạch, không còn timer, không kết nối lại', async () => {
    // Nothing listens on this port: each attempt is refused at once.
    const port = await new Promise<number>((resolve) => {
      const probe = createServer().listen(0, '127.0.0.1', () => {
        const { port: free } = probe.address() as { port: number };
        probe.close(() => resolve(free));
      });
    });
    const logs: LogEntry[] = [];
    const consumer = new EventConsumer({
      service: 'no-broker',
      db: {} as never,
      amqpUrl: `amqp://guest:guest@127.0.0.1:${port}`,
      handlers: [{ routingKeys: ['project.lifecycle_changed.*'], handle: async () => undefined }],
      reconnectDelayMs: 200,
      reconnectMaxDelayMs: 200,
      logger: recordingLogger(logs),
    });
    await expect(consumer.start()).resolves.toBeUndefined();
    expect(consumer.isConsuming).toBe(false);
    expect(logs.map((entry) => entry.msg)).toEqual(['consumer: kết nối AMQP lần đầu chưa được, sẽ thử lại']);
    // The retry is waiting on its timer.
    expect((consumer as unknown as { reconnectTimer?: unknown }).reconnectTimer).toBeDefined();

    await consumer.stop();
    expect((consumer as unknown as { reconnectTimer?: unknown }).reconnectTimer).toBeUndefined();
    // Longer than a few backoff periods: no attempt was made after stop().
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(logs).toHaveLength(1);
    expect(consumer.isConsuming).toBe(false);
  });

  it('stop() giữa lần kết nối đang dở (broker nhận TCP mà không trả lời) trả về ngay, đóng socket (PC-05 P25)', async () => {
    // A mute broker: accepts the TCP connection and never answers the AMQP handshake.
    const sockets: Socket[] = [];
    const mute = createServer((socket) => {
      socket.on('error', () => undefined);
      // Reads and drops the handshake, so that the client closing the socket is seen.
      socket.resume();
      sockets.push(socket);
    });
    await new Promise<void>((resolve) => mute.listen(0, '127.0.0.1', resolve));
    const { port } = mute.address() as { port: number };
    const logs: LogEntry[] = [];
    const consumer = new EventConsumer({
      service: 'mute-broker',
      db: {} as never,
      amqpUrl: `amqp://guest:guest@127.0.0.1:${port}`,
      handlers: [{ routingKeys: ['project.lifecycle_changed.*'], handle: async () => undefined }],
      reconnectDelayMs: 200,
      reconnectMaxDelayMs: 200,
      logger: recordingLogger(logs),
    });
    try {
      const starting = consumer.start();
      await waitUntil(() => sockets.length === 1, 'kết nối TCP tới broker câm', 5_000);
      const closed = new Promise<void>((resolve) => sockets[0]!.once('close', () => resolve()));

      const before = Date.now();
      await consumer.stop();
      // Well under CONNECT_TIMEOUT_MS (10 s): the attempt was cancelled, not waited for.
      expect(Date.now() - before).toBeLessThan(1_000);
      await expect(starting).resolves.toBeUndefined();
      expect(Date.now() - before).toBeLessThan(1_000);
      await closed;
      expect(consumer.isConsuming).toBe(false);
      expect((consumer as unknown as { reconnectTimer?: unknown }).reconnectTimer).toBeUndefined();
      // A cancelled attempt is not a failure to report, and no new attempt follows stop().
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(logs).toEqual([]);
      expect(sockets).toHaveLength(1);
    } finally {
      await consumer.stop();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => mute.close(resolve));
    }
  });
});
