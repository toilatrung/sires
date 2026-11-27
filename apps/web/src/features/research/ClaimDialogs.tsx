// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Dialogs of the claim review (S04, H6; design.md §4; Evidence--dialog-accept-claim, --dialog-link-evidence): extra
// confirmation for Unsupported/Conflicting, reject with an optional reason, link one Active evidence with a relation
// chosen by the Researcher (nothing preselected), bulk accept of the loaded Draft claims at Supported.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState, useApi, useShell, type ApiError } from '../../shell';
import { useLoad, usePaged, toApiError, type Schemas } from './data';
import { Dialog } from './Dialog';
import { linkCounts, locationParts, problemDetail, referenceShort } from './labels';

type Claim = Schemas['Claim'];
type Relation = Schemas['ClaimEvidenceLink']['relation'];
const RELATIONS: Relation[] = ['supports', 'contradicts', 'context'];

export function AcceptConfirmDialog({ claim, busy, onConfirm, onCancel }: { claim: Claim; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation('research');
  const counts = linkCounts(claim);
  return (
    <Dialog
      title={t('claim.acceptConfirmTitle', { status: claim.supportStatus })}
      cancelLabel={t('claim.keepDraft')}
      onCancel={onCancel}
      confirm={{ label: t('claim.accept'), onConfirm, busy }}
    >
      <p>“{claim.statement}”</p>
      <ul>
        <li>{t('claim.acceptConfirmCounts', { supports: counts.supports, contradicts: counts.contradicts })}</li>
        <li>{t('claim.acceptConfirmKeepsLabel', { status: claim.supportStatus })}</li>
      </ul>
    </Dialog>
  );
}

export function RejectDialog({ claim, busy, onConfirm, onCancel }: { claim: Claim; busy: boolean; onConfirm: (reason: string) => void; onCancel: () => void }) {
  const { t } = useTranslation('research');
  const [reason, setReason] = useState('');
  return (
    <Dialog
      title={t('claim.rejectTitle')}
      cancelLabel={t('claim.keepDraft')}
      onCancel={onCancel}
      confirm={{ label: t('claim.rejectConfirm'), onConfirm: () => onConfirm(reason.trim()), busy }}
    >
      <p>“{claim.statement}”</p>
      <ul>
        <li>{t('claim.rejectEffect')}</li>
      </ul>
      <label className="sires-field">
        <span className="sires-field__label">{t('claim.reasonOptional')}</span>
        <textarea className="sires-input" rows={3} value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
      </label>
    </Dialog>
  );
}

/** Lists only Active evidence of the project (listEvidence status=Active), filtered by reference (EC10, EC22). */
export function LinkEvidenceDialog({ projectId, claim, onLinked, onCancel }: { projectId: string; claim: Claim; onLinked: () => void; onCancel: () => void }) {
  const { t } = useTranslation('research');
  const api = useApi();
  const [referenceId, setReferenceId] = useState('');
  const [evidenceId, setEvidenceId] = useState('');
  const [relation, setRelation] = useState<Relation | ''>('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | undefined>();
  const references = useLoad(
    () => api.get('/projects/{projectId}/references', { path: { projectId } }).then((result) => result.data.items ?? []),
    [api, projectId],
  );
  const evidence = usePaged(
    (cursor) => api.get('/projects/{projectId}/evidence', {
      path: { projectId }, query: { status: 'Active', ...(referenceId ? { referenceId } : {}), limit: 20, ...(cursor ? { cursor } : {}) },
    }).then((result) => result.data),
    [api, projectId, referenceId],
  );
  const referenceOf = (id: string) => references.data?.find((row) => row.referenceId === id)?.reference;

  const submit = async () => {
    if (!evidenceId || !relation) return;
    setBusy(true);
    setFailure(undefined);
    try {
      await api.post('/projects/{projectId}/claims/{claimId}/evidence-links', { path: { projectId, claimId: claim.id }, body: { evidenceId, relation } });
      onLinked();
    } catch (error) {
      setFailure(toApiError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t('link.title')}
      cancelLabel={t('link.cancel')}
      onCancel={onCancel}
      confirm={{
        label: t('link.confirm'), onConfirm: () => void submit(), busy,
        disabled: !evidenceId || !relation, disabledReason: t('link.chooseBoth'),
      }}
    >
      <p>{t('link.intro')}</p>
      <select className="research-select" aria-label={t('filter.reference')} value={referenceId} onChange={(event) => { setReferenceId(event.currentTarget.value); setEvidenceId(''); }}>
        <option value="">{t('filter.allReferences')}</option>
        {(references.data ?? []).filter((row) => row.status === 'Active').map((row) => (
          <option key={row.referenceId} value={row.referenceId}>{referenceShort(row.reference)}</option>
        ))}
      </select>
      <fieldset className="research-fieldset">
        <legend>{t('link.evidence')}</legend>
        {evidence.error && <ErrorState error={evidence.error} ns="research" onRetry={evidence.reload} />}
        {evidence.data?.length === 0 && <p className="research-meta">{t('link.noEvidence')}</p>}
        {(evidence.data ?? []).map((row) => (
          <label key={row.id} className="research-choice">
            <input type="radio" name="research-link-evidence" value={row.id} checked={evidenceId === row.id} onChange={() => setEvidenceId(row.id)} />
            <span>{[referenceShort(referenceOf(row.referenceId)), ...locationParts(t, row.location)].filter(Boolean).join(' · ')} · “{row.quote}”</span>
          </label>
        ))}
        {evidence.nextCursor && (
          <button type="button" className="research-textbutton" disabled={evidence.loadingMore} onClick={evidence.loadMore}>{t('list.loadMore')}</button>
        )}
      </fieldset>
      <fieldset className="research-fieldset research-fieldset--inline">
        <legend>{t('link.relation')}</legend>
        {RELATIONS.map((value) => (
          <label key={value} className="research-choice">
            <input type="radio" name="research-link-relation" value={value} checked={relation === value} onChange={() => setRelation(value)} />
            <span>{value}</span>
          </label>
        ))}
      </fieldset>
      {failure && <ErrorState error={failure} ns="research" title={t('link.refused')} description={problemDetail(failure)} />}
    </Dialog>
  );
}

interface BulkResult {
  accepted: number;
  failed: Array<{ claim: Claim; error: ApiError }>;
}

/** SYN-HUMAN-REVIEW-001: accept the loaded Draft claims at Supported one by one, one Idempotency-Key each (EC24). */
export function BulkAcceptDialog({ projectId, claims: eligible, onClose }: { projectId: string; claims: Claim[]; onClose: (changed: boolean) => void }) {
  // The claims listed when the dialog opened; the list behind it reloads as claims get accepted.
  const [claims] = useState(eligible);
  const { t } = useTranslation('research');
  const api = useApi();
  const { idempotency } = useShell();
  const [progress, setProgress] = useState<number | undefined>();
  const [result, setResult] = useState<BulkResult | undefined>();

  const run = async () => {
    const outcome: BulkResult = { accepted: 0, failed: [] };
    setProgress(0);
    for (const [index, claim] of claims.entries()) {
      try {
        await idempotency.run(`acceptClaim:${claim.id}`, (key) => api.post('/projects/{projectId}/claims/{claimId}/accept', {
          path: { projectId, claimId: claim.id }, body: { rowVersion: claim.rowVersion }, idempotencyKey: key,
        }));
        outcome.accepted += 1;
      } catch (error) {
        // 409, 400: listed with its code, not sent again; the claims already accepted stay accepted.
        outcome.failed.push({ claim, error: toApiError(error) });
      }
      setProgress(index + 1);
    }
    setResult(outcome);
  };

  const running = progress !== undefined && !result;
  return (
    <Dialog
      title={t('bulk.title', { count: claims.length })}
      cancelLabel={result ? t('bulk.close') : t('claim.keepDraft')}
      onCancel={() => { if (!running) onClose(Boolean(result)); }}
      confirm={result ? undefined : { label: t('bulk.confirm', { count: claims.length }), onConfirm: () => void run(), busy: running }}
    >
      <ul>
        {claims.map((claim) => <li key={claim.id}>{claim.statement}</li>)}
      </ul>
      <p>{t('bulk.effect', { count: claims.length })}</p>
      {progress !== undefined && (
        <p role="status" className="research-meta sires-num">{t('bulk.progress', { done: progress, total: claims.length })}</p>
      )}
      {result && (
        <div className="research-stack">
          <p>{t('bulk.done', { accepted: result.accepted, total: claims.length })}</p>
          {result.failed.length > 0 && (
            <div role="alert" className="sires-error">
              <strong className="sires-error__title">{t('bulk.failedTitle', { count: result.failed.length })}</strong>
              <ul>
                {result.failed.map(({ claim, error }) => (
                  <li key={claim.id}>{claim.statement} — <span className="sires-error__code">{error.code}</span>{problemDetail(error) ? ` ${problemDetail(error)}` : ''}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
