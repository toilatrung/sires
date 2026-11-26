// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Shared loading, long-operation, empty and error states (UX-STATE-001–003, design.md §2.4.1, §4, States).

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type Problem } from '../api/errors';
import { formatElapsed, formatTime, type DateInput } from '../format';

/* ---------- Loading a short list: skeleton of the real row layout + one role="status" line ---------- */

export interface LoadingStateProps {
  /** What is loading, e.g. “Trusted Library” → “Đang tải Trusted Library…”. */
  what?: string;
  /** Skeleton rows matching the real rows (two lines each); 0 shows only the status line. */
  rows?: number;
}

const SKELETON_WIDTHS: ReadonlyArray<[number, number]> = [
  [78, 46],
  [64, 38],
  [70, 42],
];

export function LoadingState({ what, rows = 3 }: LoadingStateProps) {
  const { t } = useTranslation('shell');
  return (
    <div className="sires-loading">
      <p role="status" className="sires-loading__status">
        {what ? t('state.loadingWhat', { what }) : t('state.loading')}
      </p>
      {rows > 0 && (
        <ul aria-hidden="true" className="sires-loading__rows">
          {Array.from({ length: rows }, (_, i) => {
            const [a, b] = SKELETON_WIDTHS[i % SKELETON_WIDTHS.length];
            return (
              <li key={i}>
                <span data-skeleton="" style={{ width: `${a}%`, height: 14 }} />
                <span data-skeleton="" style={{ width: `${b}%`, height: 12 }} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------- Long operation of an agent or System (never a skeleton, never a spinner) ---------- */

export interface LongOperationProps {
  /** Operation name, e.g. “Đang tìm evidence cho T-2.2”. */
  title: ReactNode;
  /** Who works on it: an agent name or “System”. */
  actor: ReactNode;
  /** Start time; the elapsed time ticks every second (hidden from the live region so it is not read every second). */
  startedAt: DateInput;
  /** Known number of steps → progress bar with “Bước n/m”; omitted → indeterminate bar. */
  step?: { current: number; total: number };
  /** Latest activity line. */
  latest?: { at: DateInput; text: ReactNode };
  /** Shown only when the operation can be cancelled. */
  onCancel?: () => void;
  cancelLabel?: string;
  /** Status chip in front of the title (e.g. a running chip for builds). */
  chip?: ReactNode;
}

function useElapsedSeconds(startedAt: DateInput): number {
  const start = new Date(startedAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, []);
  return Math.max(0, (now - start) / 1000);
}

export function LongOperation({ title, actor, startedAt, step, latest, onCancel, cancelLabel, chip }: LongOperationProps) {
  const { t } = useTranslation('shell');
  const elapsed = formatElapsed(useElapsedSeconds(startedAt));
  const ratio = step && step.total > 0 ? Math.min(1, Math.max(0, step.current / step.total)) : undefined;
  return (
    <div className="sires-longop">
      <div role="status" className="sires-longop__box">
        <span className="sires-longop__title">
          {chip}
          <span>{title}</span>
        </span>
        <span className="sires-longop__meta sires-num">
          {step ? (
            <>
              {t('longOp.step', step)} · {actor} · <span aria-hidden="true">{elapsed}</span>
            </>
          ) : (
            <>
              {actor} · <span aria-hidden="true">{t('longOp.elapsed', { time: elapsed })}</span>
            </>
          )}
        </span>
        {step ? (
          <div className="sires-progress" role="img" aria-label={t('longOp.stepOf', step)}>
            <div data-progress="" className="sires-progress__fill" style={{ width: `${(ratio ?? 0) * 100}%` }} />
          </div>
        ) : (
          <div data-progress="indeterminate" role="img" aria-label={t('longOp.unknownDuration')} />
        )}
        {latest && (
          <span className="sires-longop__latest sires-num">
            {t('longOp.latestAt', { time: formatTime(latest.at, { withSeconds: true }) })} — {latest.text}
          </span>
        )}
      </div>
      <span className="sires-longop__leave">
        {t('longOp.leave')}
        {onCancel && (
          <>
            {' '}
            <button type="button" className="sires-button" data-variant="secondary" onClick={onCancel}>
              {cancelLabel ?? t('longOp.cancel')}
            </button>
          </>
        )}
      </span>
    </div>
  );
}

/* ---------- Empty: reason + one action passed by the screen ---------- */

export interface EmptyStateProps {
  title: ReactNode;
  reason: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, reason, action }: EmptyStateProps) {
  return (
    <div className="sires-empty">
      <strong className="sires-empty__title">{title}</strong>
      <span className="sires-empty__reason">{reason}</span>
      {action && <div className="sires-empty__action">{action}</div>}
    </div>
  );
}

/* ---------- Error: what happened, what was saved, what next, code and correlationId ---------- */

export interface ErrorStateProps {
  /** Error from the API client, or a Problem. Gives the code, correlationId and the default description. */
  error?: ApiError | Problem;
  /** Headline; defaults to the translated description of the code. */
  title?: ReactNode;
  /** Description; defaults to the translation of the code (feature namespace first, then shell). */
  description?: ReactNode;
  /** What was saved / what was not (the screen knows). */
  saved?: ReactNode;
  notSaved?: ReactNode;
  /** What to do next. */
  next?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  /** Namespace of the feature area holding translations of its business codes as `error.<code>`. */
  ns?: string;
  /** Extra controls next to the retry button (e.g. dismiss). */
  actions?: ReactNode;
}

function toApiError(error: ApiError | Problem | undefined): ApiError | undefined {
  if (!error) return undefined;
  if (error instanceof ApiError) return error;
  return new ApiError('problem', { status: error.status, problem: error });
}

/** Translated description of an error code: feature namespace, then shell, else a generic sentence (EC12). */
export function useErrorDescription(error: ApiError | Problem | undefined, ns?: string): string {
  const { t, i18n } = useTranslation('shell');
  const apiError = toApiError(error);
  if (!apiError) return t('error.generic');
  const code = apiError.code;
  const key = `error.${code}`;
  if (ns && i18n.exists(key, { ns })) return t(key, { ns, status: apiError.status });
  if (i18n.exists(key, { ns: 'shell' })) return t(key, { status: apiError.status });
  return t('error.generic');
}

export function ErrorState({ error, title, description, saved, notSaved, next, onRetry, retryLabel, ns, actions }: ErrorStateProps) {
  const { t } = useTranslation('shell');
  const apiError = toApiError(error);
  const translated = useErrorDescription(error, ns);
  const heading = title ?? translated;
  const body = description ?? (title ? translated : undefined);
  return (
    <div role="alert" className="sires-error">
      <strong className="sires-error__title">{heading}</strong>
      {body && <span>{body}</span>}
      {(saved || notSaved) && (
        <span>
          {saved && (
            <>
              <strong>{t('state.saved')}</strong> {saved}
            </>
          )}
          {saved && notSaved && ' '}
          {notSaved && (
            <>
              <strong>{t('state.notSaved')}</strong> {notSaved}
            </>
          )}
        </span>
      )}
      {next && (
        <span>
          <strong>{t('state.next')}</strong> {next}
        </span>
      )}
      <span className="sires-error__footer">
        {onRetry && (
          <button type="button" className="sires-button" data-variant="danger" data-size="sm" onClick={onRetry}>
            {retryLabel ?? t('state.retry')}
          </button>
        )}
        {actions}
        {apiError && (
          <span className="sires-error__code">
            {apiError.code}
            {apiError.correlationId && <> · {t('state.request', { id: apiError.correlationId })}</>}
          </span>
        )}
      </span>
    </div>
  );
}
