// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTransactionConfig } from 'drizzle-orm/pg-core';
import { isUuid } from './uuid';

/** Drizzle database over a node-postgres pool, connected with the service's `_app` role. */
export type TenantDatabase<TSchema extends Record<string, unknown> = Record<string, never>> = NodePgDatabase<TSchema>;

/** Transaction handed to the callback of {@link withAccountTransaction}; nested `transaction()` uses savepoints. */
export type TenantTransaction<TSchema extends Record<string, unknown> = Record<string, never>> = Parameters<
  Parameters<TenantDatabase<TSchema>['transaction']>[0]
>[0];

/**
 * Runs `work` in one database transaction scoped to `accountId`.
 *
 * The transaction first runs `set_config('app.account_id', accountId, true)` — the bind-parameter form of
 * `SET LOCAL app.account_id` — so RLS policies (`account_id = app.current_account_id()`, database 11.1) only match
 * rows of that account. The setting ends with the transaction, so a pooled connection never carries it to the next
 * caller. When `work` throws, the transaction rolls back and the original error is rethrown, even if the rollback
 * itself fails.
 */
export async function withAccountTransaction<TSchema extends Record<string, unknown>, T>(
  db: TenantDatabase<TSchema>,
  accountId: string,
  work: (tx: TenantTransaction<TSchema>) => Promise<T>,
  config?: PgTransactionConfig,
): Promise<T> {
  if (!isUuid(accountId)) {
    throw new TypeError('withAccountTransaction: accountId must be a UUID');
  }
  let workFailed = false;
  let workError: unknown;
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.account_id', ${accountId}, true)`);
      try {
        return await work(tx);
      } catch (error) {
        workFailed = true;
        workError = error;
        throw error;
      }
    }, config);
  } catch (error) {
    // A failed ROLLBACK must not hide why the transaction was aborted.
    throw workFailed ? workError : error;
  }
}
