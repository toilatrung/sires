// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Inspector of a claim and its review (S04, H6): linked evidence grouped by relation, last verification, verify with
// the shell's long-operation card, accept (Not Assessed disabled; Unsupported/Conflicting confirmed again; the
// rowVersion seen is sent), reject, edit the statement (merge-patch + If-Match, draft store), link, unlink and
// change the relation of evidence. The support label never changes when the claim is accepted (KPI-01).

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  ErrorState, LoadingState, LongOperation, StatusChip, useApi, useDraft, useEvents, useShell, type ApiError,
} from '../../shell';
import { AcceptConfirmDialog, LinkEvidenceDialog, RejectDialog } from './ClaimDialogs';
import { useLoad, useReloadSignal, useResearchObjectEvents, useSingleFlight, toApiError, type Schemas } from './data';
import { EvidenceCard } from './EvidenceCard';
import { AGENT_NAMES, formatWhen, paths, problemDetail, shortId } from './labels';
import { PanelNotFound, TaskKey } from './Panel';

type Relation = Schemas['ClaimEvidenceLink']['relation'];
type Workflow = Schemas['Workflow'];
const RELATIONS: Relation[] = ['supports', 'contradicts', 'context'];

interface Notice {
  title: string;
  error?: ApiError;
  next?: string;
}

/** One linked evidence, loaded with getEvidence (S04: “getEvidence cho từng evidenceLinks”). */
function LinkedEvidence({ projectId, claimId, link, editable, busy, onUnlink, onChangeRelation }: {
  projectId: string; claimId: string; link: Schemas['ClaimEvidenceLink']; editable: boolean; busy: boolean;
  onUnlink: () => void; onChangeRelation: (relation: Relation) => void;
}) {
  const { t } = useTranslation('research');
  const api = useApi();
  const evidence = useLoad(
    () => api.get('/projects/{projectId}/evidence/{evidenceId}', { path: { projectId, evidenceId: link.evidenceId } }).then((result) => result.data),
    [api, projectId, link.evidenceId],
  );
  const [changing, setChanging] = useState(false);
  const [relation, setRelation] = useState<Relation | ''>('');
  useResearchObjectEvents(projectId, ['evidence'], (event) => {
    if (event.objectId === link.evidenceId) evidence.reload();
  });
  useReloadSignal(evidence.reload);

  if (evidence.error) {
    return evidence.error.status === 404
      ? <p className="research-meta">{t('panel.notFound.evidence')}</p>
      : <ErrorState error={evidence.error} ns="research" onRetry={evidence.reload} />;
  }
  if (!evidence.data) return <LoadingState what={t('evidence.loadingOne')} rows={1} />;
  return (
    <EvidenceCard evidence={evidence.data} relation={link.relation}>
      <div className="research-actions">
        <Link className="research-textbutton" to={paths.evidenceItem(projectId, link.evidenceId)}>{t('claim.openEvidence')}</Link>
        {editable && (
          <>
            <button type="button" className="research-textbutton" disabled={busy} onClick={onUnlink}>{t('claim.unlink')}</button>
            <button type="button" className="research-textbutton" disabled={busy} aria-expanded={changing} onClick={() => setChanging((open) => !open)}>
              {t('claim.changeRelation')}
            </button>
          </>
        )}
      </div>
      {editable && changing && (
        <fieldset className="research-fieldset research-fieldset--inline" aria-describedby={`research-relation-${claimId}-${link.evidenceId}`}>
          <legend>{t('claim.newRelation')}</legend>
          {RELATIONS.filter((value) => value !== link.relation).map((value) => (
            <label key={value} className="research-choice">
              <input type="radio" name={`research-relation-${link.evidenceId}`} value={value} checked={relation === value} onChange={() => setRelation(value)} />
              <span>{value}</span>
            </label>
          ))}
          <button type="button" className="sires-button" data-size="sm" disabled={!relation || busy} onClick={() => relation && onChangeRelation(relation)}>
            {t('claim.changeRelationConfirm')}
          </button>
          <span id={`research-relation-${claimId}-${link.evidenceId}`} className="research-reason">{t('claim.changeRelationHow')}</span>
        </fieldset>
      )}
    </EvidenceCard>
  );
}

export function ClaimInspector({ projectId, claimId, onChanged }: { projectId: string; claimId: string; onChanged: () => void }) {
  const { t } = useTranslation('research');
  const api = useApi();
  const { idempotency } = useShell();
  const loaded = useLoad(
    () => api.get('/projects/{projectId}/claims/{claimId}', { path: { projectId, claimId } }).then((result) => ({ claim: result.data, etag: result.etag })),
    [api, projectId, claimId],
  );
  const draft = useDraft('claim.statement');
  const [editing, setEditing] = useState(() => draft.value !== '');
  const [emptyStatement, setEmptyStatement] = useState(false);
  const [dialog, setDialog] = useState<'accept' | 'reject' | 'link' | undefined>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | undefined>();
  const [verifying, setVerifying] = useState<{ workflow: Workflow; refreshError?: ApiError } | undefined>();
  const [verifyEnded, setVerifyEnded] = useState<Workflow | undefined>();
  const [relink, setRelink] = useState<{ evidenceId: string; relation: Relation; error: ApiError } | undefined>();
  const once = useSingleFlight();

  const reloadAll = () => {
    loaded.reload();
    onChanged();
  };
  useResearchObjectEvents(projectId, ['claim'], (event) => {
    if (event.objectId === claimId) loaded.reload();
  });
  useReloadSignal(loaded.reload);

  const refreshWorkflow = async (workflowId: string) => {
    try {
      const { data } = await api.get('/workflows/{workflowId}', { path: { workflowId } });
      if (data.status === 'Succeeded') {
        setVerifying(undefined);
        reloadAll();
      } else if (data.status === 'Failed' || data.status === 'Cancelled') {
        setVerifying(undefined);
        setVerifyEnded(data);
        reloadAll();
      } else {
        setVerifying({ workflow: data });
      }
    } catch (error) {
      setVerifying((current) => (current ? { ...current, refreshError: toApiError(error) } : current));
    }
  };
  useEvents({ types: ['workflow.status_changed'], projectId }, (event) => {
    if (verifying && event.objectId === verifying.workflow.id) void refreshWorkflow(verifying.workflow.id);
  });

  /** One request per click; a retry after a network error or 5xx reuses the key (EC44). */
  const command = (title: string, send: () => Promise<unknown>, after?: () => void) => once(async () => {
    setBusy(true);
    setNotice(undefined);
    try {
      await send();
      after?.();
      reloadAll();
    } catch (error) {
      const failure = toApiError(error);
      // 409 / 400 / 412: the claim changed or was decided elsewhere — reload and report, never resend (EC19).
      setNotice({ title, error: failure, next: failure.status && failure.status < 500 ? t('claim.reloaded') : undefined });
      if (failure.status && failure.status < 500) reloadAll();
    } finally {
      setBusy(false);
      setDialog(undefined);
    }
  });

  if (loaded.error?.status === 404) return <PanelNotFound kind="claim" />;
  if (loaded.error && !loaded.data) {
    return <div className="research-panel__section"><ErrorState error={loaded.error} ns="research" onRetry={loaded.reload} /></div>;
  }
  if (!loaded.data) return <div className="research-panel__section"><LoadingState what={t('claim.loadingOne')} rows={2} /></div>;

  const { claim, etag } = loaded.data;
  const path = { projectId, claimId };
  const draftClaim = claim.approvalStatus === 'Draft';
  const assessed = claim.supportStatus !== 'Not Assessed';
  const needsConfirm = claim.supportStatus === 'Unsupported' || claim.supportStatus === 'Conflicting';

  const accept = () => command(t('claim.acceptRefused'), () => idempotency.run(`acceptClaim:${claimId}`, (key) =>
    api.post('/projects/{projectId}/claims/{claimId}/accept', { path, body: { rowVersion: claim.rowVersion }, idempotencyKey: key })));
  const reject = (reason: string) => command(t('claim.rejectRefused'), () => idempotency.run(`rejectClaim:${claimId}`, (key) =>
    api.post('/projects/{projectId}/claims/{claimId}/reject', { path, body: reason ? { reason } : {}, idempotencyKey: key })));
  const verify = () => once(async () => {
    setBusy(true);
    setNotice(undefined);
    setVerifyEnded(undefined);
    try {
      const { data } = await idempotency.run(`verifyClaim:${claimId}`, (key) => api.post('/projects/{projectId}/claims/{claimId}/verify', { path, idempotencyKey: key }));
      setVerifying({ workflow: data });
    } catch (error) {
      const failure = toApiError(error);
      setNotice({ title: failure.code === 'active_workflow_exists' ? t('claim.verifyRunning') : t('claim.verifyRefused'), error: failure });
    } finally {
      setBusy(false);
    }
  });
  const unlink = (evidenceId: string) => command(t('claim.unlinkRefused'), () =>
    api.delete('/projects/{projectId}/claims/{claimId}/evidence-links/{evidenceId}', { path: { ...path, evidenceId } }));
  const link = (evidenceId: string, relation: Relation) =>
    api.post('/projects/{projectId}/claims/{claimId}/evidence-links', { path, body: { evidenceId, relation } });
  /** The contract has no “change relation”: unlink, then link again; a failed second step keeps “Liên kết lại” (EC22). */
  const changeRelation = (evidenceId: string, relation: Relation) => once(async () => {
    setBusy(true);
    setNotice(undefined);
    setRelink(undefined);
    try {
      await api.delete('/projects/{projectId}/claims/{claimId}/evidence-links/{evidenceId}', { path: { ...path, evidenceId } });
    } catch (error) {
      setNotice({ title: t('claim.unlinkRefused'), error: toApiError(error) });
      setBusy(false);
      reloadAll();
      return;
    }
    try {
      await link(evidenceId, relation);
    } catch (error) {
      setRelink({ evidenceId, relation, error: toApiError(error) });
    }
    setBusy(false);
    reloadAll();
  });
  const retryLink = () => once(async () => {
    if (!relink) return;
    setBusy(true);
    try {
      await link(relink.evidenceId, relink.relation);
      setRelink(undefined);
    } catch (error) {
      setRelink({ ...relink, error: toApiError(error) });
    }
    setBusy(false);
    reloadAll();
  });

  const startEditing = () => {
    if (!draft.value) draft.setValue(claim.statement);
    setEmptyStatement(false);
    setEditing(true);
  };
  const cancelEditing = () => {
    draft.clear();
    setEditing(false);
    setEmptyStatement(false);
  };
  const saveStatement = async (event: FormEvent) => {
    event.preventDefault();
    const statement = draft.value.trim();
    if (!statement) {
      setEmptyStatement(true);
      return;
    }
    setEmptyStatement(false);
    await once(async () => {
      setBusy(true);
      setNotice(undefined);
      try {
        await api.patch('/projects/{projectId}/claims/{claimId}', {
          path, body: { statement }, contentType: 'application/merge-patch+json', ifMatch: etag ?? `"${claim.rowVersion}"`,
        });
        draft.clear();
        setEditing(false);
      } catch (error) {
        const failure = toApiError(error);
        // 412: changed elsewhere — reload, keep what the Researcher typed (EC20).
        setNotice({ title: failure.status === 412 ? t('claim.changedElsewhere') : t('claim.editRefused'), error: failure, next: t('claim.editKept') });
      } finally {
        setBusy(false);
        reloadAll();
      }
    });
  };

  const groups = RELATIONS.map((relation) => ({ relation, links: (claim.evidenceLinks ?? []).filter((item) => item.relation === relation) }))
    .filter((group) => group.links.length > 0 || (claim.supportStatus === 'Conflicting' && group.relation !== 'context'));
  const last = claim.lastVerification;

  return (
    <>
      {claim.supportStatus === 'Conflicting' && <p className="research-panel__note">{t('claim.conflictingNote')}</p>}
      <div className="research-panel__section research-stack">
        <p className="research-claim__statement">{claim.statement}</p>
        <span className="research-chips">
          <StatusChip status={claim.supportStatus} entity="claim" />
          <StatusChip status={claim.approvalStatus} entity="claim" />
          {claim.needsReview && <StatusChip status="needs review" />}
          <span className="research-meta sires-num">
            {last ? t('claim.lastVerification', { when: formatWhen(last.at), outcome: last.outcome }) : t('claim.neverVerified')}
            <TaskKey taskId={claim.taskId} prefix=" · " />
            {claim.artifactVersionId && <> · {t('claim.sourceVersion')} <span className="sires-id">{shortId(claim.artifactVersionId)}</span></>}
          </span>
        </span>
        {draftClaim && (
          <div className="research-actions">
            <button
              type="button"
              className="sires-button"
              data-variant="primary"
              disabled={!assessed || busy}
              aria-describedby={!assessed ? 'research-accept-reason' : undefined}
              onClick={() => (needsConfirm ? setDialog('accept') : void accept())}
            >
              {t('claim.accept')}
            </button>
            {!assessed && <span id="research-accept-reason" className="research-reason">{t('claim.verifyFirst')}</span>}
            <button type="button" className="sires-button" disabled={busy} onClick={() => setDialog('reject')}>{t('claim.reject')}</button>
            <button type="button" className="sires-button" disabled={busy || Boolean(verifying)} onClick={() => void verify()}>
              {verifyEnded ? t('claim.verifyAgain') : t('claim.verify')}
            </button>
            {!editing && <button type="button" className="research-textbutton" disabled={busy} onClick={startEditing}>{t('claim.edit')}</button>}
            <button type="button" className="research-textbutton" disabled={busy} onClick={() => setDialog('link')}>{t('claim.link')}</button>
          </div>
        )}
        {claim.approvalStatus === 'Accepted' && !editing && (
          <div className="research-actions">
            <button type="button" className="research-textbutton" disabled={busy} onClick={startEditing}>{t('claim.edit')}</button>
          </div>
        )}
        {claim.approvalStatus === 'Rejected' && <p className="research-meta">{t('claim.rejectedReadOnly')}</p>}
        {editing && claim.approvalStatus !== 'Rejected' && (
          <form className="research-stack" onSubmit={(event) => void saveStatement(event)}>
            <label className="sires-field">
              <span className="sires-field__label">{t('claim.statementLabel')}</span>
              <textarea
                className="sires-input"
                rows={3}
                value={draft.value}
                aria-invalid={emptyStatement || undefined}
                aria-describedby={emptyStatement ? 'research-statement-error' : undefined}
                onChange={(event) => draft.setValue(event.currentTarget.value)}
              />
            </label>
            {emptyStatement && <p id="research-statement-error" className="research-field-error">{t('claim.statementEmpty')}</p>}
            {claim.approvalStatus === 'Accepted' && <p className="research-warning">{t('claim.editAcceptedWarning')}</p>}
            <div className="research-actions">
              <button type="submit" className="sires-button" disabled={busy}>{t('claim.saveStatement')}</button>
              <button type="button" className="research-textbutton" onClick={cancelEditing}>{t('claim.cancelEdit')}</button>
            </div>
          </form>
        )}
        {verifying && (
          <div className="research-stack">
            <LongOperation
              title={t('claim.verifyingTitle')}
              actor={AGENT_NAMES.verification}
              startedAt={verifying.workflow.startedAt ?? verifying.workflow.createdAt}
              step={verifying.workflow.steps?.length ? {
                current: Math.min(verifying.workflow.steps.length, verifying.workflow.steps.filter((step) => step.status === 'Succeeded').length + 1),
                total: verifying.workflow.steps.length,
              } : undefined}
            />
            <Link className="research-textbutton" to={paths.workflow(projectId, verifying.workflow.id)}>{t('workflow.open')}</Link>
            {verifying.refreshError && (
              <ErrorState error={verifying.refreshError} ns="research" title={t('workflow.refreshFailed')} onRetry={() => void refreshWorkflow(verifying.workflow.id)} />
            )}
          </div>
        )}
        {verifyEnded && (
          <div role="alert" className="sires-error">
            <strong className="sires-error__title">{t('claim.verifyFailed', { status: verifyEnded.status })}</strong>
            <span className="sires-error__footer">
              <Link to={paths.workflow(projectId, verifyEnded.id)}>{t('workflow.open')}</Link>
              {verifyEnded.lastError?.code && <span className="sires-error__code">{verifyEnded.lastError.code}</span>}
            </span>
          </div>
        )}
        {notice && <ErrorState error={notice.error} ns="research" title={notice.title} description={problemDetail(notice.error)} next={notice.next} />}
        {relink && (
          <ErrorState
            error={relink.error}
            ns="research"
            title={t('claim.relinkFailed', { relation: relink.relation })}
            description={problemDetail(relink.error)}
            actions={<button type="button" className="sires-button" data-size="sm" disabled={busy} onClick={() => void retryLink()}>{t('claim.relink')}</button>}
          />
        )}
      </div>
      <div className="research-panel__section research-stack">
        {groups.length === 0 && <p className="research-meta">{t('claim.noEvidence')}</p>}
        {groups.map((group) => (
          <section key={group.relation} className="research-stack" aria-labelledby={`research-group-${group.relation}`}>
            <h3 id={`research-group-${group.relation}`} className="research-subhead" data-relation={group.relation}>
              {t(`relation.group.${group.relation}`, { count: group.links.length })}
            </h3>
            {group.links.length === 0 && <p className="research-meta">{t('claim.groupEmpty')}</p>}
            {group.links.map((item) => (
              <LinkedEvidence
                key={item.evidenceId}
                projectId={projectId}
                claimId={claimId}
                link={item}
                editable={draftClaim}
                busy={busy}
                onUnlink={() => void unlink(item.evidenceId)}
                onChangeRelation={(relation) => void changeRelation(item.evidenceId, relation)}
              />
            ))}
          </section>
        ))}
      </div>
      {dialog === 'accept' && <AcceptConfirmDialog claim={claim} busy={busy} onConfirm={() => void accept()} onCancel={() => setDialog(undefined)} />}
      {dialog === 'reject' && <RejectDialog claim={claim} busy={busy} onConfirm={(reason) => void reject(reason)} onCancel={() => setDialog(undefined)} />}
      {dialog === 'link' && (
        <LinkEvidenceDialog projectId={projectId} claim={claim} onCancel={() => setDialog(undefined)} onLinked={() => { setDialog(undefined); reloadAll(); }} />
      )}
    </>
  );
}
