// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { sql, type SQL } from 'drizzle-orm';
import type { Logger } from 'pino';
import { createLogger } from '../logging/logger';
import type { SqlExecutor } from '../outbox/outbox';
import { acquireLease, leaseOwner } from './lease';

// Retention cleanup of the platform tables (PID-00002 S05, database 12.2), under a lease so two pods never run the
// same job: hourly — app.outbox rows published more than 24 hours ago and app.idempotency_key rows past expires_at;
// daily — app.inbox rows processed more than 7 days ago. An unpublished outbox row is never deleted, however old
// (EC18). Audit Events live in the audit store (PID-00045), not here. Runs with the `_system` role.

export const CLEANUP_HOURLY_LEASE = 'cleanup.hourly';
export const CLEANUP_DAILY_LEASE = 'cleanup.daily';
export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** Rows deleted per statement, so one run never holds long locks. */
const BATCH = 5_000;

export interface HourlyCleanup {
  ran: boolean;
  outbox: number;
  idempotencyKeys: number;
}

export interface DailyCleanup {
  ran: boolean;
  inbox: number;
}

export interface CleanupOptions {
  /** Lease owner; defaults to host, pid and a random suffix. */
  owner?: string;
}

/**
 * Hourly job: deletes published outbox rows older than 24 hours and expired idempotency keys. Takes the lease for one
 * hour, so another pod skips this hour; returns `ran: false` then.
 */
export async function runHourlyCleanup(db: SqlExecutor, options: CleanupOptions = {}): Promise<HourlyCleanup> {
  if (!(await acquireLease(db, { name: CLEANUP_HOURLY_LEASE, owner: options.owner ?? defaultOwner(), ttlMs: HOUR_MS }))) {
    return { ran: false, outbox: 0, idempotencyKeys: 0 };
  }
  const outbox = await deleteInBatches(
    db,
    (limit) => sql`DELETE FROM app.outbox WHERE id IN (
      SELECT id FROM app.outbox WHERE published_at IS NOT NULL AND published_at < now() - interval '24 hours' LIMIT ${limit})`,
  );
  const idempotencyKeys = await deleteInBatches(
    db,
    (limit) => sql`DELETE FROM app.idempotency_key WHERE (account_id, key) IN (
      SELECT account_id, key FROM app.idempotency_key WHERE expires_at < now() LIMIT ${limit})`,
  );
  return { ran: true, outbox, idempotencyKeys };
}

/** Daily job: deletes inbox rows processed more than 7 days ago. Takes the lease for one day. */
export async function runDailyCleanup(db: SqlExecutor, options: CleanupOptions = {}): Promise<DailyCleanup> {
  if (!(await acquireLease(db, { name: CLEANUP_DAILY_LEASE, owner: options.owner ?? defaultOwner(), ttlMs: DAY_MS }))) {
    return { ran: false, inbox: 0 };
  }
  const inbox = await deleteInBatches(
    db,
    (limit) => sql`DELETE FROM app.inbox WHERE (consumer, event_id) IN (
      SELECT consumer, event_id FROM app.inbox WHERE processed_at < now() - interval '7 days' LIMIT ${limit})`,
  );
  return { ran: true, inbox };
}

export interface CleanupScheduleOptions extends CleanupOptions {
  /** Service name, for logs. */
  service: string;
  logger?: Pick<Logger, 'info' | 'error'>;
}

/**
 * Starts both jobs on timers (hourly, daily; a first try at start). Every pod may call it: the leases keep one runner
 * per job. Returns a function that stops the timers.
 */
export function startCleanupJobs(db: SqlExecutor, options: CleanupScheduleOptions): () => void {
  const owner = options.owner ?? leaseOwner();
  const logger = options.logger ?? createLogger({ service: options.service });
  const run = (name: string, job: () => Promise<{ ran: boolean }>) => async () => {
    try {
      const result = await job();
      if (result.ran) logger.info({ job: name, ...result }, 'job dọn đã chạy');
    } catch (error) {
      logger.error({ job: name, err: error }, 'job dọn lỗi');
    }
  };
  const hourly = run(CLEANUP_HOURLY_LEASE, () => runHourlyCleanup(db, { owner }));
  const daily = run(CLEANUP_DAILY_LEASE, () => runDailyCleanup(db, { owner }));
  void hourly();
  void daily();
  const timers = [setInterval(() => void hourly(), HOUR_MS), setInterval(() => void daily(), DAY_MS)];
  for (const timer of timers) timer.unref();
  return () => timers.forEach(clearInterval);
}

async function deleteInBatches(db: SqlExecutor, statement: (limit: number) => SQL): Promise<number> {
  let total = 0;
  for (;;) {
    const deleted = (await db.execute(statement(BATCH))).rowCount ?? 0;
    total += deleted;
    if (deleted < BATCH) return total;
  }
}

let processOwner: string | undefined;
function defaultOwner(): string {
  processOwner ??= leaseOwner();
  return processOwner;
}
