// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';

/** “Không tìm thấy” in the frame (EC06, EC23); never a blank screen. */
export function NotFound({ project = false }: { project?: boolean }) {
  const { t } = useTranslation('shell');
  const location = useLocation();
  return (
    <section className="sires-page">
      <div role="alert" className="sires-error">
        <strong className="sires-error__title">{project ? t('notFound.projectTitle') : t('notFound.title')}</strong>
        <span>{project ? t('notFound.projectDetail') : t('notFound.detail', { path: location.pathname })}</span>
        <span className="sires-error__footer">
          <Link to="/dashboard">{t('notFound.action')}</Link>
          <span className="sires-error__code">not_found</span>
        </span>
      </div>
    </section>
  );
}
