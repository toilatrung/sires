// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Tab References (S02, H4; Evidence--view-references, --dialog-remove-reference): Trusted References selected for the
// project with separate approval and indexing chips, the Unavailable sentence (UX-REF-002), link to the library,
// “Bỏ khỏi project” with the number of its evidence in the project and the consequence (LIB-PROJECT-001).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { EmptyState, ErrorState, LoadingState, StatusChip, useApi, type ApiError } from '../../shell';
import { useLoad, toApiError, type Loaded, type Schemas } from './data';
import { Dialog } from './Dialog';
import { authorsShort, paths, problemDetail, referenceShort } from './labels';

type Selection = Schemas['ProjectReferenceSelection'];

function RemoveDialog({ projectId, selection, onDone, onCancel }: { projectId: string; selection: Selection; onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation('research');
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | undefined>();
  // Evidence of this reference in the project (listEvidence with referenceId); “200+” when there are more pages.
  const count = useLoad(
    () => api.get('/projects/{projectId}/evidence', { path: { projectId }, query: { referenceId: selection.referenceId, limit: 200 } })
      .then(({ data }) => `${data.items?.length ?? 0}${data.nextCursor ? '+' : ''}`),
    [api, projectId, selection.referenceId],
  );
  const remove = async () => {
    setBusy(true);
    setFailure(undefined);
    try {
      await api.delete('/projects/{projectId}/references/{referenceId}', { path: { projectId, referenceId: selection.referenceId } });
      onDone();
    } catch (error) {
      // 409 stays in the dialog with its code (EC03).
      setFailure(toApiError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t('references.removeTitle', { reference: referenceShort(selection.reference) || t('evidence.unknownReference') })}
      cancelLabel={t('references.keep')}
      onCancel={onCancel}
      confirm={{ label: t('references.remove'), onConfirm: () => void remove(), busy, variant: 'danger', disabled: !count.data && !count.error }}
    >
      <ul>
        <li className="sires-num">
          {count.data !== undefined ? t('references.removeEvidence', { count: count.data }) : count.error ? t('references.removeEvidenceUnknown') : t('references.countingEvidence')}
        </li>
        <li>{t('references.removeTasks')}</li>
        <li>{t('references.removeLibrary')}</li>
      </ul>
      {failure && <ErrorState error={failure} ns="research" title={t('references.removeRefused')} description={problemDetail(failure)} />}
    </Dialog>
  );
}

export function ReferencesTab({ projectId, references, onChanged }: { projectId: string; references: Loaded<Selection[]>; onChanged: () => void }) {
  const { t } = useTranslation('research');
  const [removing, setRemoving] = useState<Selection | undefined>();
  const active = (references.data ?? []).filter((row) => row.status === 'Active');
  return (
    <>
      {references.error && !references.data && (
        <div className="research-region"><ErrorState error={references.error} ns="research" title={t('references.loadFailed')} next={t('list.otherAreasWork')} onRetry={references.reload} /></div>
      )}
      {!references.data && !references.error && <div className="research-region"><LoadingState what={t('references.loading')} /></div>}
      {references.data && active.length === 0 && (
        <div className="research-region">
          <EmptyState title={t('references.emptyTitle')} reason={t('references.emptyReason')}
            action={<Link className="sires-button" to={paths.library()}>{t('toolbar.addFromLibrary')}</Link>} />
        </div>
      )}
      {active.length > 0 && (
        <ul className="research-rows" aria-label={t('tabs.references')}>
          {active.map((row) => {
            const metadata = row.reference?.metadata;
            return (
              <li key={row.referenceId} className="research-row research-row--static">
                <span className="research-row__line">
                  <span className="research-stack research-stack--tight">
                    <Link to={paths.reference(row.referenceId)} className="research-row__title">{metadata?.title ?? t('evidence.unknownReference')}</Link>
                    <span className="research-meta sires-num">{[authorsShort(row.reference), metadata?.year, metadata?.venue].filter(Boolean).join(' · ')}</span>
                    <span className="research-chips">
                      {row.reference && <StatusChip status={row.reference.approvalStatus} entity="reference" />}
                      {row.reference && <StatusChip status={row.reference.indexingStatus} entity="reference-index" />}
                    </span>
                    {row.reference?.indexingStatus === 'Unavailable' && <span className="research-meta">{t('references.unavailable')}</span>}
                    {row.reference?.approvalStatus === 'Revoked' && <span className="research-meta">{t('references.revoked')}</span>}
                  </span>
                  <button type="button" className="sires-button" data-size="sm" onClick={() => setRemoving(row)}>{t('references.remove')}</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {removing && (
        <RemoveDialog projectId={projectId} selection={removing} onCancel={() => setRemoving(undefined)} onDone={() => { setRemoving(undefined); onChanged(); }} />
      )}
    </>
  );
}
