// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'sires_session';
export const IDLE_HOURS = 12;

export function hashToken(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function csrfToken(key: Buffer, sessionId: string): string {
  return createHmac('sha256', key).update(sessionId).digest('hex');
}

export function equalHash(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function newSessionId(): string {
  return randomBytes(32).toString('base64url');
}

export function validSessionId(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value) && Buffer.from(value, 'base64url').toString('base64url') === value;
}

/** No cookie plugin needed: accept exactly one opaque id, never decode or log untrusted cookie contents. */
export function sessionIdFromCookie(cookie: string | string[] | undefined): string | undefined {
  if (typeof cookie !== 'string') return undefined;
  const values = cookie
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (values.length !== 1) return undefined;
  const value = values[0].slice(SESSION_COOKIE.length + 1);
  return validSessionId(value) ? value : undefined;
}

export function sessionCookie(sessionId: string, absoluteExpiresAt: Date): string {
  if (!validSessionId(sessionId) || !Number.isFinite(absoluteExpiresAt.getTime())) {
    throw new TypeError('Invalid session cookie input');
  }
  return `${SESSION_COOKIE}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${absoluteExpiresAt.toUTCString()}`;
}

/** A 256-bit hex key; values are supplied locally or by the staging secret, never committed. */
export function csrfKeyFromEnv(env: NodeJS.ProcessEnv = process.env): Buffer {
  const value = env.GATEWAY_CSRF_KEY;
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error('GATEWAY_CSRF_KEY must contain 32 random bytes encoded as 64 hex characters');
  }
  return Buffer.from(value, 'hex');
}
