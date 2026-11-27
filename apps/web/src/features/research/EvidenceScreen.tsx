// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// References and Evidence (P6 Evidence; S02, H3, H4): three tabs with the counts already loaded, “Chỉ liên quan T-x”
// for the shell's Active task, “Thêm từ Trusted Library”, the list on the left and the Evidence Inspector on the
// right. One screen for /evidence (?tab=), /claims/:claimId and /evidence/:evidenceId.

import { useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useApi, useNavigationData } from '../../shell';
import { ClaimInspector } from './ClaimInspector';
import { ClaimsTab, type ClaimFilters } from './ClaimsTab';
import { TaskKeysProvider, useLoad, usePaged, useReferenceEvents, useReloadSignal, useResearchObjectEvents } from './data';
import { EvidenceInspector } from './EvidenceInspector';
import { EvidenceTab, type EvidenceFilters } from './EvidenceTab';
import { paths } from './labels';
import { ReferencesTab } from './ReferencesTab';

export type EvidenceTabId = 'references' | 'claims' | 'evidence';
const TABS: EvidenceTabId[] = ['references', 'claims', 'evidence'];
const PAGE = 20;

const parseTab = (value: string | null): EvidenceTabId => (TABS.includes(value as EvidenceTabId) ? (value as EvidenceTabId) : 'claims');

export function ReferencesAndEvidence() {
  const { projectId = '' } = useParams();
  return (
    <TaskKeysProvider key={projectId} projectId={projectId}>
      <EvidenceFrame projectId={projectId} />
    </TaskKeysProvider>
  );
}

function EvidenceFrame({ projectId }: { projectId: string }) {
  const { t } = useTranslation('research');
  const api = useApi();
  const navigate = useNavigate();
  const { claimId, evidenceId } = useParams();
  const [search] = useSearchParams();
  const tab: EvidenceTabId = claimId ? 'claims' : evidenceId ? 'evidence' : parseTab(search.get('tab'));
  const navigation = useNavigationData();
  const activeTask = navigation.project?.id === projectId ? navigation.project.activeTask : undefined;
  const [onlyTask, setOnlyTask] = useState(false);
  const taskId = onlyTask && activeTask ? activeTask.id : undefined;
  const [claimFilters, setClaimFilters] = useState<ClaimFilters>({ supportStatus: '', approvalStatus: '' });
  const [evidenceFilters, setEvidenceFilters] = useState<EvidenceFilters>({ status: '', referenceId: '' });

  const claims = usePaged(
    (cursor) => api.get('/projects/{projectId}/claims', {
      path: { projectId },
      query: {
        limit: PAGE, ...(cursor ? { cursor } : {}), ...(taskId ? { taskId } : {}),
        ...(claimFilters.supportStatus ? { supportStatus: claimFilters.supportStatus } : {}),
        ...(claimFilters.approvalStatus ? { approvalStatus: claimFilters.approvalStatus } : {}),
      },
    }).then((result) => result.data),
    [api, projectId, taskId, claimFilters.supportStatus, claimFilters.approvalStatus],
  );
  const evidence = usePaged(
    (cursor) => api.get('/projects/{projectId}/evidence', {
      path: { projectId },
      query: {
        limit: PAGE, ...(cursor ? { cursor } : {}), ...(taskId ? { taskId } : {}),
        ...(evidenceFilters.status ? { status: evidenceFilters.status } : {}),
        ...(evidenceFilters.referenceId ? { referenceId: evidenceFilters.referenceId } : {}),
      },
    }).then((result) => result.data),
    [api, projectId, taskId, evidenceFilters.status, evidenceFilters.referenceId],
  );
  // Every selection (Active and Removed), so evidence of a removed reference still shows its name.
  const references = useLoad(
    () => api.get('/projects/{projectId}/references', { path: { projectId } }).then((result) => result.data.items ?? []),
    [api, projectId],
  );
  const activeReferences = (references.data ?? []).filter((row) => row.status === 'Active');

  // H13: reload the lists whose objects changed; reference events touch References and Stale evidence.
  useResearchObjectEvents(projectId, ['claim'], claims.reload);
  useResearchObjectEvents(projectId, ['evidence'], evidence.reload);
  useReferenceEvents(projectId, () => {
    references.reload();
    evidence.reload();
  });
  useReloadSignal(() => {
    claims.reload();
    evidence.reload();
    references.reload();
  });

  const count = (loaded: number | undefined, more: boolean) => (loaded === undefined ? '' : ` · ${loaded}${more ? '+' : ''}`);
  const labels: Record<EvidenceTabId, string> = {
    references: `References${count(references.data ? activeReferences.length : undefined, false)}`,
    claims: `Claims${count(claims.data?.length, Boolean(claims.nextCursor))}`,
    evidence: `Evidence${count(evidence.data?.length, Boolean(evidence.nextCursor))}`,
  };
  const tabRefs = useRef<Record<EvidenceTabId, HTMLButtonElement | null>>({ references: null, claims: null, evidence: null });
  const go = (next: EvidenceTabId) => navigate(paths.evidence(projectId, next));
  const onTabKey = (event: KeyboardEvent) => {
    const index = TABS.indexOf(tab);
    const next = event.key === 'ArrowRight' ? TABS[(index + 1) % TABS.length] : event.key === 'ArrowLeft' ? TABS[(index + TABS.length - 1) % TABS.length] : undefined;
    if (!next) return;
    event.preventDefault();
    go(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section className="research-frame" aria-labelledby="research-evidence-title">
      <h1 id="research-evidence-title" className="sires-visually-hidden">References and Evidence</h1>
      <div className="research-toolbar">
        <div role="tablist" aria-label={t('tabs.label')} className="research-tabs" onKeyDown={onTabKey}>
          {TABS.map((id) => (
            <button
              key={id}
              ref={(node) => { tabRefs.current[id] = node; }}
              type="button"
              role="tab"
              id={`research-tab-${id}`}
              aria-selected={tab === id}
              aria-controls="research-tabpanel"
              tabIndex={tab === id ? 0 : -1}
              className="research-tab sires-num"
              onClick={() => go(id)}
            >
              {labels[id]}
            </button>
          ))}
        </div>
        <div className="research-actions">
          {activeTask && (tab === 'claims' || tab === 'evidence') && (
            <label className="research-check">
              <input type="checkbox" checked={onlyTask} onChange={(event) => setOnlyTask(event.currentTarget.checked)} />
              {t('toolbar.onlyTask', { task: activeTask.key ?? '…' })}
            </label>
          )}
          <Link className="sires-button" data-size="sm" to={paths.library()}>{t('toolbar.addFromLibrary')}</Link>
        </div>
      </div>
      <div className="research-split">
        <section id="research-tabpanel" role="tabpanel" aria-labelledby={`research-tab-${tab}`} className="research-list">
          {tab === 'claims' && (
            <ClaimsTab projectId={projectId} claims={claims} filters={claimFilters} onFilters={setClaimFilters} selectedId={claimId} onChanged={claims.reload} />
          )}
          {tab === 'evidence' && (
            <EvidenceTab projectId={projectId} evidence={evidence} filters={evidenceFilters} onFilters={setEvidenceFilters} references={references.data ?? []} selectedId={evidenceId} />
          )}
          {tab === 'references' && (
            <ReferencesTab projectId={projectId} references={references} onChanged={() => { references.reload(); evidence.reload(); }} />
          )}
        </section>
        <aside aria-labelledby="research-inspector-title" className="research-panel">
          <div className="research-panel__head">
            <h2 id="research-inspector-title" className="research-panel__title">Evidence Inspector</h2>
            {evidenceId && <span className="research-meta">{t('panel.evidenceSubtitle')}</span>}
          </div>
          {claimId && <ClaimInspector key={claimId} projectId={projectId} claimId={claimId} onChanged={() => { claims.reload(); evidence.reload(); }} />}
          {evidenceId && <EvidenceInspector key={evidenceId} projectId={projectId} evidenceId={evidenceId} onChanged={() => { claims.reload(); evidence.reload(); }} />}
          {!claimId && !evidenceId && <p className="research-panel__section research-meta">{t('panel.choose')}</p>}
        </aside>
      </div>
    </section>
  );
}
