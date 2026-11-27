// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Dashboard frame (G1, Dashboard.html; PID-00037 S05, S06): blocks in the UX-LAYOUT-004 order, each with its own
// loading, error and empty state (WS-DASHBOARD-001). First-run (H3): no Active project → empty block with
// “Tạo project”; no Provider Connection → API key banner. Recovery banner on Interrupted workflows (H4).

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { PublicApi } from '@sires/contracts';
import { EmptyState, ErrorState, LoadingState, isApiError, useApi, useStreamSignal, type ApiError } from '../../../shell';
import { useActivityLabel } from '../ui';

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
  const one = workflows.length === 1 ? workflows[0] : undefined;
  return (
    <div role="status" className="g-banner" data-kind="recovery">
      <div className="g-banner__text">
        <strong className="g-banner__title">{one ? t('dashboard.recovery.titleOne') : t('dashboard.recovery.titleMany', { count: workflows.length })}</strong>
        <span className="g-banner__detail">{one ? t('dashboard.recovery.detailOne', { type: one.type }) : t('dashboard.recovery.detailMany')}</span>
      </div>
      <Link className="sires-button" data-variant="outline" to={one ? recoveryLink(one, pending) : '/pending-actions'}>
        {one ? t('dashboard.recovery.action') : t('dashboard.recovery.actionMany')}
      </Link>
    </div>
  );
}

function PendingBlock({ state, onRetry }: { state: Load<Dashboard>; onRetry: () => void }) {
  const { t } = useTranslation('global');
  const count = state.status === 'ready' ? (state.data.pendingActions ?? []).length : undefined;
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
      {count === 0 && <p className="g-note">{t('dashboard.pending.noneReason')}</p>}
      {count !== undefined && count > 0 && <BlockNote text={t('dashboard.pending.note', { count })} to="/pending-actions" action={t('dashboard.pending.open')} />}
    </section>
  );
}

/**
 * Explanation and next action shown in a block until it has rows (design.md §4 “Trống”: lý do + hành động tiếp). The
 * rows of the pending, workflow and error blocks come with PID-00060 (H2); until then the block says where to look.
 */
function BlockNote({ text, to, action }: { text: string; to: string; action: string }) {
  return (
    <div className="g-block-note">
      <p className="g-block-note__text">{text}</p>
      <Link className="sires-button" data-variant="outline" data-size="sm" to={to}>
        {action}
      </Link>
    </div>
  );
}

/** Frame of a block whose rows PID-00060 fills (H2): heading, link to the full screen, then rows or a note. */
function FrameBlock({ id, block, title, link, linkLabel, side, note, children }: { id: string; block: string; title: string; link: string; linkLabel: string; side?: boolean; note: { text: string; action: string }; children?: ReactNode }) {
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
      {children ?? <BlockNote text={note.text} to={link} action={note.action} />}
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
      <PendingBlock state={dashboard} onRetry={() => void reloadDashboard()} />
      <FrameBlock id="g-dash-workflows" block="workflows" title={t('dashboard.workflows.title')} link="/activity" linkLabel={t('dashboard.workflows.all')} note={{ text: t('dashboard.workflows.note'), action: t('dashboard.workflows.open') }} />
      <div className="g-row">
        <RecentProjectsBlock state={dashboard} onRetry={() => void reloadDashboard()} />
        <FrameBlock id="g-dash-errors" block="errors" title={t('dashboard.errors.title')} link="/notifications" linkLabel={t('dashboard.errors.all')} side note={{ text: t('dashboard.errors.note'), action: t('dashboard.errors.open') }} />
      </div>
    </div>
  );
}
