// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

export { bootstrapService, createServiceApp, type ServiceAppOptions } from './bootstrap';
export {
  DEFAULT_CODE_BY_STATUS,
  DEFAULT_TITLE_BY_STATUS,
  ERROR_STATUS,
  FIELD_ERROR_CODES,
  isErrorCode,
  isFieldErrorCode,
  PROBLEM_CONTENT_TYPE,
  PROBLEM_TYPE_BASE,
  ProblemException,
  ProblemJsonFilter,
  toProblem,
  validationProblem,
  ZodProblemValidationPipe,
  zodIssuesToFieldErrors,
  type ErrorCode,
  type FieldErrorCode,
  type ProblemBody,
  type ProblemFieldError,
  type ProblemOptions,
  type ProblemResult,
  type ZodIssueLike,
} from './errors';
export { HealthController, HealthModule, SERVICE_MANIFEST, type HealthStatus } from './health';
export {
  correlationFields,
  createAccountHasher,
  createLogger,
  ENTROPY_THRESHOLD,
  isAccountIdField,
  isSensitiveField,
  LogContextMiddleware,
  LoggingModule,
  looksLikeSecret,
  REDACTED,
  redactLogLine,
  redactString,
  redactValue,
  REQUEST_ID_HEADER,
  requestIdFor,
  runWithLogContext,
  setLogContext,
  shannonEntropy,
  type AccountHasher,
  type LogContext,
  type LoggerOptions,
  type RequestLike,
} from './logging';
export type { ServiceManifest } from './manifest';
export {
  currentTelemetry,
  exporterFromEnv,
  REQUEST_ID_ATTRIBUTE,
  startTelemetry,
  type Telemetry,
  type TelemetryOptions,
} from './telemetry';
export {
  assertIfMatch,
  formatEtag,
  isUuid,
  parseIfMatch,
  PreconditionRequiredException,
  updateIfMatch,
  uuidv7,
  uuidv7Timestamp,
  withAccountTransaction,
  type TenantDatabase,
  type TenantTransaction,
} from './tenancy';
