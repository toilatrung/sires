// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Content of a synthesis version (S07, H11; UX-CLAIM-001-AC01): the text as plain text, the support chip of each
// claim right after its sentence (and the approval chip when not Draft), the claims without a place in the text in
// their own group, and the table “Claim của bản tổng hợp”. No claim loses its label (KPI-01).

import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ErrorState, LoadingState, StatusChip } from '../../shell';
import type { Loaded, Schemas } from './data';
import { linkCounts, paths } from './labels';
import { locateClaims, paragraphs } from './locate';

type Claim = Schemas['Claim'];

function ClaimChips({ projectId, claim }: { projectId: string; claim: Claim }) {
  return (
    <Link to={paths.claim(projectId, claim.id)} className="research-anchor" title={claim.statement} data-claim={claim.id}>
      <StatusChip status={claim.supportStatus} entity="claim" />
      {claim.approvalStatus !== 'Draft' && <StatusChip status={claim.approvalStatus} entity="claim" />}
    </Link>
  );
}

export function SynthesisContent({ projectId, version, claims }: { projectId: string; version: Schemas['ArtifactVersion']; claims: Loaded<Claim[]> }) {
  const { t } = useTranslation('research');
  const content = version.content ?? '';
  const rows = claims.data ?? [];
  const byId = new Map(rows.map((claim) => [claim.id, claim]));
  const claimIds = version.claimIds?.length ? version.claimIds.filter((claimId) => byId.has(claimId)) : rows.map((claim) => claim.id);
  const { placements, unlocated } = locateClaims(content, claimIds, version.claimAnchors);

  const renderParagraph = (start: number, end: number) => {
    const parts: ReactNode[] = [];
    let cursor = start;
    for (const placement of placements.filter((item) => item.at > start && item.at <= end)) {
      parts.push(content.slice(cursor, placement.at));
      parts.push(
        <span key={`chips-${placement.at}`} className="research-anchors">
          {placement.claimIds.map((claimId) => {
            const claim = byId.get(claimId);
            return claim ? <ClaimChips key={claimId} projectId={projectId} claim={claim} /> : null;
          })}
        </span>,
      );
      cursor = placement.at;
    }
    parts.push(content.slice(cursor, end));
    return parts.map((part, index) => <Fragment key={index}>{part}</Fragment>);
  };

  return (
    <div className="research-stack">
      <div className="research-synthesis">
        {paragraphs(content).map((range) => <p key={range.start}>{renderParagraph(range.start, range.end)}</p>)}
      </div>
      {claims.error && <ErrorState error={claims.error} ns="research" title={t('synthesis.claimsFailed')} onRetry={claims.reload} />}
      {!claims.data && !claims.error && <LoadingState what={t('synthesis.loadingClaims')} rows={0} />}
      {unlocated.length > 0 && (
        <section className="research-unlocated research-stack" aria-labelledby="research-unlocated-title">
          <h4 id="research-unlocated-title" className="research-subhead">{t('synthesis.unlocated')}</h4>
          <ul className="research-claimlist">
            {unlocated.map((claimId) => {
              const claim = byId.get(claimId)!;
              return (
                <li key={claimId}>
                  <span>{claim.statement}</span>
                  <ClaimChips projectId={projectId} claim={claim} />
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {claims.data && (
        <section className="research-stack" aria-labelledby="research-synthesis-claims">
          <h4 id="research-synthesis-claims" className="research-subhead">{t('synthesis.table', { count: claimIds.length })}</h4>
          <div className="research-tablewrap">
            <table className="research-table">
              <thead>
                <tr>
                  <th scope="col">{t('synthesis.colStatement')}</th>
                  <th scope="col">{t('synthesis.colSupport')}</th>
                  <th scope="col">{t('synthesis.colApproval')}</th>
                  <th scope="col">{t('synthesis.colEvidence')}</th>
                </tr>
              </thead>
              <tbody>
                {claimIds.map((claimId) => {
                  const claim = byId.get(claimId)!;
                  return (
                    <tr key={claimId}>
                      <td><Link to={paths.claim(projectId, claimId)}>{claim.statement}</Link></td>
                      <td><StatusChip status={claim.supportStatus} entity="claim" /></td>
                      <td><StatusChip status={claim.approvalStatus} entity="claim" /></td>
                      <td className="sires-num">{linkCounts(claim).total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
