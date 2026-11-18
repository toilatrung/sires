// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { sql, type SQL } from 'drizzle-orm';
import type { SqlExecutor } from '../outbox/outbox';

// Replica helper (PID-00002 S02, H1, H2, database 3.5): upserts a row of a `replica.*` table of the listening service
// only when the event's aggregate.version is greater than the row's source_version. An older or equal version
// arriving late is skipped (AC03, EC09); the inbox only drops duplicates by event id.

export type ReplicaOutcome = 'applied' | 'skipped';

export interface ReplicaWrite {
  /** Table in schema `replica`, e.g. `project_state`. */
  table: string;
  /** Primary-key columns and values (snake_case), e.g. `{ project_id: … }`. */
  key: Readonly<Record<string, unknown>>;
  /** Other columns to write (snake_case). */
  values: Readonly<Record<string, unknown>>;
  /** `aggregate.version` of the event: written to `source_version`. */
  version: number;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * Inserts the row, or updates it when `version` > `source_version`; in the consumer's `_system` transaction.
 * Returns `applied` when written, `skipped` when the stored version is equal or greater.
 */
export async function applyReplica(tx: SqlExecutor, write: ReplicaWrite): Promise<ReplicaOutcome> {
  const keyColumns = Object.keys(write.key);
  const valueColumns = Object.keys(write.values);
  if (keyColumns.length === 0) throw new TypeError('applyReplica: key needs at least one column');
  for (const name of [write.table, ...keyColumns, ...valueColumns]) {
    if (!IDENTIFIER.test(name)) throw new TypeError(`applyReplica: “${name}” is not a plain identifier`);
  }
  if (valueColumns.includes('source_version') || keyColumns.includes('source_version')) {
    throw new TypeError('applyReplica: source_version comes from version');
  }
  if (!Number.isInteger(write.version) || write.version < 1) throw new TypeError('applyReplica: version must be an integer ≥ 1');

  const table = sql`${sql.identifier('replica')}.${sql.identifier(write.table)}`;
  const columns = [...keyColumns, ...valueColumns, 'source_version'];
  const values = [...keyColumns.map((name) => write.key[name]), ...valueColumns.map((name) => write.values[name]), write.version];
  const updates: SQL[] = [...valueColumns, 'source_version'].map(
    (name) => sql`${sql.identifier(name)} = EXCLUDED.${sql.identifier(name)}`,
  );
  const result = await tx.execute(sql`
    INSERT INTO ${table} (${sql.join(columns.map((name) => sql.identifier(name)), sql`, `)})
    VALUES (${sql.join(values.map((value) => sql`${sql.param(value)}`), sql`, `)})
    ON CONFLICT (${sql.join(keyColumns.map((name) => sql.identifier(name)), sql`, `)})
    DO UPDATE SET ${sql.join(updates, sql`, `)}
    WHERE ${table}.source_version < EXCLUDED.source_version
    RETURNING 1 AS written`);
  return result.rows.length === 1 ? 'applied' : 'skipped';
}
