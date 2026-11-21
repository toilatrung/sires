// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import {
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  type TextMapGetter,
} from '@opentelemetry/api';
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';
import { sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { runWithLogContext } from '../logging/context';
import { createLogger } from '../logging/logger';
import { eventEnvelopeSchema, topicMatches, type EventEnvelope } from '../outbox/envelope';
import { EVENTS_EXCHANGE } from '../outbox/outbox';
import type { TenantDatabase, TenantTransaction } from '../tenancy/transaction';

// Shared event consumer with an idempotent inbox (PID-00002 S02, database 9.3, H1): one queue `<service>.events`
// bound to the routing keys of the registered handlers; each message runs in one `_system` transaction that first
// inserts (consumer, event_id) into app.inbox — already there means a duplicate and the handlers do not run — then
// runs the handlers; ack after commit, nack with requeue after rollback (EC07). A message that is not an
// EventEnvelope is nacked without requeue, to the dead-letter of the queue (EC08). The inbox does not compare versions:
// replica tables do, through applyReplica (H1).
//
// Recovery (architecture 11.6: work waits in the queue until the broker is back): once started, losing the
// connection, the channel or the consumer (broker restart, failover, network, queue deleted) is logged and followed by
// reconnect attempts with exponential backoff until one succeeds or stop() is called; each attempt declares the
// exchange, queue, bindings and prefetch again. Messages unacked on the lost channel come back from the broker and
// the inbox drops the ones already applied.
//
// Tracing (architecture 11.4, NFR-OBS-004): each message runs in a CONSUMER span `consume <routing key>` whose parent
// is the W3C `traceparent` header set by the relay, so events and Audit Events written by handlers, and their logs,
// stay on the trace of the request that caused them.

export interface EventHandler {
  /** Routing-key patterns bound on `sires.events` (`task.activated`, `workflow.status_changed.*`, `reference.#`). */
  routingKeys: readonly string[];
  /** Applies the event in the inbox transaction; throw to roll back and get the message again. */
  handle(event: EventEnvelope, tx: TenantTransaction, delivery: EventDelivery): Promise<void>;
}

export interface EventDelivery {
  routingKey: string;
  redelivered: boolean;
}

export interface EventConsumerOptions {
  /** Service name: the queue is `<service>.events` and the inbox `consumer` is the service. */
  service: string;
  /** Drizzle database connected with the service's `_system` role. */
  db: TenantDatabase;
  amqpUrl: string;
  handlers: readonly EventHandler[];
  /**
   * Arguments of the queue (`x-queue-type: quorum`, `x-dead-letter-exchange`, `x-delivery-limit`…), from the
   * service configuration: the topology of each environment is set by PID-00057. Must match an existing queue.
   */
  queueArguments?: Record<string, unknown>;
  /** Messages processed at once; default 10. */
  prefetch?: number;
  /** Wait before the first reconnect attempt after the connection is lost, doubled at each failed attempt; default 1 s. */
  reconnectDelayMs?: number;
  /** Longest wait between two reconnect attempts; default 30 s. */
  reconnectMaxDelayMs?: number;
  logger?: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** Called after each message is acked or nacked, e.g. for metrics. */
  onOutcome?: (outcome: ConsumeOutcome, messageId: string | undefined) => void;
}

export type ConsumeOutcome = 'applied' | 'duplicate' | 'unhandled' | 'rejected' | 'failed';

/** One connection, its channel and its consumer; replaced as a whole when any of them is lost. */
interface Link {
  connection: ChannelModel;
  channel?: Channel;
  consumerTag?: string;
  lost: boolean;
  error?: unknown;
}

/** Longest wait for the TCP connection and AMQP handshake of one attempt. */
const CONNECT_TIMEOUT_MS = 10_000;

/** AMQP headers as a W3C carrier: names in lower case, string or byte values. */
const headerGetter: TextMapGetter<Record<string, unknown>> = {
  keys: (carrier) => Object.keys(carrier),
  get: (carrier, key) => {
    const name = Object.keys(carrier).find((candidate) => candidate.toLowerCase() === key);
    const value = name === undefined ? undefined : carrier[name];
    if (typeof value === 'string') return value;
    return Buffer.isBuffer(value) ? value.toString('utf8') : undefined;
  },
};

export class EventConsumer {
  readonly queue: string;
  private readonly logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  private readonly reconnectDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly inFlight = new Set<Promise<ConsumeOutcome>>();
  /** True between start() and stop(): a lost link is replaced. */
  private running = false;
  private link?: Link;
  private opening?: Promise<void>;
  private reconnectTimer?: NodeJS.Timeout;
  private failedAttempts = 0;

  constructor(private readonly options: EventConsumerOptions) {
    if (options.handlers.length === 0) throw new TypeError('EventConsumer: at least one handler');
    this.queue = `${options.service}.events`;
    this.logger = options.logger ?? createLogger({ service: options.service });
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1_000;
    this.reconnectMaxDelayMs = Math.max(this.reconnectDelayMs, options.reconnectMaxDelayMs ?? 30_000);
  }

  /** Routing-key patterns bound to the queue. */
  get routingKeys(): string[] {
    return [...new Set(this.options.handlers.flatMap((handler) => handler.routingKeys))];
  }

  /** True while the consumer is registered on a live channel; false while reconnecting or stopped (for health). */
  get isConsuming(): boolean {
    return this.link !== undefined;
  }

  /**
   * Declares the exchange, the queue and its bindings, then consumes with manual ack. Rejects when this first
   * connection fails (the consumer stays stopped); after it, a lost connection is reconnected until {@link stop}.
   */
  async start(): Promise<void> {
    if (this.running) {
      await this.opening;
      return;
    }
    this.running = true;
    this.failedAttempts = 0;
    try {
      await this.open();
    } catch (error) {
      this.running = false;
      throw error;
    }
  }

  /** Stops consuming and reconnecting, waits for the messages in flight, closes the connection. */
  async stop(): Promise<void> {
    this.running = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    await this.opening?.catch(() => undefined);
    const link = this.link;
    this.link = undefined;
    if (link?.channel && link.consumerTag) await link.channel.cancel(link.consumerTag).catch(() => undefined);
    await Promise.allSettled([...this.inFlight]);
    await link?.connection.close().catch(() => undefined);
  }

  /** One connection attempt; the link becomes current only once its consumer is registered and still alive. */
  private async open(): Promise<void> {
    const opening = this.connectAndConsume();
    this.opening = opening;
    try {
      await opening;
    } finally {
      if (this.opening === opening) this.opening = undefined;
    }
  }

  private async connectAndConsume(): Promise<void> {
    // The timeout bounds the TCP and AMQP opening only, so an attempt on a dead network fails and is retried.
    const connection = await connect(this.options.amqpUrl, { timeout: CONNECT_TIMEOUT_MS });
    const link: Link = { connection, lost: false };
    // 'error' comes before 'close': keep it for the log of the loss (an unhandled 'error' would crash the process).
    connection.on('error', (error: unknown) => {
      link.error = error;
    });
    connection.on('close', (error?: unknown) => this.lose(link, 'kết nối AMQP đóng', error));
    try {
      const channel = await connection.createChannel();
      link.channel = channel;
      channel.on('error', (error: unknown) => {
        link.error = error;
      });
      channel.on('close', () => this.lose(link, 'kênh AMQP đóng'));
      await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true, autoDelete: false });
      await channel.assertQueue(this.queue, { durable: true, arguments: this.options.queueArguments });
      for (const pattern of this.routingKeys) await channel.bindQueue(this.queue, EVENTS_EXCHANGE, pattern);
      await channel.prefetch(this.options.prefetch ?? 10);
      if (!this.running) {
        await connection.close().catch(() => undefined);
        return;
      }
      const { consumerTag } = await channel.consume(this.queue, (message) => {
        // null: the broker cancelled the consumer (queue deleted, failover).
        if (!message) return this.lose(link, 'broker hủy consumer');
        const work = this.process(channel, message);
        this.inFlight.add(work);
        void work.finally(() => this.inFlight.delete(work));
      });
      link.consumerTag = consumerTag;
      if (link.lost) throw link.error instanceof Error ? link.error : new Error('consumer: AMQP đóng trong lúc khai báo');
      this.link = link;
    } catch (error) {
      link.lost = true;
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  /** Marks a link lost; when it was the current one, closes it and schedules the reconnect. */
  private lose(link: Link, reason: string, error?: unknown): void {
    if (link.lost) return;
    link.lost = true;
    if (this.link !== link) return;
    this.link = undefined;
    void link.connection.close().catch(() => undefined);
    if (!this.running) return;
    this.logger.warn({ queue: this.queue, reason, err: error ?? link.error }, 'consumer: mất kết nối AMQP, sẽ kết nối lại');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer) return;
    const base = Math.min(this.reconnectMaxDelayMs, this.reconnectDelayMs * 2 ** this.failedAttempts);
    // ±20 % so that the pods of a service do not reconnect in step after a broker restart.
    const delay = Math.min(this.reconnectMaxDelayMs, Math.round(base * (0.8 + Math.random() * 0.4)));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.reconnect();
    }, delay);
  }

  private async reconnect(): Promise<void> {
    if (!this.running) return;
    try {
      await this.open();
    } catch (error) {
      this.failedAttempts += 1;
      if (!this.running) return;
      this.logger.warn({ queue: this.queue, attempt: this.failedAttempts, err: error }, 'consumer: kết nối lại AMQP chưa được, thử lại');
      this.scheduleReconnect();
      return;
    }
    if (!this.link) return;
    this.logger.info({ queue: this.queue, failed_attempts: this.failedAttempts }, 'consumer: đã kết nối lại AMQP, consume tiếp');
    this.failedAttempts = 0;
  }

  private async process(channel: Channel, message: ConsumeMessage): Promise<ConsumeOutcome> {
    const outcome = await this.handle(message);
    try {
      if (outcome === 'failed') channel.nack(message, false, true);
      else if (outcome === 'rejected') channel.nack(message, false, false);
      else channel.ack(message);
    } catch (error) {
      // Channel closed meanwhile: the broker gives the message again and the inbox drops it if it was applied.
      this.logger.warn({ message_id: messageId(message), err: error }, 'consumer: không ack được message');
    }
    this.options.onOutcome?.(outcome, messageId(message));
    return outcome;
  }

  /**
   * Validates, deduplicates and applies one message in a CONSUMER span continuing its `traceparent` header; never
   * throws.
   */
  async handle(message: ConsumeMessage): Promise<ConsumeOutcome> {
    const routingKey = message.fields.routingKey;
    const id = messageId(message);
    const parent = propagation.extract(ROOT_CONTEXT, message.properties.headers ?? {}, headerGetter);
    const attributes = {
      'messaging.system': 'rabbitmq',
      'messaging.operation.type': 'process',
      'messaging.destination.name': message.fields.exchange,
      'messaging.rabbitmq.destination.routing_key': routingKey,
      ...(id ? { 'messaging.message.id': id } : {}),
    };
    // Looked up per message: a tracer taken at load time would keep a provider replaced since (tests, restarts).
    const tracer = trace.getTracer('@sires/platform');
    return tracer.startActiveSpan(`consume ${routingKey}`, { kind: SpanKind.CONSUMER, attributes }, parent, async (span) => {
      try {
        const outcome = await this.apply(message, id, routingKey);
        span.setAttribute('sires.consume.outcome', outcome);
        if (outcome === 'failed' || outcome === 'rejected') span.setStatus({ code: SpanStatusCode.ERROR });
        return outcome;
      } finally {
        span.end();
      }
    });
  }

  private async apply(message: ConsumeMessage, id: string | undefined, routingKey: string): Promise<ConsumeOutcome> {
    const event = parseEnvelope(message.content);
    if (!event) {
      // Never the payload (NFR-OBS-002): it may hold user data.
      this.logger.warn({ message_id: id, routing_key: routingKey }, 'consumer: message không đúng vỏ sự kiện, chuyển dead-letter');
      return 'rejected';
    }
    const handlers = this.options.handlers.filter((handler) => handler.routingKeys.some((pattern) => topicMatches(pattern, routingKey)));
    if (handlers.length === 0) return 'unhandled';

    return runWithLogContext({ accountId: event.accountId, ...(event.projectId ? { projectId: event.projectId } : {}) }, async () => {
      try {
        return await this.options.db.transaction(async (tx) => {
          const inserted = await tx.execute(sql`
            INSERT INTO app.inbox (consumer, event_id, account_id, routing_key)
            VALUES (${this.options.service}, ${event.id}, ${event.accountId}, ${routingKey})
            ON CONFLICT (consumer, event_id) DO NOTHING
            RETURNING event_id`);
          if (inserted.rows.length === 0) return 'duplicate' as const;
          const delivery = { routingKey, redelivered: message.fields.redelivered };
          for (const handler of handlers) await handler.handle(event, tx, delivery);
          return 'applied' as const;
        });
      } catch (error) {
        this.logger.error({ message_id: event.id, routing_key: routingKey, err: error }, 'consumer: xử lý sự kiện lỗi, giao lại');
        return 'failed';
      }
    });
  }
}

function messageId(message: ConsumeMessage): string | undefined {
  const header = message.properties.headers?.['message_id'];
  return (message.properties.messageId as string | undefined) ?? (typeof header === 'string' ? header : undefined);
}

function parseEnvelope(content: Buffer): EventEnvelope | undefined {
  let value: unknown;
  try {
    value = JSON.parse(content.toString('utf8'));
  } catch {
    return undefined;
  }
  const parsed = eventEnvelopeSchema.safeParse(value);
  return parsed.success ? (parsed.data as EventEnvelope) : undefined;
}
