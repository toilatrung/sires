// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// One revision (PID-00115 S07, MS-REVISION-001-AC02, H14): who made it, its files, and where it came from — the Task
// (planning area), the Agent Run of the Change Proposal (its workflow in Agent Activity) and the proposal's claims.
// A revision from a proposal without Task has no Task link (EC43). Text files can be restored to this revision.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ErrorState, useApi } from '../../../shell';
import { type ManuscriptFile, type Proposal, type Revision } from '../model';
import { useManuscript } from '../state';
import { agentLabel, useActorLabel } from '../ui';
import { revisionTime } from './labels';
import { RestoreButton, useRestore, type Restored } from './restore';

export interface RevisionDetailProps {
  revision: Revision;
  source: string;
  taskKey?: string;
  onBack: () => void;
  onRestored: (restored: Restored) => void;
}

export function RevisionDetail({ revision, source, taskKey, onBack, onRestored }: RevisionDetailProps) {
  const { t } = useTranslation('manuscript');
  const api = useApi();
  const actorLabel = useActorLabel();
  const { projectId, manuscript } = useManuscript();
  const tools = useRestore(onRestored);
  const [proposal, setProposal] = useState<Proposal | undefined>();
  const [claims, setClaims] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<ManuscriptFile[]>([]);
  const project = encodeURIComponent(projectId);
  const current = manuscript.status === 'ready' ? manuscript.data?.currentRevisionId : undefined;

  useEffect(() => {
    let alive = true;
    api.get('/projects/{projectId}/manuscript/files', { path: { projectId }, query: { revisionId: revision.id } })
      .then(({ data }) => alive && setFiles((data.items ?? []) as ManuscriptFile[]))
      .catch(() => alive && setFiles([]));
    if (revision.changeProposalId) {
      api.get('/projects/{projectId}/manuscript/change-proposals/{proposalId}', { path: { projectId, proposalId: revision.changeProposalId } })
        .then(({ data }) => {
          if (!alive) return;
          setProposal(data);
          for (const claimId of data.claimIds ?? []) {
            api.get('/projects/{projectId}/claims/{claimId}', { path: { projectId, claimId } })
              .then(({ data: claim }) => alive && setClaims((known) => ({ ...known, [claimId]: claim.statement })))
              .catch(() => undefined);
          }
        })
        .catch(() => alive && setProposal(undefined));
    }
    return () => {
      alive = false;
    };
  }, [api, projectId, revision.id, revision.changeProposalId]);

  const workflowId = proposal?.provenance.workflowId;
  const agent = proposal?.provenance.createdBy.agent ?? revision.createdBy.agent;
  const title = t('history.detailTitle', { n: revision.revisionNumber });

  return (
    <section className="msh-detail" aria-label={title}>
      <div className="msh-head">
        <button type="button" className="sires-button" data-variant="secondary" data-size="sm" onClick={onBack}>
          {t('history.back')}
        </button>
        <h3 className="msh-title">{title}</h3>
      </div>
      <p className="msh-meta">
        <span className="sires-id">r{revision.revisionNumber}</span> · {actorLabel(revision.createdBy)} · {revisionTime(revision.createdAt)}
        <br />
        <span className="msh-source">{source}</span>
      </p>
      {revision.message && revision.source !== 'init' && <p className="msh-message">{t('history.message', { message: revision.message })}</p>}

      <h4 className="msh-subtitle">{t('history.provenance')}</h4>
      {revision.source === 'change_proposal' ? (
        <ul className="msh-links">
          {revision.taskId && (
            <li>
              <Link to={`/projects/${project}/tasks/${encodeURIComponent(revision.taskId)}`}>{t('history.task', { key: taskKey ?? t('history.taskFallback') })}</Link>
            </li>
          )}
          {workflowId && (
            <li>
              <Link to={`/projects/${project}/activity/workflows/${encodeURIComponent(workflowId)}`}>{t('history.agentRun', { agent: agentLabel(agent) })}</Link>
            </li>
          )}
          {(proposal?.claimIds ?? []).map((claimId, index) => (
            <li key={claimId}>
              <Link to={`/projects/${project}/evidence/claims/${encodeURIComponent(claimId)}`}>
                {claims[claimId] ? t('history.claim', { statement: claims[claimId] }) : t('history.claimFallback', { n: index + 1 })}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="msh-note">{revision.source === 'init' ? t('history.initProvenance') : t('history.noProvenance')}</p>
      )}

      {tools.error && (
        <ErrorState
          error={tools.error.error}
          ns="manuscript"
          title={t('history.restoreFailed', { path: tools.error.path })}
          notSaved={t('history.restoreKept')}
          actions={
            <button type="button" className="sires-button" data-variant="secondary" data-size="sm" onClick={tools.clearError}>
              {t('common.close')}
            </button>
          }
        />
      )}
      <h4 className="msh-subtitle">{t('history.changes')}</h4>
      <ul className="msh-changes">
        {revision.changes.map((change) => {
          const path = change.newPath ?? change.path;
          const file = change.operation === 'delete' ? undefined : files.find((row) => row.path === path);
          return (
            <li key={`${change.operation}:${change.path}`} className="msh-change">
              <span>
                <span className="sires-id" title={path}>
                  {change.operation === 'rename' ? `${change.path} → ${change.newPath}` : path}
                </span>{' '}
                <span className="msh-op">{t(`history.op.${change.operation}`)}</span>
              </span>
              {file && revision.id !== current && (
                <RestoreButton tools={tools} target={{ fileId: file.id, path: file.path, fileType: file.fileType, revisionId: revision.id, revisionNumber: revision.revisionNumber }} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
