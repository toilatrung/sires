// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { useTranslation } from 'react-i18next';

/** Stand-in for a screen until its feature area builds it. */
export function Placeholder({ ns, screen }: { ns: string; screen: string }) {
  const { t } = useTranslation(ns);
  return (
    <section>
      <h1>{t('title')}</h1>
      <p>
        <code>{screen}</code> — {t('placeholder', { ns: 'shell' })}
      </p>
    </section>
  );
}
