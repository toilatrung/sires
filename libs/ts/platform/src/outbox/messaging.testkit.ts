// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Test-only helper (excluded from the build): PostgreSQL 16 + pgvector with the reference DDL and the service roles
// (tenancy/postgres.testkit.ts), RabbitMQ from @sires/testing, Drizzle databases for `_app` and `_system`, and a
// queue that records what reaches the broker.

import { startRabbitMq, type StartedRabbitMq } from '@sires/testing';
import { connect, type ConsumeMessage } from 'amqplib';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { startTenantDatabase, type TenantTestDatabase } from '../tenancy/postgres.testkit';
import type { TenantDatabase } from '../tenancy/transaction';
import { EVENTS_EXCHANGE } from './outbox';

export interface MessagingTestStack {
  database: TenantTestDatabase;
  rabbit: StartedRabbitMq;
  /** `_app` role: requests (INSERT outbox only, RLS). */
  appDb: TenantDatabase;
  /** `_system` role: relay, consumer, jobs. */
  systemDb: TenantDatabase;
  stop(): Promise<void>;
}

export async function startMessagingStack(options: { rabbit?: boolean } = {}): Promise<MessagingTestStack> {
  const [database, rabbit] = await Promise.all([
    startTenantDatabase(),
    options.rabbit === false ? Promise.resolve(undefined) : startRabbitMq(),
  ]);
  const appPool = new Pool({ connectionString: database.appUrl, max: 4 });
  const systemPool = new Pool({ connectionString: database.systemUrl, max: 6 });
  return {
    database,
    rabbit: rabbit as StartedRabbitMq,
    appDb: drizzle(appPool),
    systemDb: drizzle(systemPool),
    stop: async () => {
      await Promise.allSettled([appPool.end(), systemPool.end()]);
      await Promise.allSettled([database.stop(), rabbit?.stop()]);
    },
  };
}

export interface RecordingQueue {
  readonly messages: ConsumeMessage[];
  /** Resolves once at least `count` messages arrived (rejects after `timeoutMs`). */
  waitFor(count: number, timeoutMs?: number): Promise<ConsumeMessage[]>;
  close(): Promise<void>;
}

/**
 * A server-named queue that records every message: bound to `sires.events` with `patterns`, or — with `queue` — a
 * durable named queue (a command queue such as `agent.run`) declared with `arguments`.
 */
export async function recordQueue(
  amqpUrl: string,
  target: { patterns: string[] } | { queue: string; arguments?: Record<string, unknown> },
): Promise<RecordingQueue> {
  const connection = await connect(amqpUrl);
  const channel = await connection.createChannel();
  let name: string;
  if ('patterns' in target) {
    await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true, autoDelete: false });
    name = (await channel.assertQueue('', { exclusive: true })).queue;
    for (const pattern of target.patterns) await channel.bindQueue(name, EVENTS_EXCHANGE, pattern);
  } else {
    name = (await channel.assertQueue(target.queue, { durable: true, arguments: target.arguments })).queue;
  }
  const messages: ConsumeMessage[] = [];
  await channel.consume(name, (message) => {
    if (message) messages.push(message);
  }, { noAck: true });
  return {
    messages,
    waitFor: async (count, timeoutMs = 10_000) => {
      const deadline = Date.now() + timeoutMs;
      while (messages.length < count) {
        if (Date.now() > deadline) throw new Error(`recordQueue: ${messages.length}/${count} messages after ${timeoutMs} ms`);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return messages;
    },
    close: async () => {
      await connection.close().catch(() => undefined);
    },
  };
}

/** Waits `ms` milliseconds (lets the broker deliver what it would). */
export function settle(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
