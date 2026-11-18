// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import type { PublicApi } from '@sires/contracts';

// Error code catalogue of docs/api-design (components/schemas/common.yaml › ErrorCode, FieldErrorCode; NFR-OBS-005).
// The code lists come from the generated contract types, never copied by hand: the records below must name every
// code exactly once (`satisfies Record<…>`), so adding or removing a code in the contract breaks the build here.

type Schemas = PublicApi.components['schemas'];

/** `Problem.code`: closed list of the contract. */
export type ErrorCode = Schemas['ErrorCode'];
/** `Problem.errors[].code` for `validation_failed`. */
export type FieldErrorCode = Schemas['FieldErrorCode'];
/** One entry of `Problem.errors`. */
export type ProblemFieldError = { field?: string; code: FieldErrorCode; message?: string };
/** RFC 9457 body (`components/schemas/common.yaml › Problem`). */
export type ProblemBody = Omit<Schemas['Problem'], 'code' | 'errors'> & {
  code: ErrorCode;
  errors?: ProblemFieldError[];
};

/** Base of `Problem.type`, as in every example of components/responses.yaml. */
export const PROBLEM_TYPE_BASE = 'https://sires.etroy.local/problems/';

/** HTTP status of each code, as listed in the description of `ErrorCode`. */
export const ERROR_STATUS = {
  validation_failed: 400,
  unauthenticated: 401,
  invalid_service_token: 401,
  forbidden: 403,
  caller_not_allowed: 403,
  not_found: 404,
  method_not_allowed: 405,
  invalid_transition: 409,
  action_not_allowed_in_state: 409,
  project_archived: 409,
  active_workflow_exists: 409,
  readiness_failed: 409,
  open_plan_version_exists: 409,
  base_revision_mismatch: 409,
  citation_check_failed: 409,
  connection_in_use: 409,
  duplicate_name: 409,
  restore_window_expired: 409,
  stale_agent_run: 409,
  precondition_failed: 412,
  payload_too_large: 413,
  idempotency_key_reused: 422,
  dependency_cycle: 422,
  reference_not_trusted: 422,
  pdf_without_text_layer: 422,
  model_not_available: 422,
  instance_required: 422,
  instance_not_allowed: 422,
  schema_invalid: 422,
  draft_reference: 422,
  change_reason_required: 422,
  entry_immutable: 422,
  synthesis_incomplete: 422,
  problem_type_not_allowed: 422,
  analysis_agent_not_configured: 422,
  deliberation_not_confirmed: 422,
  deliberation_mismatch: 422,
  precondition_required: 428,
  internal_error: 500,
  service_unavailable: 503,
} as const satisfies Record<ErrorCode, number>;

/** Every field error code once; used to check mappings at run time. */
export const FIELD_ERROR_CODES = {
  required: true,
  invalid_type: true,
  invalid_format: true,
  too_small: true,
  too_big: true,
  invalid_value: true,
  unrecognized_field: true,
} as const satisfies Record<FieldErrorCode, true>;

/**
 * Code used when an HTTP error carries no code of its own (framework 404 and 405, `PreconditionFailedException`…).
 * Only statuses whose shared response in components/responses.yaml has one fixed code are listed; an HTTP error with
 * any other status has no catalogue code and is answered as `internal_error` (see ProblemJsonFilter).
 */
export const DEFAULT_CODE_BY_STATUS: Readonly<Record<number, ErrorCode>> = {
  400: 'validation_failed',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  412: 'precondition_failed',
  413: 'payload_too_large',
  428: 'precondition_required',
  500: 'internal_error',
  503: 'service_unavailable',
};

/** `title` per status, from the examples of components/responses.yaml; a ProblemException may set its own. */
export const DEFAULT_TITLE_BY_STATUS: Readonly<Record<number, string>> = {
  400: 'Dữ liệu không hợp lệ',
  401: 'Chưa đăng nhập',
  403: 'Không được phép',
  404: 'Không tìm thấy',
  405: 'Method không được hỗ trợ',
  409: 'Xung đột trạng thái',
  412: 'Dữ liệu đã thay đổi',
  413: 'File vượt giới hạn',
  422: 'Không xử lý được yêu cầu',
  428: 'Thiếu If-Match',
  500: 'Lỗi hệ thống',
  503: 'Dịch vụ tạm không khả dụng',
};

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_STATUS, value);
}

export function isFieldErrorCode(value: unknown): value is FieldErrorCode {
  return typeof value === 'string' && Object.hasOwn(FIELD_ERROR_CODES, value);
}
