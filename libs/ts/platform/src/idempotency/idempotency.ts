// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { ProblemException } from '../errors/problem.exception';
import { withAccountTransaction, type TenantDatabase, type TenantTransaction } from '../tenancy/transaction';

// Idempotency-Key of commands with effects (PID-00002 S03, DATA-IDEMP-001, architecture 5.8, database 9.3, H4). The
// key is claimed at the start of the command's own `_app` transaction (RLS on app.account_id): a concurrent request
// with the same key waits on the primary key until the first commits (EC10), and only committed results are kept, so
// a failed first attempt leaves no key (EC11). Kept 24 hours; an expired row counts as absent (EC13).

/** Header of components/parameters.yaml#/IdempotencyKey. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENCY_KEY_MIN_LENGTH = 8;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

export interface IdempotentRequest {
  accountId: string;
  /** Value of the Idempotency-Key header, checked by {@link parseIdempotencyKey}. */
  key: string;
  /** operationId of the OpenAPI operation. */
  operation: string;
  /** Request body; hashed after key-order normalisation. */
  body: unknown;
}

export interface IdempotentResponse {
  status: number;
  body: unknown;
}

export interface IdempotentResult extends IdempotentResponse {
  /** True when the stored result of an earlier request was returned and `work` did not run. */
  replayed: boolean;
}

/**
 * Checks the header value: missing → `400 validation_failed` with `errors[].field = Idempotency-Key`, code `required`
 * (H4, EC14); shorter than 8 or longer than 128 characters → `too_small` / `too_big` (EC15).
 */
export function parseIdempotencyKey(value: string | string[] | undefined): string {
  const key = Array.isArray(value) ? value[0] : value;
  if (key === undefined || key === '') throw keyProblem('required', 'Thiếu header Idempotency-Key');
  if (key.length < IDEMPOTENCY_KEY_MIN_LENGTH) {
    throw keyProblem('too_small', `Idempotency-Key cần ít nhất ${IDEMPOTENCY_KEY_MIN_LENGTH} ký tự`);
  }
  if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw keyProblem('too_big', `Idempotency-Key dài tối đa ${IDEMPOTENCY_KEY_MAX_LENGTH} ký tự`);
  }
  return key;
}

function keyProblem(code: 'required' | 'too_small' | 'too_big', message: string): ProblemException {
  return new ProblemException('validation_failed', { errors: [{ field: IDEMPOTENCY_KEY_HEADER, code, message }] });
}

/** SHA-256 of the operationId and the body with object keys sorted (same request, same hash). */
export function idempotencyRequestHash(operation: string, body: unknown): Buffer {
  return createHash('sha256').update(operation).update('\n').update(canonicalJson(body)).digest();
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, field]) => field !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([name, field]) => `${JSON.stringify(name)}:${canonicalJson(field)}`).join(',')}}`;
}

interface StoredKey extends Record<string, unknown> {
  operation: string;
  request_hash: Buffer;
  response_status: number | null;
  response_body: unknown;
}

/**
 * Runs `work` once per (account, key) within 24 hours, in one `_app` transaction of `accountId`:
 * - new key (or expired row): claim it, run `work`, store its status and body before commit;
 * - same key, same operation and body: return the stored response, `work` does not run (AC04);
 * - same key, other body or other operation: `422 idempotency_key_reused`, nothing changes (AC05, EC12).
 * `work` gets the transaction: the command's writes, its outbox rows and the key commit or roll back together.
 */
export async function runIdempotent<TSchema extends Record<string, unknown>>(
  db: TenantDatabase<TSchema>,
  request: IdempotentRequest,
  work: (tx: TenantTransaction<TSchema>) => Promise<IdempotentResponse>,
): Promise<IdempotentResult> {
  const key = parseIdempotencyKey(request.key);
  const hash = idempotencyRequestHash(request.operation, request.body);
  return withAccountTransaction(db, request.accountId, async (tx) => {
    const claimed = await tx.execute(sql`
      INSERT INTO app.idempotency_key (account_id, key, operation, request_hash)
      VALUES (${request.accountId}, ${key}, ${request.operation}, ${hash})
      ON CONFLICT (account_id, key) DO UPDATE
        SET operation = EXCLUDED.operation, request_hash = EXCLUDED.request_hash, response_status = NULL,
            response_body = NULL, created_at = now(), expires_at = now() + interval '24 hours'
        WHERE app.idempotency_key.expires_at <= now()
      RETURNING key`);
    if (claimed.rows.length === 0) {
      const { rows } = await tx.execute<StoredKey>(sql`
        SELECT operation, request_hash, response_status, response_body FROM app.idempotency_key
        WHERE account_id = ${request.accountId} AND key = ${key}`);
      const stored = rows[0];
      if (!stored || stored.operation !== request.operation || !hash.equals(stored.request_hash) || stored.response_status === null) {
        throw new ProblemException('idempotency_key_reused', {
          detail: 'Idempotency-Key đã dùng cho một yêu cầu khác trong 24 giờ qua',
        });
      }
      return { status: stored.response_status, body: stored.response_body ?? undefined, replayed: true };
    }
    const response = await work(tx);
    await tx.execute(sql`
      UPDATE app.idempotency_key SET response_status = ${response.status},
        response_body = ${response.body === undefined ? null : JSON.stringify(response.body)}::jsonb
      WHERE account_id = ${request.accountId} AND key = ${key}`);
    return { ...response, replayed: false };
  });
}
