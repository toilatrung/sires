// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Change Proposal box (PID-00115 S06, S09; H11–H13; Manuscript.html, --proposal-citation-error, --proposal-outdated):
// header with the agent and status, Task · claims · evidence · files, the diff per file as plain text with failed
// citation keys marked, claim and citation chips, then one decision for the whole proposal (APR-05): accept, reject,
// or for an Outdated proposal only “Yêu cầu tạo lại”. In the editor the current file's diff is open and the other
// files fold; on the phone every file is open.

import { useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ErrorState, StatusChip } from '../../../shell';
import { citeKeys, dataOf, type Proposal } from '../model';
import { useManuscript } from '../state';
import { agentLabel } from '../ui';
import { badKeys, citationResult, hunkRows, useChangedPaths, useClaims, useRevisionNumber, useTaskKey, type DiffEntry } from './data';
import { RegenerateDialog, RejectDialog } from './dialogs';
import { useProposalSession, type Notice } from './session';
import { useProposalActions } from './useProposalActions';
import './proposals.css';

/** A diff line as text; cited keys that failed the check are wrapped in a mark (never HTML, EC36). */
function MarkedText({ text, bad }: { text: string; bad: ReadonlySet<string> }) {
  const marks = citeKeys(text).filter((cite) => bad.has(cite.key));
  if (!marks.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  marks.forEach((cite, index) => {
    parts.push(text.slice(at, cite.from));
    parts.push(
      <mark key={index} className="ms-pdiff__bad">
        {text.slice(cite.from, cite.to)}
      </mark>,
    );
    at = cite.to;
  });
  parts.push(text.slice(at));
  return <>{parts}</>;
}

function FileDiff({ entry, bad, open, onToggle, current }: { entry: DiffEntry; bad: ReadonlySet<string>; open: boolean; onToggle?: () => void; current: boolean }) {
  const { t } = useTranslation('manuscript');
  const { fileList, openFile } = useManuscript();
  const path = entry.path ?? '';
  const exists = fileList.some((file) => file.path === path);
  const added = (entry.hunks ?? []).reduce((sum, hunk) => sum + hunkRows(hunk).filter((row) => row.kind === 'add').length, 0);
  const removed = (entry.hunks ?? []).reduce((sum, hunk) => sum + hunkRows(hunk).filter((row) => row.kind === 'del').length, 0);
  const regionId = useId();
  return (
    <div className="ms-pdiff" role="group" aria-label={t('proposal.diffOf', { path })}>
      <div className="ms-pdiff__file">
        <span className="sires-id">{path}</span>
        {entry.operation === 'add' && <span className="ms-pdiff__tag">{t('proposal.newFile')}</span>}
        {entry.operation === 'delete' && <span className="ms-pdiff__tag">{t('proposal.deletedFile')}</span>}
        <span className="ms-pdiff__count sires-num">
          +{added} −{removed}
        </span>
        {onToggle && (
          <button type="button" className="ms-proposal__link" aria-expanded={open} aria-controls={regionId} onClick={onToggle}>
            {open ? t('proposal.hideDiff') : t('proposal.showDiff')}
          </button>
        )}
        {!current && exists && (
          <button type="button" className="ms-proposal__link" onClick={() => openFile(path)}>
            {t('proposal.openFile')}
          </button>
        )}
      </div>
      {open && (
        <div id={regionId}>
          {(entry.hunks ?? []).map((hunk, index) => (
            <div key={index} className="ms-pdiff__hunk">
              {hunk.oldStart !== undefined && <span className="ms-pdiff__at">{t('proposal.atLine', { line: hunk.oldStart })}</span>}
              <pre className="ms-pdiff__lines">
                {hunkRows(hunk).map((row, line) => (
                  <span key={line} className="ms-pdiff__line" data-kind={row.kind}>
                    <span className="ms-pdiff__sign" aria-hidden="true">
                      {row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ' '}
                    </span>
                    <span className="sires-visually-hidden">{row.kind === 'add' ? t('proposal.added') : row.kind === 'del' ? t('proposal.removed') : ''}</span>
                    <MarkedText text={row.text} bad={bad} />
                    {'\n'}
                  </span>
                ))}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NoticeLine({ notice, proposal }: { notice: Notice | undefined; proposal: Proposal }) {
  const { t } = useTranslation('manuscript');
  const { projectId } = useManuscript();
  const resulting = useRevisionNumber(projectId, proposal.status === 'Accepted' && notice?.revision === undefined ? proposal.resultingRevisionId : undefined);
  if (notice?.kind === 'requested') {
    return (
      <p className="ms-proposal__notice" role="status">
        {t('proposal.notice.requested')}{' '}
        <Link to={`/projects/${encodeURIComponent(projectId)}/chat`}>{t('proposal.openChat')}</Link>
      </p>
    );
  }
  if (notice && notice.kind !== 'accepted' && notice.kind !== 'rejected') {
    return (
      <p className="ms-proposal__notice" role="status">
        {t(`proposal.notice.${notice.kind}`)}
      </p>
    );
  }
  if (proposal.status === 'Accepted') {
    const revision = notice?.revision ?? resulting;
    return (
      <p className="ms-proposal__notice" role={notice ? 'status' : undefined}>
        {revision !== undefined ? t('proposal.acceptedAt', { n: revision }) : t('proposal.acceptedPlain')}
      </p>
    );
  }
  if (proposal.status === 'Rejected') {
    return (
      <p className="ms-proposal__notice" role={notice ? 'status' : undefined}>
        {proposal.approval?.reason ? t('proposal.rejectedReason', { reason: proposal.approval.reason }) : t('proposal.rejectedPlain')}
      </p>
    );
  }
  return null;
}

export function ProposalBox({ proposalId, path, variant }: { proposalId: string; path?: string; variant: 'editor' | 'mobile' }) {
  const { t } = useTranslation('manuscript');
  const ctx = useManuscript();
  const { projectId, archived, fileList, manuscript, isDirty } = ctx;
  const proposal = (dataOf(ctx.proposals) ?? []).find((row) => row.id === proposalId);
  if (!proposal) return null;
  return <Box key={proposal.id} proposal={proposal} path={path} variant={variant} projectId={projectId} archived={archived} fileList={fileList} currentRevision={dataOf(manuscript)?.currentRevisionNumber} isDirty={isDirty} t={t} />;
}

function Box({
  proposal, path, variant, projectId, archived, fileList, currentRevision, isDirty, t,
}: {
  proposal: Proposal;
  path?: string;
  variant: 'editor' | 'mobile';
  projectId: string;
  archived: boolean;
  fileList: ReturnType<typeof useManuscript>['fileList'];
  currentRevision: number | undefined;
  isDirty: (path: string) => boolean;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const session = useProposalSession();
  const actions = useProposalActions(proposal);
  const taskKey = useTaskKey(projectId, proposal.taskId);
  const claims = useClaims(projectId, proposal.claimIds);
  const baseNumber = useRevisionNumber(projectId, proposal.status === 'Outdated' ? proposal.baseRevisionId : undefined);
  const changed = useChangedPaths(projectId, proposal, fileList, currentRevision);
  const [openFiles, setOpenFiles] = useState<ReadonlySet<string>>(() => new Set(path ? [path] : proposal.diff.map((entry) => entry.path ?? '')));
  const [dialog, setDialog] = useState<'reject' | 'regenerate' | null>(null);
  const whyId = useId();
  const notice = session.notices.get(proposal.id);
  const bad = badKeys(proposal);
  const citation = citationResult(proposal);
  const status = proposal.status;
  const paths = proposal.diff.map((entry) => entry.path).filter((value): value is string => Boolean(value));
  const dirtyPaths = paths.filter((value) => isDirty(value));
  const entries = path ? [...proposal.diff].sort((a, b) => (a.path === path ? -1 : b.path === path ? 1 : 0)) : proposal.diff;
  const agent = proposal.provenance?.createdBy?.type === 'agent' ? agentLabel(proposal.provenance.createdBy.agent) : agentLabel('writing');
  const task = taskKey ?? t('proposal.taskFallback');

  const why =
    citation.state === 'failed' ? t('proposal.why.citationFailed', { keys: citation.bad.join(', ') })
      : citation.state === 'missing' ? t('proposal.why.citationMissing')
        : dirtyPaths.length ? t('proposal.why.unsaved')
          : undefined;

  const claimGroups = new Map<string, number>();
  for (const claim of claims) claimGroups.set(claim.supportStatus, (claimGroups.get(claim.supportStatus) ?? 0) + 1);
  const firstClaim = proposal.claimIds?.[0];
  const evidenceLink = firstClaim ? `/projects/${encodeURIComponent(projectId)}/evidence/claims/${encodeURIComponent(firstClaim)}` : `/projects/${encodeURIComponent(projectId)}/evidence`;

  const meta = [
    ...(proposal.taskId ? [taskKey ?? ''] : []),
    t('proposal.claims', { count: proposal.claimIds?.length ?? 0 }),
    t('proposal.evidence', { count: proposal.evidenceIds?.length ?? 0 }),
    t('proposal.files', { count: proposal.diff.length }),
  ].filter(Boolean);

  const instruction = t('proposal.regenerateDialog.instruction', {
    task, base: baseNumber ?? '?', current: currentRevision ?? '?', paths: changed.join(', '), summary: proposal.summary ?? '',
  });

  return (
    <section className="ms-proposal" data-status={status} data-variant={variant} data-proposal-box={proposal.id} aria-label={t('proposal.boxLabel', { status })} tabIndex={-1}>
      <header className="ms-proposal__head">
        <span className="ms-proposal__kind">Change Proposal</span>
        <span aria-hidden="true">·</span>
        <span>{agent}</span>
        <span aria-hidden="true">·</span>
        <StatusChip status={status} entity="change-proposal" />
      </header>
      <p className="ms-proposal__meta">
        {meta.map((part, index) => (
          <span key={index}>
            {index > 0 && ' · '}
            {index === 0 && proposal.taskId ? <span className="sires-id">{part}</span> : part}
          </span>
        ))}
      </p>
      {proposal.summary && <p className="ms-proposal__summary">{proposal.summary}</p>}
      {status === 'Outdated' && (
        <p className="ms-proposal__reason">
          {t('proposal.outdatedLead')} <span className="sires-id">{changed.join(', ')}</span> {t('proposal.outdatedTail', { base: baseNumber ?? '?', current: currentRevision ?? '?' })}
        </p>
      )}
      <div className="ms-proposal__diffs">
        {entries.map((entry, index) => {
          const key = entry.path ?? String(index);
          const open = variant === 'mobile' || openFiles.has(key);
          return (
            <FileDiff
              key={key}
              entry={entry}
              bad={bad}
              open={open}
              // The phone has no editor (H21): no “Mở file” there.
              current={variant === 'mobile' || entry.path === path}
              onToggle={variant === 'editor' && entry.path !== path ? () => setOpenFiles((now) => {
                const next = new Set(now);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              }) : undefined}
            />
          );
        })}
      </div>
      <div className="ms-proposal__chips">
        {[...claimGroups].map(([support, count]) => (
          <StatusChip key={support} status={support} entity="claim">
            {claimGroups.size > 1 || count < (proposal.claimIds?.length ?? 0) ? t('proposal.claimCount', { status: support, count }) : t('proposal.claim', { status: support })}
          </StatusChip>
        ))}
        {citation.state === 'passed' && <StatusChip status="Succeeded">{t('proposal.citation.passed', { resolved: citation.resolved, total: citation.total })}</StatusChip>}
        {citation.state === 'failed' && <StatusChip status="Failed">{t('proposal.citation.failed', { keys: citation.bad.join(', ') })}</StatusChip>}
        {citation.state === 'missing' && <StatusChip status="Pending">{t('proposal.citation.missing')}</StatusChip>}
      </div>
      {citation.state === 'failed' && (proposal.citationCheck?.mismatches?.length ?? 0) > 0 && (
        <ul className="ms-proposal__mismatches" aria-label={t('proposal.mismatches')}>
          {proposal.citationCheck!.mismatches!.map((row, index) => (
            <li key={index}>
              {row.key && <span className="sires-id">{row.key}</span>}
              {row.key && row.message ? ': ' : ''}
              {row.message}
            </li>
          ))}
        </ul>
      )}
      {status === 'Proposed' && dirtyPaths.length > 0 && <p className="ms-proposal__warn">{t('proposal.unsavedWarning')}</p>}
      <NoticeLine notice={notice} proposal={proposal} />
      {actions.error && (
        <ErrorState
          error={actions.error.error}
          ns="manuscript"
          title={actions.error.action === 'accept' ? t('proposal.acceptFailed') : t('proposal.rejectFailed')}
          notSaved={t('proposal.nothingApplied')}
          onRetry={actions.error.action === 'accept' ? () => void actions.accept() : undefined}
        />
      )}
      {archived && (status === 'Proposed' || status === 'Outdated') && <p className="ms-proposal__note">{t('proposal.archived')}</p>}
      <div className="ms-proposal__actions">
        {!archived && status === 'Proposed' && (
          <>
            <button
              type="button"
              className="sires-button"
              data-variant="outline"
              data-size={variant === 'editor' ? 'sm' : undefined}
              disabled={Boolean(why) || actions.busy !== null}
              aria-describedby={why ? whyId : undefined}
              onClick={() => void actions.accept()}
            >
              {actions.busy === 'accept' ? t('proposal.accepting') : t('proposal.accept')}
            </button>
            <button type="button" className="sires-button" data-variant="secondary" data-size={variant === 'editor' ? 'sm' : undefined} disabled={actions.busy !== null} onClick={() => setDialog('reject')}>
              {t('proposal.reject')}
            </button>
          </>
        )}
        {!archived && status === 'Outdated' && (
          <button type="button" className="sires-button" data-variant="outline" data-size={variant === 'editor' ? 'sm' : undefined} disabled={actions.busy !== null} onClick={() => setDialog('regenerate')}>
            {t('proposal.regenerate')}
          </button>
        )}
        <Link className="ms-proposal__link" to={evidenceLink}>
          {t('proposal.viewEvidence')}
        </Link>
        {why && !archived && status === 'Proposed' && (
          <span id={whyId} className="ms-proposal__why">
            {why}
          </span>
        )}
      </div>
      {/* Dialogs leave the editor's content DOM (the box is a CodeMirror widget). */}
      {dialog === 'reject' && createPortal(
        <RejectDialog
          busy={actions.busy !== null}
          error={actions.error?.action === 'reject' ? actions.error.error : undefined}
          onClose={() => {
            actions.clearError();
            setDialog(null);
          }}
          onReject={actions.reject}
        />,
        document.body,
      )}
      {dialog === 'regenerate' && createPortal(<RegenerateDialog initial={instruction} task={task} busy={actions.busy === 'regenerate'} onClose={() => setDialog(null)} onSend={actions.regenerate} />, document.body)}
    </section>
  );
}
