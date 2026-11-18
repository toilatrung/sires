// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { randomBytes } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_COUNTER = 0xfff;

let lastMs = -1;
let counter = 0;

/** True when the value is a canonical 8-4-4-4-12 hexadecimal UUID string (any version). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Generates a UUIDv7 (RFC 9562): 48-bit Unix milliseconds, then a 12-bit counter in rand_a and 62 random bits.
 * Ids from one process are strictly increasing: within the same millisecond the counter grows; when it overflows
 * or the clock steps back, the timestamp field advances from the last id instead (RFC 9562 §6.2, method 1).
 */
export function uuidv7(): string {
  let ms = Math.max(Date.now(), lastMs);
  if (ms === lastMs) {
    counter += 1;
    if (counter > MAX_COUNTER) {
      ms += 1;
      counter = randomCounterSeed();
    }
  } else {
    counter = randomCounterSeed();
  }
  lastMs = ms;

  const bytes = randomBytes(16);
  bytes.writeUIntBE(ms, 0, 6);
  bytes[6] = 0x70 | (counter >> 8);
  bytes[7] = counter & 0xff;
  bytes[8] = 0x80 | (bytes[8] & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Unix milliseconds stored in a UUIDv7. */
export function uuidv7Timestamp(id: string): number {
  if (!isUuid(id) || id[14] !== '7') throw new TypeError(`Not a UUIDv7: ${id}`);
  return parseInt(id.replace(/-/g, '').slice(0, 12), 16);
}

/** Seeds the counter in the lower half of its range so that many ids still fit in the same millisecond. */
function randomCounterSeed(): number {
  return randomBytes(2).readUInt16BE(0) & 0x7ff;
}
