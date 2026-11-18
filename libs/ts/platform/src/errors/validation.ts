// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import { createZodValidationPipe } from 'nestjs-zod';
import type { FieldErrorCode, ProblemFieldError } from './catalog';
import { ProblemException } from './problem.exception';

// Input validation with Zod through nestjs-zod (H2; architecture 2.3). A schema error becomes
// `400 validation_failed` with every failing field (EC03); Zod issue codes are mapped to FieldErrorCode and never
// returned as they are (PO 11/11/2026).

/** The part of a Zod issue the mapping reads (Zod 4). */
export interface ZodIssueLike {
  code: string;
  path: readonly PropertyKey[];
  message?: string;
  keys?: readonly string[];
}

interface ZodErrorLike {
  issues: readonly ZodIssueLike[];
}

function isZodError(error: unknown): error is ZodErrorLike {
  return typeof error === 'object' && error !== null && Array.isArray((error as { issues?: unknown }).issues);
}

/** `a.b.0.c`; the body itself has no field name. */
function fieldName(path: readonly PropertyKey[]): string | undefined {
  return path.length === 0 ? undefined : path.map((part) => String(part)).join('.');
}

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  let current = input;
  for (const part of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<PropertyKey, unknown>)[part];
  }
  return current;
}

function mapIssueCode(issue: ZodIssueLike, input: unknown): FieldErrorCode {
  switch (issue.code) {
    case 'invalid_type':
      // Zod reports a missing property as a type error on `undefined`.
      return issue.path.length > 0 && valueAt(input, issue.path) === undefined ? 'required' : 'invalid_type';
    case 'too_small':
      return 'too_small';
    case 'too_big':
      return 'too_big';
    case 'invalid_format':
      return 'invalid_format';
    default:
      // invalid_value, not_multiple_of, invalid_union, invalid_key, invalid_element, custom: the value is not allowed.
      return 'invalid_value';
  }
}

/** Maps every Zod issue to `Problem.errors[]`; `unrecognized_keys` yields one entry per extra field. */
export function zodIssuesToFieldErrors(issues: readonly ZodIssueLike[], input: unknown): ProblemFieldError[] {
  const errors: ProblemFieldError[] = [];
  for (const issue of issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys ?? []) {
        errors.push({ field: fieldName([...issue.path, key]), code: 'unrecognized_field', message: issue.message });
      }
      continue;
    }
    const field = fieldName(issue.path);
    errors.push({ ...(field === undefined ? {} : { field }), code: mapIssueCode(issue, input), message: issue.message });
  }
  return errors;
}

/** `400 validation_failed` for a Zod error on `input`. */
export function validationProblem(error: unknown, input: unknown): ProblemException {
  const errors = isZodError(error) ? zodIssuesToFieldErrors(error.issues, input) : [];
  return new ProblemException('validation_failed', { errors, cause: error });
}

/** nestjs-zod pipe that hands the Zod error back instead of throwing its own BadRequestException. */
const NestZodPipe: new () => PipeTransform = createZodValidationPipe({
  createValidationException: (error: unknown) => Object.assign(new Error('zod validation failed'), { zodError: error }),
});

/**
 * Global pipe: validates every parameter whose type is a Zod DTO (`createZodDto`) and answers schema errors as
 * `validation_failed`. Parameters without a Zod DTO type pass through unchanged.
 */
@Injectable()
export class ZodProblemValidationPipe implements PipeTransform {
  private readonly inner: PipeTransform;

  constructor() {
    this.inner = new NestZodPipe();
  }

  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    try {
      return await this.inner.transform(value, metadata);
    } catch (error) {
      const zodError = (error as { zodError?: unknown }).zodError;
      if (zodError !== undefined) throw validationProblem(zodError, value);
      throw error;
    }
  }
}
