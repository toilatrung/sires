// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './i18n/en.json';
import vi from './i18n/vi.json';
import { features } from './features';
import type { Locale, Messages } from './feature';
import { detectInitialLanguage, LOCALES } from './locale';

export { changeLanguage, currentLanguage, detectInitialLanguage, isLocale, LOCALES } from './locale';

/** One namespace per feature area, so two areas never edit the same translation file. */
export function resources(): Record<Locale, Record<string, Messages>> {
  const byLocale = (locale: Locale) =>
    Object.fromEntries([['shell', locale === 'vi' ? vi : en], ...features.map((f) => [f.id, f.messages[locale]])]);
  return { vi: byLocale('vi'), en: byLocale('en') };
}

function syncDocumentLanguage(lng: string): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
}

/** Initialise i18next once; later calls return the same instance. */
export function initI18n(language: Locale = detectInitialLanguage(), instance: i18n = i18next): i18n {
  if (!instance.isInitialized) {
    void instance.use(initReactI18next).init({
      resources: resources(),
      lng: language,
      fallbackLng: 'en',
      supportedLngs: LOCALES,
      defaultNS: 'shell',
      interpolation: { escapeValue: false },
      returnNull: false,
      initAsync: false,
    });
    instance.on('languageChanged', syncDocumentLanguage);
  } else if (instance.language !== language) {
    void instance.changeLanguage(language);
  }
  syncDocumentLanguage(instance.language);
  return instance;
}
