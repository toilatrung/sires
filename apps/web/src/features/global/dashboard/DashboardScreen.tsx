// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Dashboard frame (G1, Dashboard.html; PID-00037 S05, S06): blocks in the UX-LAYOUT-004 order, each with its own
// loading, error and empty state (WS-DASHBOARD-001). First-run (H3): no Active project → empty block with
// “Tạo project”; no Provider Connection → API key banner. Recovery banner on Interrupted workflows (H4).
// Block data (PID-00060 S06, H7): pending rows, workflows, manuscript column, recent errors (dashboard/blocks.tsx).

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { PublicApi } from '@sires/contracts';
import { EmptyState, ErrorState, LoadingState, isApiError, useApi, useEvents, useStreamSignal, type ApiError } from '../../../shell';
import { useProjectNames } from '../labels';
import { PendingRow } from '../pending/PendingRow';
import { useActivityLabel } from '../ui';
import { ManuscriptCell, RecentErrorsBody, WorkflowsBody, stepOf } from './blocks';

type Schemas = PublicApi.components['schemas'];
type Dashboard = Schemas['Dashboard'];
type Project = Schemas['ResearchProject'];
type Workflow = Schemas['Workflow'];

type Load<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: ApiError };

function useLoad<T>(fetcher: () => Promise<T>): [Load<T>, () => Promise<void>] {
  const [state, setState] = useState<Load<T>>({ status: 'loading' });
  const reload = useCallback(async () => {
    try {
      setState({ status: 'ready', data: await fetcher() });
    } catch (error) {
      if (!isApiError(error)) throw error;
      setState({ status: 'error', error });
    }
  }, [fetcher]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return [state, reload];
}

function progressOf(project: Project): { done: number; total: number } {
  const counts = project.summary?.taskCounts ?? {};
  return { done: counts.Completed ?? 0, total: Object.values(counts).reduce((sum, n) => sum + n, 0) };
}

/** Where “Mở Recovery decision” goes for one workflow (H4): its pending action, else the workflow screen. */
export function recoveryLink(workflow: Workflow, pending: readonly Schemas['PendingAction'][]): string {
  const action = pending.find((row) => row.kind === 'recovery_decision' && row.objectId === workflow.id && row.deepLink);
  return action?.deepLink ?? `/projects/${workflow.projectId}/activity/workflows/${workflow.id}`;
}

function ApiKeyBanner() {
  const { t } = useTranslation('global');
  return (
    <div className="g-banner" data-kind="api-key">
      <div className="g-banner__text">
        <strong className="g-banner__title">{t('dashboard.apiKey.title')}</strong>
        <span className="g-banner__detail">{t('dashboard.apiKey.detail')}</span>
      </div>
      <Link className="sires-button" data-variant="outline" to="/settings/providers">
        {t('dashboard.apiKey.action')}
      </Link>
    </div>
  );
}

function RecoveryBanner({ workflows, pending }: { workflows: readonly Workflow[]; pending: readonly Schemas['PendingAction'][] }) {
  const { t } = useTranslation('global');
  const recoveryDetail = (workflow: Workflow) => {
    const step = stepOf(workflow);
    return step
      ? t('dashboard.recovery.detailStep', { type: workflow.type, order: step.order, total: step.total, agent: step.agent ?? '' })
      : t('dashboard.recovery.detailOne', { type: workflow.type });
  };
  const one = workflows.length === 1 ? workflows[0] : undefined;
  return (
    <div role="status" className="g-banner" data-kind="recovery">
      <div className="g-banner__text">
        <strong className="g-banner__title">{one ? t('dashboard.recovery.titleOne') : t('dashboard.recovery.titleMany', { count: workflows.length })}</strong>
        <span className="g-banner__detail">{one ? recoveryDetail(one) : t('dashboard.recovery.detailMany')}</span>
      </div>
      <Link className="sires-button" data-variant="outline" to={one ? recoveryLink(one, pending) : '/pending-actions'}>
        {one ? t('dashboard.recovery.action') : t('dashboard.recovery.actionMany')}
      </Link>
    </div>
  );
}

function PendingBlock({ state, onRetry, names }: { state: Load<Dashboard>; onRetry: () => void; names: ReadonlyMap<string, string> }) {
  const { t } = useTranslation('global');
  const count = state.status === 'ready' ? (state.data.pendingActions ?? []).length : undefined;
  const rows = state.status === 'ready' ? [...(state.data.pendingActions ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [];
  return (
    <section aria-labelledby="g-dash-pending" className="g-section" data-block="pending">
      <div className="g-head g-head--baseline">
        <h1 id="g-dash-pending" className="g-title">
          {count === undefined ? t('dashboard.pending.heading') : count ? t('dashboard.pending.title', { count }) : t('dashboard.pending.none')}
        </h1>
        <Link className="g-link" to="/pending-actions">
          {t('dashboard.pending.all')}
        </Link>
      </div>
      {state.status === 'loading' && <LoadingState what={t('dashboard.pending.loadingWhat')} rows={2} />}
      {state.status === 'error' && <ErrorState error={state.error} ns="global" onRetry={onRetry} />}
      {rows.length > 0 && (
        <ul className="g-list g-card g-pending-list">
          {rows.map((action) => (
            <PendingRow key={action.id} action={action} names={names} layout="dashboard" />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Frame of a block whose rows PID-00060 fills (H2): heading and the link to the full screen. */
function FrameBlock({ id, block, title, link, linkLabel, side, children }: { id: string; block: string; title: string; link: string; linkLabel: string; side?: boolean; children?: ReactNode }) {
  return (
    <section aria-labelledby={id} className={side ? 'g-section g-block--side' : 'g-section'} data-block={block}>
      <div className="g-head g-head--baseline">
        <h2 id={id} className="g-section-title">
          {title}
        </h2>
        <Link className="g-link" to={link}>
          {linkLabel}
        </Link>
      </div>
      {children}
    </section>
  );
}

function RecentProjectsBlock({ state, onRetry }: { state: Load<Dashboard>; onRetry: () => void }) {
  const { t } = useTranslation('global');
  // WS-DASHBOARD-001: only Active projects in this block (AC04, EC05), even if the data says otherwise.
  const projects = state.status === 'ready' ? (state.data.recentProjects ?? []).filter((project) => project.status === 'Active' && !project.deletedAt) : [];
  return (
    <section aria-labelledby="g-dash-projects" className="g-section g-block" data-block="projects">
      <div className="g-head g-head--baseline">
        <h2 id="g-dash-projects" className="g-section-title">
          {t('dashboard.projects.title')}
        </h2>
        <Link className="g-link" to="/projects">
          {t('dashboard.projects.all')}
        </Link>
      </div>
      {state.status === 'loading' && <LoadingState what={t('dashboard.projects.loadingWhat')} rows={3} />}
      {state.status === 'error' && <ErrorState error={state.error} ns="global" onRetry={onRetry} />}
      {state.status === 'ready' && !projects.length && (
        <EmptyState
          title={t('dashboard.projects.emptyTitle')}
          reason={t('dashboard.projects.emptyReason')}
          action={
            <span className="g-actions">
              <Link className="sires-button" data-variant="primary" to="/projects?new=1">
                {t('projects.create')}
              </Link>
              <Link className="g-link" to="/projects">
                {t('dashboard.projects.openList')}
              </Link>
            </span>
          }
        />
      )}
      {state.status === 'ready' && projects.length > 0 && (
        <div className="g-card g-card--scroll">
          <table className="g-table g-table--compact">
            <thead>
              <tr>
                <th scope="col">{t('projects.col.project')}</th>
                <th scope="col">{t('dashboard.projects.tasksCompleted')}</th>
                <th scope="col">{t('dashboard.projects.manuscript')}</th>
                <th scope="col">{t('projects.col.lastActivity')}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const { done, total } = progressOf(project);
                return (
                  <tr key={project.id}>
                    <td>
                      <Link className="g-project-name" to={`/projects/${project.id}/overview`}>
                        {project.name}
                      </Link>
                    </td>
                    <td>
                      {total ? (
                        <span className="g-progress">
                          <span className="sires-num">
                            {done}/{total}
                          </span>
                          <span className="g-progress__track" role="img" aria-label={t('dashboard.projects.progressLabel', { done, total })}>
                            <span className="g-progress__fill" data-progress="" style={{ width: `${Math.round((done / total) * 100)}%` }} />
                          </span>
                        </span>
                      ) : (
                        <span className="g-muted">{t('dashboard.projects.noTasks')}</span>
                      )}
                    </td>
                    <td>
                      <ManuscriptCell projectId={project.id} />
                    </td>
                    <td className="g-muted sires-num">
                      <ProjectActivity iso={project.lastActivityAt} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}


function ProjectActivity({ iso }: { iso: string }) {
  const label = useActivityLabel();
  return <>{label(iso)}</>;
}

export function DashboardScreen() {
  const { t } = useTranslation('global');
  const api = useApi();
  const fetchDashboard = useCallback(async () => (await api.get('/dashboard')).data, [api]);
  const fetchConnections = useCallback(async () => (await api.get('/provider-connections')).data, [api]);
  const [dashboard, reloadDashboard] = useLoad(fetchDashboard);
  const [connections, reloadConnections] = useLoad(fetchConnections);
  const names = useProjectNames();

  // PID-00060 H7: blocks follow pending action and workflow changes.
  useEvents({ types: ['pending_action.changed', 'workflow.status_changed', 'project.lifecycle_changed'] }, () => void reloadDashboard());

  useStreamSignal((signal) => {
    if (signal !== 'reload') return;
    void reloadDashboard();
    void reloadConnections();
  });

  // H3 (b): banner only when the list loaded and is empty; an error hides it without blocking other blocks (EC02).
  const noConnection = connections.status === 'ready' && (connections.data.items ?? []).length === 0;
  const interrupted = dashboard.status === 'ready' ? (dashboard.data.interruptedWorkflows ?? []) : [];
  const pending = dashboard.status === 'ready' ? (dashboard.data.pendingActions ?? []) : [];

  return (
    <div className="g-page">
      {noConnection && <ApiKeyBanner />}
      {interrupted.length > 0 && <RecoveryBanner workflows={interrupted} pending={pending} />}
      <PendingBlock state={dashboard} onRetry={() => void reloadDashboard()} names={names} />
      <FrameBlock id="g-dash-workflows" block="workflows" title={t('dashboard.workflows.title')} link="/activity" linkLabel={t('dashboard.workflows.all')}>
        <WorkflowsBody interrupted={interrupted} names={names} recoveryLink={(workflow) => recoveryLink(workflow, pending)} />
      </FrameBlock>
      <div className="g-row">
        <RecentProjectsBlock state={dashboard} onRetry={() => void reloadDashboard()} />
        <FrameBlock id="g-dash-errors" block="errors" title={t('dashboard.errors.title')} link="/notifications" linkLabel={t('dashboard.errors.all')} side>
          <RecentErrorsBody names={names} />
        </FrameBlock>
      </div>
    </div>
  );
}
