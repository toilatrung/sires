// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Evidence Inspector of one evidence (S03, H5): getEvidence (EvidenceInContext), the claims using it, exclude with
// its consequence, restore, Stale warning, “Mở PDF tại trang”. Excluded and Stale never come back to Active here
// except Excluded → Active (PRD 18.2).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ErrorState, LoadingState, StatusChip, useApi, type ApiError } from '../../shell';
import { useLoad, useReferenceEvents, useReloadSignal, useResearchObjectEvents, useSingleFlight, toApiError } from './data';
import { Dialog } from './Dialog';
import { EvidenceCard } from './EvidenceCard';
import { locationParts, paths, problemDetail, referenceShort } from './labels';
import { PanelNotFound } from './Panel';

export function EvidenceInspector({ projectId, evidenceId, onChanged }: { projectId: string; evidenceId: string; onChanged: () => void }) {
  const { t } = useTranslation('research');
  const api = useApi();
  const evidence = useLoad(
    () => api.get('/projects/{projectId}/evidence/{evidenceId}', { path: { projectId, evidenceId } }).then((result) => result.data),
    [api, projectId, evidenceId],
  );
  const linked = evidence.data?.linkedClaimIds ?? [];
  const claims = useLoad(
    () => Promise.all(linked.map((claimId) => api.get('/projects/{projectId}/claims/{claimId}', { path: { projectId, claimId } }).then((result) => result.data))),
    [api, projectId, linked.join(',')],
  );
  const [dialog, setDialog] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | undefined>();
  const once = useSingleFlight();

  useResearchObjectEvents(projectId, ['evidence'], (event) => {
    if (event.objectId === evidenceId) evidence.reload();
  });
  useResearchObjectEvents(projectId, ['claim'], (event) => {
    if (event.objectId && linked.includes(event.objectId)) claims.reload();
  });
  useReferenceEvents(projectId, evidence.reload);
  useReloadSignal(() => {
    evidence.reload();
    claims.reload();
  });

  const change = (action: 'exclude' | 'restore') => once(async () => {
    setBusy(true);
    setFailure(undefined);
    try {
      if (action === 'exclude') {
        await api.post('/projects/{projectId}/evidence/{evidenceId}/exclude', { path: { projectId, evidenceId }, body: reason.trim() ? { reason: reason.trim() } : {} });
      } else {
        await api.post('/projects/{projectId}/evidence/{evidenceId}/restore', { path: { projectId, evidenceId } });
      }
      setDialog(false);
      setReason('');
    } catch (error) {
      // 409: changed elsewhere — reload and report, never resend (EC12).
      setFailure(toApiError(error));
      setDialog(false);
    } finally {
      setBusy(false);
      evidence.reload();
      claims.reload();
      onChanged();
    }
  });

  if (evidence.error?.status === 404) return <PanelNotFound kind="evidence" />;
  if (evidence.error && !evidence.data) {
    return <div className="research-panel__section"><ErrorState error={evidence.error} ns="research" onRetry={evidence.reload} /></div>;
  }
  const row = evidence.data;
  if (!row) return <div className="research-panel__section"><LoadingState what={t('evidence.loadingOne')} rows={2} /></div>;

  const page = row.location?.page;
  const documentHref = row.reference?.document
    ? `${api.url(`/references/${encodeURIComponent(row.referenceId)}/document`)}${page !== undefined ? `#page=${page}` : ''}`
    : undefined;

  return (
    <div className="research-panel__section research-stack">
      <EvidenceCard evidence={row} full />
      <section aria-labelledby="research-using-claims" className="research-stack">
        <h3 id="research-using-claims" className="research-subhead">{t('evidence.usingClaims', { count: linked.length })}</h3>
        {linked.length === 0 && <p className="research-meta">{t('evidence.noClaims')}</p>}
        {claims.error && <ErrorState error={claims.error} ns="research" onRetry={claims.reload} />}
        {linked.length > 0 && !claims.data && !claims.error && <LoadingState what={t('evidence.loadingClaims')} rows={0} />}
        {claims.data && claims.data.length > 0 && (
          <ul className="research-claimlist">
            {claims.data.map((claim) => (
              <li key={claim.id}>
                <Link to={paths.claim(projectId, claim.id)}>{claim.statement}</Link>
                <StatusChip status={claim.supportStatus} entity="claim" />
                {claim.approvalStatus !== 'Draft' && <StatusChip status={claim.approvalStatus} entity="claim" />}
                {claim.needsReview && <StatusChip status="needs review" />}
              </li>
            ))}
          </ul>
        )}
      </section>
      {failure && (
        <ErrorState
          error={failure}
          ns="research"
          title={t('evidence.changeRefused')}
          description={problemDetail(failure) ?? undefined}
          next={t('evidence.reloaded')}
        />
      )}
      <div className="research-actions">
        {row.status === 'Active' && (
          <button type="button" className="sires-button" data-size="sm" disabled={busy} onClick={() => setDialog(true)}>
            {t('evidence.exclude')}
          </button>
        )}
        {row.status === 'Excluded' && (
          <button type="button" className="sires-button" data-size="sm" disabled={busy} aria-busy={busy || undefined} onClick={() => void change('restore')}>
            {t('evidence.restore')}
          </button>
        )}
        {documentHref && (
          <a className="research-textbutton" href={documentHref} target="_blank" rel="noopener noreferrer">
            {page !== undefined ? t('evidence.openPdfAt', { page }) : t('evidence.openPdf')}
          </a>
        )}
      </div>
      {dialog && (
        <Dialog
          title={t('evidence.excludeTitle')}
          cancelLabel={t('evidence.keep')}
          onCancel={() => setDialog(false)}
          confirm={{ label: t('evidence.excludeConfirm'), onConfirm: () => void change('exclude'), busy }}
        >
          <p>{[referenceShort(row.reference), ...locationParts(t, row.location)].filter(Boolean).join(' · ')}. {t('evidence.excludeEffect')}</p>
          <ul>
            <li>{t('evidence.excludeClaims', { count: linked.length })}</li>
          </ul>
          <label className="sires-field">
            <span className="sires-field__label">{t('evidence.reasonOptional')}</span>
            <textarea className="sires-input" rows={3} value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
          </label>
        </Dialog>
      )}
    </div>
  );
}
