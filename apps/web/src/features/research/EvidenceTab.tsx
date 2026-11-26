// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Tab Evidence (S02, H4; Evidence--view-evidence): short reference, location, one line of the excerpt, status chip;
// filters by status and reference; “Tải thêm”.

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { EmptyState, ErrorState, LoadingState, StatusChip } from '../../shell';
import type { Paged, Schemas } from './data';
import { locationParts, paths, referenceShort } from './labels';

export interface EvidenceFilters {
  status: Schemas['EvidenceStatus'] | '';
  referenceId: string;
}

const STATUSES: Schemas['EvidenceStatus'][] = ['Active', 'Excluded', 'Stale'];

export function EvidenceTab({ projectId, evidence, filters, onFilters, references, selectedId }: {
  projectId: string; evidence: Paged<Schemas['Evidence']>; filters: EvidenceFilters; onFilters: (filters: EvidenceFilters) => void;
  references: Schemas['ProjectReferenceSelection'][]; selectedId?: string;
}) {
  const { t } = useTranslation('research');
  const referenceOf = (id: string) => references.find((row) => row.referenceId === id)?.reference;
  const filtered = Boolean(filters.status || filters.referenceId);
  return (
    <>
      <div className="research-filters">
        <select className="research-select" aria-label={t('filter.status')} value={filters.status}
          onChange={(event) => onFilters({ ...filters, status: event.currentTarget.value as EvidenceFilters['status'] })}>
          <option value="">{t('filter.allStatus')}</option>
          {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select className="research-select" aria-label={t('filter.reference')} value={filters.referenceId}
          onChange={(event) => onFilters({ ...filters, referenceId: event.currentTarget.value })}>
          <option value="">{t('filter.allReferences')}</option>
          {references.map((row) => <option key={row.referenceId} value={row.referenceId}>{referenceShort(row.reference)}</option>)}
        </select>
      </div>
      {evidence.error && !evidence.data && (
        <div className="research-region"><ErrorState error={evidence.error} ns="research" title={t('evidenceList.loadFailed')} next={t('list.otherAreasWork')} onRetry={evidence.reload} /></div>
      )}
      {!evidence.data && !evidence.error && <div className="research-region"><LoadingState what={t('evidenceList.loading')} /></div>}
      {evidence.data?.length === 0 && (
        <div className="research-region">
          {filtered
            ? <EmptyState title={t('evidenceList.noMatchTitle')} reason={t('list.noMatchReason')} />
            : <EmptyState title={t('evidenceList.emptyTitle')} reason={t('evidenceList.emptyReason')} />}
        </div>
      )}
      {evidence.data && evidence.data.length > 0 && (
        <ul className="research-rows" aria-label={t('tabs.evidence')}>
          {evidence.data.map((row) => (
            <li key={row.id}>
              <Link to={paths.evidenceItem(projectId, row.id)} className="research-row" aria-current={row.id === selectedId ? 'page' : undefined}>
                <span className="research-row__line">
                  <span className="research-row__title sires-num">
                    {[referenceShort(referenceOf(row.referenceId)) || t('evidence.unknownReference'), ...locationParts(t, row.location)].join(' · ')}
                  </span>
                  <StatusChip status={row.status} entity="evidence" />
                </span>
                <span className="research-row__quote">“{row.quote}”</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="research-listfoot">
        {evidence.nextCursor && (
          <button type="button" className="sires-button" data-size="sm" disabled={evidence.loadingMore} onClick={evidence.loadMore}>{t('list.loadMore')}</button>
        )}
        {evidence.moreError && <ErrorState error={evidence.moreError} ns="research" title={t('list.moreFailed')} onRetry={evidence.loadMore} />}
      </div>
    </>
  );
}
