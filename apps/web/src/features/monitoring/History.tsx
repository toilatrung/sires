// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Activity and History (PID-00059 S06; H16; CTX-AUDIT-001): the project's audit trail, read-only, newest first, “Xem
// thêm” by nextCursor. Filters: Actor (researcher, agent, system are sent as actorType; Orchestrator and Specialist
// Agent split the loaded agent events by actor.agent, EC33), Loại sự kiện (“Phê duyệt” = apr set, “Sự kiện agent” =
// actor.type agent, on the loaded items; “Thay đổi”, “Quyết định” wait for the PO's answer to I2, EC34), Task
// (objectType=task, objectId). Summaries are text, never HTML (EC35).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { EmptyState, ErrorState, LoadingState, formatDateTime, useApi } from '../../shell';
import { NS, loadTaskNames, refHref, shortId, useActorName, useResource, type AuditEvent, type Page } from './shared';

type ActorFilter = 'all' | 'researcher' | 'orchestrator' | 'specialist' | 'system';
type KindFilter = 'all' | 'approval' | 'agent';
const ACTORS: ActorFilter[] = ['all', 'researcher', 'orchestrator', 'specialist', 'system'];
const KINDS: KindFilter[] = ['all', 'approval', 'agent'];
const PAGE = 50;
/** Prefix of the short id of an object (“wf-052”, “ar-7f3”), as on the other screens. */
const PREFIX: Record<string, string> = { workflow: 'wf', agent_run: 'ar', prompt: 'pr', plan_version: 'pv', task: 't' };

const actorType = (filter: ActorFilter) => (filter === 'orchestrator' || filter === 'specialist' ? 'agent' : filter === 'all' ? undefined : filter);

function keep(event: AuditEvent, actor: ActorFilter, kind: KindFilter): boolean {
  if (actor === 'orchestrator' && event.actor.agent !== 'orchestrator') return false;
  if (actor === 'specialist' && (event.actor.type !== 'agent' || event.actor.agent === 'orchestrator')) return false;
  if (kind === 'approval' && !event.apr) return false;
  if (kind === 'agent' && event.actor.type !== 'agent') return false;
  return true;
}

export function HistoryPage() {
  const { t } = useTranslation(NS);
  const api = useApi();
  const { projectId = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const actor = ACTORS.find((a) => a === search.get('actor')) ?? 'all';
  const kind = KINDS.find((k) => k === search.get('kind')) ?? 'all';
  const taskId = search.get('task') ?? '';
  const actorName = useActorName();
  const [loadingMore, setLoadingMore] = useState(false);

  const read = (cursor?: string): Promise<Page<AuditEvent>> =>
    api
      .get('/projects/{projectId}/audit-events', {
        path: { projectId },
        query: { limit: PAGE, ...(actorType(actor) ? { actorType: actorType(actor) } : {}), ...(taskId ? { objectType: 'task', objectId: taskId } : {}), ...(cursor ? { cursor } : {}) },
      })
      .then((r) => r.data);

  const events = useResource(async () => {
    const page = await read();
    return { items: page.items ?? [], cursor: page.nextCursor ?? null };
  }, [projectId, actor, taskId]);
  const tasks = useResource(() => loadTaskNames(api, [projectId]), [projectId]);

  const set = (key: string, value: string) => {
    const params = new URLSearchParams(search);
    if (!value || value === 'all') params.delete(key);
    else params.set(key, value);
    setSearch(params);
  };
  const more = async (cursor: string) => {
    setLoadingMore(true);
    try {
      const page = await read(cursor);
      events.setData((old) => ({ items: [...old.items, ...(page.items ?? []).filter((e) => !old.items.some((x) => x.id === e.id))], cursor: page.nextCursor ?? null }));
    } finally {
      setLoadingMore(false);
    }
  };

  const taskList = tasks.value.state === 'ready' ? [...tasks.value.data.entries()] : [];
  const localFilter = actor === 'orchestrator' || actor === 'specialist' || kind !== 'all';

  return (
    <section className="sires-mon">
      <header className="sires-mon__head">
        <h1 className="sires-mon__title">{t('history.title')}</h1>
        <p className="sires-mon__lede">{t('history.lede')}</p>
      </header>
      <div className="sires-mon__filter-row">
        <label className="sires-field">
          <span className="sires-field__label">{t('history.actor')}</span>
          <select className="sires-input" value={actor} onChange={(e) => set('actor', e.currentTarget.value)}>
            {ACTORS.map((a) => (
              <option key={a} value={a}>
                {t(`history.actorOption.${a}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="sires-field">
          <span className="sires-field__label">{t('history.kind')}</span>
          <select className="sires-input" value={kind} onChange={(e) => set('kind', e.currentTarget.value)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`history.kindOption.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="sires-field">
          <span className="sires-field__label">{t('history.task')}</span>
          <select className="sires-input" value={taskId} onChange={(e) => set('task', e.currentTarget.value)}>
            <option value="">{t('history.allTasks')}</option>
            {taskList.map(([id, task]) => (
              <option key={id} value={id}>
                {task.key} · {task.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {events.value.state === 'loading' && <LoadingState what={t('history.loading')} />}
      {events.value.state === 'error' && <ErrorState error={events.value.error} ns={NS} title={t('history.loadFailed')} onRetry={() => void events.reload()} />}
      {events.value.state === 'ready' &&
        (() => {
          const { items, cursor } = events.value.data;
          // Newest first, whatever order the pages came in.
          const rows = items.filter((e) => keep(e, actor, kind)).sort((a, b) => b.at.localeCompare(a.at));
          return (
            <>
              {rows.length === 0 ? (
                <EmptyState title={t('history.empty')} reason={cursor ? t('history.emptyMore') : t('history.emptyReason')} />
              ) : (
                <div className="sires-mon__table-wrap" data-scroll="">
                  <table className="sires-mon__table sires-mon__history" aria-label={t('history.tableLabel')}>
                    <thead>
                      <tr>
                        <th scope="col">{t('history.col.at')}</th>
                        <th scope="col">{t('history.col.actor')}</th>
                        <th scope="col">{t('history.col.kind')}</th>
                        <th scope="col">{t('history.col.event')}</th>
                        <th scope="col">{t('history.col.object')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((e) => {
                        const href = refHref(projectId, { type: e.objectType, id: e.objectId });
                        const object = `${t(`ref.${e.objectType}`, { defaultValue: e.objectType })} ${shortId(PREFIX[e.objectType] ?? e.objectType.slice(0, 2), e.objectId)}`;
                        return (
                          <tr key={e.id}>
                            <td className="sires-num">{formatDateTime(e.at)}</td>
                            <td>{actorName(e.actor)}</td>
                            <td>{e.apr ? t('history.kindApproval', { apr: e.apr }) : e.actor.type === 'agent' ? t('history.kindOption.agent') : <span className="sires-id">{e.action}</span>}</td>
                            <td>{e.summary || e.action}</td>
                            <td>
                              {href ? (
                                <Link className="sires-mon__link" to={href}>
                                  {object}
                                </Link>
                              ) : (
                                object
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {localFilter && cursor && <p className="sires-mon__hint">{t('history.loadedOnly')}</p>}
              {cursor && (
                <div className="sires-mon__more">
                  <button type="button" className="sires-button" data-size="sm" disabled={loadingMore} onClick={() => void more(cursor)}>
                    {t('history.more')}
                  </button>
                </div>
              )}
            </>
          );
        })()}
    </section>
  );
}
