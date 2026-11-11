// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { hostname } from 'node:os';
import pino, { type DestinationStream, type Level, type Logger } from 'pino';
import { correlationFields, createAccountHasher } from './context';
import { redactLogLine } from './redact';

export interface LoggerOptions {
  /** Service name, logged as `service` on every line. */
  service: string;
  /** Minimum level; default `LOG_LEVEL` or `info`. */
  level?: Level | 'silent';
  /** Key of the account hash; default `LOG_ACCOUNT_HASH_KEY`. Without it hashes are per process (warned once). */
  accountHashKey?: string;
  /** Where JSON lines go; default stdout. */
  destination?: DestinationStream;
}

/**
 * Creates the service logger: JSON lines, correlation ids from the log context and the active span, and redaction
 * of every line right before it is written, so no code path — message, bindings, serializers, error stacks — can
 * bypass it.
 */
export function createLogger(options: LoggerOptions): Logger {
  const accountHasher = createAccountHasher(options.accountHashKey ?? process.env.LOG_ACCOUNT_HASH_KEY);
  const hashAccount = accountHasher.hash;
  const level = options.level ?? (process.env.LOG_LEVEL as Level | undefined) ?? 'info';
  const logger = pino(
    {
      level,
      base: { service: options.service, pid: process.pid, hostname: hostname() },
      timestamp: pino.stdTimeFunctions.isoTime,
      mixin: () => correlationFields(hashAccount),
      hooks: {
        streamWrite: (line) => redactLogLine(line, hashAccount),
      },
    },
    options.destination,
  );
  if (!accountHasher.configured) {
    logger.warn('LOG_ACCOUNT_HASH_KEY chưa đặt: account_hash dùng khóa ngẫu nhiên, chỉ so được trong tiến trình này');
  }
  return logger;
}
