// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { connect, type ChannelModel, type ConfirmChannel, type Message } from 'amqplib';
import { sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { acquireLease, leaseOwner, releaseLease } from '../jobs/lease';
import { createLogger } from '../logging/logger';
import type { TenantDatabase } from '../tenancy/transaction';
import { EVENTS_EXCHANGE } from './outbox';

// Outbox relay (PID-00002 S01, architecture 6.4, database 9.2 and 9.4): one pod holds the lease, reads unpublished
// rows in created_at order with FOR UPDATE SKIP LOCKED, publishes them persistent with publisher confirms and sets
// published_at only for confirmed rows, in the same transaction. Delivery is at least once: a relay that stops after
// publishing and before committing publishes the same message_id again (EC01); consumers drop it through the inbox.

/** Lease name in app.job_lock (one relay per service database). */
export const OUTBOX_RELAY_LEASE = 'outbox-relay';

export interface OutboxRelayOptions {
  /** Drizzle database connected with the service's `_system` role (BYPASSRLS, reads app.outbox). */
  db: TenantDatabase;
  /** AMQP URL of RabbitMQ. */
  amqpUrl: string;
  /** Service name, for logs. */
  service: string;
  /** Lease owner; defaults to host, pid and a random suffix. */
  owner?: string;
  /** Rows per batch; default 100. */
  batchSize?: number;
  /** Lease length, renewed at each run; default 30 s. */
  leaseTtlMs?: number;
  /** Pause between runs when the last batch was not full; default 1 s. */
  intervalMs?: number;
  /** A publish without confirm after this long counts as not published; default 10 s. */
  confirmTimeoutMs?: number;
  logger?: Pick<Logger, 'info' | 'warn' | 'error'>;
}

export interface RelayRunResult {
  /** False when another pod holds the lease: nothing was read. */
  leader: boolean;
  /** Rows confirmed by the broker and marked published. */
  published: number;
  /** Rows read but not confirmed (nack, return, closed channel, timeout): left for the next run. */
  failed: number;
}

interface OutboxRecord extends Record<string, unknown> {
  id: string;
  kind: 'event' | 'audit' | 'command';
  routing_key: string;
  payload: unknown;
  traceparent: string | null;
}

export class OutboxRelay {
  private readonly owner: string;
  private readonly batchSize: number;
  private readonly leaseTtlMs: number;
  private readonly intervalMs: number;
  private readonly confirmTimeoutMs: number;
  private readonly logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private timer?: NodeJS.Timeout;
  private running?: Promise<unknown>;
  private stopped = true;

  constructor(private readonly options: OutboxRelayOptions) {
    this.owner = options.owner ?? leaseOwner();
    this.batchSize = options.batchSize ?? 100;
    this.leaseTtlMs = options.leaseTtlMs ?? 30_000;
    this.intervalMs = options.intervalMs ?? 1_000;
    this.confirmTimeoutMs = options.confirmTimeoutMs ?? 10_000;
    this.logger = options.logger ?? createLogger({ service: options.service });
  }

  /** One batch: takes or renews the lease, publishes up to `batchSize` rows, marks the confirmed ones. */
  async runOnce(): Promise<RelayRunResult> {
    const { db } = this.options;
    if (!(await acquireLease(db, { name: OUTBOX_RELAY_LEASE, owner: this.owner, ttlMs: this.leaseTtlMs }))) {
      return { leader: false, published: 0, failed: 0 };
    }
    const channel = await this.openChannel();
    return db.transaction(async (tx) => {
      const { rows } = await tx.execute<OutboxRecord>(sql`
        SELECT id, kind, routing_key, payload, traceparent FROM app.outbox
        WHERE published_at IS NULL ORDER BY created_at, id LIMIT ${this.batchSize}
        FOR UPDATE SKIP LOCKED`);
      if (rows.length === 0) return { leader: true, published: 0, failed: 0 };
      const confirmed = await this.publishBatch(channel, rows);
      if (confirmed.length > 0) {
        await tx.execute(sql`UPDATE app.outbox SET published_at = now() WHERE id = ANY(${`{${confirmed.join(',')}}`}::uuid[])`);
      }
      return { leader: true, published: confirmed.length, failed: rows.length - confirmed.length };
    });
  }

  /** Runs batches until {@link stop}: at once again after a full batch, else after `intervalMs`. */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    const tick = async () => {
      let full = false;
      try {
        const result = await (this.running = this.runOnce());
        full = result.published + result.failed >= this.batchSize && result.failed === 0;
      } catch (error) {
        this.logger.error({ err: error }, 'outbox relay: lượt chạy lỗi');
      }
      if (!this.stopped) this.timer = setTimeout(() => void tick(), full ? 0 : this.intervalMs);
    };
    void tick();
  }

  /** Stops the loop, waits for the batch in flight, gives the lease up and closes the AMQP connection. */
  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running?.catch(() => undefined);
    await releaseLease(this.options.db, OUTBOX_RELAY_LEASE, this.owner).catch(() => undefined);
    await this.close();
  }

  /** Closes the AMQP connection; the next run opens a new one. */
  async close(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;
    this.channel = undefined;
    await connection?.close().catch(() => undefined);
  }

  private async openChannel(): Promise<ConfirmChannel> {
    if (this.channel) return this.channel;
    if (!this.connection) {
      const connection = await connect(this.options.amqpUrl);
      connection.on('error', (error: Error) => this.logger.warn({ err: error }, 'outbox relay: lỗi kết nối AMQP'));
      connection.on('close', () => {
        if (this.connection === connection) {
          this.connection = undefined;
          this.channel = undefined;
        }
      });
      this.connection = connection;
    }
    const channel = await this.connection.createConfirmChannel();
    // A closed channel (unknown exchange, broker error) is replaced at the next run.
    channel.on('error', (error: Error) => this.logger.warn({ err: error }, 'outbox relay: kênh AMQP bị đóng'));
    channel.on('close', () => {
      if (this.channel === channel) this.channel = undefined;
    });
    await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true, autoDelete: false });
    this.channel = channel;
    return channel;
  }

  /** Publishes the rows in order and returns the ids the broker confirmed and did not return. */
  private async publishBatch(channel: ConfirmChannel, rows: readonly OutboxRecord[]): Promise<string[]> {
    const returned = new Set<string>();
    // A mandatory command with no queue comes back (basic.return) before its confirm.
    const onReturn = (message: Message) => {
      const id = message.properties.messageId as string | undefined;
      if (id) returned.add(id);
    };
    channel.on('return', onReturn);
    let timedOut = false;
    try {
      const outcomes = await Promise.all(
        rows.map((row) =>
          this.withTimeout(this.publishOne(channel, row)).then(
            (confirmed) => {
              if (!confirmed) timedOut = true;
              return confirmed;
            },
            (error: unknown) => {
              this.logger.warn({ message_id: row.id, err: error }, 'outbox relay: broker không xác nhận');
              return false;
            },
          ),
        ),
      );
      const confirmed = rows.filter((row, index) => outcomes[index] && !returned.has(row.id)).map((row) => row.id);
      for (const id of returned) this.logger.warn({ message_id: id }, 'outbox relay: lệnh không có queue nhận');
      return confirmed;
    } finally {
      channel.off('return', onReturn);
      // Late confirms of this channel can no longer be matched to rows: start again on a new channel.
      if (timedOut) {
        if (this.channel === channel) this.channel = undefined;
        await channel.close().catch(() => undefined);
      }
    }
  }

  private publishOne(channel: ConfirmChannel, row: OutboxRecord): Promise<void> {
    const command = row.kind === 'command';
    return new Promise<void>((resolve, reject) => {
      try {
        channel.publish(
          command ? '' : EVENTS_EXCHANGE,
          row.routing_key,
          Buffer.from(JSON.stringify(row.payload)),
          {
            persistent: true,
            mandatory: command,
            messageId: row.id,
            contentType: 'application/json',
            timestamp: Math.floor(Date.now() / 1000),
            headers: { message_id: row.id, ...(row.traceparent ? { traceparent: row.traceparent } : {}) },
          },
          (error: unknown) => (error ? reject(error instanceof Error ? error : new Error(String(error))) : resolve()),
        );
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** True when `publish` confirms in time, false on timeout; rejects on nack or a closed channel. */
  private withTimeout(publish: Promise<void>): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), this.confirmTimeoutMs);
    });
    return Promise.race([publish.then(() => true), timeout]).finally(() => clearTimeout(timer));
  }
}
