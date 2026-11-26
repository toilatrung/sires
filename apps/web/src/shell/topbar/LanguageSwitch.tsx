// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// VI/EN: two aria-pressed buttons (TopBar, SignIn). Switches at once without remounting the routes (UX-I18N-002),
// then saves Preferences.uiLanguage when signed in (H2, S08).

import { useTranslation } from 'react-i18next';
import type { Locale } from '../feature';
import { useShell } from '../hooks';
import { currentLanguage, LOCALES } from '../i18n';

export function LanguageSwitch() {
  const { t, i18n } = useTranslation('shell');
  const { language } = useShell();
  const current = currentLanguage(i18n);
  const select = (lng: Locale) => {
    if (lng !== current) void language.select(lng);
  };
  return (
    <div role="group" aria-label={t('language.group')} className="sires-lang">
      {LOCALES.map((lng) => (
        <button
          key={lng}
          type="button"
          lang={lng}
          aria-pressed={current === lng}
          title={t(`language.${lng}`)}
          onClick={() => select(lng)}
        >
          {lng.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
