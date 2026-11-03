// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './i18n/en.json';
import vi from './i18n/vi.json';
import { features } from './features';
import type { Locale, Messages } from './feature';

export const LOCALES: Locale[] = ['vi', 'en'];

/** One namespace per feature area, so two areas never edit the same translation file. */
export function resources(): Record<Locale, Record<string, Messages>> {
  const byLocale = (locale: Locale) =>
    Object.fromEntries([['shell', locale === 'vi' ? vi : en], ...features.map((f) => [f.id, f.messages[locale]])]);
  return { vi: byLocale('vi'), en: byLocale('en') };
}

export function initI18n(): void {
  void i18next.use(initReactI18next).init({
    resources: resources(),
    lng: 'vi',
    fallbackLng: 'en',
    defaultNS: 'shell',
    interpolation: { escapeValue: false },
  });
}
