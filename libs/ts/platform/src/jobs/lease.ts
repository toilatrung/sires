// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { sql } from 'drizzle-orm';
import type { SqlExecutor } from '../outbox/outbox';

// Leader lease of background jobs in app.job_lock (database 9.4): one pod runs the relay or a cleanup job until
// `lease_until`; no advisory lock. Runs with the `_system` role (the `_app` role has no access to app.job_lock).

/** Identity of this process as a lease owner: host, pid and a random suffix. */
export function leaseOwner(): string {
  return `${hostname()}:${process.pid}:${randomBytes(4).toString('hex')}`;
}

export interface LeaseRequest {
  /** Job name, e.g. `outbox-relay`, `cleanup.hourly`. */
  name: string;
  owner: string;
  /** How long the lease lasts from now, in milliseconds. */
  ttlMs: number;
}

/**
 * Takes or renews the lease `name` for `owner`: succeeds when nobody holds it, when the holder's `lease_until` has
 * passed, or when `owner` already holds it (renewal). Returns false while another owner holds a live lease.
 */
export async function acquireLease(db: SqlExecutor, { name, owner, ttlMs }: LeaseRequest): Promise<boolean> {
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) throw new TypeError('acquireLease: ttlMs must be a positive integer');
  const result = await db.execute(sql`
    INSERT INTO app.job_lock (name, owner, lease_until)
    VALUES (${name}, ${owner}, now() + ${ttlMs} * interval '1 millisecond')
    ON CONFLICT (name) DO UPDATE SET owner = EXCLUDED.owner, lease_until = EXCLUDED.lease_until
      WHERE app.job_lock.lease_until < now() OR app.job_lock.owner = EXCLUDED.owner
    RETURNING owner`);
  return result.rows.length === 1;
}

/** Gives the lease up so another pod can take it at once (shutdown). No effect when `owner` does not hold it. */
export async function releaseLease(db: SqlExecutor, name: string, owner: string): Promise<void> {
  await db.execute(sql`DELETE FROM app.job_lock WHERE name = ${name} AND owner = ${owner}`);
}
