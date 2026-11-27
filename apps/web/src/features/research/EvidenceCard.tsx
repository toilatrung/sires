// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Evidence card shared by the Evidence Inspector and the claim inspector (S03, S04; Evidence screen aside): status
// chip, reference, location, the excerpt with its neighbours in the source (before, quote highlighted, after). The
// context comes from the indexed Source Document only; nothing is generated here (EVID-INSPECTOR-001).

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { StatusChip } from '../../shell';
import type { Schemas } from './data';
import { locationParts, paths, referenceShort } from './labels';

export interface EvidenceCardProps {
  evidence: Schemas['EvidenceInContext'];
  /** Relation of the link when shown inside a claim (S04). */
  relation?: Schemas['ClaimEvidenceLink']['relation'];
  /** Full metadata of the reference (venue, year, DOI): the Evidence Inspector of one evidence (H5). */
  full?: boolean;
  children?: ReactNode;
}

export function EvidenceCard({ evidence, relation, full = false, children }: EvidenceCardProps) {
  const { t } = useTranslation('research');
  const reference = evidence.reference;
  const metadata = reference?.metadata;
  const label = referenceShort(reference);
  const doi = metadata?.identifiers.doi;
  const link = doi ? `https://doi.org/${doi}` : metadata?.identifiers.url;
  const uncounted = evidence.status !== 'Active';
  const location = locationParts(t, evidence.location, evidence.chunkId);
  return (
    <article className="research-evidence" aria-label={t('evidence.cardLabel', { reference: label || t('evidence.unknownReference') })}>
      <div className="research-evidence__head">
        {relation && <span className="research-relation" data-relation={relation}>{t(`relation.${relation}`)}</span>}
        <StatusChip status={evidence.status} entity="evidence" />
      </div>
      <Link to={paths.reference(evidence.referenceId)} className="research-evidence__reference">
        {label ? `${label} — ${metadata?.title ?? ''}` : t('evidence.unknownReference')}
      </Link>
      {full && metadata && metadata.authors.length > 0 && (
        <span className="research-meta">{metadata.authors.map((author) => author.name).join(', ')}</span>
      )}
      {full && metadata && (
        <span className="research-meta">
          {[metadata.venue, metadata.year].filter(Boolean).join(' ')}
          {link && (
            <>
              {' · '}
              <a href={link} target="_blank" rel="noopener noreferrer">{doi ? `DOI ${doi}` : t('evidence.sourceLink')}</a>
            </>
          )}
          {reference?.approvalStatus === 'Revoked' && <> · {t('evidence.referenceRevoked')}</>}
        </span>
      )}
      {location.length > 0 && <span className="research-meta sires-num">{location.join(' · ')}</span>}
      {evidence.status === 'Stale' && (
        <div role="note" className="research-stale">
          {t('evidence.staleNote', { reason: evidence.statusReason ?? t('evidence.staleNoReason') })}
        </div>
      )}
      {evidence.status === 'Excluded' && evidence.statusReason && (
        <span className="research-meta">{t('evidence.excludedReason', { reason: evidence.statusReason })}</span>
      )}
      {relation && uncounted && <span className="research-uncounted">{t('evidence.uncounted')}</span>}
      <blockquote className="research-excerpt">
        {evidence.before && <>{evidence.before} </>}
        <mark>{evidence.quote}</mark>
        {evidence.after && <> {evidence.after}</>}
      </blockquote>
      {children}
    </article>
  );
}
