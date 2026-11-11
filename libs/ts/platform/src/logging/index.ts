// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

export {
  correlationFields,
  createAccountHasher,
  runWithLogContext,
  setLogContext,
  type AccountHasher,
  type LogContext,
} from './context';
export { createLogger, type LoggerOptions } from './logger';
export { LogContextMiddleware, LoggingModule } from './logging.module';
export {
  ENTROPY_THRESHOLD,
  isAccountIdField,
  isSensitiveField,
  looksLikeSecret,
  REDACTED,
  redactLogLine,
  redactString,
  redactValue,
  shannonEntropy,
} from './redact';
export { REQUEST_ID_HEADER, requestIdFor, type RequestLike } from './request-id';
