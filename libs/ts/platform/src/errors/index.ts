// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

export {
  DEFAULT_CODE_BY_STATUS,
  DEFAULT_TITLE_BY_STATUS,
  ERROR_STATUS,
  FIELD_ERROR_CODES,
  isErrorCode,
  isFieldErrorCode,
  PROBLEM_TYPE_BASE,
  type ErrorCode,
  type FieldErrorCode,
  type ProblemBody,
  type ProblemFieldError,
} from './catalog';
export { ProblemException, type ProblemOptions } from './problem.exception';
export { PROBLEM_CONTENT_TYPE, ProblemJsonFilter, toProblem, type ProblemResult } from './problem.filter';
export { validationProblem, ZodProblemValidationPipe, zodIssuesToFieldErrors, type ZodIssueLike } from './validation';
