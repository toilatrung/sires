// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Tasks of every Active project (PID-00082 S07, reference GlobalTasks): read-only, grouped by TaskStatus with counts,
// filters Project / Execution label / Agent; a row opens the Task in its project's Plan. No command here (EC35).

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, ErrorState, ExecutionLabel, LoadingState, StatusChip, useApi, useEvents } from '../../shell';
import { itemsOf, keyOf, TASK_STATUS_ORDER, useResource, type Schemas, type Task } from './common';
import { AGENT_NAMES } from './TaskPanel';

interface Row {
  task: Task;
  project: Schemas['ResearchProject'];
}

export function GlobalTasksPage() {
  const { t } = useTranslation('planning');
  const api = useApi();
  const [search, setSearch] = useSearchParams();
  const data = useResource(async () => {
    const { data: projects } = await api.get('/projects', { query: { status: 'Active' } });
    const list = itemsOf<Schemas['ResearchProject']>(projects);
    const pages = await Promise.all(list.map((project) => api.get('/projects/{projectId}/tasks', { path: { projectId: project.id } })));
    const rows: Row[] = pages.flatMap((page, i) => itemsOf<Task>(page.data).map((task) => ({ task, project: list[i]! })));
    return { data: { projects: list, rows } };
  }, [api]);
  useEvents({ types: ['task.status_changed'] }, () => void data.reload());

  const project = search.get('project') ?? '';
  const label = search.get('label') ?? '';
  const agent = search.get('agent') ?? '';
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearch(next);
  };
  const rows = useMemo(
    () =>
      (data.data?.rows ?? [])
        .filter((r) => !project || r.project.id === project)
        .filter((r) => !label || r.task.currentDefinition.executionLabel === label)
        .filter((r) => !agent || r.task.currentDefinition.proposedAgent === agent),
    [data.data, project, label, agent],
  );
  const agents = useMemo(
    () => [...new Set((data.data?.rows ?? []).map((r) => r.task.currentDefinition.proposedAgent).filter(Boolean) as Schemas['AgentName'][])],
    [data.data],
  );

  return (
    <div className="planning-page planning-global">
      <div className="planning-main">
        <header className="planning-header">
          <h1 className="planning-title">{t('global.title')}</h1>
          <p className="planning-muted">{t('global.lede')}</p>
        </header>
        {data.status === 'loading' && !data.data && <LoadingState what={t('global.loading')} />}
        {data.status === 'error' && !data.data && <ErrorState error={data.error} title={t('global.loadFailed')} onRetry={() => void data.reload()} />}
        {data.data && (
          <>
            <div className="planning-row planning-filters">
              <label className="sires-field planning-field--inline">
                <span className="sires-field__label">{t('global.project')}</span>
                <select className="sires-input" value={project} onChange={(e) => set('project', e.currentTarget.value)}>
                  <option value="">{t('global.allProjects', { count: data.data.projects.length })}</option>
                  {data.data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sires-field planning-field--inline">
                <span className="sires-field__label">{t('filter.label')}</span>
                <select className="sires-input" value={label} onChange={(e) => set('label', e.currentTarget.value)}>
                  <option value="">{t('global.all')}</option>
                  <option value="Available for agent">Available for agent</option>
                  <option value="Manual editor requirement">Manual editor requirement</option>
                </select>
              </label>
              <label className="sires-field planning-field--inline">
                <span className="sires-field__label">{t('filter.agent')}</span>
                <select className="sires-input" value={agent} onChange={(e) => set('agent', e.currentTarget.value)}>
                  <option value="">{t('global.all')}</option>
                  {agents.map((a) => (
                    <option key={a} value={a}>
                      {AGENT_NAMES[a]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {rows.length === 0 ? (
              <EmptyState title={t('global.empty')} reason={data.data.rows.length ? t('board.noMatchReason') : t('global.emptyReason')} />
            ) : (
              TASK_STATUS_ORDER.map((status) => {
                const group = rows.filter((r) => r.task.status === status);
                if (group.length === 0) return null;
                const id = `planning-global-${status.replace(/\s/g, '-')}`;
                return (
                  <section key={status} className="planning-group" aria-labelledby={id}>
                    <h2 id={id} className="planning-group__head">
                      <StatusChip status={status} entity="task" /> <span className="planning-muted">{t('global.count', { count: group.length })}</span>
                    </h2>
                    <ul className="planning-rows">
                      {group.map(({ task, project: p }) => {
                        const failing = task.lastReadiness && !task.lastReadiness.passed ? task.lastReadiness.checks.find((c) => !c.passed) : undefined;
                        return (
                          <li key={task.id}>
                            <Link to={`/projects/${encodeURIComponent(p.id)}/plan?task=${encodeURIComponent(task.id)}`} className="planning-global-row">
                              <span className="sires-id">{keyOf(task.currentDefinition) || task.stableKey}</span>{' '}
                              <span className="planning-card__title">{task.currentDefinition.title}</span>{' '}
                              <span className="planning-global-row__meta">
                                {status === 'Blocked' && failing && <span className="planning-card__reason">{failing.detail ?? failing.code} · </span>}
                                <span className="planning-muted">{p.name}</span>
                              </span>{' '}
                              <ExecutionLabel kind={task.currentDefinition.executionLabel} />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}
