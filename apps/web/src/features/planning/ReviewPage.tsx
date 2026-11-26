// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Task review (PID-00082 S06, reference TaskReview, UX-TASK-006): outputs of the Task with the latest version and
// accept / reject of that version (research operations), acceptance criteria ticked in the browser, “Nghiệm thu”
// only when every criterion is ticked and every required output has an Accepted version; return with a ReasonCode
// and feedback (draft store); cancel with a confirmation. A Task not In Review goes back to the Plan panel.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router';
import { ApiError, ErrorState, isApiError, LoadingState, StatusChip, useApi, useDraft, useEvents, useRefreshNavigation, useShell } from '../../shell';
import { ConfirmDialog, itemsOf, keyOf, useResource, type Schemas, type Task } from './common';
import { useArchived } from './PlanPage';
import { AGENT_NAMES } from './TaskPanel';

type Artifact = Schemas['Artifact'];

export const REASON_CODES: readonly Schemas['ReasonCode'][] = [
  'missing_input',
  'quality_insufficient',
  'scope_changed',
  'wrong_approach',
  'provider_error',
  'dependency_changed',
  'other',
];

export function ReviewPage() {
  const { projectId = '', taskId = '' } = useParams();
  const { t } = useTranslation('planning');
  const api = useApi();
  const task = useResource(() => api.get('/projects/{projectId}/tasks/{taskId}', { path: { projectId, taskId } }), [api, projectId, taskId]);
  useEvents({ types: ['task.status_changed'], projectId }, (event) => {
    if (event.objectId === taskId) void task.reload();
  });

  if (task.status === 'loading' && !task.data) return <LoadingState what={t('review.loading')} />;
  if (!task.data) return <ErrorState error={task.error} title={t('panel.loadFailed')} onRetry={() => void task.reload()} />;
  if (task.data.status !== 'In Review') {
    return <Navigate to={`/projects/${encodeURIComponent(projectId)}/plan?task=${encodeURIComponent(taskId)}`} replace />;
  }
  return <Review projectId={projectId} task={task.data} onChanged={task.reload} />;
}

function Review({ projectId, task, onChanged }: { projectId: string; task: Task; onChanged: () => Promise<void> }) {
  const { t } = useTranslation('planning');
  const api = useApi();
  const { idempotency } = useShell();
  const refreshNavigation = useRefreshNavigation();
  const archived = useArchived(projectId);
  const definition = task.currentDefinition;
  const allowed = new Set(task.allowedActions ?? []);
  const artifacts = useResource(() => api.get('/projects/{projectId}/artifacts', { path: { projectId }, query: { taskId: task.id } }), [api, projectId, task.id]);
  const workflows = useResource(() => api.get('/workflows', { query: { projectId, taskId: task.id } }), [api, projectId, task.id]);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [reasonCode, setReasonCode] = useState<Schemas['ReasonCode'] | ''>('');
  const feedback = useDraft(`review.${task.id}.feedback`);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancelReason = useDraft(`review.${task.id}.cancelReason`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; error: ApiError }>();

  const criteria = definition.acceptanceCriteria;
  const required = definition.expectedOutputs.filter((o) => o.required);
  const items = itemsOf<Artifact>(artifacts.data);
  const artifactFor = (type: Schemas['ArtifactType']) => items.filter((a) => a.type === type);
  const missing = required.filter((o) => !artifactFor(o.artifactType).some((a) => a.currentAcceptedVersionId));
  const allTicked = criteria.every((c) => ticked.has(c.id));
  const canAccept = allTicked && missing.length === 0 && artifacts.status === 'ready' && allowed.has('review') && !archived;
  const criteriaResults = criteria.map((c) => ({ criterionId: c.id, met: ticked.has(c.id) }));
  const latestWorkflow = [...itemsOf<Schemas['Workflow']>(workflows.data)].sort((a, b) => (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt))[0];
  const path = { projectId, taskId: task.id };

  const act = async (title: string, send: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(undefined);
    try {
      await send();
      after?.();
      void refreshNavigation();
    } catch (err) {
      setError({ title, error: isApiError(err) ? err : new ApiError('network') });
    } finally {
      setBusy(false);
      await onChanged();
    }
  };

  const blockedReason = !allTicked && missing.length > 0
    ? t('review.needBoth', { count: criteria.length })
    : !allTicked
      ? t('review.needCriteria', { count: criteria.length })
      : missing.length > 0
        ? t('review.needOutputs')
        : undefined;

  return (
    <div className="planning-page planning-review">
      <div className="planning-main">
        <header className="planning-header">
          <h1 className="planning-title">
            {definition.title} <StatusChip status={task.status} entity="task" />
          </h1>
          <p className="planning-muted">
            <span className="sires-id">{keyOf(definition)}</span>
            {latestWorkflow && (
              <>
                {' · '}
                <Link to={`/projects/${encodeURIComponent(projectId)}/activity/workflows/${encodeURIComponent(latestWorkflow.id)}`}>
                  {t('review.workflow', { id: latestWorkflow.id.slice(0, 8) })}
                </Link>
              </>
            )}
            {definition.proposedAgent && <> · {AGENT_NAMES[definition.proposedAgent]}</>}
            {' · '}
            <Link to={`/projects/${encodeURIComponent(projectId)}/plan?task=${encodeURIComponent(task.id)}`}>{t('review.openInPlan')}</Link>
          </p>
        </header>

        <section className="planning-block" aria-labelledby="planning-outputs">
          <h2 id="planning-outputs" className="planning-section-title">{t('review.outputs')}</h2>
          {artifacts.status === 'loading' && <LoadingState what={t('review.outputs')} rows={1} />}
          {artifacts.status === 'error' && <ErrorState error={artifacts.error} title={t('review.outputsFailed')} onRetry={() => void artifacts.reload()} />}
          {artifacts.status === 'ready' && items.length === 0 && <p className="planning-muted">{t('review.noOutputs')}</p>}
          {items.map((artifact) => (
            <Output key={artifact.id} projectId={projectId} artifact={artifact} archived={archived} onChanged={() => void artifacts.reload()} />
          ))}
        </section>
      </div>

      <aside className="planning-approval" aria-label={t('review.decision')}>
        <section aria-labelledby="planning-criteria">
          <h2 id="planning-criteria" className="planning-section-title">
            {t('review.criteria', { done: criteria.filter((c) => ticked.has(c.id)).length, total: criteria.length })}
          </h2>
          <ul className="planning-list planning-list--plain">
            {criteria.map((c) => (
              <li key={c.id}>
                <label className="planning-checkbox">
                  <input
                    type="checkbox"
                    checked={ticked.has(c.id)}
                    disabled={archived}
                    onChange={(e) => {
                      const next = new Set(ticked);
                      if (e.currentTarget.checked) next.add(c.id);
                      else next.delete(c.id);
                      setTicked(next);
                    }}
                  />
                  {c.text}
                </label>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="planning-required">
          <h3 id="planning-required" className="planning-block__title">{t('review.required')}</h3>
          <ul className="planning-list">
            {required.map((output, i) => {
              const list = artifactFor(output.artifactType);
              const accepted = list.some((a) => a.currentAcceptedVersionId);
              const latest = list[0]?.latestVersion;
              return (
                <li key={i} data-accepted={accepted ? '' : undefined}>
                  <span className="sires-id">{output.artifactType}</span>:{' '}
                  {latest ? `v${latest.versionNumber} ${latest.status ?? ''}` : t('review.noVersion')}
                  {' — '}
                  {accepted ? t('review.hasAccepted') : t('review.noAccepted')}
                </li>
              );
            })}
          </ul>
        </section>
        {error && <ErrorState error={error.error} title={error.title} />}
        <button
          type="button"
          className="sires-button"
          data-variant="primary"
          disabled={busy || !canAccept}
          onClick={() =>
            void act(t('review.acceptFailed'), () =>
              idempotency.run(`reviewTask:${task.id}:accepted`, (key) =>
                api.post('/projects/{projectId}/tasks/{taskId}/reviews', { path, idempotencyKey: key, body: { outcome: 'accepted', criteriaResults } }),
              ),
            )
          }
        >
          {t('review.accept')}
        </button>
        {blockedReason && <p className="planning-muted">{blockedReason}</p>}
        {archived && <p className="planning-muted">{t('panel.archived')}</p>}

        <section className="planning-block" aria-labelledby="planning-return">
          <h3 id="planning-return" className="planning-block__title">{t('review.returnTitle')}</h3>
          <label className="sires-field">
            <span className="sires-field__label">{t('review.reasonCode')}</span>
            <select className="sires-input" value={reasonCode} onChange={(e) => setReasonCode(e.currentTarget.value as Schemas['ReasonCode'])}>
              <option value="">{t('review.chooseReason')}</option>
              {REASON_CODES.map((code) => (
                <option key={code} value={code}>
                  {t(`review.reason.${code}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="sires-field">
            <span className="sires-field__label">{t('review.feedback')}</span>
            <textarea className="sires-input" rows={3} value={feedback.value} onChange={(e) => feedback.setValue(e.currentTarget.value)} />
          </label>
          <div className="planning-row">
            <button
              type="button"
              className="sires-button"
              data-variant="secondary"
              disabled={busy || archived || !allowed.has('review') || !reasonCode || !feedback.value.trim()}
              onClick={() =>
                void act(
                  t('review.returnFailed'),
                  () =>
                    idempotency.run(`reviewTask:${task.id}:returned`, (key) =>
                      api.post('/projects/{projectId}/tasks/{taskId}/reviews', {
                        path,
                        idempotencyKey: key,
                        body: { outcome: 'returned', criteriaResults, reasonCode: reasonCode || undefined, feedback: feedback.value.trim() },
                      }),
                    ),
                  () => feedback.clear(),
                )
              }
            >
              {t('review.return')}
            </button>
            {allowed.has('cancel') && (
              <button type="button" className="sires-button" data-variant="danger" disabled={busy || archived} onClick={() => setConfirmCancel(true)}>
                {t('panel.cancel')}
              </button>
            )}
          </div>
        </section>
      </aside>

      {confirmCancel && (
        <ConfirmDialog
          title={t('panel.cancelTitle', { key: keyOf(definition) })}
          confirmLabel={cancelReason.value.trim() ? t('panel.cancel') : t('panel.reasonFirst')}
          cancelLabel={t('panel.keep')}
          busy={busy || !cancelReason.value.trim()}
          onCancel={() => setConfirmCancel(false)}
          onConfirm={() =>
            void act(
              t('panel.commandFailed'),
              () =>
                idempotency.run(`cancelTask:${task.id}`, (key) =>
                  api.post('/projects/{projectId}/tasks/{taskId}/cancel', { path, idempotencyKey: key, body: { reason: cancelReason.value.trim() } }),
                ),
              () => {
                cancelReason.clear();
                setConfirmCancel(false);
              },
            )
          }
        >
          <p>{t('panel.cancelConsequence')}</p>
          <label className="sires-field">
            <span className="sires-field__label">{t('panel.reason')}</span>
            <textarea className="sires-input" rows={2} value={cancelReason.value} onChange={(e) => cancelReason.setValue(e.currentTarget.value)} />
          </label>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** One output: latest version with its chip and a short summary, accept or reject that version (EC32). */
function Output({ projectId, artifact, archived, onChanged }: { projectId: string; artifact: Artifact; archived: boolean; onChanged: () => void }) {
  const { t } = useTranslation('planning');
  const api = useApi();
  const { idempotency } = useShell();
  const latest = artifact.latestVersion;
  const versionId = latest?.id;
  const detail = useResource(
    () =>
      versionId
        ? api.get('/projects/{projectId}/artifacts/{artifactId}/versions/{versionId}', { path: { projectId, artifactId: artifact.id, versionId } })
        : Promise.resolve({ data: undefined }),
    [api, projectId, artifact.id, versionId],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const base = `/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifact.id)}`;
  const decide = async (decision: 'accept' | 'reject') => {
    if (!versionId) return;
    setBusy(true);
    setError(undefined);
    try {
      const pathParams = { projectId, artifactId: artifact.id, versionId };
      await idempotency.run(`${decision}ArtifactVersion:${versionId}`, (key) =>
        decision === 'accept'
          ? api.post('/projects/{projectId}/artifacts/{artifactId}/versions/{versionId}/accept', { path: pathParams, idempotencyKey: key, body: {} })
          : api.post('/projects/{projectId}/artifacts/{artifactId}/versions/{versionId}/reject', { path: pathParams, idempotencyKey: key, body: {} }),
      );
      onChanged();
    } catch (err) {
      setError(isApiError(err) ? err : new ApiError('network'));
    } finally {
      setBusy(false);
    }
  };
  const summary = detail.data?.content ? detail.data.content.slice(0, 600) : undefined;
  const status = detail.data?.status ?? latest?.status;
  return (
    <article className="planning-output" aria-labelledby={`planning-output-${artifact.id}`}>
      <h3 id={`planning-output-${artifact.id}`} className="planning-block__title">
        <span className="sires-id">{artifact.type}</span> “{artifact.title}”{latest?.versionNumber !== undefined && ` v${latest.versionNumber}`}{' '}
        {status && <StatusChip status={status} entity="artifact" />}
      </h3>
      {detail.status === 'loading' && <LoadingState what={t('review.summary')} rows={1} />}
      {summary && <p className="planning-output__summary">{summary}</p>}
      {error && <ErrorState error={error} title={t('review.decisionFailed')} />}
      <div className="planning-row">
        {status === 'Draft' && (
          <>
            <button type="button" className="sires-button" data-variant="primary" data-size="sm" disabled={busy || archived} onClick={() => void decide('accept')}>
              {t('review.acceptVersion')}
            </button>
            <button type="button" className="sires-button" data-variant="secondary" data-size="sm" disabled={busy || archived} onClick={() => void decide('reject')}>
              {t('review.rejectVersion')}
            </button>
          </>
        )}
        <Link to={base}>{t('review.openArtifact')}</Link>
        <Link to={`${base}?view=evidence`}>{t('review.openEvidence')}</Link>
        {latest?.versionNumber !== undefined && latest.versionNumber > 1 && (
          <Link to={`${base}?compare=${latest.versionNumber - 1}-${latest.versionNumber}`}>{t('review.compare', { from: latest.versionNumber - 1, to: latest.versionNumber })}</Link>
        )}
      </div>
    </article>
  );
}
