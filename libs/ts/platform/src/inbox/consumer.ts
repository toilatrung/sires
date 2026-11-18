// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

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
  logger?: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** Called after each message is acked or nacked, e.g. for metrics. */
  onOutcome?: (outcome: ConsumeOutcome, messageId: string | undefined) => void;
}

export type ConsumeOutcome = 'applied' | 'duplicate' | 'unhandled' | 'rejected' | 'failed';

export class EventConsumer {
  readonly queue: string;
  private readonly logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  private connection?: ChannelModel;
  private channel?: Channel;
  private consumerTag?: string;
  private readonly inFlight = new Set<Promise<ConsumeOutcome>>();

  constructor(private readonly options: EventConsumerOptions) {
    if (options.handlers.length === 0) throw new TypeError('EventConsumer: at least one handler');
    this.queue = `${options.service}.events`;
    this.logger = options.logger ?? createLogger({ service: options.service });
  }

  /** Routing-key patterns bound to the queue. */
  get routingKeys(): string[] {
    return [...new Set(this.options.handlers.flatMap((handler) => handler.routingKeys))];
  }

  /** Declares the exchange, the queue and its bindings, then consumes with manual ack. */
  async start(): Promise<void> {
    if (this.channel) return;
    const connection = await connect(this.options.amqpUrl);
    connection.on('error', (error: Error) => this.logger.warn({ err: error }, 'consumer: lỗi kết nối AMQP'));
    const channel = await connection.createChannel();
    channel.on('error', (error: Error) => this.logger.warn({ err: error }, 'consumer: kênh AMQP bị đóng'));
    await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true, autoDelete: false });
    await channel.assertQueue(this.queue, { durable: true, arguments: this.options.queueArguments });
    for (const pattern of this.routingKeys) await channel.bindQueue(this.queue, EVENTS_EXCHANGE, pattern);
    await channel.prefetch(this.options.prefetch ?? 10);
    this.connection = connection;
    this.channel = channel;
    const { consumerTag } = await channel.consume(this.queue, (message) => {
      if (!message) return;
      const work = this.process(channel, message);
      this.inFlight.add(work);
      void work.finally(() => this.inFlight.delete(work));
    });
    this.consumerTag = consumerTag;
  }

  /** Stops consuming, waits for the messages in flight, closes the connection. */
  async stop(): Promise<void> {
    const { channel, connection, consumerTag } = this;
    this.channel = undefined;
    this.connection = undefined;
    if (channel && consumerTag) await channel.cancel(consumerTag).catch(() => undefined);
    await Promise.allSettled([...this.inFlight]);
    await connection?.close().catch(() => undefined);
  }

  private async process(channel: Channel, message: ConsumeMessage): Promise<ConsumeOutcome> {
    const outcome = await this.handle(message);
    try {
      if (outcome === 'failed') channel.nack(message, false, true);
      else if (outcome === 'rejected') channel.nack(message, false, false);
      else channel.ack(message);
    } catch (error) {
      // Channel closed meanwhile: the broker gives the message again.
      this.logger.warn({ message_id: messageId(message), err: error }, 'consumer: không ack được message');
    }
    this.options.onOutcome?.(outcome, messageId(message));
    return outcome;
  }

  /** Validates, deduplicates and applies one message; never throws. */
  async handle(message: ConsumeMessage): Promise<ConsumeOutcome> {
    const id = messageId(message);
    const routingKey = message.fields.routingKey;
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
