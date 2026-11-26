// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Plan screen (PID-00082 S02–S04, reference Plan, Plan--view-graph, Plan--view-graph-cycle): Plan Version selector
// (baseline by default), content of the version, board grouped by TaskStatus (PRD 9.8) with Phase / label / agent
// filters, dependency graph, Draft actions, Task panel on `?task=`. Status changes only by command, never by drag.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  ApiError,
  EmptyState,
  ErrorState,
  ExecutionLabel,
  isApiError,
  LoadingState,
  StatusChip,
  useApi,
  useEvents,
  useNavigationData,
  useRefreshNavigation,
  useShell,
  useStreamSignal,
} from '../../shell';
import { DeliberationLabel, itemsOf, keyOf, TASK_STATUS_ORDER, useResource, type PlanVersion, type ResearchPlan, type Schemas, type Task, type TaskDefinition, type TaskStatus } from './common';
import { DraftActions, GraphView } from './GraphView';
import { AGENT_NAMES, TaskPanel } from './TaskPanel';

const LABELS = ['Available for agent', 'Manual editor requirement'] as const;

/** Whether the project is Archived: every change is disabled with the reason (EC40). */
export function useArchived(projectId: string): boolean {
  const { project } = useNavigationData();
  return project?.id === projectId && project.status === 'Archived';
}

export function PlanPage() {
  const { projectId = '' } = useParams();
  const { t } = useTranslation('planning');
  const api = useApi();
  const plan = useResource(() => api.get('/projects/{projectId}/plan', { path: { projectId } }), [api, projectId]);

  useEvents({ types: ['plan_version.status_changed'], projectId }, () => void plan.reload());

  if (plan.status === 'loading' && !plan.data) return <LoadingState what={t('plan.loading')} />;
  if (plan.status === 'error' && !plan.data) {
    if (plan.error?.status === 404) return <NoPlan projectId={projectId} onRequested={() => void plan.reload()} />;
    return <ErrorState error={plan.error} title={t('plan.loadFailed')} onRetry={() => void plan.reload()} />;
  }
  return <PlanView projectId={projectId} plan={plan.data!} reloadPlan={plan.reload} />;
}

/** No Plan yet (EC01): ask the Orchestrator for a proposal, or go to Project AI Chat. */
function NoPlan({ projectId, onRequested }: { projectId: string; onRequested: () => void }) {
  const { t } = useTranslation('planning');
  const api = useApi();
  const { idempotency } = useShell();
  const archived = useArchived(projectId);
  const [state, setState] = useState<{ busy?: boolean; sent?: boolean; error?: ApiError }>({});
  return (
    <div className="planning-page">
      <h1 className="planning-title">{t('plan.title')}</h1>
      <EmptyState
        title={t('plan.noPlan')}
        reason={state.sent ? t('plan.requested') : t('plan.noPlanReason')}
        action={
          <div className="planning-row">
            <button
              type="button"
              className="sires-button"
              data-variant="primary"
              disabled={archived || state.busy || state.sent}
              onClick={async () => {
                setState({ busy: true });
                try {
                  await idempotency.run(`requestPlanProposal:${projectId}`, (key) =>
                    api.post('/projects/{projectId}/plan/proposals', { path: { projectId }, idempotencyKey: key, body: {} }),
                  );
                  setState({ sent: true });
                  onRequested();
                } catch (err) {
                  setState({ error: isApiError(err) ? err : new ApiError('network') });
                }
              }}
            >
              {t('plan.requestProposal')}
            </button>
            <Link to={`/projects/${encodeURIComponent(projectId)}/chat`} className="sires-button" data-variant="secondary">
              {t('plan.openChat')}
            </Link>
          </div>
        }
      />
      {archived && <p className="planning-note">{t('panel.archived')}</p>}
      {state.error && <ErrorState error={state.error} title={t('plan.requestFailed')} />}
    </div>
  );
}

interface Row {
  def: TaskDefinition;
  task?: Task;
  status: TaskStatus;
  /** Task the version adds (no Task yet): “mới trong vN”. */
  isNew: boolean;
}

function PlanView({ projectId, plan, reloadPlan }: { projectId: string; plan: ResearchPlan; reloadPlan: () => Promise<void> }) {
  const { t } = useTranslation('planning');
  const api = useApi();
  const refreshNavigation = useRefreshNavigation();
  const archived = useArchived(projectId);
  const [search, setSearch] = useSearchParams();
  const versions = useMemo(() => [...(plan.versions ?? [])].sort((a, b) => b.versionNumber - a.versionNumber), [plan.versions]);
  const versionId = search.get('version') ?? plan.baselineVersionId ?? plan.openVersionId ?? versions[0]?.id ?? '';
  const isBaseline = versionId === plan.baselineVersionId;
  const view = search.get('view') === 'graph' ? 'graph' : 'board';
  const phase = search.get('phase') ?? '';
  const label = search.get('label') ?? '';
  const agent = search.get('agent') ?? '';
  const taskId = search.get('task');

  const version = useResource(
    () => api.get('/projects/{projectId}/plan/versions/{planVersionId}', { path: { projectId, planVersionId: versionId } }),
    [api, projectId, versionId],
  );
  // Server filters on the baseline board; otherwise the version's own definitions are filtered on screen.
  const serverFilter = isBaseline && view === 'board';
  const query = serverFilter ? { phaseId: phase || undefined, executionLabel: (label || undefined) as Schemas['ExecutionLabel'] | undefined } : {};
  const tasks = useResource(() => api.get('/projects/{projectId}/tasks', { path: { projectId }, query }), [api, projectId, serverFilter, phase, label]);
  const basedOn = version.data?.status === 'Draft' ? version.data.basedOnVersionId : undefined;
  const base = useResource(
    () => (basedOn ? api.get('/projects/{projectId}/plan/versions/{planVersionId}', { path: { projectId, planVersionId: basedOn } }) : Promise.resolve({ data: undefined })),
    [api, projectId, basedOn],
  );

  // EC36: every view follows the same events.
  useEvents({ types: ['task.status_changed'], projectId }, () => void tasks.reload());
  useEvents({ types: ['plan_version.status_changed'], projectId }, () => {
    void version.reload();
    void tasks.reload();
  });
  useStreamSignal((signal) => {
    if (signal !== 'reload') return;
    void reloadPlan();
    void version.reload();
    void tasks.reload();
  });

  const setParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearch(next);
  };
  const hrefOf = (id: string) => {
    const next = new URLSearchParams(search);
    next.set('task', id);
    return `?${next.toString()}`;
  };

  const byId = useMemo(() => new Map(itemsOf<Task>(tasks.data).map((task) => [task.id, task])), [tasks.data]);
  const current = version.data;
  const rows: Row[] = useMemo(() => {
    if (!current) return [];
    const source: Row[] = serverFilter
      ? itemsOf<Task>(tasks.data).map((task) => ({ def: current.tasks?.find((d) => d.taskId === task.id) ?? task.currentDefinition, task, status: task.status, isNew: false }))
      : (current.tasks ?? [])
          .filter((d) => !phase || d.phaseId === phase)
          .filter((d) => !label || d.executionLabel === label)
          .map((def) => {
            const task = byId.get(def.taskId);
            return { def, task, status: task?.status ?? 'Draft', isNew: !task };
          });
    return source.filter((row) => !agent || row.def.proposedAgent === agent);
  }, [current, serverFilter, tasks.data, byId, phase, label, agent]);
  const agents = useMemo(
    () => [...new Set((current?.tasks ?? []).map((d) => d.proposedAgent).filter(Boolean) as Schemas['AgentName'][])],
    [current],
  );

  const summary = versions.find((v) => v.id === versionId);
  const versionLabel = (v: { versionNumber: number; status: string; id: string }) =>
    `v${v.versionNumber} · ${v.status}${v.id === plan.baselineVersionId ? ` ${t('version.baseline')}` : ''}${v.status === 'Draft' ? ` ${t('version.drafting')}` : ''}`;
  const compareTarget = plan.openVersionId ?? (isBaseline ? undefined : versionId);
  const selectedDef = taskId ? (current?.tasks ?? []).find((d) => d.taskId === taskId) : undefined;
  const taskName = (id: string) => {
    const def = (current?.tasks ?? []).find((d) => d.taskId === id) ?? byId.get(id)?.currentDefinition;
    return def ? keyOf(def) : id.slice(0, 8);
  };

  return (
    <div className="planning-page" data-panel={taskId ? 'open' : undefined}>
      <div className="planning-main">
        <header className="planning-header">
          <h1 className="planning-title">{t('plan.title')}</h1>
          <div className="planning-row planning-header__controls">
            <label className="sires-field planning-field--inline">
              <span className="sires-field__label">{t('version.label')}</span>
              <select className="sires-input" value={versionId} onChange={(e) => setParams({ version: e.currentTarget.value, task: null })}>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {versionLabel(v)}
                  </option>
                ))}
              </select>
            </label>
            {summary && <StatusChip status={summary.status} entity="plan-version" />}
            {!plan.baselineVersionId && <span className="planning-note planning-note--inline">{t('version.notApproved')}</span>}
            {current && <DeliberationLabel provenance={current.provenance} projectId={projectId} />}
            {compareTarget && (
              <Link to={`/projects/${encodeURIComponent(projectId)}/plan/versions/${encodeURIComponent(compareTarget)}`} className="sires-button" data-variant="secondary" data-size="sm">
                {t('version.compare')}
              </Link>
            )}
          </div>
        </header>

        {version.status === 'loading' && !current && <LoadingState what={t('version.loading')} />}
        {version.status === 'error' && !current && <ErrorState error={version.error} title={t('version.loadFailed')} onRetry={() => void version.reload()} />}
        {current && (
          <>
            <VersionNotice version={current} projectId={projectId} />
            <PlanContent version={current} />
            {current.status === 'Draft' && (
              <DraftActions
                projectId={projectId}
                version={current}
                etag={version.etag}
                base={base.data}
                archived={archived}
                onChanged={() => version.reload()}
                onSubmitted={() => {
                  void reloadPlan();
                  void version.reload();
                  void refreshNavigation();
                }}
              />
            )}

            <div className="planning-row planning-toolbar">
              <div role="tablist" aria-label={t('view.label')} className="planning-tabs">
                {(['board', 'graph'] as const).map((v) => (
                  <button key={v} type="button" role="tab" aria-selected={view === v} className="planning-tab" onClick={() => setParams({ view: v === 'board' ? null : v })}>
                    {t(`view.${v}`)}
                  </button>
                ))}
              </div>
              {view === 'board' && (
                <div className="planning-row planning-filters">
                  <select className="sires-input" aria-label={t('filter.phase')} value={phase} onChange={(e) => setParams({ phase: e.currentTarget.value })}>
                    <option value="">{t('filter.allPhases')}</option>
                    {(current.phases ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {t('filter.phaseOption', { order: p.order, name: p.name })}
                      </option>
                    ))}
                  </select>
                  <select className="sires-input" aria-label={t('filter.label')} value={label} onChange={(e) => setParams({ label: e.currentTarget.value })}>
                    <option value="">{t('filter.allLabels')}</option>
                    {LABELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <select className="sires-input" aria-label={t('filter.agent')} value={agent} onChange={(e) => setParams({ agent: e.currentTarget.value })}>
                    <option value="">{t('filter.allAgents')}</option>
                    {agents.map((a) => (
                      <option key={a} value={a}>
                        {AGENT_NAMES[a]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div role="tabpanel" aria-label={t(`view.${view}`)}>
              {tasks.status === 'loading' && !tasks.data && <LoadingState what={t('board.loading')} />}
              {tasks.status === 'error' && !tasks.data && <ErrorState error={tasks.error} title={t('board.loadFailed')} onRetry={() => void tasks.reload()} />}
              {tasks.data &&
                (view === 'graph' ? (
                  <GraphView projectId={projectId} version={current} tasks={byId} hrefOf={hrefOf} selectedTaskId={taskId} />
                ) : (
                  <Board rows={rows} version={current} hrefOf={hrefOf} selectedTaskId={taskId} filtered={Boolean(phase || label || agent)} />
                ))}
            </div>
          </>
        )}
      </div>

      {taskId && (
        <TaskPanel
          key={taskId}
          projectId={projectId}
          taskId={taskId}
          definition={selectedDef}
          versionNumber={current?.versionNumber}
          taskName={taskName}
          openTaskHref={hrefOf}
          proposedVersionId={versions.find((v) => v.status === 'Proposed')?.id}
          archived={archived}
          onChanged={() => {
            void tasks.reload();
            void refreshNavigation();
          }}
          onClose={() => setParams({ task: null })}
        />
      )}
    </div>
  );
}

/** Read-only versions and what can be done with the others (EC03). */
function VersionNotice({ version, projectId }: { version: PlanVersion; projectId: string }) {
  const { t } = useTranslation('planning');
  if (version.status === 'Superseded' || version.status === 'Rejected') {
    return (
      <p className="planning-note" role="note">
        {t('version.readOnly', { version: version.versionNumber, status: version.status })}
        {version.rejectionReason && <> {t('version.rejectionReason', { reason: version.rejectionReason })}</>}
      </p>
    );
  }
  if (version.status === 'Proposed') {
    return (
      <p className="planning-note" role="note">
        {t('version.proposed', { version: version.versionNumber })}{' '}
        <Link to={`/projects/${encodeURIComponent(projectId)}/plan/versions/${encodeURIComponent(version.id)}`}>{t('version.review')}</Link>
      </p>
    );
  }
  return null;
}

function PlanContent({ version }: { version: PlanVersion }) {
  const { t } = useTranslation('planning');
  const parts = (['goals', 'methods', 'milestones', 'deliverables', 'risks', 'assumptions'] as const).filter((key) => (version[key] ?? []).length > 0);
  return (
    <details className="planning-content">
      <summary>{t('content.title', { version: version.versionNumber })}</summary>
      {version.changeSummary && <p>{version.changeSummary}</p>}
      <div className="planning-content__grid">
        {parts.map((key) => (
          <section key={key}>
            <h3 className="planning-block__title">{t(`content.${key}`)}</h3>
            <ul className="planning-list">
              {(version[key] ?? []).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}

function Board({ rows, version, hrefOf, selectedTaskId, filtered }: { rows: Row[]; version: PlanVersion; hrefOf: (id: string) => string; selectedTaskId: string | null; filtered: boolean }) {
  const { t } = useTranslation('planning');
  const columns = TASK_STATUS_ORDER.map((status) => ({ status, rows: rows.filter((r) => r.status === status) })).filter((c) => c.rows.length > 0);
  if (rows.length === 0) {
    return <EmptyState title={filtered ? t('board.noMatch') : t('board.empty')} reason={filtered ? t('board.noMatchReason') : t('board.emptyReason')} />;
  }
  return (
    <div className="planning-board">
      {columns.map((column) => (
        <section key={column.status} className="planning-column" aria-labelledby={`planning-col-${column.status.replace(/\s/g, '-')}`}>
          <h2 id={`planning-col-${column.status.replace(/\s/g, '-')}`} className="planning-column__head">
            <StatusChip status={column.status} entity="task" /> <span className="sires-num">{column.rows.length}</span>
          </h2>
          <ul className="planning-cards">
            {column.rows.map((row) => (
              <li key={row.def.taskId}>
                <Card row={row} version={version} href={hrefOf(row.def.taskId)} selected={selectedTaskId === row.def.taskId} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Card({ row, version, href, selected }: { row: Row; version: PlanVersion; href: string; selected: boolean }) {
  const { t } = useTranslation('planning');
  const { def, task } = row;
  const failing = task?.lastReadiness && !task.lastReadiness.passed ? task.lastReadiness.checks.find((c) => !c.passed) : undefined;
  const reason =
    row.status === 'Blocked' && failing
      ? (failing.detail ?? failing.code)
      : row.status === 'Waiting for User'
        ? t('board.waitingYou')
        : row.status === 'In Review'
          ? t('board.needsReviewDecision')
          : undefined;
  return (
    <Link to={href} className="planning-card" draggable={false} aria-current={selected ? 'true' : undefined} data-status={row.status}>
      <span className="sires-id">{keyOf(def)}</span>{' '}
      <span className="planning-card__title">{def.title}</span>{' '}
      <ExecutionLabel kind={def.executionLabel} />{' '}
      {def.proposedAgent && def.executionLabel === 'Available for agent' && <span className="planning-muted">{AGENT_NAMES[def.proposedAgent]}</span>}{' '}
      {reason && <span className="planning-card__reason">{reason}</span>}
      {task?.needsReview && <StatusChip status="needs review" />}
      {row.isNew && <span className="planning-card__new">{t('board.newIn', { version: version.versionNumber })}</span>}
    </Link>
  );
}
