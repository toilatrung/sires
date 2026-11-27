// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// One row of the waiting list (design.md §4 “Danh sách chờ”; PID-00060 H4): needs-you chip with the kind, title,
// project and time, one outline button opening the object in its context. Used by Pending Actions and the dashboard.

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { PublicApi } from '@sires/contracts';
import { StatusChip } from '../../../shell';
import { PENDING_KIND_LABEL, shortStamp } from '../labels';

type PendingAction = PublicApi.components['schemas']['PendingAction'];

/** Where a pending action without projectId is handled (Reference approval → Trusted Library, PRD 4.4). */
export function placeOf(action: PendingAction, names: ReadonlyMap<string, string>): string | undefined {
  if (action.projectId) return names.get(action.projectId);
  return action.kind === 'reference_approval' ? 'Trusted Library' : undefined;
}

export function PendingRow({ action, names, layout }: { action: PendingAction; names: ReadonlyMap<string, string>; layout: 'page' | 'dashboard' }) {
  const { t } = useTranslation('global');
  const label = PENDING_KIND_LABEL[action.kind];
  const place = placeOf(action, names);
  const time = shortStamp(action.createdAt);
  const title = action.title ?? label;
  return (
    <li className="g-pending" data-layout={layout}>
      {layout === 'page' && <span className="g-pending__time sires-num">{time}</span>}
      <span className="g-pending__kind">
        <StatusChip status={label} entity="pending-action" />
        {layout === 'page' && place && <span className="g-pending__place">{place}</span>}
      </span>
      <span className="g-pending__body">
        <span className="g-pending__title">{title}</span>
        {layout === 'dashboard' && (
          <span className="g-meta">
            {[place, time].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
      {action.deepLink ? (
        <Link className="sires-button" data-variant="outline" to={action.deepLink} aria-label={`${t(`pending.action.${action.kind}`)}: ${title}`}>
          {t(`pending.action.${action.kind}`)}
        </Link>
      ) : (
        <span className="g-pending__disabled">
          <button type="button" className="sires-button" disabled>
            {t(`pending.action.${action.kind}`)}
          </button>
          <span className="g-field__hint">{t('pending.noLink')}</span>
        </span>
      )}
    </li>
  );
}
