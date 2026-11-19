// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { isUuid, uuidv7 } from '../tenancy/uuid';

/** Incoming header that may carry the request id of the caller (for example the gateway). */
export const REQUEST_ID_HEADER = 'x-request-id';

/** The part of a Node HTTP/1 or HTTP/2 incoming request that the request id needs. */
export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Request id of an incoming HTTP request, fixed on first use and stored as `req.id` (where pino-http reads it):
 * the caller's `x-request-id` when it is a UUID, otherwise a new UUIDv7. Only UUIDs are accepted so that a
 * client cannot inject arbitrary text into logs and spans.
 */
export function requestIdFor(req: RequestLike): string {
  const holder = req as RequestLike & { id?: unknown };
  if (typeof holder.id === 'string' && holder.id !== '') return holder.id;
  const header = req.headers[REQUEST_ID_HEADER];
  const incoming = Array.isArray(header) ? header[0] : header;
  const id = isUuid(incoming) ? incoming.toLowerCase() : uuidv7();
  holder.id = id;
  return id;
}

/**
 * Path of a request target without its query string (NFR-OBS-002: logs and spans carry metadata only). Query values
 * such as the OIDC `code`, `state` or a `token` are too short to be caught by the entropy rule, so they are dropped.
 */
export function withoutQuery(target: string | undefined): string | undefined {
  if (target === undefined) return undefined;
  const cut = target.search(/[?#]/);
  return cut === -1 ? target : target.slice(0, cut);
}
