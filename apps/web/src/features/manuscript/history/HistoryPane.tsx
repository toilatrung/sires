// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Revision history pane (PID-00115 S07, H14; Manuscript--rightPane-history): newest first, “Tải thêm” by cursor
// (EC43), choose exactly two to compare (EC41), open one to see its provenance, restore a text file to an older
// revision as a new revision (MS-REVISION-001). Reloads on revision events (H19).

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, LoadingState, useApi, useEvents } from '../../../shell';
import { asApiError, type Revision } from '../model';
import { useManuscript } from '../state';
import { Banner, useActorLabel } from '../ui';
import { CompareView } from './CompareView';
import { revisionTime, useSourceLabel, useTaskKeys } from './labels';
import type { Restored } from './restore';
import { RevisionDetail } from './RevisionDetail';
import './history.css';

const PAGE = 20;

type View = { kind: 'list' } | { kind: 'compare'; older: Revision; newer: Revision } | { kind: 'detail'; revision: Revision };

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; rows: Revision[]; cursor: string | null }
  | { status: 'error'; error: ReturnType<typeof asApiError> };

export function HistoryPane() {
  const { t } = useTranslation('manuscript');
  const api = useApi();
  const actorLabel = useActorLabel();
  const sourceLabel = useSourceLabel();
  const { projectId } = useManuscript();
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [more, setMore] = useState<{ busy: boolean; error?: ReturnType<typeof asApiError> }>({ busy: false });
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [restored, setRestored] = useState<Restored | undefined>();
  const reasonId = useId();
  const loaded = useRef(PAGE);

  const load = useCallback(async (limit = loaded.current) => {
    try {
      const { data } = await api.get('/projects/{projectId}/manuscript/revisions', { path: { projectId }, query: { limit } });
      setList({ status: 'ready', rows: (data.items ?? []) as Revision[], cursor: data.nextCursor ?? null });
    } catch (error) {
      setList({ status: 'error', error: asApiError(error) });
    }
  }, [api, projectId]);

  useEffect(() => {
    void load(PAGE);
  }, [load]);

  useEvents({ types: ['manuscript.object_status_changed'], projectId }, (event) => {
    if (event.objectType === 'revision') void load();
  });

  const loadMore = async () => {
    if (list.status !== 'ready' || !list.cursor || more.busy) return;
    setMore({ busy: true });
    try {
      const { data } = await api.get('/projects/{projectId}/manuscript/revisions', { path: { projectId }, query: { limit: PAGE, cursor: list.cursor } });
      const rows = [...list.rows, ...((data.items ?? []) as Revision[]).filter((row) => !list.rows.some((known) => known.id === row.id))];
      loaded.current = rows.length;
      setList({ status: 'ready', rows, cursor: data.nextCursor ?? null });
      setMore({ busy: false });
    } catch (error) {
      setMore({ busy: false, error: asApiError(error) });
    }
  };

  const rows = list.status === 'ready' ? list.rows : [];
  const taskKeys = useTaskKeys(projectId, rows.map((row) => row.taskId));
  const sourceOf = (revision: Revision) => sourceLabel(revision, revision.taskId ? taskKeys.get(revision.taskId) : undefined);

  const onRestored = (done: Restored) => {
    setRestored(done);
    setSelected([]);
    setView({ kind: 'list' });
    void load();
  };

  if (view.kind === 'compare') {
    return (
      <div className="msh">
        <CompareView older={view.older} newer={view.newer} sourceOf={sourceOf} onBack={() => setView({ kind: 'list' })} onRestored={onRestored} />
      </div>
    );
  }
  if (view.kind === 'detail') {
    const taskKey = view.revision.taskId ? taskKeys.get(view.revision.taskId) : undefined;
    return (
      <div className="msh">
        <RevisionDetail revision={view.revision} source={sourceOf(view.revision)} taskKey={taskKey} onBack={() => setView({ kind: 'list' })} onRestored={onRestored} />
      </div>
    );
  }

  const chosen = rows.filter((row) => selected.includes(row.id)).sort((a, b) => a.revisionNumber - b.revisionNumber);
  const ready = chosen.length === 2;
  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  return (
    <div className="msh">
      <h2 className="ms-pane-title msh-pane-title">{t('history.title')}</h2>
      {restored && (
        <div className="msh-notice">
          <Banner
            tone="info"
            label={t('history.restoredLabel')}
            actions={
              <button type="button" className="sires-button" data-variant="secondary" data-size="sm" onClick={() => setRestored(undefined)}>
                {t('common.close')}
              </button>
            }
          >
            {t('history.restored', { path: restored.path, from: restored.from, to: restored.to })}
          </Banner>
        </div>
      )}
      {list.status === 'loading' && <LoadingState what={t('history.title')} rows={4} />}
      {list.status === 'error' && <ErrorState error={list.error} ns="manuscript" onRetry={() => void load()} />}
      {list.status === 'ready' && !rows.length && <EmptyState title={t('history.emptyTitle')} reason={t('history.emptyReason')} />}
      {list.status === 'ready' && rows.length > 0 && (
        <>
          <div className="msh-compare-bar">
            <button
              type="button"
              className="sires-button"
              data-variant="secondary"
              data-size="sm"
              disabled={!ready}
              aria-describedby={ready ? undefined : reasonId}
              onClick={() => ready && setView({ kind: 'compare', older: chosen[0]!, newer: chosen[1]! })}
            >
              {ready ? t('history.compare', { a: chosen[0]!.revisionNumber, b: chosen[1]!.revisionNumber }) : t('history.compareIdle')}
            </button>
            {!ready && (
              <span id={reasonId} className="msh-reason">
                {t('history.pickTwo', { count: chosen.length })}
              </span>
            )}
          </div>
          <ol className="msh-list" aria-label={t('history.title')}>
            {rows.map((revision) => {
              const checked = selected.includes(revision.id);
              const id = `msh-pick-${revision.id}`;
              return (
                <li key={revision.id} className="msh-row" data-selected={checked ? '' : undefined}>
                  <input id={id} type="checkbox" className="msh-check" checked={checked} onChange={() => toggle(revision.id)} aria-label={t('history.select', { n: revision.revisionNumber })} />
                  <label htmlFor={id} className="msh-row__text">
                    <span className="msh-row__line">
                      <span className="sires-id">r{revision.revisionNumber}</span> · {actorLabel(revision.createdBy)} · {revisionTime(revision.createdAt)}
                    </span>
                    <span className="msh-source">{sourceOf(revision)}</span>
                  </label>
                  <button type="button" className="sires-button" data-variant="secondary" data-size="xs" onClick={() => setView({ kind: 'detail', revision })}>
                    {t('history.open', { n: revision.revisionNumber })}
                  </button>
                </li>
              );
            })}
          </ol>
          {more.error && <ErrorState error={more.error} ns="manuscript" onRetry={() => void loadMore()} />}
          {list.cursor && (
            <div className="msh-more">
              <button type="button" className="sires-button" data-variant="secondary" data-size="sm" disabled={more.busy} onClick={() => void loadMore()}>
                {more.busy ? t('history.loadingMore') : t('history.more')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
