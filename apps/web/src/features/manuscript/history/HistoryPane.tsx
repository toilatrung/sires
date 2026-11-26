// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Revision history pane (PID-00115 S07). Stub until S07.

import { useTranslation } from 'react-i18next';

export function HistoryPane() {
  const { t } = useTranslation('manuscript');
  return <h2 className="ms-pane-title">{t('pane.history')}</h2>;
}
