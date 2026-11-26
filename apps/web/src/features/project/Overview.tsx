// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Overview of a project (PID-00058 S02; H12, H13): header, research context with open assumptions, Plan progress per
// Phase, active Tasks, work waiting for the Researcher, the manuscript build, and the three banners of the reference
// screen (no Plan baseline, Archived, interrupted workflow).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ErrorState, LoadingState, StatusChip, formatDate, formatTime, isApiError, useApi, useShell, type ApiError } from '../../shell';
import { NS, planOrNull, useResource, workflowHref, type Schemas } from './shared';

type Project = Schemas['ResearchProject'];
type SharedContext = Schemas['SharedContextView'];
type Task = Schemas['Task'];
type PlanVersion = Schemas['PlanVersion'];
type Workflow = Schemas['Workflow'];
type Build = Schemas['Build'];

const ACTIVE: readonly string[] = ['In Progress', 'Queued', 'Waiting for User', 'Needs Review'];

interface Data {
  project: Project;
  context: SharedContext;
  baseline: PlanVersion | null;
  tasks: Task[];
  pending: Schemas['PendingAction'][];
  build: Build | null | 'none' | 'error';
  interrupted: Workflow | null;
}

async function loadOverview(api: ReturnType<typeof useApi>, projectId: string): Promise<Data> {
  const path = { projectId };
  const [project, context, plan, tasks, pending, workflows] = await Promise.all([
    api.get('/projects/{projectId}', { path }),
    api.get('/projects/{projectId}/shared-context', { path }),
    planOrNull(api, projectId),
    api.get('/projects/{projectId}/tasks', { path }),
    api.get('/pending-actions', { query: { projectId, status: 'Open', limit: 200 } }),
    api.get('/workflows', { query: { projectId, status: ['Interrupted'] } }),
  ]);
  const baselineId = plan?.baselineVersionId;
  const baseline = baselineId ? (await api.get('/projects/{projectId}/plan/versions/{planVersionId}', { path: { projectId, planVersionId: baselineId } })).data : null;
  // Manuscript block: 404 = not initialised; any other failure shows “—” and does not block Overview (EC05).
  let build: Data['build'];
  try {
    build = (await api.get('/projects/{projectId}/manuscript', { path })).data.latestBuild ?? null;
  } catch (error) {
    build = isApiError(error) && error.status === 404 ? 'none' : 'error';
  }
  return {
    project: project.data,
    context: context.data,
    baseline,
    tasks: tasks.data.items ?? [],
    pending: pending.data.items ?? [],
    build,
    interrupted: (workflows.data.items ?? [])[0] ?? null,
  };
}

export function OverviewScreen() {
  const { t } = useTranslation(NS);
  const { projectId = '' } = useParams();
  const api = useApi();
  const resource = useResource(() => loadOverview(api, projectId), [projectId]);
  const [editing, setEditing] = useState(false);
  const [reopenError, setReopenError] = useState<ApiError | null>(null);

  if (resource.value.state === 'loading') return <LoadingState what={t('overview.title')} />;
  if (resource.value.state === 'error') return <ErrorState error={resource.value.error as ApiError} ns={NS} onRetry={() => void resource.reload()} />;
  const data = resource.value.data;
  const archived = data.project.status === 'Archived';

  const reopen = async () => {
    setReopenError(null);
    try {
      await api.post('/projects/{projectId}/unarchive', { path: { projectId } });
      await resource.reload();
    } catch (error) {
      setReopenError(error as ApiError);
    }
  };

  return (
    <div className="sires-project">
      {archived && (
        <div role="status" className="sires-project__banner" data-tone="archived">
          <div>
            <strong>{t('overview.archived.title')}</strong> {t('overview.archived.body')}
          </div>
          <button type="button" className="sires-button" onClick={() => void reopen()}>
            {t('overview.archived.reopen')}
          </button>
        </div>
      )}
      {reopenError && <ErrorState error={reopenError} ns={NS} notSaved={t('overview.archived.notReopened')} />}
      {data.interrupted && <RecoveryBanner projectId={projectId} workflow={data.interrupted} tasks={data.tasks} />}

      <header className="sires-project__head">
        <h1 className="sires-project__title">{data.project.name}</h1>
        <p className="sires-project__meta">
          {t('overview.meta', { created: formatDate(data.project.createdAt), last: formatTime(data.project.lastActivityAt) })}
        </p>
      </header>

      <div className="sires-project__grid">
        <section className="sires-project__card" aria-labelledby="sires-overview-context">
          <div className="sires-project__card-head">
            <h2 id="sires-overview-context" className="sires-project__card-title">
              {t('overview.context.title')}
            </h2>
            <button type="button" className="sires-button" disabled={archived || editing} title={archived ? t('overview.archived.readOnly') : undefined} onClick={() => setEditing(true)}>
              {t('overview.context.edit')}
            </button>
          </div>
          {archived && <p className="sires-project__hint">{t('overview.archived.readOnly')}</p>}
          {editing && data.context.researchContext ? (
            <ContextForm
              projectId={projectId}
              current={data.context.researchContext}
              onClose={() => setEditing(false)}
              onSaved={(version) => {
                setEditing(false);
                resource.setData((d) => ({ ...d, context: { ...d.context, researchContext: version } }));
              }}
              onConflict={() => void resource.reload()}
            />
          ) : (
            <ContextView context={data.context} />
          )}
        </section>

        <section className="sires-project__card" aria-labelledby="sires-overview-plan">
          {data.baseline ? (
            <>
              <div className="sires-project__card-head">
                <h2 id="sires-overview-plan" className="sires-project__card-title">
                  {t('overview.plan.title', { version: data.baseline.versionNumber })} <StatusChip status={data.baseline.status} />
                </h2>
                <Link className="sires-project__link" to={`/projects/${projectId}/plan`}>
                  {t('overview.plan.open')}
                </Link>
              </div>
              <PhaseProgress baseline={data.baseline} tasks={data.tasks} />
              <ActiveTasks projectId={projectId} tasks={data.tasks} />
            </>
          ) : (
            <div className="sires-project__empty">
              <h2 id="sires-overview-plan" className="sires-project__card-title">
                {t('overview.noPlan.title')}
              </h2>
              <p>{t('overview.noPlan.body')}</p>
              <Link className="sires-button" data-variant="primary" to={`/projects/${projectId}/chat`}>
                {t('overview.noPlan.action')}
              </Link>
            </div>
          )}
        </section>

        <section className="sires-project__card" aria-labelledby="sires-overview-pending">
          <h2 id="sires-overview-pending" className="sires-project__card-title">
            {t('overview.pending.title', { count: data.pending.length })}
          </h2>
          {data.pending.length ? (
            <ul className="sires-project__list">
              {data.pending.slice(0, 5).map((p) => (
                <li key={p.id}>{p.deepLink ? <Link to={p.deepLink}>{p.title ?? p.kind}</Link> : (p.title ?? p.kind)}</li>
              ))}
            </ul>
          ) : (
            <p className="sires-project__hint">{t('overview.pending.none')}</p>
          )}
        </section>

        <section className="sires-project__card" aria-labelledby="sires-overview-manuscript">
          <div className="sires-project__card-head">
            <h2 id="sires-overview-manuscript" className="sires-project__card-title">
              {t('overview.manuscript.title')}
            </h2>
            <Link className="sires-project__link" to={`/projects/${projectId}/manuscript`}>
              {t('overview.manuscript.open')}
            </Link>
          </div>
          <p>
            <BuildLine build={data.build} />
          </p>
          {(() => {
            const proposals = data.pending.filter((p) => p.kind === 'manuscript_change_proposal').length;
            return proposals ? <p className="sires-project__hint">{t('overview.manuscript.proposals', { count: proposals })}</p> : null;
          })()}
        </section>
      </div>
    </div>
  );
}

function ContextView({ context }: { context: SharedContext }) {
  const { t } = useTranslation(NS);
  const rc = context.researchContext;
  const assumptions = (context.activeContextItems ?? []).filter((item) => item.kind === 'assumption' && item.status === 'Active');
  if (!rc) return <p className="sires-project__hint">{t('overview.context.none')}</p>;
  return (
    <dl className="sires-project__facts">
      <dt>{t('overview.context.question')}</dt>
      <dd>{rc.researchQuestion}</dd>
      <dt>{t('overview.context.objectives')}</dt>
      <dd>{rc.objectives?.length ? rc.objectives.join('; ') : '—'}</dd>
      <dt>{t('overview.context.constraints')}</dt>
      <dd>{rc.constraints?.length ? rc.constraints.join('; ') : '—'}</dd>
      <dt>{t('overview.context.assumptions')}</dt>
      <dd>
        {assumptions.length ? (
          <ul className="sires-project__list">
            {assumptions.map((item) => (
              <li key={item.id}>
                <span className="sires-chip" data-tone="warning-flag">
                  {t('overview.context.assumptionChip')}
                </span>{' '}
                {contentText(item.content)}
              </li>
            ))}
          </ul>
        ) : (
          '—'
        )}
      </dd>
    </dl>
  );
}

/** Text of a context item (content is a free-form object in the contract). */
export function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object') {
    const text = (content as { text?: unknown; statement?: unknown }).text ?? (content as { statement?: unknown }).statement;
    if (typeof text === 'string') return text;
  }
  return JSON.stringify(content);
}

const lines = (value: string) =>
  value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

/** Edit the research context: a new version based on the current one, one Idempotency-Key per save (EC06). */
function ContextForm({ projectId, current, onClose, onSaved, onConflict }: { projectId: string; current: Schemas['ResearchContextVersion']; onClose: () => void; onSaved: (v: Schemas['ResearchContextVersion']) => void; onConflict: () => void }) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const { idempotency } = useShell();
  const [question, setQuestion] = useState(current.researchQuestion);
  const [objectives, setObjectives] = useState((current.objectives ?? []).join('\n'));
  const [constraints, setConstraints] = useState((current.constraints ?? []).join('\n'));
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const save = async () => {
    if (!question.trim()) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setBusy(true);
    setError(null);
    // Fields of the current version the form does not edit are kept as they are (ResearchContextInput).
    const { domain, keywords, scope, outputType, manuscriptLanguage, citationStyle } = current;
    const input: Schemas['ResearchContextInput'] = { researchQuestion: current.researchQuestion, domain, keywords, scope, outputType, manuscriptLanguage, citationStyle };
    try {
      const res = await idempotency.run(`createContextVersion:${projectId}:${current.id}`, (key) =>
        api.post('/projects/{projectId}/context-versions', {
          path: { projectId },
          body: { ...input, researchQuestion: question.trim(), objectives: lines(objectives), constraints: lines(constraints), basedOnVersionId: current.id },
          idempotencyKey: key,
        }),
      );
      onSaved(res.data);
    } catch (caught) {
      setError(caught as ApiError);
      if (isApiError(caught) && caught.status === 409) onConflict();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="sires-project__form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="sires-field">
        <span className="sires-field__label">{t('overview.context.question')}</span>
        <textarea className="sires-input" rows={3} value={question} aria-invalid={invalid} aria-describedby={invalid ? 'sires-context-question-error' : undefined} onChange={(e) => setQuestion(e.currentTarget.value)} />
        {invalid && (
          <span id="sires-context-question-error" className="sires-project__field-error">
            {t('overview.context.questionRequired')}
          </span>
        )}
      </label>
      <label className="sires-field">
        <span className="sires-field__label">{t('overview.context.objectives')}</span>
        <textarea className="sires-input" rows={3} value={objectives} onChange={(e) => setObjectives(e.currentTarget.value)} />
        <span className="sires-project__hint">{t('overview.context.oneLine')}</span>
      </label>
      <label className="sires-field">
        <span className="sires-field__label">{t('overview.context.constraints')}</span>
        <textarea className="sires-input" rows={2} value={constraints} onChange={(e) => setConstraints(e.currentTarget.value)} />
      </label>
      {error && <ErrorState error={error} ns={NS} notSaved={t('overview.context.notSaved')} next={isApiError(error) && error.status === 409 ? t('overview.context.conflictNext') : undefined} />}
      <div className="sires-project__buttons">
        <button type="submit" className="sires-button" data-variant="primary" disabled={busy}>
          {busy ? t('common.saving') : t('overview.context.save')}
        </button>
        <button type="button" className="sires-button" disabled={busy} onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

/** Completed Tasks over all Tasks of each Phase of the baseline (UX-OVERVIEW-001-AC01). */
function PhaseProgress({ baseline, tasks }: { baseline: PlanVersion; tasks: Task[] }) {
  const { t } = useTranslation(NS);
  const phases = [...(baseline.phases ?? [])].sort((a, b) => a.order - b.order);
  return (
    <ol className="sires-project__phases">
      {phases.map((phase) => {
        const own = tasks.filter((task) => task.currentDefinition.phaseId === phase.id);
        const done = own.filter((task) => task.status === 'Completed').length;
        return (
          <li key={phase.id} className="sires-project__phase">
            <span>{t('overview.plan.phase', { order: phase.order, name: phase.name })}</span>
            <span className="sires-project__count">{t('overview.plan.progress', { done, total: own.length })}</span>
            <span className="sires-progress" role="img" aria-label={t('overview.plan.progressLabel', { done, total: own.length })}>
              <span style={{ width: own.length ? `${(done / own.length) * 100}%` : 0 }} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ActiveTasks({ projectId, tasks }: { projectId: string; tasks: Task[] }) {
  const { t } = useTranslation(NS);
  const active = tasks.filter((task) => ACTIVE.includes(task.status));
  return (
    <div>
      <h3 className="sires-project__sub">{t('overview.tasks.title')}</h3>
      {active.length ? (
        <ul className="sires-project__list">
          {active.map((task) => (
            <li key={task.id}>
              <Link to={`/projects/${projectId}/tasks/${task.id}`}>
                <span className="sires-id">{task.stableKey}</span> {task.currentDefinition.title}
              </Link>{' '}
              <StatusChip status={task.status} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="sires-project__hint">{t('overview.tasks.none')}</p>
      )}
    </div>
  );
}

function BuildLine({ build }: { build: Data['build'] }) {
  const { t } = useTranslation(NS);
  if (build === 'none') return <>{t('overview.manuscript.none')}</>;
  if (build === 'error' || build === null) return <>—</>;
  const time = build.endedAt ?? build.startedAt ?? build.queuedAt;
  if (build.status === 'Failed') return <>{t('overview.manuscript.failed', { time: formatTime(time) })}</>;
  if (build.status === 'Succeeded') return <>{t('overview.manuscript.ok', { time: formatTime(time), revision: build.revisionNumber ?? '—' })}</>;
  return <>{t('overview.manuscript.building')}</>;
}

/** Interrupted workflow: Task, stopped step (order over total), prompts waiting; opens the Recovery decision (EC03). */
function RecoveryBanner({ projectId, workflow, tasks }: { projectId: string; workflow: Workflow; tasks: Task[] }) {
  const { t } = useTranslation(NS);
  const steps = [...(workflow.steps ?? [])].sort((a, b) => a.order - b.order);
  const stopped = steps.find((s) => s.id === workflow.currentStepId) ?? steps.find((s) => s.status !== 'Succeeded');
  const prompts = steps.filter((s) => s.openPromptId).length;
  const task = tasks.find((x) => x.id === workflow.taskId);
  return (
    <div role="status" className="sires-project__banner" data-tone="recovery">
      <div>
        <strong>{t('overview.recovery.title', { task: task?.stableKey ?? '—' })}</strong>{' '}
        {t('overview.recovery.detail', { step: stopped?.order ?? '—', total: steps.length, prompts })}
      </div>
      <Link className="sires-button" data-variant="primary" to={workflowHref(projectId, workflow.id)}>
        {t('overview.recovery.action')}
      </Link>
    </div>
  );
}
