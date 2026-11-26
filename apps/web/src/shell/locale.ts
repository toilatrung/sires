// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Interface language helpers without the feature registry, so feature areas can import them through the shell's
// index.ts without an import cycle (index → i18n → features → area → index). i18n.ts re-exports them.

import i18next, { type i18n } from 'i18next';
import type { Locale } from './feature';

export const LOCALES: Locale[] = ['vi', 'en'];

export function isLocale(value: unknown): value is Locale {
  return value === 'vi' || value === 'en';
}

/**
 * Initial interface language (UX-I18N-001): Preferences.uiLanguage when known, else the browser
 * language (vi* → vi, en* → en, first match wins), else English.
 */
export function detectInitialLanguage(
  preferred?: string | null,
  browserLanguages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language],
): Locale {
  if (isLocale(preferred)) return preferred;
  for (const tag of browserLanguages) {
    const primary = tag?.toLowerCase().split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return 'en';
}

/** Current interface language. */
export function currentLanguage(instance: i18n = i18next): Locale {
  return isLocale(instance.language) ? instance.language : 'en';
}

/**
 * Switch the interface language in place. Only i18next changes: the route tree is not remounted,
 * so typed input, the current route and open panels stay as they are (UX-I18N-002).
 */
export async function changeLanguage(lng: Locale, instance: i18n = i18next): Promise<void> {
  if (instance.language === lng) return;
  await instance.changeLanguage(lng);
}
