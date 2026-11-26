// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import type { PublicApi } from '@sires/contracts';

export type Problem = PublicApi.components['schemas']['Problem'];
export type ErrorCode = PublicApi.components['schemas']['ErrorCode'];
export type FieldErrorCode = PublicApi.components['schemas']['FieldErrorCode'];

/**
 * `problem`: the gateway answered with application/problem+json (Problem.code is an ErrorCode).
 * `http`: an error status without a problem body (proxy page, empty body) — only the status is kept.
 * `network`: no response at all (offline, connection refused, aborted).
 */
export type ApiErrorKind = 'problem' | 'http' | 'network';

/** Error of the shell API client. Never carries the raw response body or a stack trace for display (EC11). */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly problem?: Problem;

  constructor(kind: ApiErrorKind, init: { status?: number; problem?: Problem } = {}) {
    super(kind === 'problem' ? `${init.problem?.code} (${init.status})` : kind === 'http' ? `HTTP ${init.status}` : 'network error');
    this.name = 'ApiError';
    this.kind = kind;
    this.status = init.status;
    this.problem = init.problem;
  }

  /** Stable code to translate: Problem.code, or `network_error` / `http_error`. */
  get code(): ErrorCode | 'network_error' | 'http_error' {
    if (this.kind === 'problem' && this.problem) return this.problem.code;
    return this.kind === 'network' ? 'network_error' : 'http_error';
  }

  get correlationId(): string | undefined {
    return this.problem?.correlationId;
  }

  get unauthenticated(): boolean {
    return this.status === 401;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

function isProblem(value: unknown): value is Problem {
  return typeof value === 'object' && value !== null && typeof (value as Problem).code === 'string' && typeof (value as Problem).status === 'number';
}

/** Turn a non-2xx response into an ApiError; the body is read only to extract a Problem, then dropped. */
export async function errorFromResponse(response: Response): Promise<ApiError> {
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/problem+json') || type.includes('application/json')) {
    try {
      const body: unknown = await response.json();
      if (isProblem(body)) {
        const { type: problemType, title, status, code, detail, instance, currentState, errors, suggestedAction, correlationId } = body;
        return new ApiError('problem', {
          status: response.status,
          problem: { type: problemType, title, status, code, detail, instance, currentState, errors, suggestedAction, correlationId },
        });
      }
    } catch {
      // Not JSON after all: fall through to a plain HTTP error.
    }
  }
  return new ApiError('http', { status: response.status });
}
