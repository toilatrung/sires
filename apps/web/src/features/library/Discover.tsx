// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Discover (G3, PID-00098 S02–S04): search by query, title, keywords or author; long-running search with cancel and
// restore by /discover?search=<workflowId>; results always marked unreviewed (AC01); select, reject, batch import.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import {
  EmptyState, LoadingState, LongOperation, PromptCard, formatNumber, isApiError, useApi, useEvents, useSession, useShell,
  useStreamSignal, type ApiError, type InteractiveAgentPrompt,
} from '../../shell';
import {
  hasMinimumMetadata, MAX_BATCH, MetaLine, NS, safeUrl, sourceName, UnreviewedLabel, type DiscoveredResult, type Reference,
  type Schemas, type Workflow,
} from './common';
import { ManualImport } from './ManualImport';

type Tab = 'query' | 'title' | 'keywords' | 'author';
type SearchKind = 'search' | 'author';
type SearchStatus = 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';
interface Search {
  workflowId: string;
  kind: SearchKind;
  label: string;
  source: string;
  status: SearchStatus;
  startedAt: string;
  lastError?: { code?: string; message?: string };
}
interface Batch {
  workflowId: string;
  ids: string[];
  status: 'running' | 'done' | 'interrupted';
  startedAt: string;
  lastError?: { code?: string; message?: string };
}
type Problem = { code: string; title: string };

/** H11 filter on the loaded publications: year range (4 digits) and keyword in title, authors, venue, snippet. */
function matchesLoadedFilter(row: DiscoveredResult, filter: { yearFrom: string; yearTo: string; text: string }): boolean {
  const year = row.metadata.year;
  if (/^\d{4}$/.test(filter.yearFrom) && (!year || year < Number(filter.yearFrom))) return false;
  if (/^\d{4}$/.test(filter.yearTo) && (!year || year > Number(filter.yearTo))) return false;
  const text = filter.text.trim().toLowerCase();
  if (!text) return true;
  return [row.metadata.title, row.metadata.venue, row.metadata.abstractOrSnippet, ...row.metadata.authors.map((a) => a.name)]
    .some((value) => value?.toLowerCase().includes(text));
}

const NO_RESPONSE = new Set(['provider_unavailable', 'timeout', 'network_error', 'service_unavailable']);

const toStatus = (status: Schemas['WorkflowStatus']): SearchStatus =>
  status === 'Succeeded' ? 'succeeded' : status === 'Failed' ? 'failed' : status === 'Cancelled' ? 'cancelled'
    : status === 'Interrupted' ? 'interrupted' : status === 'Waiting for User' ? 'waiting' : 'running';

export function DiscoverScreen() {
  const { t } = useTranslation(NS);
  const api = useApi();
  const { idempotency } = useShell();
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const searchId = params.get('search');

  const [sources, setSources] = useState<Schemas['DiscoverySource'][] | 'error'>();
  const [tab, setTab] = useState<Tab>('query');
  const [text, setText] = useState('');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [errors, setErrors] = useState<{ text?: string; year?: string }>({});
  const [search, setSearch] = useState<Search>();
  const [startError, setStartError] = useState<ApiError>();
  const [notFound, setNotFound] = useState(false);
  const [results, setResults] = useState<DiscoveredResult[]>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState<InteractiveAgentPrompt>();
  const [answering, setAnswering] = useState(false);
  const [batch, setBatch] = useState<Batch>();
  const [batchError, setBatchError] = useState<{ code: string; ids: string[] }>();
  // H11: an author's publications are filtered on the loaded rows (year, keyword), not by a new search (QC G8).
  const [loadedFilter, setLoadedFilter] = useState({ yearFrom: '', yearTo: '', text: '' });
  const [lastBody, setLastBody] = useState<{ kind: SearchKind; body: Schemas['DiscoverySearchRequest'] | Schemas['AuthorSearchRequest'] }>();

  useEffect(() => {
    api.get('/discovery/sources').then(({ data }) => setSources(data.items ?? [])).catch(() => setSources('error'));
  }, [api]);

  const available = sources === 'error' || !sources ? [] : sources.filter((s) => s.available);
  const primary = available.find((s) => s.role === 'primary') ?? available.find((s) => s.source === 'openalex');
  const scholar = available.find((s) => s.source === 'google_scholar');
  const authorSource = available.find((s) => s.supportsAuthorSearch && s.source !== 'google_scholar') ?? available.find((s) => s.supportsAuthorSearch);
  const canAuthor = Boolean(authorSource);
  const yearSupported = !primary?.supportedFilters || primary.supportedFilters.includes('yearFrom');
  const account = session.status === 'signed-in' ? session.account : undefined;
  const profileUrl = account?.profile.googleScholarProfileUrl;
  const canMine = Boolean(profileUrl && scholar?.supportsAuthorSearch);

  const loadResults = useCallback(async (workflowId: string, after?: string | null) => {
    const { data } = await api.get('/discovered-results', { query: { workflowId, limit: 50, ...(after ? { cursor: after } : {}) } });
    const items: DiscoveredResult[] = data.items ?? [];
    setResults((current) => (after ? [...(current ?? []), ...items] : items));
    setCursor(data.nextCursor ?? null);
  }, [api]);

  const loadPrompt = useCallback(async (workflowId: string) => {
    const { data } = await api.get('/prompts', { query: { workflowId, status: 'Open', limit: 5 } });
    const items: InteractiveAgentPrompt[] = data.items ?? [];
    setPrompt(items[0]);
  }, [api]);

  /** Reads the workflow (restore, failure details, reload signal, 409 on cancel). */
  const readWorkflow = useCallback(async (workflowId: string, kind: SearchKind = 'search') => {
    try {
      const { data } = await api.get('/workflows/{workflowId}', { path: { workflowId } });
      const status = toStatus(data.status);
      setNotFound(false);
      setSearch((current) => ({
        workflowId, kind: current?.workflowId === workflowId ? current.kind : kind, label: current?.label ?? '',
        source: current?.source ?? '', status, startedAt: data.startedAt ?? data.createdAt, lastError: data.lastError,
      }));
      if (status === 'succeeded') await loadResults(workflowId);
      if (status === 'waiting') await loadPrompt(workflowId);
    } catch (e) {
      if (isApiError(e) && e.status === 404) {
        setNotFound(true);
        setSearch(undefined);
      }
    }
  }, [api, loadPrompt, loadResults]);

  // Restore a search by address (EC08).
  useEffect(() => {
    if (searchId && searchId !== search?.workflowId) void readWorkflow(searchId);
  }, [searchId]);

  useEvents({ types: ['workflow.status_changed', 'prompt.status_changed'] }, (event) => {
    // A prompt of this search opened, or was answered elsewhere (Pending Actions): read the open prompt again (QC G9).
    if (search?.status === 'waiting' && event.type === 'prompt.status_changed') void loadPrompt(search.workflowId);
    if (search && event.objectId === search.workflowId && event.type === 'workflow.status_changed' && event.toState) {
      const status = toStatus(event.toState as Schemas['WorkflowStatus']);
      setSearch({ ...search, status });
      if (status === 'succeeded') void loadResults(search.workflowId);
      if (status === 'failed') void readWorkflow(search.workflowId, search.kind);
      if (status === 'waiting') void loadPrompt(search.workflowId);
    }
    if (batch && event.objectId === batch.workflowId && event.type === 'workflow.status_changed' && event.toState) {
      const status = event.toState as Schemas['WorkflowStatus'];
      if (status === 'Running') return;
      void finishBatch(batch, status);
    }
  });
  useStreamSignal((signal) => {
    if (signal === 'reload' && search) void readWorkflow(search.workflowId, search.kind);
  });

  const finishBatch = async (current: Batch, status: Schemas['WorkflowStatus']) => {
    if (status === 'Interrupted') {
      setBatch({ ...current, status: 'interrupted' });
      return;
    }
    let lastError: Batch['lastError'];
    try {
      lastError = (await api.get('/workflows/{workflowId}', { path: { workflowId: current.workflowId } })).data.lastError;
    } catch { /* reason unknown: summary still shows the item */ }
    if (search) await loadResults(search.workflowId);
    setBatch({ ...current, status: 'done', lastError });
  };

  const start = async (kind: SearchKind, body: Schemas['DiscoverySearchRequest'] | Schemas['AuthorSearchRequest'], label: string) => {
    setStartError(undefined);
    setResults(undefined);
    setLoadedFilter({ yearFrom: '', yearTo: '', text: '' });
    setPrompt(undefined);
    setBatch(undefined);
    setBatchError(undefined);
    setNotFound(false);
    setLastBody({ kind, body });
    // One key per request body: “Tìm lại” after a network error or 5xx resends the same key (EC03); another query gets
    // its own key instead of reusing one the server already holds for a different body.
    const operation = `${kind === 'author' ? 'startAuthorSearch' : 'startDiscoverySearch'}:${JSON.stringify(body)}`;
    try {
      const { data } = kind === 'author'
        ? await idempotency.run(operation, (key) => api.post('/discovery/author-searches', { body: body as Schemas['AuthorSearchRequest'], idempotencyKey: key }))
        : await idempotency.run(operation, (key) => api.post('/discovery/searches', { body: body as Schemas['DiscoverySearchRequest'], idempotencyKey: key }));
      const workflow = data as Workflow;
      setSearch({ workflowId: workflow.id, kind, label, source: body.source ?? primary?.source ?? 'openalex', status: toStatus(workflow.status), startedAt: workflow.startedAt ?? workflow.createdAt });
      setParams({ search: workflow.id }, { replace: true });
    } catch (e) {
      setStartError(e as ApiError);
    }
  };

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    const next: typeof errors = {};
    const value = text.trim();
    if (!value) next.text = tab === 'author' ? t('discover.error.authorEmpty') : t('discover.error.queryEmpty');
    const from = yearFrom.trim();
    const to = yearTo.trim();
    if ((from && !/^\d{4}$/.test(from)) || (to && !/^\d{4}$/.test(to))) next.year = t('discover.error.yearNumber');
    else if (from && to && Number(from) > Number(to)) next.year = t('discover.error.yearOrder');
    setErrors(next);
    if (next.text || next.year) return;
    if (tab === 'author') {
      void start('author', { author: value, source: authorSource?.source ?? 'openalex' }, value);
      return;
    }
    const years = yearSupported ? { ...(from ? { yearFrom: Number(from) } : {}), ...(to ? { yearTo: Number(to) } : {}) } : {};
    const filters = tab === 'title' ? { title: value, ...years } : tab === 'keywords' ? { keywords: value.split(/[,;]/).map((k) => k.trim()).filter(Boolean), ...years } : years;
    void start('search', { query: value, source: primary?.source ?? 'openalex', maxResults: 20, ...(Object.keys(filters).length ? { filters } : {}) }, value);
  };

  const cancel = async () => {
    if (!search) return;
    try {
      await idempotency.run(`cancel:${search.workflowId}`, (key) => api.post('/workflows/{workflowId}/cancel', { path: { workflowId: search.workflowId }, body: {}, idempotencyKey: key }));
      setSearch({ ...search, status: 'cancelled' });
    } catch {
      await readWorkflow(search.workflowId, search.kind); // 409: already finished, show the real state (EC07)
    }
  };

  const setStatus = async (row: DiscoveredResult, status: 'New' | 'Selected' | 'Rejected') => {
    const previous = row.status;
    setResults((current) => current?.map((r) => (r.id === row.id ? { ...r, status } : r)));
    setRowErrors((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== row.id)));
    try {
      await api.patch('/discovered-results/{discoveredResultId}', { path: { discoveredResultId: row.id }, body: { status } });
    } catch (e) {
      setResults((current) => current?.map((r) => (r.id === row.id ? { ...r, status: previous } : r)));
      setRowErrors((current) => ({ ...current, [row.id]: `${t('discover.selectFailed')} (${(e as ApiError).code})` }));
    }
  };

  const selected = (results ?? []).filter((r) => r.status === 'Selected');
  const shown = search?.kind === 'author' ? (results ?? []).filter((row) => matchesLoadedFilter(row, loadedFilter)) : (results ?? []);
  const eligible = shown.filter((r) => r.status === 'New' && !r.duplicateOfReferenceId && hasMinimumMetadata(r.metadata));
  const sendDisabledReason = selected.length === 0 ? t('discover.batch.none') : selected.length > MAX_BATCH ? t('discover.batch.tooMany', { max: MAX_BATCH }) : undefined;

  const sendBatch = async (ids: string[]) => {
    setBatchError(undefined);
    try {
      // One key per set of results: sending the same set again after a 5xx or a network error reuses the key (QC G10);
      // “Thử lại các mục lỗi” is another set, so another batch and key. The key is dropped once the server accepts it.
      const operation = `importDiscoveredResults:${[...ids].sort().join(',')}`;
      const { data } = await idempotency.run(operation, (key) => api.post('/discovered-results/import', { body: { discoveredResultIds: ids }, idempotencyKey: key }));
      setBatch({ workflowId: data.id, ids, status: 'running', startedAt: data.startedAt ?? data.createdAt });
    } catch (e) {
      setBatchError({ code: (e as ApiError).code, ids });
    }
  };

  const selectAllEligible = async () => {
    for (const row of eligible.slice(0, MAX_BATCH - selected.length)) await setStatus(row, 'Selected');
  };

  const sourceLine = sources === 'error' ? t('discover.sourcesError')
    : primary ? t('discover.sourceLine', { source: sourceName(primary.source) }) : t('discover.sourcesLoading');
  // H8: a source that did not answer (unavailable, timeout, network) reads “Nguồn không phản hồi” (QC G16).
  const failedTitle = (code?: string) => (code === 'rate_limited' ? t('discover.error.rateLimited')
    : code && NO_RESPONSE.has(code) ? t('discover.error.noResponse') : t('discover.error.sourceFailed'));
  const problem: Problem | undefined = startError
    ? { code: startError.code, title: startError.status === 503 || startError.code === 'network_error' || startError.code === 'service_unavailable' ? t('discover.error.noResponse') : t('discover.error.startFailed') }
    : search?.status === 'failed'
      ? { code: search.lastError?.code ?? 'unknown', title: failedTitle(search.lastError?.code) }
      : undefined;

  return (
    <div className="library-page library-discover">
      <div className="library-head">
        <div>
          <h1 className="library-title">Discover</h1>
          <p className="library-muted">{sourceLine} {t('discover.boundary')}</p>
        </div>
        <a className="sires-button" href="#nhap-thu-cong">{t('discover.manual')}</a>
      </div>

      {/* H20: from 1280px the results are the main column and the right column (340–400px) holds the selection and
          manual import; narrower, the right column falls below (library.css). */}
      <div className="library-discover__layout">
      <div className="library-discover__main">
      <section className="library-card library-search" aria-labelledby="discover-search">
        <h2 id="discover-search" className="sires-visually-hidden">{t('discover.searchTitle')}</h2>
        <div className="library-segments" role="tablist" aria-label={t('discover.kind')}>
          {(['query', 'title', 'keywords', ...(canAuthor ? ['author'] as const : [])] as Tab[]).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} className="library-segment" onClick={() => { setTab(value); setErrors({}); }}>
              {t(`discover.tab.${value}`)}
            </button>
          ))}
        </div>
        <form className="library-search__form" onSubmit={submit} noValidate>
          {/* The error is outside the label (aria-describedby), so the field's name stays its label. */}
          <div className="sires-field library-search__query">
            <label className="sires-field__label" htmlFor="discover-text">{tab === 'author' ? t('discover.authorLabel') : t('discover.queryLabel')}</label>
            <input id="discover-text" className="sires-input" value={text} aria-invalid={Boolean(errors.text)} aria-describedby={errors.text ? 'discover-text-error' : undefined}
              onChange={(e) => setText(e.currentTarget.value)} />
            {errors.text && <span id="discover-text-error" className="library-field-error">{errors.text}</span>}
          </div>
          {tab !== 'author' && yearSupported && (
            <fieldset className="library-years">
              <legend className="sires-field__label">{t('discover.years')}</legend>
              <input className="sires-input" inputMode="numeric" aria-label={t('discover.yearFrom')} value={yearFrom} aria-invalid={Boolean(errors.year)}
                aria-describedby={errors.year ? 'discover-year-error' : undefined} onChange={(e) => setYearFrom(e.currentTarget.value)} />
              <span aria-hidden="true">–</span>
              <input className="sires-input" inputMode="numeric" aria-label={t('discover.yearTo')} value={yearTo} aria-invalid={Boolean(errors.year)}
                aria-describedby={errors.year ? 'discover-year-error' : undefined} onChange={(e) => setYearTo(e.currentTarget.value)} />
              {errors.year && <span id="discover-year-error" className="library-field-error">{errors.year}</span>}
            </fieldset>
          )}
          <button type="submit" className="sires-button" data-variant={selected.length ? undefined : 'outline'} disabled={search?.status === 'running'}>{t('discover.search')}</button>
          {canMine && (
            <button type="button" className="sires-button" onClick={() => void start('author', { author: profileUrl!, source: 'google_scholar' }, t('discover.mine'))}>{t('discover.mine')}</button>
          )}
        </form>
      </section>

      {notFound && <EmptyState title={t('discover.notFound.title')} reason={t('discover.notFound.reason')} />}

      {problem && (
        <div className="library-alert" role="alert">
          <strong>{problem.title}</strong>
          <span>{t('discover.error.suggest')} <span className="sires-id">{problem.code}</span></span>
          <span className="library-alert__actions">
            <a className="sires-button" data-size="sm" href="#nhap-thu-cong">{t('discover.manual')}</a>
            {lastBody && <button type="button" className="sires-button" data-size="sm" onClick={() => void start(lastBody.kind, lastBody.body, search?.label ?? text)}>{t('discover.retry')}</button>}
          </span>
        </div>
      )}

      {search && (search.status === 'running' || search.status === 'waiting') && (
        <LongOperation title={t('discover.running', { query: search.label })} actor="Discovery Agent" startedAt={search.startedAt}
          latest={{ at: search.startedAt, text: t('discover.runningSource', { source: sourceName(search.source || 'openalex') }) }}
          onCancel={() => void cancel()} cancelLabel={t('discover.cancel')} />
      )}
      {search?.status === 'cancelled' && <p className="library-banner" role="status">{t('discover.cancelled')}</p>}

      {prompt && search?.status === 'waiting' && (
        <PromptCard prompt={prompt} agentLabel="Discovery Agent" submitting={answering} onAnswer={async (response) => {
          setAnswering(true);
          try {
            await idempotency.run(`answerPrompt:${prompt.id}`, (key) => api.post('/prompts/{promptId}/response', { path: { promptId: prompt.id }, body: response, idempotencyKey: key }));
            setPrompt(undefined);
            setSearch({ ...search, status: 'running' });
          } finally {
            setAnswering(false);
          }
        }} />
      )}

      {search?.status === 'succeeded' && !results && <LoadingState what={t('discover.resultsWhat')} rows={5} />}
      {search?.status === 'succeeded' && results && (results.length === 0 ? (
        <EmptyState title={search.kind === 'author' ? t('discover.authorEmpty.title') : t('discover.empty.title')}
          reason={search.kind === 'author' ? t('discover.authorEmpty.reason') : t('discover.empty.reason')}
          action={(
            <span className="library-inline-actions">
              {search.kind === 'search' && search.source !== 'google_scholar' && scholar && lastBody && (
                <button type="button" className="sires-button" onClick={() => void start('search', { ...(lastBody.body as Schemas['DiscoverySearchRequest']), source: 'google_scholar' }, search.label)}>{t('discover.tryScholar')}</button>
              )}
              <a className="sires-button" href="#nhap-thu-cong">{t('discover.manual')}</a>
            </span>
          )} />
      ) : (
        <section className="library-results" aria-labelledby="discover-results">
          <div className="library-results__head">
            <h2 id="discover-results" className="library-results__title">
              {t('discover.results', { count: results.length })}{cursor ? '+' : ''} · Discovery Agent · {sourceName(search.source || results[0]?.source || '')}
            </h2>
            {search.kind === 'author' && <p className="library-muted">{t('discover.incomplete')}</p>}
            {search.kind === 'author' && (
              <div className="library-results__filter" role="group" aria-label={t('discover.loadedFilter')}>
                <input className="sires-input" inputMode="numeric" maxLength={4} aria-label={t('discover.loadedYearFrom')} placeholder={t('discover.yearFrom')} value={loadedFilter.yearFrom}
                  onChange={(e) => setLoadedFilter({ ...loadedFilter, yearFrom: e.currentTarget.value.replace(/\D/g, '') })} />
                <span aria-hidden="true">–</span>
                <input className="sires-input" inputMode="numeric" maxLength={4} aria-label={t('discover.loadedYearTo')} placeholder={t('discover.yearTo')} value={loadedFilter.yearTo}
                  onChange={(e) => setLoadedFilter({ ...loadedFilter, yearTo: e.currentTarget.value.replace(/\D/g, '') })} />
                <input className="sires-input" type="search" aria-label={t('discover.loadedText')} placeholder={t('discover.loadedText')} value={loadedFilter.text}
                  onChange={(e) => setLoadedFilter({ ...loadedFilter, text: e.currentTarget.value })} />
                <span className="library-muted sires-num" role="status">{t('discover.loadedShown', { shown: shown.length, total: results.length })}</span>
              </div>
            )}
            <div className="library-results__tools">
              {search.kind === 'author' ? (
                <button type="button" className="sires-button" data-size="sm" disabled={eligible.length === 0} onClick={() => void selectAllEligible()}>{t('discover.selectEligible')}</button>
              ) : (
                <button type="button" className="sires-button" data-size="sm" disabled={eligible.length === 0} onClick={() => void selectAllEligible()}>{t('discover.selectPage')}</button>
              )}
            </div>
          </div>
          <ul className="library-results__list">
            {shown.map((row) => <ResultRow key={row.id} result={row} error={rowErrors[row.id]} onStatus={(status) => void setStatus(row, status)} />)}
          </ul>
          {cursor && <button type="button" className="sires-button" data-size="sm" onClick={() => void loadResults(search.workflowId, cursor)}>{t('common.loadMore')}</button>}
        </section>
      ))}

      {batch?.status === 'running' && (
        <LongOperation title={t('discover.batch.running', { count: batch.ids.length })} actor="Reference Processing Agent" startedAt={batch.startedAt} />
      )}
      {batch?.status === 'interrupted' && (
        <div className="library-alert" role="alert">
          <strong>{t('discover.batch.interrupted')}</strong>
          <span>{t('discover.batch.interruptedHint')}</span>
          <Link to="/pending-actions">Recovery decision</Link>
        </div>
      )}
      {batch?.status === 'done' && results && (
        <BatchSummary batch={batch} results={results} onRetry={(ids) => void sendBatch(ids)} />
      )}
      </div>

      <aside className="library-discover__side" aria-label={t('discover.side')}>
        {search?.status === 'succeeded' && results && results.length > 0 && (
          <section className="library-card library-selection" aria-labelledby="discover-selection">
            <h2 id="discover-selection" className="library-card__title sires-num">{t('discover.selected', { count: selected.length })}</h2>
            <button type="button" className="sires-button" data-variant="primary" disabled={Boolean(sendDisabledReason) || batch?.status === 'running'}
              aria-describedby={sendDisabledReason ? 'discover-send-reason' : undefined} onClick={() => void sendBatch(selected.map((r) => r.id))}>
              {t('discover.send', { count: selected.length })}
            </button>
            {sendDisabledReason && <span id="discover-send-reason" className="library-muted">{sendDisabledReason}</span>}
            {batchError && (
              // A failed send is shown here, not as a search error (QC G11); “Gửi lại” keeps the batch's key (G10).
              <div className="library-alert" role="alert">
                <strong>{t('discover.batch.sendFailed')}</strong>
                <span className="sires-id">{batchError.code}</span>
                <span className="library-alert__actions">
                  <button type="button" className="sires-button" data-size="sm" onClick={() => void sendBatch(batchError.ids)}>{t('discover.batch.resend')}</button>
                </span>
              </div>
            )}
          </section>
        )}
        <ManualImport />
      </aside>
      </div>
    </div>
  );
}

function ResultRow({ result: row, error, onStatus }: { result: DiscoveredResult; error?: string; onStatus: (status: 'New' | 'Selected' | 'Rejected') => void }) {
  const { t } = useTranslation(NS);
  const link = safeUrl(row.sourceUrl);
  const duplicate = Boolean(row.duplicateOfReferenceId);
  const rejected = row.status === 'Rejected';
  const imported = row.status === 'Imported';
  return (
    <li className="library-result" data-status={row.status}>
      {duplicate || imported ? (
        <input type="checkbox" disabled readOnly checked={imported} aria-label={t('discover.choose', { title: row.metadata.title })} aria-describedby={`dup-${row.id}`} />
      ) : (
        <input type="checkbox" checked={row.status === 'Selected'} disabled={rejected} aria-label={t('discover.choose', { title: row.metadata.title })}
          onChange={(e) => onStatus(e.currentTarget.checked ? 'Selected' : 'New')} />
      )}
      <div className="library-result__body">
        <strong className="library-result__title">{row.metadata.title || t('meta.noTitle')}</strong>
        <MetaLine metadata={row.metadata} />
        {row.metadata.abstractOrSnippet && <p className="library-result__snippet">{row.metadata.abstractOrSnippet}</p>}
        <span className="library-result__source">
          {sourceName(row.source)}
          {row.metadata.citationCount !== undefined && <> · <span className="sires-num">{t('discover.citations', { count: row.metadata.citationCount, formatted: formatNumber(row.metadata.citationCount) })}</span></>}
          {link && <> · <a href={link} target="_blank" rel="noopener noreferrer">{t('discover.sourceRecord')}</a></>}
        </span>
        {error && <span className="library-item-error" role="alert">{error}</span>}
      </div>
      <div className="library-result__side" id={`dup-${row.id}`}>
        {duplicate ? <DuplicateLabel referenceId={row.duplicateOfReferenceId!} /> : imported ? (
          <span className="library-tag" data-tone="proposed">{t('discover.imported')}</span>
        ) : <UnreviewedLabel />}
        {!duplicate && !imported && (rejected ? (
          <><span className="library-muted">{t('discover.rejected')}</span><button type="button" className="library-textbutton" onClick={() => onStatus('New')}>{t('discover.reselect')}</button></>
        ) : (
          <button type="button" className="library-textbutton" onClick={() => onStatus('Rejected')}>{t('discover.reject')}</button>
        ))}
      </div>
    </li>
  );
}

/** “Đã có trong Trusted Library” / “Đã từ chối trước đây” / … from the duplicate's approval status (H9, EC09–EC11). */
function DuplicateLabel({ referenceId }: { referenceId: string }) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const [ref, setRef] = useState<Reference | null>();
  useEffect(() => {
    let live = true;
    api.get('/references/{referenceId}', { path: { referenceId } }).then(({ data }) => { if (live) setRef(data); }).catch(() => { if (live) setRef(null); });
    return () => { live = false; };
  }, [api, referenceId]);
  const key = ref === undefined ? undefined : ref === null ? 'unknown'
    : ref.approvalStatus === 'Trusted' ? 'trusted' : ref.approvalStatus === 'Rejected' ? 'rejected' : ref.approvalStatus === 'Revoked' ? 'revoked' : 'pending';
  if (!key) return <span className="library-muted">{t('discover.duplicate.checking')}</span>;
  const text = t(`discover.duplicate.${key}`);
  return (
    <span className="library-tag" data-tone={key === 'trusted' ? 'confirmed' : 'neutral'}>
      {ref ? <Link to={`/library/${referenceId}`}>{text}</Link> : text}
    </span>
  );
}

function BatchSummary({ batch, results, onRetry }: { batch: Batch; results: DiscoveredResult[]; onRetry: (ids: string[]) => void }) {
  const { t } = useTranslation(NS);
  const rows = batch.ids.map((id) => results.find((r) => r.id === id)).filter((r): r is DiscoveredResult => Boolean(r));
  const failed = rows.filter((r) => !r.importedReferenceId && !r.duplicateOfReferenceId);
  const created = rows.filter((r) => r.importedReferenceId);
  const summary = useMemo(() => t('discover.batch.summary', { created: created.length, failed: failed.length, duplicate: rows.length - created.length - failed.length }), [t, created.length, failed.length, rows.length]);
  return (
    <section className="library-card" aria-labelledby="batch-summary">
      <h2 id="batch-summary" className="library-card__title">{t('discover.batch.title')}</h2>
      <p className="library-muted" role="status">{summary}</p>
      <ul className="library-summary">
        {rows.map((row) => (
          <li key={row.id}>
            <span className="library-summary__title">{row.metadata.title}</span>
            {row.importedReferenceId ? (
              <Link to={`/library/${row.importedReferenceId}`}>{t('discover.batch.created')}</Link>
            ) : row.duplicateOfReferenceId ? (
              <span>{t('discover.batch.duplicate')} · <Link to={`/library/${row.duplicateOfReferenceId}`}>{t('discover.batch.existing')}</Link> · {t('discover.batch.suggestMerge')}</span>
            ) : (
              <span className="library-item-error">{t('discover.batch.error')}: {batch.lastError?.message ?? t('discover.batch.errorUnknown')}</span>
            )}
          </li>
        ))}
      </ul>
      {failed.length > 0 && (
        <button type="button" className="sires-button" data-size="sm" onClick={() => onRetry(failed.map((r) => r.id))}>{t('discover.batch.retry')}</button>
      )}
    </section>
  );
}
