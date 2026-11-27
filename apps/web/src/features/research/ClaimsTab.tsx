// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Tab Claims of References and Evidence (S02, H4; Evidence screen): statement, support chip, approval chip when not
// Draft, needs review, “n hỗ trợ · m phản bác · T-x”; filters by support status (Conflicting reads “Bất đồng giữa
// nguồn”) and approval status; “Tải thêm”; bulk accept of the loaded Draft claims at Supported (S04, EC24).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { EmptyState, ErrorState, LoadingState, StatusChip } from '../../shell';
import { BulkAcceptDialog } from './ClaimDialogs';
import type { Paged, Schemas } from './data';
import { linkCounts, paths } from './labels';
import { TaskKey } from './Panel';

type Claim = Schemas['Claim'];
export interface ClaimFilters {
  supportStatus: Schemas['SupportStatus'] | '';
  approvalStatus: Schemas['ClaimApprovalStatus'] | '';
}

const SUPPORT: Schemas['SupportStatus'][] = ['Supported', 'Partially Supported', 'Unsupported', 'Conflicting', 'Not Assessed'];
const APPROVAL: Schemas['ClaimApprovalStatus'][] = ['Draft', 'Accepted', 'Rejected'];

export function ClaimMeta({ claim }: { claim: Claim }) {
  const { t } = useTranslation('research');
  const counts = linkCounts(claim);
  const parts: string[] = [];
  if (counts.total === 0) parts.push(t('claim.noEvidenceShort'));
  if (counts.supports) parts.push(t('claim.supportsCount', { count: counts.supports }));
  if (counts.contradicts) parts.push(t('claim.contradictsCount', { count: counts.contradicts }));
  return (
    <span className="sires-num">
      {parts.join(' · ')}
      <TaskKey taskId={claim.taskId} prefix={parts.length > 0 ? ' · ' : undefined} />
    </span>
  );
}

export function ClaimsTab({ projectId, claims, filters, onFilters, selectedId, onChanged }: {
  projectId: string; claims: Paged<Claim>; filters: ClaimFilters; onFilters: (filters: ClaimFilters) => void;
  selectedId?: string; onChanged: () => void;
}) {
  const { t } = useTranslation('research');
  const [bulk, setBulk] = useState(false);
  const eligible = (claims.data ?? []).filter((claim) => claim.approvalStatus === 'Draft' && claim.supportStatus === 'Supported');
  const filtered = Boolean(filters.supportStatus || filters.approvalStatus);

  return (
    <>
      <div className="research-filters">
        <select className="research-select" aria-label={t('filter.support')} value={filters.supportStatus}
          onChange={(event) => onFilters({ ...filters, supportStatus: event.currentTarget.value as ClaimFilters['supportStatus'] })}>
          <option value="">{t('filter.allSupport')}</option>
          {SUPPORT.map((status) => <option key={status} value={status}>{status === 'Conflicting' ? t('filter.conflicting') : status}</option>)}
        </select>
        <select className="research-select" aria-label={t('filter.approval')} value={filters.approvalStatus}
          onChange={(event) => onFilters({ ...filters, approvalStatus: event.currentTarget.value as ClaimFilters['approvalStatus'] })}>
          <option value="">{t('filter.allApproval')}</option>
          {APPROVAL.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </div>
      {claims.error && !claims.data && (
        <div className="research-region"><ErrorState error={claims.error} ns="research" title={t('claims.loadFailed')} next={t('list.otherAreasWork')} onRetry={claims.reload} /></div>
      )}
      {!claims.data && !claims.error && <div className="research-region"><LoadingState what={t('claims.loading')} /></div>}
      {claims.data?.length === 0 && (
        <div className="research-region">
          {filtered
            ? <EmptyState title={t('claims.noMatchTitle')} reason={t('list.noMatchReason')} />
            : <EmptyState title={t('claims.emptyTitle')} reason={t('claims.emptyReason')} />}
        </div>
      )}
      {claims.data && claims.data.length > 0 && (
        <ul className="research-rows" aria-label={t('tabs.claims')}>
          {claims.data.map((claim) => (
            <li key={claim.id}>
              <Link to={paths.claim(projectId, claim.id)} className="research-row" aria-current={claim.id === selectedId ? 'page' : undefined}>
                <span className="research-row__title research-row__title--statement">{claim.statement}</span>
                <span className="research-row__meta">
                  <StatusChip status={claim.supportStatus} entity="claim" />
                  {claim.approvalStatus !== 'Draft' && <StatusChip status={claim.approvalStatus} entity="claim" />}
                  {claim.needsReview && <StatusChip status="needs review" />}
                  <ClaimMeta claim={claim} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="research-listfoot">
        {claims.nextCursor && (
          <button type="button" className="sires-button" data-size="sm" disabled={claims.loadingMore} onClick={claims.loadMore}>{t('list.loadMore')}</button>
        )}
        {claims.moreError && <ErrorState error={claims.moreError} ns="research" title={t('list.moreFailed')} onRetry={claims.loadMore} />}
        {claims.data && claims.data.length > 0 && (
          <span className="research-actions">
            <button type="button" className="sires-button" data-size="sm" disabled={eligible.length === 0} aria-describedby={eligible.length === 0 ? 'research-bulk-reason' : undefined} onClick={() => setBulk(true)}>
              {t('bulk.open', { count: eligible.length })}
            </button>
            {eligible.length === 0 && <span id="research-bulk-reason" className="research-reason">{t('bulk.noneEligible')}</span>}
          </span>
        )}
      </div>
      {bulk && (
        <BulkAcceptDialog projectId={projectId} claims={eligible} onClose={(changed) => { setBulk(false); if (changed) onChanged(); }} />
      )}
    </>
  );
}
