// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { HttpException } from '@nestjs/common';
import { DEFAULT_TITLE_BY_STATUS, ERROR_STATUS, type ErrorCode, type ProblemFieldError } from './catalog';

export interface ProblemOptions {
  /** Defaults to the shared title of the status (components/responses.yaml). */
  title?: string;
  /** Human-readable detail for this occurrence. Never put stack traces, secrets or internal messages here. */
  detail?: string;
  errors?: ProblemFieldError[];
  /** Current state when the error is a refused state transition (409). */
  currentState?: string;
  /** Hint for the user, for example “Mở Settings › Agent Models” (RC-08). */
  suggestedAction?: string;
  cause?: unknown;
}

/**
 * An error the service declares: answered as `application/problem+json` with this `code` and the status the catalogue
 * gives it. Throw it from controllers and services instead of Nest's HttpException for any 409 or 422.
 */
export class ProblemException extends HttpException {
  readonly code: ErrorCode;
  readonly problem: ProblemOptions;

  constructor(code: ErrorCode, options: ProblemOptions = {}) {
    const status = ERROR_STATUS[code];
    super(options.detail ?? options.title ?? DEFAULT_TITLE_BY_STATUS[status] ?? code, status, { cause: options.cause });
    this.code = code;
    this.problem = options;
  }
}
