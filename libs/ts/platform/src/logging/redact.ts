// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Log redaction (architecture 10.3; NFR-OBS-001, NFR-OBS-002): mask strings that look like provider API keys or
// high-entropy secrets, mask every value under a sensitive field name (api_key, authorization, …) and replace
// accountId by its keyed hash `account_hash`.

/** Replacement for a masked value. */
export const REDACTED = '[REDACTED]';

/** Field names whose value is always masked, compared lowercase without separators (`api_key` → `apikey`). */
const SENSITIVE_FIELDS = new Set([
  'authorization',
  'proxyauthorization',
  'password',
  'secret',
  'clientsecret',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'cookie',
  'setcookie',
  'csrftoken',
  'xcsrftoken',
]);

/** Field names holding an account id; logged only as `account_hash` (architecture 11, NFR-OBS-001). */
const ACCOUNT_ID_FIELDS = new Set(['accountid']);

/** Key prefixes of the three providers (Anthropic `sk-ant-`, OpenAI `sk-`/`sk-proj-`, Google `AIza`). */
const PROVIDER_KEY_PATTERNS: readonly RegExp[] = [
  /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/g,
  /(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{35}/g,
];

/** Credentials after an HTTP auth scheme, for headers that end up inside a message string. */
const AUTH_SCHEME_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;

/**
 * Candidate secrets for the entropy check: long runs of base64url characters (plus `+`, `=`). `/` is left out so
 * that URL paths and file paths in stack traces stay readable.
 */
const ENTROPY_CANDIDATE = /[A-Za-z0-9+=_-]{32,}/g;

/**
 * Bits per character from which a candidate counts as random (the usual base64 limit of secret scanners).
 * Measured on this rule: random base64 of 40 characters scores ≥ 4.5 in about 95 % of cases, of 48 characters in
 * nearly all; long identifiers such as `ContextSnapshotOutdatedEvent2026` score about 4.0–4.2.
 */
export const ENTROPY_THRESHOLD = 4.5;

/** Shannon entropy of a string, in bits per character. */
export function shannonEntropy(value: string): number {
  if (value.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * True for a run that looks like a random secret: upper case, lower case and digits mixed, entropy at least
 * {@link ENTROPY_THRESHOLD}. Lower-case hex (UUIDs, trace ids, hashes) never qualifies, so correlation ids survive.
 */
export function looksLikeSecret(candidate: string): boolean {
  return (
    candidate.length >= 32 &&
    /[a-z]/.test(candidate) &&
    /[A-Z]/.test(candidate) &&
    /[0-9]/.test(candidate) &&
    shannonEntropy(candidate) >= ENTROPY_THRESHOLD
  );
}

/** Masks provider keys, credentials after `Bearer`/`Basic` and high-entropy runs inside a string. */
export function redactString(value: string): string {
  let result = value;
  for (const pattern of PROVIDER_KEY_PATTERNS) result = result.replace(pattern, REDACTED);
  result = result.replace(AUTH_SCHEME_PATTERN, (_match, scheme: string) => `${scheme} ${REDACTED}`);
  return result.replace(ENTROPY_CANDIDATE, (candidate) => (looksLikeSecret(candidate) ? REDACTED : candidate));
}

function normalizeField(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** True for `api_key`, `apiKey`, `x-api-key`, `openai_api_key`, `authorization` and the other listed fields. */
export function isSensitiveField(name: string): boolean {
  const normalized = normalizeField(name);
  return normalized.endsWith('apikey') || SENSITIVE_FIELDS.has(normalized);
}

/** True for `accountId` and `account_id`. */
export function isAccountIdField(name: string): boolean {
  return ACCOUNT_ID_FIELDS.has(normalizeField(name));
}

const MAX_DEPTH = 32;

/**
 * Returns a redacted copy of a JSON-like value: strings pass through {@link redactString}, values under sensitive
 * field names become {@link REDACTED}, `accountId`/`account_id` becomes `account_hash` = `hashAccount(value)`.
 * Nesting deeper than 32 levels is masked as a whole.
 */
export function redactValue(value: unknown, hashAccount: (accountId: string) => string, depth = 0): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, hashAccount, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveField(key)) {
      result[key] = REDACTED;
    } else if (isAccountIdField(key)) {
      result.account_hash = typeof item === 'string' ? hashAccount(item) : REDACTED;
    } else {
      result[key] = redactValue(item, hashAccount, depth + 1);
    }
  }
  return result;
}

/**
 * Redacts one serialized log line (pino `hooks.streamWrite`): parse, redact, serialize again. A line that is not
 * JSON is still scanned as a string, so nothing leaves the process unredacted.
 */
export function redactLogLine(line: string, hashAccount: (accountId: string) => string): string {
  const trailingNewline = line.endsWith('\n');
  const body = trailingNewline ? line.slice(0, -1) : line;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return redactString(line);
  }
  return JSON.stringify(redactValue(parsed, hashAccount)) + (trailingNewline ? '\n' : '');
}
