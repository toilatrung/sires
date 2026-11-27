// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Research Projects (G2, Projects.html; PID-00037 S02–S04, H6–H8): three tabs Active, Archived, “Đã xóa (30
// ngày)”, the create panel, and the lifecycle actions. The contract has no total count and no search, so tab
// counts are of loaded rows (“+” when more pages exist) and the filter runs on loaded rows.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { PublicApi } from '@sires/contracts';
import { EmptyState, ErrorState, LoadingState, StatusChip, formatDate, isApiError, useApi, type ApiError } from '../../../shell';
import { RowMenu, useActivityLabel, type MenuItem } from '../ui';
import { EditProjectDialog, LifecycleDialog, type LifecycleKind } from './dialogs';
import { ProjectForm } from './ProjectForm';

type Project = PublicApi.components['schemas']['ResearchProject'];
export type ProjectTab = 'Active' | 'Archived' | 'deleted';
export const TABS: readonly ProjectTab[] = ['Active', 'Archived', 'deleted'];
const PAGE = 50;

interface ListState {
  status: 'loading' | 'ready' | 'error';
  items: Project[];
  nextCursor: string | null;
  error?: ApiError;
  loadingMore?: boolean;
}

const initial: ListState = { status: 'loading', items: [], nextCursor: null };

function useProjectLists() {
  const api = useApi();
  const [lists, setLists] = useState<Record<ProjectTab, ListState>>({ Active: initial, Archived: initial, deleted: initial });

  const load = useCallback(
    async (tab: ProjectTab) => {
      setLists((all) => ({ ...all, [tab]: { ...all[tab], status: all[tab].items.length ? all[tab].status : 'loading', error: undefined } }));
      try {
        const { data } = await api.get('/projects', { query: { status: tab, sort: 'lastActivityAt', limit: PAGE } });
        setLists((all) => ({ ...all, [tab]: { status: 'ready', items: data.items, nextCursor: data.nextCursor ?? null } }));
      } catch (error) {
        if (!isApiError(error)) throw error;
        setLists((all) => ({ ...all, [tab]: { status: 'error', items: [], nextCursor: null, error } }));
      }
    },
    [api],
  );

  const loadMore = useCallback(
    async (tab: ProjectTab, cursor: string) => {
      setLists((all) => ({ ...all, [tab]: { ...all[tab], loadingMore: true } }));
      try {
        const { data } = await api.get('/projects', { query: { status: tab, sort: 'lastActivityAt', limit: PAGE, cursor } });
        setLists((all) => ({ ...all, [tab]: { status: 'ready', items: [...all[tab].items, ...data.items], nextCursor: data.nextCursor ?? null } }));
      } catch (error) {
        if (!isApiError(error)) throw error;
        setLists((all) => ({ ...all, [tab]: { ...all[tab], loadingMore: false, error } }));
      }
    },
    [api],
  );

  const reloadAll = useCallback(() => Promise.all(TABS.map((tab) => load(tab))), [load]);
  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);
  return { lists, load, loadMore, reloadAll };
}

function completed(project: Project): { done: number; total: number } | undefined {
  const counts = project.summary?.taskCounts;
  if (!counts) return undefined;
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return { done: counts.Completed ?? 0, total };
}

function matches(project: Project, filter: string): boolean {
  const needle = filter.trim().toLocaleLowerCase();
  if (!needle) return true;
  return `${project.name} ${project.shortDescription ?? ''}`.toLocaleLowerCase().includes(needle);
}

export function ProjectsScreen() {
  const { t } = useTranslation('global');
  const api = useApi();
  const navigate = useNavigate();
  const activity = useActivityLabel();
  const [params, setParams] = useSearchParams();
  const { lists, load, loadMore, reloadAll } = useProjectLists();
  const [tab, setTab] = useState<ProjectTab>('Active');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<Project>();
  const [lifecycle, setLifecycle] = useState<{ kind: LifecycleKind; project: Project }>();
  const [notice, setNotice] = useState<string>();
  const [actionError, setActionError] = useState<ApiError>();
  const creating = params.get('new') === '1';

  const setCreating = (open: boolean) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (open) next.set('new', '1');
      else next.delete('new');
      return next;
    });

  const list = lists[tab];
  const rows = useMemo(() => list.items.filter((project) => matches(project, filter)), [list.items, filter]);
  const activeNames = useMemo(() => lists.Active.items.map((project) => project.name), [lists.Active.items]);

  const tabLabel = (value: ProjectTab) => {
    const state = lists[value];
    const name = t(`projects.tab.${value}`);
    if (state.status !== 'ready') return name;
    return `${name} · ${state.items.length}${state.nextCursor ? '+' : ''}`;
  };

  const run = async (action: () => Promise<unknown>, message: string) => {
    setActionError(undefined);
    setNotice(undefined);
    try {
      await action();
      setNotice(message);
    } catch (error) {
      if (!isApiError(error)) throw error;
      setActionError(error);
    }
    await reloadAll();
  };

  const reopen = (project: Project) =>
    run(() => api.post('/projects/{projectId}/unarchive', { path: { projectId: project.id } }), t('notice.reopened', { name: project.name }));
  const restore = (project: Project) =>
    run(() => api.post('/projects/{projectId}/restore', { path: { projectId: project.id } }), t('notice.restored', { name: project.name }));

  const menu = (project: Project): MenuItem[] => {
    const open = { label: t('actions.open'), onSelect: () => navigate(`/projects/${project.id}/overview`) };
    const edit = { label: project.status === 'Archived' ? t('actions.viewInfo') : t('actions.edit'), onSelect: () => setEditing(project) };
    const remove = { label: t('actions.delete'), danger: true, onSelect: () => setLifecycle({ kind: 'delete', project }) };
    return project.status === 'Archived'
      ? [open, edit, { label: t('actions.reopen'), onSelect: () => void reopen(project) }, remove]
      : [open, edit, { label: t('actions.archive'), onSelect: () => setLifecycle({ kind: 'archive', project }) }, remove];
  };

  const empty = () => {
    if (list.items.length && !rows.length) {
      return (
        <EmptyState
          title={t('projects.filterEmpty', { filter: filter.trim() })}
          reason={t('projects.filterEmptyReason')}
          action={
            <button type="button" className="sires-button" data-variant="secondary" onClick={() => setFilter('')}>
              {t('projects.clearFilter')}
            </button>
          }
        />
      );
    }
    return (
      <EmptyState
        title={t(`projects.empty.${tab}`)}
        reason={t(`projects.emptyReason.${tab}`)}
        action={
          tab === 'Active' ? (
            <button type="button" className="sires-button" data-variant="secondary" onClick={() => setCreating(true)}>
              {t('projects.create')}
            </button>
          ) : (
            <button type="button" className="sires-button" data-variant="secondary" onClick={() => setTab('Active')}>
              {t('projects.backToActive')}
            </button>
          )
        }
      />
    );
  };

  const table = () => (
    <div className="g-card g-card--scroll">
      {tab === 'deleted' ? (
        <table className="g-table g-table--compact">
          <thead>
            <tr>
              <th scope="col">{t('projects.col.project')}</th>
              <th scope="col">{t('projects.col.deletedAt')}</th>
              <th scope="col">{t('projects.col.purgeAfter')}</th>
              <th scope="col">
                <span className="sires-visually-hidden">{t('projects.col.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((project) => (
              <tr key={project.id}>
                <td>
                  <span className="g-project-name">{project.name}</span>
                  {project.shortDescription && <span className="g-project-desc">{project.shortDescription}</span>}
                </td>
                <td className="g-muted sires-num">{project.deletedAt ? formatDate(project.deletedAt) : '—'}</td>
                <td className="sires-num">{project.purgeAfter ? formatDate(project.purgeAfter) : '—'}</td>
                <td className="g-cell--action">
                  <button type="button" className="sires-button" data-variant="outline" data-size="sm" onClick={() => void restore(project)} aria-label={t('actions.restoreNamed', { name: project.name })}>
                    {t('actions.restore')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="g-table">
          <thead>
            <tr>
              <th scope="col">{t('projects.col.project')}</th>
              <th scope="col">{t('projects.col.plan')}</th>
              <th scope="col">{t('projects.col.progress')}</th>
              <th scope="col">{t('projects.col.waiting')}</th>
              <th scope="col">{t('projects.col.lastActivity')}</th>
              <th scope="col">
                <span className="sires-visually-hidden">{t('projects.col.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((project) => {
              const progress = completed(project);
              const waiting = project.summary?.openPendingActions;
              return (
                <tr key={project.id}>
                  <td>
                    <Link className="g-project-name" to={`/projects/${project.id}/overview`}>
                      {project.name}
                    </Link>
                    {project.shortDescription && <span className="g-project-desc">{project.shortDescription}</span>}
                  </td>
                  <td>
                    {project.summary === undefined ? (
                      '—'
                    ) : project.summary.hasApprovedPlan ? (
                      <StatusChip status="Approved" entity="plan-version" />
                    ) : (
                      <span className="g-muted">{t('projects.noBaseline')}</span>
                    )}
                  </td>
                  <td className="sires-num">{progress && progress.total ? t('projects.tasks', { done: progress.done, total: progress.total }) : '—'}</td>
                  <td className="sires-num">{waiting ? t('projects.waiting', { count: waiting }) : '—'}</td>
                  <td className="g-muted sires-num">{activity(project.lastActivityAt)}</td>
                  <td className="g-cell--action">
                    <RowMenu label={t('actions.menu', { name: project.name })} items={menu(project)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="g-split">
      <div className="g-split__main">
        <div className="g-page g-page--tight">
          <div className="g-head">
            <h1 className="g-title">{t('projects.title')}</h1>
            <button type="button" className="sires-button" data-variant={creating ? 'secondary' : 'primary'} aria-expanded={creating} onClick={() => setCreating(true)}>
              {t('projects.create')}
            </button>
          </div>
          <div className="g-toolbar">
            <div role="tablist" aria-label={t('projects.tabsLabel')} className="g-tabs">
              {TABS.map((value) => (
                <button key={value} type="button" role="tab" className="g-tab" aria-selected={tab === value} onClick={() => setTab(value)}>
                  {tabLabel(value)}
                </button>
              ))}
            </div>
            <div className="g-field g-field--search">
              <label htmlFor="g-project-filter">{t('projects.filter')}</label>
              <input id="g-project-filter" type="search" className="g-input" placeholder={t('projects.filterPlaceholder')} value={filter} onChange={(event) => setFilter(event.currentTarget.value)} />
            </div>
          </div>
          <div role="status" aria-live="polite">
            {notice && <p className="g-notice">{notice}</p>}
          </div>
          {actionError && <ErrorState error={actionError} ns="global" notSaved={t('lifecycle.notChanged')} />}
          <div role="tabpanel" aria-label={t(`projects.tab.${tab}`)}>
            {list.status === 'loading' ? (
              <LoadingState what={t('projects.loadingWhat')} />
            ) : list.status === 'error' ? (
              <ErrorState error={list.error} ns="global" onRetry={() => void load(tab)} />
            ) : rows.length ? (
              table()
            ) : (
              empty()
            )}
          </div>
          {list.status === 'ready' && list.nextCursor && (
            <div>
              <button type="button" className="sires-button" data-variant="secondary" disabled={list.loadingMore} onClick={() => void loadMore(tab, list.nextCursor!)}>
                {list.loadingMore ? t('projects.loadingMore') : t('projects.loadMore')}
              </button>
            </div>
          )}
          <p className="g-note">{t('projects.menuNote')}</p>
        </div>
      </div>
      {creating && (
        <aside className="g-split__panel" aria-label={t('form.createTitle')}>
          <ProjectForm activeNames={activeNames} onCancel={() => setCreating(false)} onCreated={(project) => navigate(`/projects/${project.id}/chat`)} />
        </aside>
      )}
      {editing && (
        <EditProjectDialog
          project={editing}
          onClose={() => setEditing(undefined)}
          onReopen={() => {
            const project = editing;
            setEditing(undefined);
            void reopen(project);
          }}
          onSaved={(project) => {
            setEditing(undefined);
            setNotice(t('notice.saved', { name: project.name }));
            void reloadAll();
          }}
        />
      )}
      {lifecycle && (
        <LifecycleDialog
          kind={lifecycle.kind}
          project={lifecycle.project}
          onClose={() => setLifecycle(undefined)}
          onDone={(project) => {
            setLifecycle(undefined);
            setNotice(t(lifecycle.kind === 'archive' ? 'notice.archived' : 'notice.deleted', { name: project.name }));
            void reloadAll();
          }}
        />
      )}
    </div>
  );
}
