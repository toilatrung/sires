// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Phone screen of the Manuscript area (PID-00115 S09, H21, UX-RESP-001): one column of Change Proposals waiting for
// the Researcher — Proposed first, then Outdated — each with its diff wrapped, accept, reject or “Yêu cầu tạo lại”.
// No editor (N13); writing the manuscript is for a computer or tablet (EC53, EC54).

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../../shell';
import { dataOf } from '../model';
import { ProposalBox } from '../proposals/ProposalBox';
import { focusProposal, startProposalSession, useProposalSession } from '../proposals/session';
import { revealProposal } from '../proposals/useProposalDeepLink';
import { useManuscript } from '../state';
import './mobile.css';

export function MobileProposals() {
  const { t } = useTranslation('manuscript');
  const { projectId, proposals, manuscript, reload } = useManuscript();
  const session = useProposalSession();
  const [params] = useSearchParams();
  const wanted = params.get('proposal');
  const shown = useRef<string | null>(null);

  useEffect(() => {
    startProposalSession(projectId);
  }, [projectId]);

  const list = dataOf(proposals);
  useEffect(() => {
    if (!wanted || !list || shown.current === wanted) return;
    shown.current = wanted;
    if (list.some((proposal) => proposal.id === wanted)) {
      focusProposal(wanted);
      revealProposal(wanted);
    }
  }, [list, wanted]);

  const rows = (list ?? [])
    .filter((proposal) => proposal.status === 'Proposed' || proposal.status === 'Outdated' || session.sticky.has(proposal.id))
    .sort((a, b) => Number(b.status === 'Proposed') - Number(a.status === 'Proposed') || b.createdAt.localeCompare(a.createdAt));
  const waiting = rows.filter((proposal) => proposal.status === 'Proposed' || proposal.status === 'Outdated').length;

  let body;
  if (manuscript.status === 'loading' || proposals.status === 'loading') body = <LoadingState what="Change Proposal" rows={3} />;
  else if (manuscript.status === 'error') body = <ErrorState error={manuscript.error} ns="manuscript" onRetry={() => void reload()} />;
  else if (manuscript.data === null) body = <EmptyState title={t('mobile.noManuscript.title')} reason={t('mobile.noManuscript.reason')} />;
  else if (proposals.status === 'error') body = <ErrorState error={proposals.error} ns="manuscript" onRetry={() => void reload(['proposals'])} />;
  else if (!rows.length) body = <EmptyState title={t('mobile.empty.title')} reason={t('mobile.empty.reason')} />;
  else {
    body = (
      <ul className="ms-mobile__list" aria-label={t('mobile.listLabel')}>
        {rows.map((proposal) => (
          <li key={proposal.id}>
            <ProposalBox proposalId={proposal.id} variant="mobile" />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="ms-mobile">
      <header className="ms-mobile__head">
        <h1 className="ms-mobile__title">{t('title')}</h1>
        <p className="ms-mobile__lead">{list ? t('mobile.lead', { count: waiting }) : t('mobile.leadLoading')}</p>
      </header>
      {body}
      {rows.length > 0 && <p className="ms-mobile__note">{t('mobile.note')}</p>}
    </div>
  );
}
