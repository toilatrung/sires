// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Notifications (G10, Notifications.html, Notifications--filter-unread.html; PID-00060 S03, H5): newest first, read
// and unread dots with a screen-reader label, kind chips, filters Unread (server) and by kind (loaded rows), mark
// read on open and “mark all”. Links come from objectType (labels.ts objectLink). Reloads on notification.created.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { PublicApi } from '@sires/contracts';
import { EmptyState, ErrorState, LoadingState, isApiError, useApi, useEvents, useRefreshNavigation, useStreamSignal, type ApiError } from '../../../shell';
import { NOTIFICATION_KINDS, NOTIFICATION_KIND_LABEL, NOTIFICATION_TONE, objectLink, shortStamp, useProjectNames, type NotificationKind } from '../labels';

type Notification = PublicApi.components['schemas']['Notification'];
type Filter = 'all' | 'unread' | NotificationKind;
type State = { status: 'loading' } | { status: 'ready'; items: Notification[]; unreadCount: number } | { status: 'error'; error: ApiError };

/** Place shown for a row without project (design: Settings, Trusted Library). */
function placeOf(row: Notification, names: ReadonlyMap<string, string>): string | undefined {
  if (row.projectId) return names.get(row.projectId);
  if (row.objectType === 'provider_connection') return 'Settings';
  if (row.objectType === 'reference') return 'Trusted Library';
  return undefined;
}

export function NotificationsScreen() {
  const { t } = useTranslation('global');
  const api = useApi();
  const navigate = useNavigate();
  const names = useProjectNames();
  const refreshNavigation = useRefreshNavigation();
  const [filter, setFilter] = useState<Filter>('all');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [error, setError] = useState<ApiError>();

  const unreadOnly = filter === 'unread';
  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications', { query: { limit: 100, ...(unreadOnly ? { status: 'Unread' as const } : {}) } });
      const items = [...(data.items as Notification[])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setState({ status: 'ready', items, unreadCount: data.unreadCount ?? items.filter((row) => row.status === 'Unread').length });
    } catch (failure) {
      if (!isApiError(failure)) throw failure;
      setState({ status: 'error', error: failure });
    }
  }, [api, unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);
  useEvents({ types: ['notification.created'] }, () => void load());
  useStreamSignal((signal) => signal === 'reload' && void load());

  const items = state.status === 'ready' ? state.items : [];
  const rows = useMemo(() => (filter === 'all' || filter === 'unread' ? items : items.filter((row) => row.kind === filter)), [items, filter]);
  const byKind = filter === 'all' || filter === 'unread' ? undefined : filter;
  const unreadShown = rows.filter((row) => row.status === 'Unread');

  const markRead = async (body: { ids?: string[]; all?: boolean }) => {
    setError(undefined);
    try {
      await api.post('/notifications/read', { body });
    } catch (failure) {
      if (!isApiError(failure)) throw failure;
      setError(failure);
    }
    await load();
    void refreshNavigation();
  };

  const open = async (row: Notification, to: string) => {
    if (row.status === 'Unread') {
      // EC10: mark read first; a failure must not keep the researcher from the object.
      try {
        await api.post('/notifications/read', { body: { ids: [row.id] } });
        void refreshNavigation();
      } catch (failure) {
        if (!isApiError(failure)) throw failure;
      }
    }
    void navigate(to);
  };

  const filters: Array<{ value: Filter; label: string; count?: number }> = [
    { value: 'all', label: t('notifications.all'), count: state.status === 'ready' && !unreadOnly ? items.length : undefined },
    { value: 'unread', label: t('notifications.unread'), count: state.status === 'ready' ? state.unreadCount : undefined },
    ...NOTIFICATION_KINDS.map((kind) => ({ value: kind as Filter, label: NOTIFICATION_KIND_LABEL[kind], count: state.status === 'ready' && !unreadOnly ? items.filter((row) => row.kind === kind).length : undefined })),
  ];

  return (
    <div className="g-page g-page--tight">
      <div className="g-with-filter">
        <nav className="g-filter" aria-label={t('notifications.filterLabel')}>
          <ul className="g-list">
            {filters.map((item) => (
              <li key={item.value}>
                <button type="button" className="g-filter__item" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>
                  <span>{item.label}</span>
                  <span className="sires-num">{item.count ?? ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="g-section g-with-filter__main">
          <div className="g-head">
            <div>
              <h1 className="g-title">Notifications</h1>
              <p className="g-note">
                {t('notifications.subtitle', { count: state.status === 'ready' ? state.unreadCount : 0 })}{' '}
                <Link to="/pending-actions">Pending Actions</Link>.
              </p>
            </div>
            {byKind ? (
              <button type="button" className="sires-button" data-variant="secondary" disabled={!unreadShown.length} onClick={() => void markRead({ ids: unreadShown.map((row) => row.id) })}>
                {t('notifications.markShown')}
              </button>
            ) : (
              <button type="button" className="sires-button" data-variant="secondary" disabled={state.status !== 'ready' || !state.unreadCount} onClick={() => void markRead({ all: true })}>
                {t('notifications.markAll')}
              </button>
            )}
          </div>
          {error && <ErrorState error={error} ns="global" notSaved={t('notifications.notMarked')} />}
          {state.status === 'loading' && <LoadingState what={t('notifications.loadingWhat')} />}
          {state.status === 'error' && <ErrorState error={state.error} ns="global" onRetry={() => void load()} />}
          {state.status === 'ready' && !rows.length && <EmptyState title={unreadOnly ? t('notifications.emptyUnread') : t('notifications.empty')} reason={t('notifications.emptyReason')} />}
          {state.status === 'ready' && rows.length > 0 && (
            <ul className="g-list g-card g-notification-list">
              {rows.map((row) => {
                const link = objectLink(row.objectType, row.objectId, row.projectId);
                const place = placeOf(row, names);
                const unread = row.status === 'Unread';
                return (
                  <li key={row.id} className="g-notification" data-unread={unread || undefined}>
                    <span className="g-notification__dot" data-unread={unread || undefined} aria-hidden="true" />
                    <span className="sires-visually-hidden">{unread ? t('notifications.unreadLabel') : t('notifications.readLabel')}</span>
                    <span className="g-notification__time sires-num">{shortStamp(row.createdAt)}</span>
                    <span className="g-notification__body">
                      <span className="g-notification__meta">
                        <span className="sires-chip" data-tone={NOTIFICATION_TONE[row.kind]}>
                          {NOTIFICATION_KIND_LABEL[row.kind]}
                        </span>
                        {place && <span className="g-meta">{place}</span>}
                      </span>
                      <span className="g-notification__message">{row.message}</span>
                      {link && (
                        <a
                          className="g-link"
                          href={link.to}
                          onClick={(event) => {
                            event.preventDefault();
                            void open(row, link.to);
                          }}
                        >
                          {t(`link.${link.label}`)}
                        </a>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="g-note">{t('notifications.inAppOnly')}</p>
        </div>
      </div>
    </div>
  );
}
