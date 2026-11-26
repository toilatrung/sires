// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Reference page (G5, PID-00098 S08) and its actions by status (S09).

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import {
  ErrorState, formatDateTime, formatNumber, LoadingState, NotFound, StatusChip, useApi, useDraft, useEvents, useSession, useShell,
  useStreamSignal, type ApiError,
} from '../../shell';
import { Dialog, MAX_PDF_BYTES, MetaLine, NS, sourceName, type Reference as ReferenceRow, type ReferenceMetadata } from './common';
import { MetadataForm, RejectDialog, type MetadataFormValues } from './Library';

type Usage = { projectId?: string; name?: string; evidenceCount?: number; citationCount?: number }[];
type DialogKind = 'reject' | 'revoke' | 'delete' | 'project' | 'merge';
type Notice = { tone: 'info' | 'error'; text: string };

/** One sentence per (approval, indexing) pair (UX-REF-002). */
function explanation(ref: ReferenceRow, t: (key: string) => string): string {
  if (ref.approvalStatus === 'Pending Approval') return t('ref.explain.pending');
  if (ref.approvalStatus === 'Rejected') return t('ref.explain.rejected');
  if (ref.approvalStatus === 'Revoked') return t('ref.explain.revoked');
  if (ref.indexingStatus === 'Indexed') return t('ref.explain.indexed');
  if (ref.indexingStatus === 'Unavailable') return t('ref.explain.unavailable');
  if (ref.indexingStatus === 'Failed') return t('ref.explain.failed');
  return t('ref.explain.indexing');
}

export function ReferenceScreen() {
  const { referenceId = '' } = useParams();
  const { t } = useTranslation(NS);
  const api = useApi();
  const [ref, setRef] = useState<ReferenceRow | null>();
  const [etag, setEtag] = useState<string>();
  const [usage, setUsage] = useState<Usage>();
  const [error, setError] = useState<ApiError>();
  const [reload, setReload] = useState(0);
  // Notice of the last action (revoke summary, errors); cleared when another reference opens.
  const [notice, setNotice] = useState<Notice>();
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => setNotice(undefined), [referenceId]);

  useEffect(() => {
    let live = true;
    setError(undefined);
    api.get('/references/{referenceId}', { path: { referenceId } })
      .then(({ data, etag: tag }) => { if (live) { setRef(data); setEtag(tag); } })
      .catch((e: ApiError) => { if (!live) return; if (e.status === 404) setRef(null); else setError(e); });
    api.get('/references/{referenceId}/usage', { path: { referenceId } })
      .then(({ data }) => { if (live) setUsage(data.projects ?? []); })
      .catch(() => { if (live) setUsage([]); });
    return () => { live = false; };
  }, [api, referenceId, reload]);

  useEvents({ types: ['reference.status_changed', 'reference.indexing_status_changed', 'project_reference.changed'] }, (event) => {
    if (event.objectId === referenceId) refresh();
  });
  useStreamSignal((signal) => { if (signal === 'reload') refresh(); });

  if (ref === null) return <NotFound />;
  if (error && !ref) return <div className="library-page"><ErrorState error={error} ns={NS} title={t('ref.loadError')} onRetry={refresh} /></div>;
  if (!ref) return <div className="library-page"><LoadingState what="Reference" rows={4} /></div>;

  // Keyed by id only: a reload (event, 412 re-read) must keep the open form and its draft.
  return <ReferenceView key={ref.id} reference={ref} etag={etag} usage={usage ?? []} notice={notice} onNotice={setNotice} onChanged={refresh} onReplaced={(next, tag) => { setRef(next); setEtag(tag); }} />;
}

interface ViewProps {
  reference: ReferenceRow;
  etag?: string;
  usage: Usage;
  notice?: Notice;
  onNotice: (notice: Notice | undefined) => void;
  onChanged: () => void;
  onReplaced: (next: ReferenceRow, etag?: string) => void;
}

function ReferenceView({ reference: ref, etag, usage, notice, onNotice: setNotice, onChanged, onReplaced }: ViewProps) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const { idempotency } = useShell();
  const session = useSession();
  const [dialog, setDialog] = useState<DialogKind>();
  const [editing, setEditing] = useState(false);
  // What the user types in the metadata form lives in the shell's draft store (EC27): it survives a session expiry and
  // a 412 re-read, and the form reopens with it; cleared once saved, approved or cancelled.
  const metaDraft = useDraft('library.reference.metadata');
  const savedForm = useMemo(() => {
    try { return metaDraft.value ? JSON.parse(metaDraft.value) as MetadataFormValues : undefined; } catch { return undefined; }
  }, [metaDraft.value]);
  const editorOpen = editing || Boolean(savedForm);
  const closeEditor = () => { setEditing(false); metaDraft.clear(); };
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const merged = Boolean(ref.mergedIntoId);
  const status = ref.approvalStatus;
  const evidence = usage.reduce((sum, row) => sum + (row.evidenceCount ?? 0), 0);
  const myAccount = session.status === 'signed-in' ? session.account : undefined;
  const actorName = (accountId?: string) => accountId && myAccount && accountId === myAccount.id ? myAccount.profile.displayName ?? t('ref.you') : t('ref.researcher');

  const act = async (run: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setNotice(undefined);
    try {
      await run();
      if (done) setNotice({ tone: 'info', text: done });
      onChanged();
    } catch (e) {
      const apiError = e as ApiError;
      setNotice({ tone: 'error', text: `${t(`error.${apiError.code}`, { defaultValue: t('ref.actionFailed') })} (${apiError.code})` });
      if (apiError.status === 409) onChanged();
    } finally {
      setBusy(false);
    }
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    if (file.type && file.type !== 'application/pdf') { setNotice({ tone: 'error', text: t('pdf.notPdf') }); return; }
    if (file.size > MAX_PDF_BYTES) { setNotice({ tone: 'error', text: t('pdf.tooLarge') }); return; }
    const form = new FormData();
    form.append('file', file);
    void act(() => api.put('/references/{referenceId}/document', { path: { referenceId: ref.id }, body: form as never, contentType: 'multipart/form-data' }));
  };

  const saveMetadata = async (metadata: ReferenceMetadata) => {
    setBusy(true);
    setNotice(undefined);
    try {
      // Full metadata, never bibtexKey (LIB-METADATA-001-AC02); If-Match = ETag (DATA-CONC-001).
      const { data, etag: tag } = await api.patch('/references/{referenceId}', {
        path: { referenceId: ref.id }, body: { metadata }, contentType: 'application/merge-patch+json', ifMatch: etag ?? `"${ref.rowVersion}"`,
      });
      closeEditor();
      onReplaced(data, tag);
    } catch (e) {
      const apiError = e as ApiError;
      setNotice({ tone: 'error', text: apiError.status === 412 ? t('ref.edit.conflict') : `${t('ref.actionFailed')} (${apiError.code})` });
      if (apiError.status === 412 || apiError.status === 409) {
        try {
          const { data, etag: tag } = await api.get('/references/{referenceId}', { path: { referenceId: ref.id } });
          onReplaced({ ...data }, tag);
        } catch { /* keep the old row */ }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="library-page library-ref">
      <nav className="library-crumbs" aria-label={t('ref.breadcrumb')}>
        <Link to="/library">Trusted Library</Link> <span aria-hidden="true">/</span> <span className="sires-id">{ref.bibtexKey}</span>
      </nav>
      <header className="library-ref__head">
        <h1 className="library-title">{ref.metadata.title}</h1>
        <MetaLine metadata={ref.metadata} />
        <div className="library-ref__chips">
          <StatusChip status={status} entity="reference">{t('ref.approvalChip', { status })}</StatusChip>
          <StatusChip status={ref.indexingStatus} entity="reference-index">{t('ref.indexChip', { status: ref.indexingStatus })}</StatusChip>
        </div>
        <p className="library-ref__explain">{explanation(ref, t)}</p>
      </header>

      {merged && (
        <div className="library-banner" role="status">
          {t('ref.merged')} <Link to={`/library/${ref.mergedIntoId}`}>{t('ref.mergedTarget')}</Link>
        </div>
      )}
      {notice && <div className={notice.tone === 'error' ? 'library-banner library-banner--error' : 'library-banner'} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.text}</div>}

      {ref.indexingStatus === 'Failed' && (
        <div className="library-alert" role="alert">
          <strong>{t('index.failedTitle')}</strong>
          <span>{ref.indexingError?.message ?? t('index.failed')} <span className="sires-id">{ref.indexingError?.code}</span></span>
          {!merged && status === 'Trusted' && (
            <span className="library-alert__actions">
              <button type="button" className="sires-button" data-size="sm" disabled={busy}
                onClick={() => void act(() => api.post('/references/{referenceId}/indexing/retry', { path: { referenceId: ref.id } }))}>{t('index.retry')}</button>
              <button type="button" className="sires-button" data-size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>{t('index.otherPdf')}</button>
            </span>
          )}
        </div>
      )}
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden data-testid="reference-pdf-input" onChange={(e) => upload(e.currentTarget.files?.[0])} />

      {!merged && (
        <div className="library-ref__actions">
          {status === 'Pending Approval' && (
            <>
              <button type="button" className="sires-button" data-variant="primary" disabled={busy}
                onClick={() => void act(() => idempotency.run(`decide:${ref.id}`, (key) => api.post('/references/approvals', { body: { decisions: [{ referenceId: ref.id, decision: 'approve', metadataVersion: ref.metadataVersion }] }, idempotencyKey: key })), t('ref.approved'))}>
                {t('ref.approve')}
              </button>
              <button type="button" className="sires-button" disabled={busy} onClick={() => setEditing(true)}>{t('ref.editApprove')}</button>
              <button type="button" className="sires-button" disabled={busy} onClick={() => setDialog('reject')}>{t('pending.reject')}</button>
            </>
          )}
          {status === 'Trusted' && (
            <>
              <button type="button" className="sires-button" disabled={busy} onClick={() => setEditing(true)}>{t('ref.edit.open')}</button>
              <button type="button" className="sires-button" disabled={busy} onClick={() => setDialog('project')}>{t('ref.addToProject')}</button>
              <button type="button" className="sires-button" disabled={busy} onClick={() => setDialog('merge')}>{t('pending.merge')}</button>
              <button type="button" className="sires-button" data-variant="danger" disabled={busy} onClick={() => setDialog('revoke')}>{t('ref.revoke')}</button>
            </>
          )}
          {(status === 'Revoked' || status === 'Rejected') && (
            <button type="button" className="sires-button" disabled={busy}
              onClick={() => void act(() => idempotency.run(`reinstate:${ref.id}`, (key) => api.post('/references/{referenceId}/reinstate', { path: { referenceId: ref.id }, body: {}, idempotencyKey: key })), t('ref.reinstated'))}>
              {t('ref.reinstate')}
            </button>
          )}
          {usage.length === 0 && status !== 'Pending Approval' && (
            <button type="button" className="sires-button" data-variant="danger" disabled={busy} onClick={() => setDialog('delete')}>{t('ref.delete')}</button>
          )}
        </div>
      )}

      {editorOpen && !merged && (status === 'Pending Approval' || status === 'Trusted') && (
        <section className="library-card">
          <h2 className="library-card__title">{status === 'Pending Approval' ? t('ref.editApprove') : t('ref.edit.title')}</h2>
          <MetadataForm metadata={ref.metadata} busy={busy} submitLabel={status === 'Pending Approval' ? t('pending.saveApprove') : t('ref.edit.save')}
            initial={savedForm} onChange={(values) => metaDraft.setValue(JSON.stringify(values))}
            onCancel={closeEditor}
            onSubmit={(metadata) => {
              if (status === 'Pending Approval') {
                void act(async () => {
                  await idempotency.run(`decide:${ref.id}`, (key) => api.post('/references/approvals', { body: { decisions: [{ referenceId: ref.id, decision: 'approve', metadataVersion: ref.metadataVersion, editedMetadata: metadata }] }, idempotencyKey: key }));
                  closeEditor();
                }, t('ref.approved'));
              } else {
                void saveMetadata(metadata);
              }
            }} />
        </section>
      )}

      <div className="library-ref__grid">
        <section className="library-card" aria-labelledby="ref-meta">
          <h2 id="ref-meta" className="library-card__title">{t('ref.metadata', { version: ref.metadataVersion })}</h2>
          <dl className="library-dl">
            <dt>{t('form.title')}</dt><dd>{ref.metadata.title}</dd>
            <dt>{t('ref.authors')}</dt><dd>{ref.metadata.authors.map((a) => a.name).join(', ') || '—'}</dd>
            <dt>{t('form.year')}</dt><dd className="sires-num">{ref.metadata.year ?? '—'}</dd>
            <dt>{t('form.venue')}</dt><dd>{ref.metadata.venue ?? '—'}</dd>
            {ref.metadata.identifiers.doi && <><dt>DOI</dt><dd className="sires-id">{ref.metadata.identifiers.doi}</dd></>}
            {ref.metadata.identifiers.arxivId && <><dt>arXiv</dt><dd className="sires-id">{ref.metadata.identifiers.arxivId}</dd></>}
            <dt>BibTeX key</dt><dd className="sires-id">{ref.bibtexKey}</dd>
            {ref.metadata.abstractOrSnippet && <><dt>{t('ref.abstract')}</dt><dd>{ref.metadata.abstractOrSnippet}</dd></>}
          </dl>
        </section>

        <section className="library-card" aria-labelledby="ref-doc">
          <h2 id="ref-doc" className="library-card__title">Source Document</h2>
          {ref.document ? (
            <dl className="library-dl">
              <dt>{t('ref.doc.file')}</dt><dd className="sires-id">{ref.document.fileName ?? '—'}</dd>
              <dt>{t('ref.doc.size')}</dt><dd className="sires-num">{ref.document.sizeBytes ? `${formatNumber(Math.round(ref.document.sizeBytes / 1024))} KB` : '—'}</dd>
              <dt>{t('ref.doc.pages')}</dt><dd className="sires-num">{ref.document.pageCount ?? '—'}</dd>
              {ref.indexingStatus === 'Indexed' && <><dt>{t('ref.doc.chunks')}</dt><dd className="sires-num">{ref.document.chunkCount ?? '—'}</dd></>}
              {ref.document.indexedAt && <><dt>{t('ref.doc.indexedAt')}</dt><dd className="sires-num">{formatDateTime(ref.document.indexedAt)}</dd></>}
            </dl>
          ) : (
            <p className="library-muted">{t('ref.doc.none')}</p>
          )}
          <div className="library-card__actions">
            {ref.document && <a className="sires-button" data-size="sm" href={`/api/v1/references/${ref.id}/document`}>{t('ref.doc.download')}</a>}
            {status === 'Trusted' && !merged && (
              <button type="button" className="sires-button" data-size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
                {ref.document ? t('ref.doc.replace') : t('ref.doc.upload')}
              </button>
            )}
          </div>
        </section>

        <section className="library-card" aria-labelledby="ref-usage">
          <h2 id="ref-usage" className="library-card__title">{t('ref.usage.title')}</h2>
          {usage.length === 0 ? <p className="library-muted">{t('ref.usage.none')}</p> : (
            <ul className="library-usage">
              {usage.map((row) => (
                <li key={row.projectId}>
                  <Link to={`/projects/${row.projectId}/overview`}>{row.name}</Link>
                  <span className="library-muted sires-num">{t('ref.usage.counts', { evidence: row.evidenceCount ?? 0, citation: row.citationCount ?? 0 })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="library-card" aria-labelledby="ref-prov">
          <h2 id="ref-prov" className="library-card__title">Provenance</h2>
          <dl className="library-dl">
            <dt>{t('ref.prov.origin')}</dt>
            <dd>{ref.origin === 'discovered' ? t('ref.prov.discovered', { source: sourceName(ref.metadata.source) }) : t('ref.prov.manual', { source: ref.metadata.source })}</dd>
            <dt>{t('ref.prov.retrieved')}</dt><dd className="sires-num">{formatDateTime(ref.metadata.retrievedAt)}</dd>
            {ref.approval && (
              <>
                <dt>{t('ref.prov.approvedBy')}</dt><dd>{actorName(ref.approval.approvedBy.accountId)}</dd>
                <dt>{t('ref.prov.approvedAt')}</dt><dd className="sires-num">{formatDateTime(ref.approval.decidedAt)}</dd>
                <dt>{t('ref.prov.version')}</dt><dd className="sires-num">{t('ref.prov.versionValue', { version: ref.approval.objectVersion })}</dd>
              </>
            )}
            {ref.revocation && (
              <>
                <dt>{t('ref.prov.revokedAt')}</dt><dd className="sires-num">{formatDateTime(ref.revocation.decidedAt)}</dd>
                <dt>{t('ref.prov.revokeReason')}</dt><dd>{ref.revocation.reason ?? '—'}</dd>
              </>
            )}
          </dl>
        </section>
      </div>

      {dialog === 'reject' && (
        <RejectDialog count={1} onClose={() => setDialog(undefined)} onConfirm={(reason) => {
          setDialog(undefined);
          void act(() => idempotency.run(`decide:${ref.id}`, (key) => api.post('/references/approvals', { body: { decisions: [{ referenceId: ref.id, decision: 'reject', reason }] }, idempotencyKey: key })));
        }} />
      )}
      {dialog === 'revoke' && (
        <RevokeDialog usage={usage} evidence={evidence} onClose={() => setDialog(undefined)} onConfirm={(reason) => {
          setDialog(undefined);
          void act(() => idempotency.run(`revoke:${ref.id}`, (key) => api.post('/references/{referenceId}/revoke', { path: { referenceId: ref.id }, body: { reason }, idempotencyKey: key })),
            t('revoke.done', { projects: usage.length, evidence }));
        }} />
      )}
      {dialog === 'delete' && (
        <Dialog title={t('delete.title')} onClose={() => setDialog(undefined)} actions={(
          <>
            <button type="button" className="sires-button" onClick={() => setDialog(undefined)}>{t('delete.keep')}</button>
            <button type="button" className="sires-button" data-variant="danger" onClick={() => {
              setDialog(undefined);
              setBusy(true);
              api.delete('/references/{referenceId}', { path: { referenceId: ref.id } })
                .then(() => setNotice({ tone: 'info', text: t('delete.done') }))
                .catch((e: ApiError) => setNotice({ tone: 'error', text: e.status === 409 ? t('delete.inUse') : `${t('ref.actionFailed')} (${e.code})` }))
                .finally(() => { setBusy(false); onChanged(); });
            }}>{t('delete.confirm')}</button>
          </>
        )}>
          <p>{t('delete.consequence')}</p>
        </Dialog>
      )}
      {dialog === 'project' && <AddToProjectDialog referenceId={ref.id} usage={usage} onClose={() => setDialog(undefined)} onDone={() => { setDialog(undefined); setNotice({ tone: 'info', text: t('project.done') }); onChanged(); }} />}
      {dialog === 'merge' && <MergeDialog reference={ref} onClose={() => setDialog(undefined)} onConfirm={(into) => {
        setDialog(undefined);
        void act(() => idempotency.run(`merge:${ref.id}`, (key) => api.post('/references/{referenceId}/merge', { path: { referenceId: ref.id }, body: { intoReferenceId: into }, idempotencyKey: key })));
      }} />}
    </div>
  );
}

function RevokeDialog({ usage, evidence, onClose, onConfirm }: { usage: Usage; evidence: number; onClose: () => void; onConfirm: (reason: string) => void }) {
  const { t } = useTranslation(NS);
  const id = useId();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const missing = !reason.trim();
  return (
    <Dialog title={t('revoke.title')} onClose={onClose} actions={(
      <>
        <button type="button" className="sires-button" onClick={onClose}>{t('revoke.keep')}</button>
        <button type="button" className="sires-button" data-variant="danger" onClick={() => { setTried(true); if (!missing) onConfirm(reason.trim()); }}>{t('revoke.confirm')}</button>
      </>
    )}>
      <p>{t('revoke.consequence', { projects: usage.length, evidence })}</p>
      {usage.length > 0 && (
        <ul className="library-usage">
          {usage.map((row) => <li key={row.projectId}>{row.name} · <span className="sires-num">{t('ref.usage.counts', { evidence: row.evidenceCount ?? 0, citation: row.citationCount ?? 0 })}</span></li>)}
        </ul>
      )}
      <div className="sires-field">
        <label className="sires-field__label" htmlFor={`${id}-reason`}>{t('revoke.reason')}</label>
        <textarea id={`${id}-reason`} className="sires-input library-textarea" value={reason} aria-invalid={tried && missing}
          aria-describedby={tried && missing ? `${id}-reason-error` : undefined} onChange={(e) => setReason(e.currentTarget.value)} />
        {tried && missing && <span id={`${id}-reason-error`} className="library-field-error">{t('revoke.reasonRequired')}</span>}
      </div>
    </Dialog>
  );
}

function AddToProjectDialog({ referenceId, usage, onClose, onDone }: { referenceId: string; usage: Usage; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>();
  const [chosen, setChosen] = useState<string>();
  const [error, setError] = useState<ApiError>();
  const used = new Set(usage.map((row) => row.projectId));
  useEffect(() => {
    api.get('/projects', { query: { status: 'Active', limit: 200 } })
      .then(({ data }) => { const items: { id: string; name: string }[] = data.items ?? []; setProjects(items.map((p) => ({ id: p.id, name: p.name }))); })
      .catch((e: ApiError) => setError(e));
  }, [api]);
  const confirm = async () => {
    if (!chosen) return;
    try {
      await api.post('/projects/{projectId}/references', { path: { projectId: chosen }, body: { referenceIds: [referenceId] } });
      onDone();
    } catch (e) {
      setError(e as ApiError);
    }
  };
  return (
    <Dialog title={t('project.title')} onClose={onClose} actions={(
      <>
        <button type="button" className="sires-button" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="sires-button" data-variant="outline" disabled={!chosen} onClick={() => void confirm()}>{t('project.confirm')}</button>
      </>
    )}>
      <p>{t('project.consequence')}</p>
      {error && <p className="library-field-error" role="alert">{t(`error.${error.code}`, { defaultValue: t('ref.actionFailed') })} ({error.code})</p>}
      {!projects ? <LoadingState rows={0} what={t('project.loading')} /> : projects.length === 0 ? (
        <p className="library-muted">{t('project.none')} <Link to="/projects">Research Projects</Link></p>
      ) : (
        <fieldset className="library-choices">
          <legend className="sires-visually-hidden">{t('project.title')}</legend>
          {projects.map((p) => (
            <label key={p.id} className="library-choice">
              <input type="radio" name="project" value={p.id} disabled={used.has(p.id)} checked={chosen === p.id} onChange={() => setChosen(p.id)} />
              <span>{p.name}{used.has(p.id) && <span className="library-muted"> · {t('project.already')}</span>}</span>
            </label>
          ))}
        </fieldset>
      )}
    </Dialog>
  );
}

function MergeDialog({ reference: ref, onClose, onConfirm }: { reference: ReferenceRow; onClose: () => void; onConfirm: (into: string) => void }) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const [candidates, setCandidates] = useState<ReferenceRow[]>();
  const [chosen, setChosen] = useState<string>();
  useEffect(() => {
    api.get('/references', { query: { approvalStatus: ['Trusted'], limit: 200 } })
      .then(({ data }) => { const items: ReferenceRow[] = data.items ?? []; setCandidates(items.filter((row) => row.id !== ref.id)); })
      .catch(() => setCandidates([]));
  }, [api, ref.id]);
  return (
    <Dialog title={t('merge.title')} onClose={onClose} actions={(
      <>
        <button type="button" className="sires-button" onClick={onClose}>{t('merge.keep')}</button>
        <button type="button" className="sires-button" data-variant="outline" disabled={!chosen} onClick={() => chosen && onConfirm(chosen)}>{t('merge.confirm')}</button>
      </>
    )}>
      <p>{t('merge.consequence')}</p>
      {!candidates ? <LoadingState rows={0} what="Trusted Library" /> : (
        <fieldset className="library-choices">
          <legend className="sires-visually-hidden">{t('merge.title')}</legend>
          {candidates.map((row) => (
            <label key={row.id} className="library-choice">
              <input type="radio" name="merge" value={row.id} checked={chosen === row.id} onChange={() => setChosen(row.id)} />
              <span>{row.metadata.title} <span className="sires-id">{row.bibtexKey}</span></span>
            </label>
          ))}
        </fieldset>
      )}
    </Dialog>
  );
}
