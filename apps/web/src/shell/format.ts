// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Date, time and number formatting for every feature area (UX-I18N-004, design.md §6, H3).
// Dates are dd/mm/yyyy and times HH:mm (24 h) in both languages; numbers follow the interface language:
// English 1,234.5, Vietnamese 1.234,5. Times use the browser time zone, never Preferences.timezone (EC21).

import i18next from 'i18next';
import type { Locale } from './feature';

export type DateInput = Date | string | number;

/** Browser time zone; an object so tests can stub it. */
export const clock = {
  timeZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  },
};

interface FormatOptions {
  /** Defaults to the current interface language. */
  locale?: Locale;
  /** Defaults to the browser time zone. Not for Preferences.timezone (EC21). */
  timeZone?: string;
}

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

function parts(value: DateInput, timeZone: string | undefined): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone ?? clock.timeZone(),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  return Object.fromEntries(fmt.formatToParts(toDate(value)).map((p) => [p.type, p.value]));
}

/** dd/mm/yyyy in the browser time zone. */
export function formatDate(value: DateInput, options: FormatOptions = {}): string {
  const p = parts(value, options.timeZone);
  return `${p.day}/${p.month}/${p.year}`;
}

/** dd/mm without the year, as in compact lists (MobilePending, Components). */
export function formatShortDate(value: DateInput, options: FormatOptions = {}): string {
  const p = parts(value, options.timeZone);
  return `${p.day}/${p.month}`;
}

/** HH:mm (24 h) in the browser time zone; `withSeconds` gives HH:mm:ss. */
export function formatTime(value: DateInput, options: FormatOptions & { withSeconds?: boolean } = {}): string {
  const p = parts(value, options.timeZone);
  return options.withSeconds ? `${p.hour}:${p.minute}:${p.second}` : `${p.hour}:${p.minute}`;
}

/** dd/mm/yyyy HH:mm in the browser time zone. */
export function formatDateTime(value: DateInput, options: FormatOptions = {}): string {
  return `${formatDate(value, options)} ${formatTime(value, options)}`;
}

function numberLocale(locale: Locale | undefined): string {
  const lng = locale ?? (i18next.language === 'vi' ? 'vi' : 'en');
  return lng === 'vi' ? 'vi-VN' : 'en-US';
}

/** Number in the interface language: en 1,234.5 · vi 1.234,5. Render inside `.sires-num` for tabular digits. */
export function formatNumber(value: number, options: { locale?: Locale } & Intl.NumberFormatOptions = {}): string {
  const { locale, ...intl } = options;
  return new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: 2, ...intl }).format(value);
}

/** Elapsed time as mm:ss, or HH:mm:ss from one hour (States: “06:12”, “đã chạy 00:12”). */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const two = (n: number) => String(n).padStart(2, '0');
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return hours > 0 ? `${two(hours)}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}
