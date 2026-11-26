// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Small blocks shared by the research screens: “Không tìm thấy” inside a panel (EC07: an id that does not exist or
// belongs to another account; the list next to it stays usable) and the Task key of a row.

import { useTranslation } from 'react-i18next';
import { ApiError, ErrorState } from '../../shell';
import { useTask } from './data';

/** 404 of the contract, also for a version id the artifact does not have. */
const NOT_FOUND = new ApiError('problem', {
  status: 404, problem: { type: 'https://sires.etroy.local/problems/not_found', title: 'not_found', status: 404, code: 'not_found' },
});

/** Never says whether the object exists elsewhere (PRD 4.3, 16.1). */
export function PanelNotFound({ kind, error = NOT_FOUND }: { kind: 'claim' | 'evidence' | 'artifact' | 'version'; error?: ApiError }) {
  const { t } = useTranslation('research');
  return (
    <div className="research-panel__section">
      <ErrorState error={error} ns="research" title={t('panel.notFoundTitle')} description={t(`panel.notFound.${kind}`)} />
    </div>
  );
}

/**
 * Stable key of a Task (`T-2.3`) from getTask, or nothing while it loads or when the Task is not found. `prefix`
 * (e.g. “ · ”) shows only with the key.
 */
export function TaskKey({ taskId, prefix }: { taskId?: string; prefix?: string }) {
  const task = useTask(taskId);
  if (!taskId || !task) return null;
  return <>{prefix}<span className="sires-id">{task.stableKey}</span></>;
}
