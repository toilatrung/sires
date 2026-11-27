// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Citations in the editor (PID-00115 S05, H10): a key is resolved when the manuscript's bibliography has it; an
// entry whose reference is no longer Trusted is marked as a warning (MS-BIB-001-AC03); suggestions come from the
// bibliography and the project's Trusted References, and choosing a reference without entry adds it first (EC28).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { isApiError, useApi, useEvents, type ApiError } from '../../../shell';
import type { CitationSupport, CiteOption, CiteState } from '../editor/Editor';
import { asApiError, dataOf, nearestKey, type BibliographyEntry, type ProjectReference } from '../model';
import { useManuscript } from '../state';

export interface Citations {
  support: CitationSupport;
  /** Error of the last addBibliographyEntry (422 reference_not_trusted, network), shown in the editor pane. */
  error?: ApiError;
  clearError: () => void;
}

const trusted = (entry: BibliographyEntry) => !entry.referenceApprovalStatus || entry.referenceApprovalStatus === 'Trusted';

export function useCitations(): Citations {
  const api = useApi();
  const { t } = useTranslation('manuscript');
  const { projectId, bibliography, reload } = useManuscript();
  const [references, setReferences] = useState<ProjectReference[] | undefined>();
  const [error, setError] = useState<ApiError | undefined>();

  const loadReferences = useCallback(async () => {
    try {
      const { data } = await api.get('/projects/{projectId}/references', { path: { projectId }, query: { status: 'Active' } });
      setReferences((data.items ?? []) as ProjectReference[]);
    } catch {
      // Suggestions fall back to the bibliography; marks do not depend on this list.
      setReferences([]);
    }
  }, [api, projectId]);

  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);
  useEvents({ types: ['project_reference.changed', 'reference.status_changed'], projectId }, () => {
    void loadReferences();
  });

  const entries = useMemo(() => dataOf(bibliography) ?? [], [bibliography]);

  const support = useMemo<CitationSupport>(() => {
    const byKey = new Map(entries.map((entry) => [entry.bibtexKey, entry]));
    const selectable = (references ?? []).filter((row) => row.status === 'Active' && row.reference?.approvalStatus === 'Trusted');
    const known = [...new Set([...entries.filter(trusted).map((entry) => entry.bibtexKey), ...selectable.map((row) => row.reference!.bibtexKey)])];

    const stateOf = (key: string): CiteState => {
      const entry = byKey.get(key);
      if (!entry) return 'unresolved';
      return trusted(entry) ? 'ok' : 'revoked';
    };

    const tooltip = (key: string) => {
      const entry = byKey.get(key);
      if (entry && !trusted(entry)) {
        return (
          <>
            <strong className="ms-cite-tip__title">{t('cite.revokedTitle', { key })}</strong>
            <span className="ms-cite-tip__body">{t('cite.revokedBody', { status: entry.referenceApprovalStatus })}</span>
          </>
        );
      }
      const nearest = nearestKey(key, known.filter((candidate) => candidate !== key));
      return (
        <>
          <strong className="ms-cite-tip__title">{t('cite.unresolvedTitle', { key })}</strong>
          <span className="ms-cite-tip__body">
            {t('cite.unresolvedBody')}
            {nearest && (
              <>
                {' '}
                {t('cite.suggestion')} <span className="sires-id">{nearest}</span>
              </>
            )}
          </span>
        </>
      );
    };

    const suggest = (prefix: string) => {
      const needle = prefix.toLowerCase();
      const options: CiteOption[] = [];
      for (const entry of entries.filter(trusted)) {
        const reference = selectable.find((row) => row.referenceId === entry.referenceId)?.reference;
        const title = reference?.metadata.title;
        if (!needle || entry.bibtexKey.toLowerCase().includes(needle) || title?.toLowerCase().includes(needle)) {
          options.push({ key: entry.bibtexKey, label: entry.bibtexKey, ...(title ? { detail: title } : {}) });
        }
      }
      for (const row of selectable) {
        const reference = row.reference!;
        if (byKey.has(reference.bibtexKey)) continue;
        if (!needle || reference.bibtexKey.toLowerCase().includes(needle) || reference.metadata.title.toLowerCase().includes(needle)) {
          options.push({ key: reference.bibtexKey, label: reference.bibtexKey, detail: `${reference.metadata.title} · ${t('cite.addsEntry')}`, needsEntry: true });
        }
      }
      if (options.length) return { options: options.slice(0, 8) };
      const none = !entries.some(trusted) && !selectable.length;
      return {
        options,
        empty: (
          <div className="ms-cite-pop__empty" role="status">
            <strong>{none ? t('cite.emptyTitle') : t('cite.noMatchTitle', { prefix })}</strong>
            <span>{none ? t('cite.emptyReason') : t('cite.noMatchReason')}</span>
            <Link className="sires-button" data-variant="outline" data-size="sm" to={`/projects/${encodeURIComponent(projectId)}/evidence`}>
              {t('cite.openEvidence')}
            </Link>
          </div>
        ),
      };
    };

    const pick = async (option: CiteOption): Promise<string | null> => {
      if (!option.needsEntry) return option.key;
      const row = selectable.find((candidate) => candidate.reference?.bibtexKey === option.key);
      if (!row) return null;
      try {
        // Not idempotency-keyed in the contract: a second call returns the existing entry (200).
        const { data } = await api.post('/projects/{projectId}/manuscript/bibliography', { path: { projectId }, body: { referenceId: row.referenceId } });
        setError(undefined);
        // System regenerates references.bib in a new revision; my next save goes through EC18.
        void reload(['bibliography', 'manuscript', 'files']);
        return data.bibtexKey;
      } catch (caught) {
        setError(isApiError(caught) ? caught : asApiError(caught));
        return null;
      }
    };

    return { stateOf, tooltip, suggest, pick };
  }, [api, entries, projectId, references, reload, t]);

  return { support, error, clearError: () => setError(undefined) };
}
