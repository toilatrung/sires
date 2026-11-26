// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Public API of the shell for feature areas (rule 1.4.9): import from 'src/shell', never from another area.
// See README “Dùng shell trong khu vực”.

export type { Feature, Locale, Messages } from './feature';
export { Placeholder } from './Placeholder';

// Data access
export { ApiClient, API_BASE, type ApiResult, type RequestOptions, type PathsWith } from './api/client';
export { ApiError, isApiError, type ApiErrorKind, type Problem, type ErrorCode, type FieldErrorCode } from './api/errors';
export { createIdempotencyKey, IdempotencyKeys } from './api/idempotency';
export {
  useApi,
  useDraft,
  useEvents,
  useMarkScreenOpened,
  useNavigationData,
  useRefreshNavigation,
  useSession,
  useShell,
  useStreamSignal,
  useStreamStatus,
  type DraftField,
} from './hooks';
export type { StreamEvent, StreamEventType, StreamSignal, EventFilter } from './sse';
export { REASON_PARAM, REASON_SESSION_EXPIRED, RETURN_TO_PARAM, SIGN_IN_PATH, safeReturnTo, signInPath, type SessionState } from './session/session';

// i18n and formatting
export { changeLanguage, currentLanguage } from './i18n';
export { formatDate, formatDateTime, formatElapsed, formatNumber, formatShortDate, formatTime } from './format';

// Shared states and components
export { StatusChip, ExecutionLabel, type StatusChipProps } from './states/StatusChip';
export { statusTone, type StatusEntity, type StatusTone, type ExecutionLabelKind } from './states/statuses';
export { EmptyState, ErrorState, LoadingState, LongOperation, useErrorDescription } from './states/States';
export { PromptCard, type InteractiveAgentPrompt, type PromptCardProps } from './prompt-card/PromptCard';
export { NotFound } from './App';
