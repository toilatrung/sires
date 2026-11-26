// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Building blocks of the settings area (PID-00036 S01): the Settings frame with its left menu (design.md §5),
// the switch (design.md §4 “Công tắc”), the dialog (design.md §4 “Dialog”) and a small loader hook.

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { isApiError, type ApiError } from '../../shell';

export const NS = 'settings';

const NAV = [
  { to: '/settings/profile', key: 'nav.profile' },
  { to: '/settings/providers', key: 'nav.providers' },
  { to: '/settings/agents', key: 'nav.agents' },
  { to: '/settings/preferences', key: 'nav.preferences' },
] as const;

/** Settings page: left menu of the four views, one panel per group, one save button per view (design.md §5). */
export function SettingsLayout({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation(NS);
  return (
    <div className="sires-settings">
      <nav aria-label={t('nav.label')} className="sires-settings__nav">
        <h1 className="sires-settings__title">{t('nav.title')}</h1>
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className="sires-settings__link">
            {t(item.key)}
          </NavLink>
        ))}
      </nav>
      <div className="sires-settings__content">
        <div className="sires-settings__head">
          <h2 className="sires-settings__view">{title}</h2>
          {actions}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Switch: track 44×26, the label states the current value in words (design.md §4). */
export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const labelId = useId();
  const descId = useId();
  return (
    <div className="sires-switch-row">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
        className="sires-switch"
        data-on={checked ? '' : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="sires-switch__knob" aria-hidden="true" />
      </button>
      <div className="sires-switch-row__text">
        <span id={labelId} className="sires-switch-row__label">
          {label}
        </span>
        {description && (
          <span id={descId} className="sires-switch-row__desc">
            {description}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Dialog 480px (design.md §4): states the consequence before the confirm button; the cancel button names the safe
 * option. Focus moves into the dialog, Escape closes it, focus returns to the control that opened it.
 */
export function Dialog({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer: ReactNode }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled]), select, textarea');
    (first ?? ref.current)?.focus();
    return () => opener?.focus?.();
  }, []);
  return (
    <div className="sires-dialog-scrim">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sires-dialog"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <h3 id={titleId} className="sires-dialog__title">
          {title}
        </h3>
        {children}
        <div className="sires-dialog__footer">{footer}</div>
      </div>
    </div>
  );
}

export type Loadable<T> = { state: 'loading' } | { state: 'ready'; data: T } | { state: 'error'; error: ApiError | Error };

/** Load data for a view; `reload` reruns the loader, `setData` replaces it after a write. */
export function useResource<T>(load: () => Promise<T>): { value: Loadable<T>; reload: () => Promise<void>; setData: (update: (old: T) => T) => void } {
  const [value, setValue] = useState<Loadable<T>>({ state: 'loading' });
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useCallback(async () => {
    try {
      const data = await loadRef.current();
      setValue({ state: 'ready', data });
    } catch (error) {
      setValue({ state: 'error', error: error as Error });
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const setData = useCallback((update: (old: T) => T) => {
    setValue((old) => (old.state === 'ready' ? { state: 'ready', data: update(old.data) } : old));
  }, []);
  return { value, reload, setData };
}

/** Field errors of a 400 validation_failed, keyed by field name (Problem.errors[]). */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error) || !error.problem?.errors) return {};
  return Object.fromEntries(error.problem.errors.map((e) => [e.field ?? '', e.code ?? 'invalid_value']));
}

/** ETag for If-Match built from rowVersion when the list response carries no header (ETag = rowVersion). */
export function etagOf(row: { rowVersion: number }): string {
  return `"${row.rowVersion}"`;
}

/** Initials of a display name, for the avatar without a picture. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Parse a decimal typed with the decimal mark of the interface language (vi “0,8”, en “0.8”). */
export function parseDecimal(text: string): number | undefined {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d*(\.\d+)?$/.test(normalized) || normalized === '' || normalized === '.') return undefined;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * merge-patch body with only the changed fields (RFC 7396). The contract types the body of updatePreferences as the
 * full `Preferences` (includeResearchFieldInContext, debugMode required), so the partial body needs this one cast;
 * the source fix is a partial schema for merge-patch bodies (reported with PID-00036).
 */
export function mergePatch<T>(changed: Partial<T>): T {
  return changed as T;
}
