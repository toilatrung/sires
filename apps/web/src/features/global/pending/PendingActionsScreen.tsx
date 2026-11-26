// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Pending Actions (G9, PendingActions.html; PID-00060 S02, H4) and its phone layout M1 (MobilePending.html; S05,
// H3). Open items oldest first with a filter by kind; Expired items in their own group with the reason until the
// researcher marks them seen (UX-PENDING-001, UX-PENDING-002). Reloads on pending_action.changed.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { PublicApi } from '@sires/contracts';
import { EmptyState, ErrorState, LoadingState, StatusChip, isApiError, useApi, useEvents, useRefreshNavigation, useStreamSignal, type ApiError } from '../../../shell';
import { PENDING_KINDS, PENDING_KIND_LABEL, shortStamp, usePhone, useProjectNames, type PendingKind } from '../labels';
import { PendingRow, placeOf } from './PendingRow';

type PendingAction = PublicApi.components['schemas']['PendingAction'];
const PAGE = 100;

interface ListState {
  status: 'loading' | 'ready' | 'error';
  items: PendingAction[];
  nextCursor: string | null;
  openCount?: number;
  error?: ApiError;
}

const loading: ListState = { status: 'loading', items: [], nextCursor: null };
const oldestFirst = (rows: PendingAction[]) => [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/** Route of a pending action on the phone: prompts open MobilePrompt (H3), others their owner's screen. */
export function phoneTarget(action: PendingAction): string | undefined {
  if (action.kind === 'interactive_prompt') return `/pending-actions/prompts/${action.objectId}`;
  return action.deepLink;
}

export function PendingActionsScreen() {
  const { t } = useTranslation('global');
  const api = useApi();
  const phone = usePhone();
  const names = useProjectNames();
  const refreshNavigation = useRefreshNavigation();
  const [kind, setKind] = useState<PendingKind | 'all'>('all');
  const [all, setAll] = useState<ListState>(loading);
  const [filtered, setFiltered] = useState<ListState>(loading);
  const [expired, setExpired] = useState<ListState>(loading);
  const [ackError, setAckError] = useState<ApiError>();

  const fetchList = useCallback(
    async (status: 'Open' | 'Expired', filter?: PendingKind, cursor?: string): Promise<ListState> => {
      try {
        const { data } = await api.get('/pending-actions', { query: { status, limit: PAGE, ...(filter ? { kind: filter } : {}), ...(cursor ? { cursor } : {}) } });
        return { status: 'ready', items: data.items as PendingAction[], nextCursor: data.nextCursor ?? null, openCount: data.openCount };
      } catch (error) {
        if (!isApiError(error)) throw error;
        return { status: 'error', items: [], nextCursor: null, error };
      }
    },
    [api],
  );

  const reload = useCallback(async () => {
    const [open, gone] = await Promise.all([fetchList('Open'), fetchList('Expired')]);
    setAll(open);
    setExpired(gone);
  }, [fetchList]);

  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (kind === 'all') return;
    setFiltered(loading);
    void fetchList('Open', kind).then(setFiltered);
  }, [kind, fetchList, all]);

  useEvents({ types: ['pending_action.changed'] }, () => void reload());
  useStreamSignal((signal) => signal === 'reload' && void reload());

  const loadMore = async () => {
    const list = kind === 'all' ? all : filtered;
    if (!list.nextCursor) return;
    const next = await fetchList('Open', kind === 'all' ? undefined : kind, list.nextCursor);
    const merge = (state: ListState): ListState => ({ ...next, items: [...state.items, ...next.items] });
    if (kind === 'all') setAll(merge);
    else setFiltered(merge);
  };

  const acknowledge = async (action: PendingAction) => {
    setAckError(undefined);
    try {
      await api.post('/pending-actions/{pendingActionId}/acknowledge', { path: { pendingActionId: action.id } });
    } catch (error) {
      if (!isApiError(error)) throw error;
      // 409: already resolved elsewhere (EC02) — the reload below shows the current state, no red error.
      if (error.status !== 409) setAckError(error);
    }
    await reload();
    void refreshNavigation();
  };

  const counts = useMemo(() => {
    const byKind = new Map<PendingKind, number>();
    for (const row of all.items) byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 1);
    return byKind;
  }, [all.items]);
  const more = all.nextCursor ? '+' : '';
  const list = kind === 'all' ? all : filtered;
  const rows = oldestFirst(list.items);
  const openCount = all.openCount ?? all.items.length;

  const expiredGroup = expired.status === 'ready' && expired.items.length > 0 && (
    <section aria-labelledby="g-expired" className="g-expired">
      <h2 id="g-expired" className="g-expired__title">
        {t('pending.expired', { count: expired.items.length })}
      </h2>
      <ul className="g-list">
        {oldestFirst(expired.items).map((action) => {
          const place = placeOf(action, names);
          return (
            <li key={action.id} className="g-expired__row">
              <span className="g-expired__body">
                <span className="g-pending__title">{[action.title ?? PENDING_KIND_LABEL[action.kind], place].filter(Boolean).join(' · ')}</span>
                <span className="g-meta">
                  {action.expiryReason ?? t('pending.expiredNoReason')} {t('pending.notConsent')}
                </span>
              </span>
              <button type="button" className="sires-button" data-variant="secondary" data-size="sm" onClick={() => void acknowledge(action)}>
                {t('pending.acknowledge')}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );

  const body = () => {
    if (list.status === 'loading') return <LoadingState what={t('pending.loadingWhat')} />;
    if (list.status === 'error') return <ErrorState error={list.error} ns="global" onRetry={() => void reload()} />;
    if (!rows.length) {
      return (
        <EmptyState
          title={kind === 'all' ? t('pending.emptyTitle') : t('pending.emptyKind', { kind: PENDING_KIND_LABEL[kind] })}
          reason={t('pending.emptyReason')}
          action={
            <Link className="g-link" to="/dashboard">
              {t('pending.toDashboard')}
            </Link>
          }
        />
      );
    }
    if (phone) {
      return (
        <ul className="g-list g-mobile-list">
          {rows.map((action) => {
            const target = phoneTarget(action);
            const content = (
              <>
                <span className="g-mobile-item__top">
                  <StatusChip status={PENDING_KIND_LABEL[action.kind]} entity="pending-action" />
                  <span className="g-meta sires-num">{shortStamp(action.createdAt)}</span>
                </span>
                <span className="g-pending__title">{action.title ?? PENDING_KIND_LABEL[action.kind]}</span>
                {placeOf(action, names) && <span className="g-meta">{placeOf(action, names)}</span>}
              </>
            );
            return (
              <li key={action.id}>
                {target ? (
                  <Link className="g-mobile-item" to={target}>
                    {content}
                  </Link>
                ) : (
                  <span className="g-mobile-item" aria-disabled="true">
                    {content}
                    <span className="g-field__hint">{t('pending.noLink')}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      );
    }
    return (
      <ul className="g-list g-card g-pending-list">
        {rows.map((action) => (
          <PendingRow key={action.id} action={action} names={names} layout="page" />
        ))}
      </ul>
    );
  };

  const loadMoreButton = list.status === 'ready' && list.nextCursor && (
    <div>
      <button type="button" className="sires-button" data-variant="secondary" onClick={() => void loadMore()}>
        {t('projects.loadMore')}
      </button>
    </div>
  );

  if (phone) {
    return (
      <div className="g-page g-page--tight">
        <h1 className="g-title">{all.status === 'ready' ? t('dashboard.pending.title', { count: openCount }) : t('dashboard.pending.heading')}</h1>
        {ackError && <ErrorState error={ackError} ns="global" />}
        {body()}
        {loadMoreButton}
        {expiredGroup}
        <p className="g-note">{t('pending.phoneNote')}</p>
      </div>
    );
  }

  return (
    <div className="g-page g-page--tight">
      <div className="g-with-filter">
        <nav className="g-filter" aria-label={t('pending.filterLabel')}>
          <ul className="g-list">
            <li>
              <button type="button" className="g-filter__item" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>
                <span>{t('pending.all')}</span>
                <span className="sires-num">{all.status === 'ready' ? openCount : ''}</span>
              </button>
            </li>
            {PENDING_KINDS.map((value) => (
              <li key={value}>
                <button type="button" className="g-filter__item" aria-pressed={kind === value} onClick={() => setKind(value)}>
                  <span>{PENDING_KIND_LABEL[value]}</span>
                  <span className="sires-num">{all.status === 'ready' ? `${counts.get(value) ?? 0}${more}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="g-section g-with-filter__main">
          <div>
            <h1 className="g-title">Pending Actions</h1>
            <p className="g-note">{t('pending.subtitle')}</p>
          </div>
          {ackError && <ErrorState error={ackError} ns="global" />}
          {body()}
          {loadMoreButton}
          {expiredGroup}
        </div>
      </div>
    </div>
  );
}
