// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Trusted Library (G4, PID-00098 S06) and the pending-approval panel (S07). Never calls discovery (DISC-SCHOLAR-002).

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  EmptyState, ErrorState, formatDate, LoadingState, StatusChip, useApi, useEvents, useShell, useStreamSignal, type ApiError,
} from '../../shell';
import { Dialog, MetaLine, NS, type Reference, type ReferenceMetadata } from './common';

type ApprovalFilter = 'Trusted' | 'Revoked' | 'Rejected' | 'all';
interface Filters { q: string; approval: ApprovalFilter; indexing: string; year: string }
const DEFAULT_FILTERS: Filters = { q: '', approval: 'Trusted', indexing: '', year: '' };
const INDEXING = ['Not Indexed', 'Queued', 'Indexing', 'Indexed', 'Failed', 'Unavailable'] as const;
const PAGE = 50;

export function LibraryScreen() {
  const { t } = useTranslation(NS);
  const api = useApi();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<Reference[]>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<ApiError>();
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const query = useMemo(() => ({
    approvalStatus: filters.approval === 'all' ? ['Trusted', 'Revoked', 'Rejected'] as const : [filters.approval] as const,
    ...(filters.indexing ? { indexingStatus: filters.indexing as (typeof INDEXING)[number] } : {}),
    ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
    ...(/^\d{4}$/.test(filters.year) ? { year: Number(filters.year) } : {}),
    limit: PAGE,
  }), [filters]);

  useEffect(() => {
    let live = true;
    setRows(undefined);
    setError(undefined);
    api.get('/references', { query: { ...query, approvalStatus: [...query.approvalStatus] } })
      .then(({ data }) => { if (live) { setRows(data.items ?? []); setCursor(data.nextCursor ?? null); } })
      .catch((e: ApiError) => { if (live) setError(e); });
    return () => { live = false; };
  }, [api, query, reload]);

  const loadMore = async () => {
    if (!cursor) return;
    try {
      const { data } = await api.get('/references', { query: { ...query, approvalStatus: [...query.approvalStatus], cursor } });
      const items: Reference[] = data.items ?? [];
      setRows((current) => [...(current ?? []), ...items]);
      setCursor(data.nextCursor ?? null);
    } catch (e) {
      setError(e as ApiError);
    }
  };

  useEvents({ types: ['reference.status_changed', 'reference.indexing_status_changed'] }, refresh);
  useStreamSignal((signal) => { if (signal === 'reload') refresh(); });

  const filtered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  const [pendingCount, setPendingCount] = useState<number>();

  return (
    <div className="library-page">
      <div className="library-head">
        <h1 className="library-title">Trusted Library</h1>
        <div className="library-head__actions">
          <Link className="sires-button" to="/discover">{t('library.toDiscover')}</Link>
          <Link className="sires-button" to="/discover#nhap-thu-cong">{t('library.toManual')}</Link>
        </div>
      </div>

      <PendingPanel reloadKey={reload} onChanged={refresh} onCount={setPendingCount} />

      <form className="library-filters" role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="library-filter library-filter--grow">{t('library.filter.search')}
          <input className="sires-input" type="search" value={filters.q} placeholder={t('library.filter.searchPlaceholder')}
            onChange={(event) => setFilters({ ...filters, q: event.currentTarget.value })} />
        </label>
        <label className="library-filter">{t('library.filter.approval')}
          <select className="sires-input" value={filters.approval} onChange={(event) => setFilters({ ...filters, approval: event.currentTarget.value as ApprovalFilter })}>
            <option value="Trusted">Trusted</option>
            <option value="Revoked">Revoked</option>
            <option value="Rejected">Rejected</option>
            <option value="all">{t('library.filter.all')}</option>
          </select>
        </label>
        <label className="library-filter">{t('library.filter.indexing')}
          <select className="sires-input" value={filters.indexing} onChange={(event) => setFilters({ ...filters, indexing: event.currentTarget.value })}>
            <option value="">{t('library.filter.all')}</option>
            {INDEXING.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label className="library-filter library-filter--year">{t('library.filter.year')}
          <input className="sires-input" inputMode="numeric" maxLength={4} value={filters.year}
            onChange={(event) => setFilters({ ...filters, year: event.currentTarget.value.replace(/\D/g, '') })} />
        </label>
      </form>

      {error ? (
        <ErrorState error={error} ns={NS} title={t('library.loadError')} onRetry={refresh} />
      ) : !rows ? (
        <LoadingState what="Trusted Library" rows={6} />
      ) : rows.length === 0 ? (
        filtered ? (
          <EmptyState title={t('library.filteredEmpty.title')} reason={t('library.filteredEmpty.reason')}
            action={<button type="button" className="sires-button" onClick={() => setFilters(DEFAULT_FILTERS)}>{t('library.filteredEmpty.clear')}</button>} />
        ) : (
          <EmptyState title={t('library.empty.title')} reason={pendingCount ? t('library.empty.reasonPending', { count: pendingCount }) : t('library.empty.reason')}
            action={pendingCount ? undefined : <Link className="sires-button" data-variant="primary" to="/discover">{t('library.empty.action')}</Link>} />
        )
      ) : (
        <div className="library-table-wrap">
          <table className="library-table">
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">BibTeX key</th>
                <th scope="col">{t('library.col.approval')}</th>
                <th scope="col">Indexing</th>
                <th scope="col">{t('library.col.projects')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ref) => <LibraryRow key={ref.id} reference={ref} />)}
            </tbody>
          </table>
          {cursor && (
            <div className="library-more">
              <span className="sires-num">{t('library.count', { count: rows.length })}+</span>
              <button type="button" className="sires-button" data-size="sm" onClick={() => void loadMore()}>{t('common.loadMore')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LibraryRow({ reference: ref }: { reference: Reference }) {
  const { t } = useTranslation(NS);
  const note = ref.indexingStatus === 'Failed' ? ref.indexingError?.message ?? t('index.failed')
    : ref.indexingStatus === 'Unavailable' ? t('index.unavailableShort') : undefined;
  const decided = ref.approvalStatus === 'Revoked' ? ref.revocation?.decidedAt : ref.approval?.decidedAt;
  return (
    <tr>
      <td>
        <Link className="library-link" to={`/library/${ref.id}`}>{ref.metadata.title}</Link>
        <MetaLine metadata={ref.metadata} />
      </td>
      <td><span className="sires-id">{ref.bibtexKey}</span></td>
      <td>
        <StatusChip status={ref.approvalStatus} entity="reference" />
        {decided && <span className="library-sub">{formatDate(decided)}</span>}
      </td>
      <td>
        <StatusChip status={ref.indexingStatus} entity="reference-index" />
        {note && <span className="library-sub">{note}</span>}
      </td>
      <td className="sires-num">
        {ref.usedInProjectCount ? t('library.projects', { count: ref.usedInProjectCount }) : '—'}
      </td>
    </tr>
  );
}

/* ---------- Pending approval panel (S07) ---------- */

interface ItemState { error?: string; editing?: boolean }

function PendingPanel({ reloadKey, onChanged, onCount }: { reloadKey: number; onChanged: () => void; onCount: (count: number) => void }) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const { idempotency } = useShell();
  const [items, setItems] = useState<Reference[]>();
  const [error, setError] = useState<ApiError>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, setState] = useState<Record<string, ItemState>>({});
  const [rejecting, setRejecting] = useState<string[]>();
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    setError(undefined);
    api.get('/references', { query: { approvalStatus: ['Pending Approval'], limit: 200 } })
      .then(({ data }) => {
        if (!live) return;
        const rows: Reference[] = data.items ?? [];
        setItems(rows);
        setSelected(new Set(rows.filter((row) => !row.duplicateWarnings?.length).map((row) => row.id)));
        onCount(rows.length);
      })
      .catch((e: ApiError) => { if (live) setError(e); });
    return () => { live = false; };
  }, [api, reloadKey, retry, onCount]);

  if (error) return <section className="library-pending"><ErrorState error={error} ns={NS} title={t('pending.loadError')} onRetry={() => setRetry((n) => n + 1)} /></section>;
  if (!items) return null;
  if (items.length === 0) return null;

  const decide = async (decisions: { referenceId: string; decision: 'approve' | 'reject'; metadataVersion?: number; editedMetadata?: ReferenceMetadata; reason?: string }[]) => {
    setBusy(true);
    try {
      const { data } = await idempotency.run(`decideReferences:${decisions.map((d) => d.referenceId).join(',')}`,
        (key) => api.post('/references/approvals', { body: { decisions }, idempotencyKey: key }));
      const outcome = new Map((data.results ?? []).map((row) => [row.referenceId, row]));
      const done = new Set(decisions.map((d) => d.referenceId).filter((id) => {
        const row = outcome.get(id);
        return row?.outcome === 'trusted' || row?.outcome === 'rejected';
      }));
      setState((current) => {
        const next = { ...current };
        for (const d of decisions) {
          const row = outcome.get(d.referenceId);
          if (row && !done.has(d.referenceId)) next[d.referenceId] = { error: row.problem?.detail ?? t('pending.skipped') };
        }
        return next;
      });
      setItems((current) => current?.filter((row) => !done.has(row.id)));
      setSelected((current) => new Set([...current].filter((id) => !done.has(id))));
      onCount(items.length - done.size);
      if (done.size) onChanged();
    } catch (e) {
      const apiError = e as ApiError;
      setState((current) => Object.fromEntries([...Object.entries(current), ...decisions.map((d) => [d.referenceId, { error: `${t('pending.failed')} (${apiError.code})` }])]));
    } finally {
      setBusy(false);
    }
  };

  const regular = items.filter((row) => !row.duplicateWarnings?.length);
  const chosen = regular.filter((row) => selected.has(row.id));
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <section className="library-pending" aria-labelledby="library-pending-title">
      <div className="library-pending__head">
        <div className="library-pending__intro">
          <h2 id="library-pending-title" className="library-pending__title">{t('pending.title', { count: items.length })}</h2>
          <span className="library-muted">{t('pending.hint')}</span>
        </div>
        <div className="library-pending__actions">
          <button type="button" className="sires-button" disabled={busy || chosen.length === 0} onClick={() => setRejecting(chosen.map((row) => row.id))}>
            {t('pending.rejectSelected')}
          </button>
          <button type="button" className="sires-button" data-variant="primary" disabled={busy || chosen.length === 0}
            aria-describedby={chosen.length === 0 ? 'library-pending-none' : undefined}
            onClick={() => void decide(chosen.map((row) => ({ referenceId: row.id, decision: 'approve', metadataVersion: row.metadataVersion })))}>
            {t('pending.approveSelected', { count: chosen.length })}
          </button>
          {chosen.length === 0 && <span id="library-pending-none" className="library-muted">{t('pending.noneSelected')}</span>}
        </div>
      </div>
      <ul className="library-pending__list">
        {items.map((row) => (
          <PendingItem key={row.id} reference={row} selected={selected.has(row.id)} onToggle={() => toggle(row.id)} state={state[row.id] ?? {}}
            busy={busy}
            onEdit={(editing) => setState((current) => ({ ...current, [row.id]: { ...current[row.id], editing } }))}
            onSaveApprove={(metadata) => void decide([{ referenceId: row.id, decision: 'approve', metadataVersion: row.metadataVersion, editedMetadata: metadata }])}
            onKeepApprove={() => void decide([{ referenceId: row.id, decision: 'approve', metadataVersion: row.metadataVersion, reason: t('pending.keepReason') }])}
            onReject={() => setRejecting([row.id])}
            onMerge={async (into) => {
              setBusy(true);
              try {
                await idempotency.run(`mergeReference:${row.id}`, (key) => api.post('/references/{referenceId}/merge', { path: { referenceId: row.id }, body: { intoReferenceId: into }, idempotencyKey: key }));
                setItems((current) => current?.filter((item) => item.id !== row.id));
                onCount(items.length - 1);
                onChanged();
              } catch (e) {
                setState((current) => ({ ...current, [row.id]: { error: `${t('pending.failed')} (${(e as ApiError).code})` } }));
              } finally {
                setBusy(false);
              }
            }} />
        ))}
      </ul>
      {rejecting && (
        <RejectDialog count={rejecting.length} onClose={() => setRejecting(undefined)}
          onConfirm={(reason) => { const ids = rejecting; setRejecting(undefined); void decide(ids.map((id) => ({ referenceId: id, decision: 'reject', reason }))); }} />
      )}
    </section>
  );
}

interface PendingItemProps {
  reference: Reference;
  selected: boolean;
  onToggle: () => void;
  state: ItemState;
  busy: boolean;
  onEdit: (editing: boolean) => void;
  onSaveApprove: (metadata: ReferenceMetadata) => void;
  onKeepApprove: () => void;
  onReject: () => void;
  onMerge: (into: string) => void;
}

function PendingItem({ reference: ref, selected, onToggle, state, busy, onEdit, onSaveApprove, onKeepApprove, onReject, onMerge }: PendingItemProps) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const duplicateId = ref.duplicateWarnings?.[0]?.referenceId;
  const [duplicate, setDuplicate] = useState<Reference | null>();
  useEffect(() => {
    if (!duplicateId) return;
    let live = true;
    api.get('/references/{referenceId}', { path: { referenceId: duplicateId } })
      .then(({ data }) => { if (live) setDuplicate(data); })
      .catch(() => { if (live) setDuplicate(null); });
    return () => { live = false; };
  }, [api, duplicateId]);

  return (
    <li className="library-pending__item">
      {duplicateId ? (
        <span className="library-pending__nocheck" aria-hidden="true" />
      ) : (
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={t('pending.choose', { title: ref.metadata.title })} />
      )}
      <span className="library-pending__text">
        <Link className="library-link" to={`/library/${ref.id}`}>{ref.metadata.title}</Link>
        <MetaLine metadata={ref.metadata} />
      </span>
      {duplicateId && (
        <span className="library-tag" data-tone="warning">
          {t('pending.maybeDuplicate')}{' '}
          {duplicate ? <Link to={`/library/${duplicateId}`}>{duplicate.metadata.title}</Link> : t('pending.existing')}
        </span>
      )}
      <span className="library-pending__buttons">
        {duplicateId ? (
          <>
            <button type="button" className="sires-button" data-size="xs" disabled={busy} onClick={() => onMerge(duplicateId)}>{t('pending.merge')}</button>
            <button type="button" className="sires-button" data-size="xs" disabled={busy} onClick={onKeepApprove}>{t('pending.keepApprove')}</button>
            <button type="button" className="sires-button" data-size="xs" disabled={busy} onClick={onReject}>{t('pending.reject')}</button>
          </>
        ) : (
          <button type="button" className="library-textbutton" onClick={() => onEdit(!state.editing)}>{t('pending.edit')}</button>
        )}
      </span>
      {state.error && <span className="library-item-error" role="alert">{state.error}</span>}
      {state.editing && <MetadataForm metadata={ref.metadata} submitLabel={t('pending.saveApprove')} busy={busy} onCancel={() => onEdit(false)} onSubmit={onSaveApprove} />}
    </li>
  );
}

/** What the metadata form holds while typing (also what a draft stores). */
export interface MetadataFormValues { title: string; authors: string; year: string; venue: string }

/** Edit form for title, authors, year, venue (rest of the metadata kept as is); onChange lets the page keep a draft. */
export function MetadataForm({ metadata, submitLabel, busy, onSubmit, onCancel, initial, onChange }: {
  metadata: ReferenceMetadata; submitLabel: string; busy?: boolean; onSubmit: (next: ReferenceMetadata) => void; onCancel: () => void;
  initial?: MetadataFormValues; onChange?: (values: MetadataFormValues) => void;
}) {
  const { t } = useTranslation(NS);
  const id = useId();
  const [form, setFormState] = useState<MetadataFormValues>(initial ?? {
    title: metadata.title, authors: metadata.authors.map((a) => a.name).join('; '), year: metadata.year ? String(metadata.year) : '', venue: metadata.venue ?? '',
  });
  const setForm = (next: MetadataFormValues) => { setFormState(next); onChange?.(next); };
  const yearError = form.year && !/^\d{4}$/.test(form.year) ? t('form.yearInvalid') : undefined;
  const titleError = !form.title.trim() ? t('form.titleRequired') : undefined;
  return (
    <form className="library-metaform" onSubmit={(event) => {
      event.preventDefault();
      if (yearError || titleError) return;
      const rest = Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== 'year' && key !== 'venue')) as ReferenceMetadata;
      onSubmit({
        ...rest,
        title: form.title.trim(),
        authors: form.authors.split(';').map((name) => name.trim()).filter(Boolean).map((name) => ({ name })),
        ...(form.year ? { year: Number(form.year) } : {}),
        ...(form.venue.trim() ? { venue: form.venue.trim() } : {}),
      });
    }}>
      {/* Errors sit outside the labels (aria-describedby), so each field's name stays its label. */}
      <div className="sires-field">
        <label className="sires-field__label" htmlFor={`${id}-title`}>{t('form.title')}</label>
        <input id={`${id}-title`} className="sires-input" value={form.title} aria-invalid={Boolean(titleError)} aria-describedby={titleError ? `${id}-title-error` : undefined}
          onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} />
        {titleError && <span id={`${id}-title-error`} className="library-field-error">{titleError}</span>}
      </div>
      <label className="sires-field"><span className="sires-field__label">{t('form.authors')}</span>
        <input className="sires-input" value={form.authors} onChange={(e) => setForm({ ...form, authors: e.currentTarget.value })} />
      </label>
      <div className="library-metaform__row">
        <div className="sires-field">
          <label className="sires-field__label" htmlFor={`${id}-year`}>{t('form.year')}</label>
          <input id={`${id}-year`} className="sires-input" inputMode="numeric" value={form.year} aria-invalid={Boolean(yearError)} aria-describedby={yearError ? `${id}-year-error` : undefined}
            onChange={(e) => setForm({ ...form, year: e.currentTarget.value })} />
          {yearError && <span id={`${id}-year-error`} className="library-field-error">{yearError}</span>}
        </div>
        <label className="sires-field"><span className="sires-field__label">{t('form.venue')}</span>
          <input className="sires-input" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.currentTarget.value })} />
        </label>
      </div>
      <div className="library-metaform__actions">
        <button type="button" className="sires-button" onClick={onCancel}>{t('common.cancel')}</button>
        <button type="submit" className="sires-button" data-variant="outline" disabled={busy}>{submitLabel}</button>
      </div>
    </form>
  );
}

export function RejectDialog({ count, onClose, onConfirm }: { count: number; onClose: () => void; onConfirm: (reason: string) => void }) {
  const { t } = useTranslation(NS);
  const [reason, setReason] = useState('');
  return (
    <Dialog title={t('reject.title', { count })} onClose={onClose} actions={(
      <>
        <button type="button" className="sires-button" onClick={onClose}>{t('reject.keep')}</button>
        <button type="button" className="sires-button" data-variant="danger" onClick={() => onConfirm(reason.trim())}>{t('reject.confirm', { count })}</button>
      </>
    )}>
      <p>{t('reject.consequence', { count })}</p>
      <label className="sires-field"><span className="sires-field__label">{t('reject.reason')}</span>
        <textarea className="sires-input library-textarea" value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
      </label>
    </Dialog>
  );
}
