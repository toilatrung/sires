// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Agent Activity (PID-00059 S02; H7–H9, H17): GlobalActivity (/activity, every workflow of the account) and
// ProjectActivity (/projects/:projectId/activity, with the Agent List on the right). Filters Đang hoạt động /
// Đã kết thúc / Tất cả send `status` to listWorkflows; counts are of the loaded items, “+” while a page remains (EC03).
// Rows update from workflow.status_changed, agent_run.status_changed, prompt.status_changed by reading the workflow
// again (EC04, EC05); no token stream. At 390 px each workflow is a card (EC36).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { EmptyState, ErrorState, LoadingState, StatusChip, formatDate, formatTime, useApi, useEvents, useStreamSignal, type StreamEvent } from '../../shell';
import { AgentList } from './AgentList';
import {
  ACTIVE,
  ENDED,
  NS,
  WorkflowControls,
  allPages,
  elapsedText,
  hrefs,
  isActive,
  loadTaskNames,
  shortId,
  taskLabel,
  useAgentName,
  useNow,
  useResource,
  useWorkflowCommands,
  type Page,
  type TaskNames,
  type Workflow,
} from './shared';

type Filter = 'active' | 'ended' | 'all';
const PAGE = 20;
/** Default view: active workflows, then the three most recently ended (H7, EC02). */
const ENDED_PREVIEW = 3;

interface ActivityData {
  active: Workflow[];
  activeCursor: string | null;
  ended: Workflow[];
  endedCursor: string | null;
  projects: Map<string, string>;
  tasks: TaskNames;
  updatedAt: number;
}

const byStart = (a: Workflow, b: Workflow) => (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt);
const byEnd = (a: Workflow, b: Workflow) => (b.endedAt ?? b.createdAt).localeCompare(a.endedAt ?? a.createdAt);

export function ActivityPage({ scope }: { scope: 'global' | 'project' }) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const { projectId } = useParams();
  const [search, setSearch] = useSearchParams();
  const filter: Filter = (['active', 'ended', 'all'] as const).find((f) => f === search.get('filter')) ?? 'all';
  const [expanded, setExpanded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const project = scope === 'project' ? projectId : undefined;

  const list = (status: typeof ACTIVE, cursor?: string, limit = PAGE): Promise<Page<Workflow>> =>
    api.get('/workflows', { query: { status, limit, ...(project ? { projectId: project } : {}), ...(cursor ? { cursor } : {}) } }).then((r) => r.data);

  // A list row may come without its steps: read active workflows in full for the step and agent columns.
  const withSteps = (items: Workflow[]) =>
    Promise.all(items.map((w) => (w.steps || !isActive(w) ? w : api.get('/workflows/{workflowId}', { path: { workflowId: w.id } }).then((r) => r.data, () => w))));

  const resource = useResource<ActivityData>(async () => {
    const [activePage, endedPage, projects] = await Promise.all([
      list(ACTIVE, undefined, 100),
      list(ENDED),
      project
        ? Promise.resolve([])
        : allPages((cursor) => api.get('/projects', { query: { limit: 100, ...(cursor ? { cursor } : {}) } }).then((r) => r.data)).catch(() => []),
    ]);
    const active = (await withSteps(activePage.items ?? [])).sort(byStart);
    const ended = [...(endedPage.items ?? [])].sort(byEnd);
    const projectIds = project ? [project] : [...new Set([...active, ...ended].map((w) => w.projectId).filter(Boolean) as string[])];
    return {
      active,
      activeCursor: activePage.nextCursor ?? null,
      ended,
      endedCursor: endedPage.nextCursor ?? null,
      projects: new Map(projects.map((p) => [p.id, p.name])),
      tasks: await loadTaskNames(api, projectIds),
      updatedAt: Date.now(),
    };
  }, [project]);

  const upsert = (workflow: Workflow) =>
    resource.setData((old) => {
      const rest = (items: Workflow[]) => items.filter((w) => w.id !== workflow.id);
      return isActive(workflow)
        ? { ...old, active: [workflow, ...rest(old.active)].sort(byStart), ended: rest(old.ended), updatedAt: Date.now() }
        : { ...old, active: rest(old.active), ended: [workflow, ...rest(old.ended)].sort(byEnd), updatedAt: Date.now() };
    });

  const commands = useWorkflowCommands(upsert);

  // Each event: read the workflow it concerns again, so a duplicate or out-of-order event changes nothing (EC05).
  const refresh = async (workflowId: string) => {
    try {
      const workflow = (await api.get('/workflows/{workflowId}', { path: { workflowId } })).data;
      if (!project || workflow.projectId === project) upsert(workflow);
    } catch {
      void resource.reload();
    }
  };
  const rows = resource.value.state === 'ready' ? [...resource.value.data.active, ...resource.value.data.ended] : [];
  const onEvent = async (event: StreamEvent) => {
    const id = event.objectId;
    if (!id) return;
    if (event.type === 'workflow.status_changed') return refresh(id);
    const known = rows.find((w) => (event.type === 'agent_run.status_changed' ? w.steps?.some((s) => s.agentRunIds?.includes(id)) : w.steps?.some((s) => s.openPromptId === id)));
    if (known) return refresh(known.id);
    try {
      const workflowId =
        event.type === 'agent_run.status_changed'
          ? (await api.get('/agent-runs/{agentRunId}', { path: { agentRunId: id } })).data.workflowId
          : (await api.get('/prompts/{promptId}', { path: { promptId: id } })).data.workflowId;
      if (workflowId) await refresh(workflowId);
    } catch {
      // Not a workflow of this list.
    }
  };
  useEvents({ types: ['workflow.status_changed', 'agent_run.status_changed', 'prompt.status_changed'], projectId: project }, (event) => void onEvent(event));
  // Reconnected or events lost (replay unavailable): read the page again (EC05).
  useStreamSignal(() => void resource.reload());

  const live = rows.some((w) => w.status === 'Running' || w.status === 'Waiting for User');
  const now = useNow(live);

  const title = scope === 'global' ? t('activity.titleGlobal') : t('activity.titleProject');
  if (resource.value.state === 'loading') {
    return (
      <section className="sires-mon">
        <h1 className="sires-mon__title">{title}</h1>
        <LoadingState what={t('activity.loading')} />
      </section>
    );
  }
  if (resource.value.state === 'error') {
    return (
      <section className="sires-mon">
        <h1 className="sires-mon__title">{title}</h1>
        <ErrorState error={resource.value.error} ns={NS} title={t('activity.loadFailed')} onRetry={() => void resource.reload()} />
      </section>
    );
  }
  const data = resource.value.data;
  const plus = (cursor: string | null) => (cursor ? '+' : '');
  const counts: Record<Filter, string> = {
    active: `${data.active.length}${plus(data.activeCursor)}`,
    ended: `${data.ended.length}${plus(data.endedCursor)}`,
    all: `${data.active.length + data.ended.length}${plus(data.activeCursor ?? data.endedCursor)}`,
  };
  const endedShown = filter === 'active' ? [] : filter === 'ended' || expanded ? data.ended : data.ended.slice(0, ENDED_PREVIEW);
  const shown = [...(filter === 'ended' ? [] : data.active), ...endedShown];
  const hiddenEnded = data.ended.length - endedShown.length;

  const loadMore = async () => {
    if (filter === 'all' && !expanded && hiddenEnded > 0) {
      setExpanded(true);
      return;
    }
    if (!data.endedCursor) return;
    setLoadingMore(true);
    try {
      const next = await list(ENDED, data.endedCursor);
      const missing = [...new Set((next.items ?? []).filter((w) => w.taskId && !data.tasks.has(w.taskId)).map((w) => w.projectId).filter((p): p is string => Boolean(p)))];
      const tasks: TaskNames = missing.length ? await loadTaskNames(api, missing) : new Map();
      resource.setData((old) => ({
        ...old,
        ended: [...old.ended, ...(next.items ?? []).filter((w) => !old.ended.some((x) => x.id === w.id))].sort(byEnd),
        endedCursor: next.nextCursor ?? null,
        tasks: new Map([...old.tasks, ...tasks]),
      }));
      setExpanded(true);
    } finally {
      setLoadingMore(false);
    }
  };
  const moreCount = filter === 'all' && !expanded && hiddenEnded > 0 ? `${hiddenEnded}${plus(data.endedCursor)}` : data.endedCursor ? '' : undefined;

  const setFilter = (next: Filter) => {
    const params = new URLSearchParams(search);
    if (next === 'all') params.delete('filter');
    else params.set('filter', next);
    setSearch(params);
  };

  const updated = new Date(data.updatedAt);
  return (
    <section className="sires-mon" data-scope={scope}>
      <div className={scope === 'project' ? 'sires-mon__layout' : undefined}>
        <div className="sires-mon__main">
          <header className="sires-mon__head">
            <h1 className="sires-mon__title">{title}</h1>
            <p className="sires-mon__lede">
              {scope === 'global' ? t('activity.ledeGlobal') : t('activity.ledeProject')}{' '}
              <span className="sires-num" data-testid="updated-at">
                {t('activity.updated', { time: formatTime(updated, { withSeconds: true }), date: formatDate(updated) })}
              </span>
            </p>
          </header>
          <div className="sires-mon__filters" role="group" aria-label={t('activity.filterLabel')}>
            {(['active', 'ended', 'all'] as const).map((f) => (
              <button key={f} type="button" className="sires-mon__filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t(`activity.filter.${f}`)} · <span className="sires-num">{counts[f]}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <EmptyState
              title={filter === 'ended' ? t('activity.emptyEnded') : filter === 'active' && data.ended.length ? t('activity.emptyActive') : t('activity.empty')}
              reason={t('activity.emptyReason')}
              action={
                <Link className="sires-button" to={project ? `/projects/${encodeURIComponent(project)}/plan` : '/tasks'}>
                  {t('activity.emptyAction')}
                </Link>
              }
            />
          ) : (
            <WorkflowTable rows={shown} scope={scope} data={data} now={now} commands={commands} />
          )}
          {filter !== 'active' && moreCount !== undefined && (
            <div className="sires-mon__more">
              {filter === 'all' && <span className="sires-mon__hint">{t('activity.moreHint', { count: ENDED_PREVIEW })}</span>}
              <button type="button" className="sires-button" data-size="sm" disabled={loadingMore} onClick={() => void loadMore()}>
                {moreCount ? t('activity.moreN', { n: moreCount }) : t('activity.more')}
              </button>
            </div>
          )}
          <p className="sires-mon__hint">{t('activity.controlsHint')}</p>
        </div>
        {scope === 'project' && project && (
          <aside className="sires-mon__side">
            <AgentList projectId={project} />
          </aside>
        )}
      </div>
    </section>
  );
}

function WorkflowTable({ rows, scope, data, now, commands }: { rows: Workflow[]; scope: 'global' | 'project'; data: ActivityData; now: number; commands: ReturnType<typeof useWorkflowCommands> }) {
  const { t } = useTranslation(NS);
  const agentName = useAgentName();
  return (
    <div className="sires-mon__table-wrap">
      <table className="sires-mon__table" aria-label={t('activity.tableLabel')}>
        <thead>
          <tr>
            <th scope="col">{t('col.workflow')}</th>
            <th scope="col">{scope === 'global' ? t('col.projectTask') : t('col.task')}</th>
            <th scope="col">{t('col.status')}</th>
            <th scope="col">{t('col.step')}</th>
            <th scope="col">{t('col.time')}</th>
            <th scope="col">{t('col.prompts')}</th>
            <th scope="col">{t('col.controls')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => {
            const steps = w.steps ?? [];
            const current = steps.find((s) => s.id === w.currentStepId);
            const index = current ? steps.indexOf(current) + 1 : 0;
            const prompts = steps.filter((s) => s.openPromptId).length;
            const task = taskLabel(data.tasks, w.taskId);
            const projectId = w.projectId ?? '';
            return (
              <tr key={w.id} data-workflow={w.id}>
                <td data-label={t('col.workflow')}>
                  <span className="sires-id">{shortId('wf', w.id)}</span> <span className="sires-mon__muted">{w.type}</span>
                </td>
                <td data-label={scope === 'global' ? t('col.projectTask') : t('col.task')}>
                  {scope === 'global' && <span className="sires-mon__project">{data.projects.get(projectId) ?? shortId('p', projectId)}</span>}
                  {task && w.taskId ? (
                    <Link className="sires-mon__link" to={hrefs.task(projectId, w.taskId)}>
                      {task}
                    </Link>
                  ) : (
                    <span className="sires-mon__muted">—</span>
                  )}
                </td>
                <td data-label={t('col.status')}>
                  <StatusChip status={w.status} entity="workflow" />
                </td>
                <td data-label={t('col.step')}>
                  {current ? (
                    <>
                      <span className="sires-num">
                        {t('activity.stepOf', { current: index, total: steps.length })}
                      </span>{' '}
                      {current.description}
                      <span className="sires-mon__muted sires-mon__block">{agentName(current.assignedAgent)}</span>
                    </>
                  ) : (
                    <span className="sires-mon__muted">—</span>
                  )}
                </td>
                <td data-label={t('col.time')} className="sires-num">
                  {elapsedText(w, now)}
                </td>
                <td data-label={t('col.prompts')} className="sires-num">
                  {prompts ? t('activity.promptCount', { count: prompts }) : '—'}
                </td>
                <td data-label={t('col.controls')}>
                  <div className="sires-mon__row-actions">
                    <WorkflowControls workflow={w} taskLabel={task} commands={commands} size="sm" recoveryHref={hrefs.workflow(projectId, w.id)} />
                    <Link className="sires-mon__link" to={hrefs.workflow(projectId, w.id)} aria-label={t('activity.detailOf', { id: shortId('wf', w.id) })}>
                      {t('activity.detail')}
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
