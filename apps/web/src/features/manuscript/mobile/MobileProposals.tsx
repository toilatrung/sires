// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Phone screen: proposal review only (PID-00115 S09, H21). Stub until S09.

import { useTranslation } from 'react-i18next';

export function MobileProposals() {
  const { t } = useTranslation('manuscript');
  return <h1>{t('title')}</h1>;
}
