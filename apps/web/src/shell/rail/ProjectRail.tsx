// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// ProjectRail (docs/ui-design/pages/ProjectRail.html; design.md §4): project name and Plan line, the eight areas
// with counts of what waits for the user (H1), Active task with “Bỏ active task” at the bottom. Hidden on
// Manuscript (EC16). Area names stay in English in both languages (EC05).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError, isApiError } from '../api/errors';
import { projectAreaPath } from '../context';
import { formatNumber } from '../format';
import { useNavigationData, useShell } from '../hooks';
import { RAIL_AREAS, type RailArea } from '../navigation/navigation';
import { ErrorState } from '../states/States';

export function ProjectRail({ projectId, area }: { projectId: string; area?: RailArea }) {
  const { t } = useTranslation('shell');
  const { navigation } = useShell();
  const { project } = useNavigationData();
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<ApiError>();
  const data = project?.id === projectId ? project : undefined;

  const clearActiveTask = async () => {
    setClearing(true);
    setClearError(undefined);
    try {
      await navigation.clearActiveTask();
    } catch (error) {
      setClearError(isApiError(error) ? error : new ApiError('network'));
    } finally {
      setClearing(false);
    }
  };

  const plan = data?.plan;
  return (
    <aside aria-label={t('rail.label')} className="sires-rail">
      <div className="sires-rail__head">
        <span className="sires-rail__name">{data?.name}</span>
        {plan && (
          <span className="sires-rail__plan sires-num">
            {plan.kind === 'version' ? t('rail.plan', { version: plan.versionNumber, status: plan.status }) : t('rail.noPlan')}
          </span>
        )}
      </div>
      <nav className="sires-rail__nav">
        {RAIL_AREAS.map((id) => {
          const count = data?.areaCounts?.[id];
          return (
            <Link key={id} to={projectAreaPath(projectId, id)} className="sires-rail__item" aria-current={area === id ? 'page' : undefined}>
              <span>{t(`rail.area.${id}`)}</span>
              {count !== undefined && count > 0 && (
                <span className="sires-rail__count sires-num" aria-label={t('rail.waiting', { count })}>
                  {formatNumber(count)}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {data?.activeTask && (
        <div className="sires-rail__active">
          <span className="sires-rail__active-label">{t('rail.activeTask')}</span>
          {(data.activeTask.key || data.activeTask.title) && (
            <span className="sires-rail__active-task">
              {data.activeTask.key && <span className="sires-id">{data.activeTask.key}</span>} {data.activeTask.title}
            </span>
          )}
          <button type="button" className="sires-button" data-variant="secondary" data-size="xs" disabled={clearing} onClick={() => void clearActiveTask()}>
            {t('rail.clearActiveTask')}
          </button>
          {clearError && <ErrorState error={clearError} title={t('rail.clearActiveTaskFailed')} />}
        </div>
      )}
    </aside>
  );
}
