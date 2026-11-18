// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import {
  DEFAULT_CODE_BY_STATUS,
  DEFAULT_TITLE_BY_STATUS,
  ERROR_STATUS,
  PROBLEM_TYPE_BASE,
  type ErrorCode,
  type ProblemBody,
} from './catalog';
import { ProblemException } from './problem.exception';

// Every error leaves a service as application/problem+json (RFC 9457) with a `code` from the catalogue
// (NFR-OBS-005): declared errors keep their code, framework HTTP errors get the fixed code of their status, anything
// else is `500 internal_error` without stack trace or internal message; `correlationId` is the request id.

/** The parts of Fastify's request and reply the filter uses (no direct dependency on fastify). */
interface RequestWithId {
  id?: string;
}
interface ReplyLike {
  status(code: number): ReplyLike;
  header(name: string, value: string): ReplyLike;
  send(body: unknown): unknown;
}

export const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8';

export interface ProblemResult {
  status: number;
  body: ProblemBody;
  /** True when the error was not declared: it is logged with its stack as an error. */
  undeclared: boolean;
}

function problem(code: ErrorCode, correlationId: string | undefined, extra: Partial<ProblemBody> = {}): ProblemBody {
  const status = ERROR_STATUS[code];
  return {
    type: `${PROBLEM_TYPE_BASE}${code}`,
    title: DEFAULT_TITLE_BY_STATUS[status] ?? code,
    status,
    code,
    ...extra,
    ...(correlationId ? { correlationId } : {}),
  };
}

function httpStatusOf(error: unknown): number | undefined {
  if (error instanceof HttpException) return error.getStatus();
  // Errors raised by Fastify before the route handler (body parser, body limit) carry `statusCode`.
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 600 ? statusCode : undefined;
}

/** Turns any thrown value into the problem body the client receives. */
export function toProblem(error: unknown, correlationId?: string): ProblemResult {
  if (error instanceof ProblemException) {
    const { title, detail, errors, currentState, suggestedAction } = error.problem;
    const body = problem(error.code, correlationId, {
      ...(title ? { title } : {}),
      ...(detail ? { detail } : {}),
      ...(errors?.length ? { errors } : {}),
      ...(currentState ? { currentState } : {}),
      ...(suggestedAction ? { suggestedAction } : {}),
    });
    return { status: body.status, body, undeclared: error.code === 'internal_error' };
  }
  const status = httpStatusOf(error);
  const code = status === undefined ? undefined : DEFAULT_CODE_BY_STATUS[status];
  if (code !== undefined && code !== 'internal_error') {
    return { status: ERROR_STATUS[code], body: problem(code, correlationId), undeclared: false };
  }
  return { status: 500, body: problem('internal_error', correlationId), undeclared: true };
}

/** Global filter for NestJS on Fastify; createServiceApp registers it for every service. */
@Catch()
export class ProblemJsonFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemJsonFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId | undefined>();
    const reply = http.getResponse<ReplyLike>();
    const result = toProblem(exception, request?.id);
    if (result.undeclared) this.logUndeclared(exception, result);
    reply.status(result.status).header('content-type', PROBLEM_CONTENT_TYPE).send(result.body);
  }

  logUndeclared(exception: unknown, result: ProblemResult): void {
    // The redacting logger masks secrets that may appear in the message or stack (NFR-OBS-002).
    const err = exception instanceof Error ? exception : new Error(String(exception));
    const status = httpStatusOf(exception);
    // A 4xx without catalogue code (415 from Fastify…) is caused by the client: answered as internal_error to keep
    // NFR-OBS-005, but logged as a warning with its status so that system-error alerts do not fire (PO, QC G4).
    if (status !== undefined && status < 500) {
      this.logger.warn({ err, code: result.body.code, status }, 'lỗi HTTP không có mã trong danh mục');
      return;
    }
    this.logger.error({ err, code: result.body.code, status }, 'lỗi không khai báo');
  }
}
