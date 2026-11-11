// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { HttpException, HttpStatus, PreconditionFailedException } from '@nestjs/common';

// Optimistic concurrency (DATA-CONC-001): an editable entity answers with `ETag: "<rowVersion>"`; a write sends that
// value back in `If-Match` and runs `UPDATE … WHERE id = :id AND row_version = :v` (database DDL 00-common.sql).

const STRONG_ETAG = /^"(\d{1,15})"$/;

/** `428 Precondition Required`: the write needs `If-Match` (docs/api-design responses.yaml › PreconditionRequired). */
export class PreconditionRequiredException extends HttpException {
  constructor(message = 'Thiếu If-Match') {
    super(message, HttpStatus.PRECONDITION_REQUIRED);
  }
}

/** ETag header value for a row version, for example `"7"`. */
export function formatEtag(rowVersion: number): string {
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 0) {
    throw new TypeError(`formatEtag: rowVersion must be a non-negative integer, got ${rowVersion}`);
  }
  return `"${rowVersion}"`;
}

/**
 * Returns the row version named by an `If-Match` header.
 * Missing or empty header → {@link PreconditionRequiredException} (428). A value that cannot name one row version —
 * `*`, a weak tag, a list, a non-numeric tag — can never match, so it fails like a stale version: 412.
 */
export function parseIfMatch(ifMatch: string | readonly string[] | undefined): number {
  const raw = typeof ifMatch === 'string' ? ifMatch : ifMatch?.join(',');
  if (raw === undefined || raw.trim() === '') {
    throw new PreconditionRequiredException();
  }
  const match = STRONG_ETAG.exec(raw.trim());
  if (!match) {
    throw new PreconditionFailedException('If-Match không khớp rowVersion hiện hành');
  }
  return Number(match[1]);
}

/** Throws 412 unless `If-Match` names `currentRowVersion`; 428 when the header is missing. */
export function assertIfMatch(ifMatch: string | readonly string[] | undefined, currentRowVersion: number): void {
  if (parseIfMatch(ifMatch) !== currentRowVersion) {
    throw new PreconditionFailedException('If-Match không khớp rowVersion hiện hành');
  }
}

/**
 * Runs a conditional update guarded by `If-Match`: `update` receives the expected row version and must only touch
 * rows still at that version (`WHERE … AND row_version = expected … RETURNING`). No row updated → 412, nothing
 * changed. Call it after the entity was found, so that a missing or foreign entity still answers 404.
 */
export async function updateIfMatch<T>(
  ifMatch: string | readonly string[] | undefined,
  update: (expectedRowVersion: number) => Promise<readonly T[]>,
): Promise<T> {
  const rows = await update(parseIfMatch(ifMatch));
  const [first] = rows;
  if (rows.length === 0 || first === undefined) {
    throw new PreconditionFailedException('If-Match không khớp rowVersion hiện hành');
  }
  return first;
}
