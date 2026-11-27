// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Data of the dashboard blocks (PID-00060 S06, H7), placed in the frame of PID-00037: running and interrupted
// workflows, the manuscript build of each recent project, recent errors from notifications.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { PublicApi } from '@sires/contracts';
import { EmptyState, ErrorState, LoadingState, StatusChip, formatElapsed, isApiError, useApi, useEvents, type ApiError } from '../../../shell';
import { NOTIFICATION_KIND_LABEL, agentLabel, objectLink, shortStamp } from '../labels';

type Schemas = PublicApi.components['schemas'];
type Workflow = Schemas['Workflow'];
type Notification = Schemas['Notification'];

const RUNNING: Schemas['WorkflowStatus'][] = ['Running', 'Waiting for User'];
const ERROR_KINDS: Notification['kind'][] = ['failure', 'provider_issue'];

/** “Bước 2/4 · Evidence Retrieval Agent” from the workflow's steps, when the server sends them. */
export function stepOf(workflow: Workflow): { order: number; total: number; agent?: string; description: string } | undefined {
  const steps = workflow.steps ?? [];
  const current = steps.find((step) => step.id === workflow.currentStepId);
  if (!current) return undefined;
  return { order: current.order, total: steps.length, agent: agentLabel(current.assignedAgent), description: current.description };
}

function WorkflowCard({ workflow, names, recovery }: { workflow: Workflow; names: ReadonlyMap<string, string>; recovery?: string }) {
  const { t } = useTranslation('global');
  const step = stepOf(workflow);
  const project = workflow.projectId ? names.get(workflow.projectId) : undefined;
  const elapsed = workflow.startedAt ? formatElapsed((Date.now() - Date.parse(workflow.startedAt)) / 1000) : undefined;
  return (
    <div className="g-workflow" data-status={workflow.status}>
      <div className="g-workflow__top">
        <span className="sires-id g-meta">{workflow.type}</span>
        <StatusChip status={workflow.status} entity="workflow" />
      </div>
      <Link className="g-pending__title" to={`/projects/${workflow.projectId}/activity/workflows/${workflow.id}`}>
        {step?.description ?? project ?? workflow.type}
      </Link>
      <span className="g-meta">
        {[step && t('dashboard.workflows.step', { order: step.order, total: step.total }), step?.agent, project && step ? project : undefined, elapsed && t('dashboard.workflows.elapsed', { elapsed })]
          .filter(Boolean)
          .join(' · ')}
      </span>
      {step && step.total > 0 && (
        <span className="g-progress__track g-workflow__bar" role="img" aria-label={t('dashboard.workflows.stepLabel', { order: step.order, total: step.total })}>
          <span className="g-progress__fill" data-progress="" style={{ width: `${Math.round(((step.order - 1) / step.total) * 100)}%` }} />
        </span>
      )}
      {recovery && (
        <Link className="sires-button" data-variant="outline" data-size="sm" to={recovery}>
          {t('dashboard.recovery.action')}
        </Link>
      )}
    </div>
  );
}

/** Workflow block (UX-LAYOUT-004 item 2): Interrupted first with “Mở Recovery decision”, then Running, Waiting for User. */
export function WorkflowsBody({ interrupted, recoveryLink, names }: { interrupted: readonly Workflow[]; recoveryLink: (workflow: Workflow) => string; names: ReadonlyMap<string, string> }) {
  const { t } = useTranslation('global');
  const api = useApi();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; items: Workflow[] } | { status: 'error'; error: ApiError }>({ status: 'loading' });
  const load = useCallback(async () => {
    try {
      // Account-wide list filtered here: an array status filter is not understood by every server or mock.
      const { data } = await api.get('/workflows', { query: { limit: 20 } });
      setState({ status: 'ready', items: (data.items as Workflow[]).filter((row) => RUNNING.includes(row.status)).slice(0, 5) });
    } catch (error) {
      if (!isApiError(error)) throw error;
      setState({ status: 'error', error });
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  useEvents({ types: ['workflow.status_changed'] }, () => void load());

  const running = state.status === 'ready' ? state.items : [];
  return (
    <>
      {(interrupted.length > 0 || running.length > 0) && (
        <div className="g-workflow-grid">
          {interrupted.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} names={names} recovery={recoveryLink(workflow)} />
          ))}
          {running.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} names={names} />
          ))}
        </div>
      )}
      {state.status === 'loading' && <LoadingState what={t('dashboard.workflows.loadingWhat')} rows={1} />}
      {/* EC26: the list failing does not hide the Interrupted workflows the dashboard already has. */}
      {state.status === 'error' && <ErrorState error={state.error} ns="global" onRetry={() => void load()} />}
      {state.status === 'ready' && !interrupted.length && !running.length && <p className="g-meta">{t('dashboard.workflows.none')}</p>}
    </>
  );
}

/** “Bản thảo” column: latest build of the project's manuscript; 404 means not initialised (EC27). */
export function ManuscriptCell({ projectId }: { projectId: string }) {
  const { t } = useTranslation('global');
  const api = useApi();
  const [label, setLabel] = useState<{ text: string; tone?: 'error' }>({ text: '…' });
  useEffect(() => {
    let live = true;
    api
      .get('/projects/{projectId}/manuscript', { path: { projectId } })
      .then(({ data }) => {
        const build = data.latestBuild;
        const at = build?.endedAt ?? build?.startedAt ?? build?.queuedAt;
        const text = !build
          ? t('dashboard.manuscript.noBuild')
          : build.status === 'Succeeded'
            ? t('dashboard.manuscript.ok', { time: at ? shortStamp(at) : '' })
            : build.status === 'Failed'
              ? t('dashboard.manuscript.failed')
              : t('dashboard.manuscript.building');
        if (live) setLabel({ text, ...(build?.status === 'Failed' ? { tone: 'error' as const } : {}) });
      })
      .catch((error: unknown) => {
        if (live) setLabel({ text: isApiError(error) && error.status === 404 ? t('dashboard.manuscript.notInitialised') : '—' });
      });
    return () => {
      live = false;
    };
  }, [api, projectId, t]);
  return <span className={label.tone === 'error' ? 'g-danger-text' : 'g-muted'}>{label.text}</span>;
}

/** Recent errors (UX-LAYOUT-004 item 5): newest failure and provider_issue notifications, at most three. */
export function RecentErrorsBody({ names }: { names: ReadonlyMap<string, string> }) {
  const { t } = useTranslation('global');
  const api = useApi();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; items: Notification[] } | { status: 'error'; error: ApiError }>({ status: 'loading' });
  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications', { query: { limit: 20 } });
      const rows = (data.items as Notification[]).filter((row) => ERROR_KINDS.includes(row.kind)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setState({ status: 'ready', items: rows.slice(0, 3) });
    } catch (error) {
      if (!isApiError(error)) throw error;
      setState({ status: 'error', error });
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  useEvents({ types: ['notification.created'] }, () => void load());

  if (state.status === 'loading') return <LoadingState what={t('dashboard.errors.loadingWhat')} rows={2} />;
  if (state.status === 'error') return <ErrorState error={state.error} ns="global" onRetry={() => void load()} />;
  if (!state.items.length) return <EmptyState title={t('dashboard.errors.none')} reason={t('dashboard.errors.noneReason')} />;
  return (
    <ul className="g-list g-card g-errors">
      {state.items.map((row) => {
        const link = objectLink(row.objectType, row.objectId, row.projectId);
        const place = row.projectId ? names.get(row.projectId) : undefined;
        return (
          <li key={row.id} className="g-errors__row">
            <span className="g-errors__head">
              <span className="g-danger-text">{NOTIFICATION_KIND_LABEL[row.kind]}</span>
              <span className="g-meta sires-num">{shortStamp(row.createdAt)}</span>
            </span>
            <span className="g-errors__message">{row.message}</span>
            {place && <span className="g-meta">{place}</span>}
            {link && (
              <Link className="g-link" to={link.to}>
                {t(`link.${link.label}`)}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
