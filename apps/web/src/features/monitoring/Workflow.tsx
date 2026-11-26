// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Workflow detail (PID-00059 S03; H2, H4, H5, H8, H10, H11, H20): header with Task, baseline, trigger and controls;
// banners for Cancelled, Failed, Succeeded; the Recovery decision of an Interrupted workflow (continue, rerun_step,
// cancel — the contract's three, nothing chosen and nothing sent before “Xác nhận”); views Dòng thời gian and
// Danh sách bước, plus the “Thảo luận” tab of PID-00083 when it has something to show; prompts of the steps in the
// shell's card; the Agent Run panel (S04, `?agentRun=`) and the Agent List (S05) on the side.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  NotFound,
  PromptCard,
  StatusChip,
  formatDateTime,
  formatNumber,
  formatTime,
  isApiError,
  useApi,
  useEvents,
  useShell,
  useStreamSignal,
  type ApiError,
  type InteractiveAgentPrompt,
} from '../../shell';
import { AgentList } from './AgentList';
import { AgentRunPanel, workflowUsage } from './AgentRun';
import { DeliberationStepNote, DeliberationTab, useDeliberationTab, type DeliberationTabState } from './deliberation';
import {
  NS,
  RefLink,
  WorkflowControls,
  elapsedText,
  hrefs,
  loadTaskNames,
  shortId,
  taskLabel,
  useActorName,
  useAgentName,
  useNow,
  useResource,
  useWorkflowCommands,
  type AgentRun,
  type AuditEvent,
  type Page,
  type Schemas,
  type Step,
  type TaskNames,
  type Workflow,
} from './shared';

type View = 'timeline' | 'steps' | 'deliberation';

interface Detail {
  workflow: Workflow;
  runs: AgentRun[];
  cancelled?: AuditEvent;
}

export function WorkflowPage() {
  const { t } = useTranslation(NS);
  const api = useApi();
  const { projectId = '', workflowId = '' } = useParams();

  const load = async (): Promise<Detail> => {
    const [workflow, runs] = await Promise.all([
      api.get('/workflows/{workflowId}', { path: { workflowId } }).then((r) => r.data),
      api.get('/workflows/{workflowId}/agent-runs', { path: { workflowId } }).then((r): AgentRun[] => r.data.items ?? []),
    ]);
    // Who cancelled and when: the audit trail of the workflow (the Workflow has no such field; H20).
    let cancelled: AuditEvent | undefined;
    if (workflow.status === 'Cancelled' && workflow.projectId) {
      try {
        const page: Page<AuditEvent> = (await api.get('/projects/{projectId}/audit-events', { path: { projectId: workflow.projectId }, query: { objectType: 'workflow', objectId: workflow.id } })).data;
        const events = page.items ?? [];
        cancelled = events.find((e) => e.toState === 'Cancelled');
      } catch {
        // The banner then shows the time only.
      }
    }
    return { workflow, runs, cancelled };
  };
  const resource = useResource(load, [workflowId]);
  const tasks = useResource(() => loadTaskNames(api, [projectId]), [projectId]);

  // The open workflow follows its events: its status, its Agent Runs, its prompts (EC04, UX-MONITOR-005).
  const detail = resource.value.state === 'ready' ? resource.value.data : undefined;
  useEvents({ types: ['workflow.status_changed', 'agent_run.status_changed', 'prompt.status_changed'], projectId }, (event) => {
    const id = event.objectId;
    if (!id || !detail) return;
    const steps = detail.workflow.steps ?? [];
    const mine =
      (event.type === 'workflow.status_changed' && id === workflowId) ||
      (event.type === 'agent_run.status_changed' && (detail.runs.some((r) => r.id === id) || steps.some((s) => s.agentRunIds?.includes(id)))) ||
      (event.type === 'prompt.status_changed' && steps.some((s) => s.openPromptId === id));
    if (mine) {
      void resource.reload();
      return;
    }
    if (event.type === 'agent_run.status_changed') {
      // A new Agent Run of this workflow is not in the list yet.
      void api.get('/agent-runs/{agentRunId}', { path: { agentRunId: id } }).then(
        (r) => r.data.workflowId === workflowId && void resource.reload(),
        () => undefined,
      );
    }
  });
  useStreamSignal(() => void resource.reload());

  if (resource.value.state === 'loading') {
    return (
      <section className="sires-mon">
        <LoadingState what={t('workflow.loading')} />
      </section>
    );
  }
  if (resource.value.state === 'error') {
    const error = resource.value.error;
    if (isApiError(error) && error.status === 404) return <NotFound />;
    return (
      <section className="sires-mon">
        <ErrorState error={error} ns={NS} title={t('workflow.loadFailed')} onRetry={() => void resource.reload()} />
      </section>
    );
  }
  return (
    <WorkflowView
      projectId={projectId}
      detail={resource.value.data}
      tasks={tasks.value.state === 'ready' ? tasks.value.data : new Map()}
      onWorkflow={(workflow) => resource.setData((old) => ({ ...old, workflow }))}
      reload={() => void resource.reload()}
    />
  );
}

function WorkflowView({ projectId, detail, tasks, onWorkflow, reload }: { projectId: string; detail: Detail; tasks: TaskNames; onWorkflow: (w: Workflow) => void; reload: () => void }) {
  const { t } = useTranslation(NS);
  const [search, setSearch] = useSearchParams();
  const { workflow, runs } = detail;
  const steps = workflow.steps ?? [];
  const tab = useDeliberationTab(projectId, workflow);
  const requested = search.get('view');
  const view: View = requested === 'steps' || (requested === 'deliberation' && tab.visible) ? requested : requested === 'deliberation' && tab.loading ? 'deliberation' : 'timeline';
  const agentRunId = search.get('agentRun') ?? undefined;
  const commands = useWorkflowCommands((next) => {
    onWorkflow(next);
    reload();
  });
  const running = workflow.status === 'Running' || workflow.status === 'Waiting for User';
  const now = useNow(running);
  const task = taskLabel(tasks, workflow.taskId);
  const actorName = useActorName();
  const done = steps.filter((s) => s.status === 'Succeeded').length;
  const prompts = steps.filter((s) => s.openPromptId);
  const usage = workflowUsage(runs);

  const viewHref = (next: View) => {
    const params = new URLSearchParams();
    if (next !== 'timeline') params.set('view', next);
    const q = params.toString();
    return q ? `?${q}` : '?';
  };
  const closeRun = () => {
    const params = new URLSearchParams(search);
    params.delete('agentRun');
    setSearch(params);
  };

  return (
    <section className="sires-mon">
      <div className="sires-mon__layout">
        <div className="sires-mon__main">
          <header className="sires-mon__head">
            <h1 className="sires-mon__title sires-mon__title-row">
              <span>{task ?? t(`type.${workflow.type}`, { defaultValue: workflow.type })}</span>
              <StatusChip status={workflow.status} entity="workflow" />
              <span className="sires-num sires-mon__elapsed" aria-label={t('workflow.elapsedLabel')}>
                {elapsedText(workflow, now)}
              </span>
            </h1>
            <p className="sires-mon__lede">
              <span className="sires-id">{shortId('wf', workflow.id)}</span> · {workflow.type}
              {workflow.planVersionId && <> · {t('workflow.baseline', { id: shortId('pv', workflow.planVersionId) })}</>} ·{' '}
              {t('workflow.triggered', { who: actorName(workflow.triggeredBy), time: formatTime(workflow.startedAt ?? workflow.createdAt) })} ·{' '}
              <Link className="sires-mon__link" to={hrefs.activity(projectId)}>
                {t('workflow.allOfProject')}
              </Link>
            </p>
            <WorkflowControls workflow={workflow} taskLabel={task} commands={commands} />
          </header>

          <ResultBanner workflow={workflow} cancelled={detail.cancelled} task={task} actorName={actorName} />
          {workflow.status === 'Interrupted' && <RecoveryDecision workflow={workflow} runs={runs} task={task} commands={commands} />}

          <div className="sires-mon__summary">
            {steps.length > 0 && (
              <div className="sires-mon__progress-row">
                <span className="sires-num">{t('workflow.progress', { done, total: steps.length })}</span>
                <div className="sires-progress" role="img" aria-label={t('workflow.progressLabel', { done, total: steps.length })}>
                  <div data-progress="" className="sires-progress__fill" style={{ width: `${(done / steps.length) * 100}%` }} />
                </div>
              </div>
            )}
            <p className="sires-mon__usage" data-testid="workflow-usage">
              {t('usage.workflow', {
                runs: runs.length,
                input: usage.inputTokens === null ? '—' : formatNumber(usage.inputTokens),
                output: usage.outputTokens === null ? '—' : formatNumber(usage.outputTokens),
                calls: formatNumber(usage.calls),
              })}
              {usage.cost && <> · {t('usage.costEstimate', { cost: formatNumber(usage.cost.amount, { maximumFractionDigits: 4 }), currency: usage.cost.currency })}</>}
            </p>
          </div>

          {prompts.map((step) => (
            <StepPrompt key={step.openPromptId} projectId={projectId} promptId={step.openPromptId!} onChange={reload} />
          ))}

          <nav className="sires-tabs sires-mon__tabs" aria-label={t('workflow.views')}>
            <Link className="sires-tab" to={viewHref('timeline')} aria-current={view === 'timeline' ? 'page' : undefined}>
              {t('workflow.view.timeline')}
            </Link>
            <Link className="sires-tab" to={viewHref('steps')} aria-current={view === 'steps' ? 'page' : undefined}>
              {t('workflow.view.steps')}
            </Link>
            {tab.visible && (
              <Link className="sires-tab" to={viewHref('deliberation')} aria-current={view === 'deliberation' ? 'page' : undefined}>
                {t('workflow.view.deliberation')}
              </Link>
            )}
          </nav>

          {view === 'deliberation' ? (
            <DeliberationTab projectId={projectId} workflow={workflow} tab={tab} />
          ) : runs.length === 0 ? (
            <EmptyState title={t('workflow.noRuns')} reason={workflow.status === 'Created' ? t('workflow.noRunsCreated') : steps.some((s) => s.status === 'Waiting for User') ? t('workflow.noRunsWaiting') : t('workflow.noRunsOther')} />
          ) : view === 'timeline' ? (
            <Timeline projectId={projectId} workflow={workflow} runs={runs} />
          ) : (
            <StepList projectId={projectId} workflow={workflow} runs={runs} tab={tab} selected={agentRunId} now={now} />
          )}
          {view === 'steps' && runs.length === 0 && <StepList projectId={projectId} workflow={workflow} runs={runs} tab={tab} selected={agentRunId} now={now} />}

        </div>
        <aside className="sires-mon__side">
          {/* Agent Run panel in the side column (design.md §4; Workflow--debug), above the Agent List. */}
          {agentRunId && <AgentRunPanel key={agentRunId} projectId={projectId} agentRunId={agentRunId} workflow={workflow} onClose={closeRun} />}
          <AgentList projectId={projectId} />
        </aside>
      </div>
    </section>
  );
}

/* ---------- Banners: Cancelled, Failed, Succeeded (EC15) ---------- */

function ResultBanner({ workflow, cancelled, task, actorName }: { workflow: Workflow; cancelled?: AuditEvent; task?: string; actorName: ReturnType<typeof useActorName> }) {
  const { t } = useTranslation(NS);
  if (workflow.status === 'Cancelled') {
    return (
      <div className="sires-mon__banner" data-tone="neutral" role="status">
        <strong>
          {t('banner.cancelled', { time: workflow.endedAt ? formatDateTime(workflow.endedAt) : '—' })}
          {cancelled && ` · ${actorName(cancelled.actor)}`}
        </strong>
        <span>{t('banner.cancelledEffect', { task: task ?? t('banner.theTask') })}</span>
      </div>
    );
  }
  if (workflow.status === 'Failed') {
    const runId = workflow.lastError?.agentRunId;
    return (
      <div className="sires-mon__banner" data-tone="danger" role="status">
        <strong>{t('banner.failed', { time: workflow.endedAt ? formatDateTime(workflow.endedAt) : '—' })}</strong>
        {workflow.lastError?.code && (
          <span>
            {t(`error.${workflow.lastError.code}`, { defaultValue: t('error.other') })} ({t('banner.code', { code: workflow.lastError.code })})
            {runId && workflow.projectId && (
              <>
                {' '}
                ·{' '}
                <Link className="sires-mon__link" to={hrefs.agentRun(workflow.projectId, workflow.id, runId)}>
                  {t('banner.agentRun', { id: shortId('ar', runId) })}
                </Link>
              </>
            )}
          </span>
        )}
        <span>{t('banner.failedNext')}</span>
      </div>
    );
  }
  if (workflow.status === 'Succeeded') {
    return (
      <div className="sires-mon__banner" data-tone="neutral" role="status">
        <strong>{t('banner.succeeded', { time: workflow.endedAt ? formatDateTime(workflow.endedAt) : '—' })}</strong>
        <span>{t('banner.readOnly')}</span>
      </div>
    );
  }
  return null;
}

/* ---------- Recovery decision (ticket AC02; EC12–EC14) ---------- */

type Decision = Schemas['RecoveryDecision']['decision'];

function RecoveryDecision({ workflow, runs, task, commands }: { workflow: Workflow; runs: AgentRun[]; task?: string; commands: ReturnType<typeof useWorkflowCommands> }) {
  const { t } = useTranslation(NS);
  const agentName = useAgentName();
  const steps = workflow.steps ?? [];
  const stopped = steps.find((s) => s.id === workflow.currentStepId) ?? steps.find((s) => s.status === 'Failed' || s.status === 'Running');
  const [choice, setChoice] = useState<Decision | null>(null);
  const [stepId, setStepId] = useState(stopped?.id ?? steps[0]?.id ?? '');
  const checkpoint = workflow.lastCheckpoint ?? null;
  const consistent = checkpoint?.consistent === true;
  const checkpointStep = checkpoint ? steps.find((s) => s.id === checkpoint.stepId) : undefined;
  const stoppedRun = stopped ? runs.filter((r) => r.stepId === stopped.id).at(-1) : undefined;
  const stoppedAt = stoppedRun?.endedAt ?? stoppedRun?.startedAt;
  const busy = commands.busy === workflow.id;
  const n = (step: Step | undefined) => (step ? steps.indexOf(step) + 1 : 0);

  const confirm = () => {
    if (!choice) return;
    void commands.recover(workflow, choice === 'rerun_step' ? { decision: choice, stepId } : { decision: choice });
  };
  return (
    <section className="sires-mon__recovery" aria-labelledby="sires-mon-recovery">
      <h2 id="sires-mon-recovery" className="sires-mon__section-title">
        {t('recovery.title')}
      </h2>
      <p>
        {stopped
          ? t(stoppedAt ? 'recovery.stoppedAt' : 'recovery.stopped', { n: n(stopped), agent: agentName(stopped.assignedAgent), time: stoppedAt ? formatTime(stoppedAt) : '' })
          : t('recovery.stoppedUnknown')}{' '}
        {consistent && checkpoint
          ? t('recovery.checkpoint', { n: n(checkpointStep), count: checkpoint.savedOutputRefs?.length ?? 0, time: formatTime(checkpoint.at) })
          : t('recovery.noCheckpoint')}
      </p>
      <fieldset className="sires-mon__choices">
        <legend className="sires-field__label">{t('recovery.choose')}</legend>
        <label className="sires-mon__choice" data-disabled={!consistent || undefined}>
          <input type="radio" name="recovery" value="continue" disabled={!consistent || busy} checked={choice === 'continue'} onChange={() => setChoice('continue')} />
          <span>
            <strong>{t('recovery.continue')}</strong>
            <span className="sires-mon__muted sires-mon__block">
              {consistent ? t('recovery.continueEffect', { from: n(checkpointStep) + 1, kept: n(checkpointStep) }) : t('recovery.continueDisabled')}
            </span>
          </span>
        </label>
        <label className="sires-mon__choice">
          <input type="radio" name="recovery" value="rerun_step" disabled={busy} checked={choice === 'rerun_step'} onChange={() => setChoice('rerun_step')} />
          <span>
            <strong>{t('recovery.rerun')}</strong>
            <span className="sires-mon__muted sires-mon__block">{t('recovery.rerunEffect')}</span>
          </span>
        </label>
        {choice === 'rerun_step' && (
          <label className="sires-field sires-mon__rerun-step">
            <span className="sires-field__label">{t('recovery.step')}</span>
            <select className="sires-input" value={stepId} onChange={(e) => setStepId(e.currentTarget.value)}>
              {steps.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {t('recovery.stepOption', { n: i + 1, total: steps.length, description: s.description })}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="sires-mon__choice">
          <input type="radio" name="recovery" value="cancel" disabled={busy} checked={choice === 'cancel'} onChange={() => setChoice('cancel')} />
          <span>
            <strong>{t('recovery.cancel')}</strong>
            <span className="sires-mon__muted sires-mon__block">{t('recovery.cancelEffect', { task: task ?? t('banner.theTask') })}</span>
          </span>
        </label>
      </fieldset>
      <div className="sires-mon__controls">
        <button type="button" className="sires-button" data-variant="primary" disabled={!choice || busy} onClick={confirm}>
          {busy ? t('recovery.sending') : t('recovery.confirm')}
        </button>
        {!choice && <span className="sires-mon__hint">{t('recovery.pickFirst')}</span>}
      </div>
      {commands.notice[workflow.id]?.conflict && (
        <p role="status" className="sires-mon__notice">
          {t('control.conflict', { state: commands.notice[workflow.id]!.conflict })}
        </p>
      )}
    </section>
  );
}

/* ---------- Timeline (UX-MONITOR-002-AC01, EC16) ---------- */

interface TimelineEntry {
  at: string;
  actor: string;
  text: string;
  tone?: 'warn' | 'need';
  link?: { label: string; to: string };
  order: number;
}

const sameRef = (a: Schemas['TypedRef'], b: Schemas['TypedRef']) => a.type === b.type && a.id === b.id;

function Timeline({ projectId, workflow, runs }: { projectId: string; workflow: Workflow; runs: AgentRun[] }) {
  const { t } = useTranslation(NS);
  const agentName = useAgentName();
  const steps = workflow.steps ?? [];
  const orchestrator = agentName('orchestrator');
  const entries: TimelineEntry[] = [];
  let order = 0;
  const push = (entry: Omit<TimelineEntry, 'order'>) => entries.push({ ...entry, order: order++ });

  // The Orchestrator creates the workflow and plans its steps (Workflow.dc.html); who triggered it is in the header.
  push({ at: workflow.createdAt, actor: orchestrator, text: t('timeline.created', { type: workflow.type, count: steps.length }) });
  steps.forEach((step, i) => {
    const stepRuns = runs.filter((r) => r.stepId === step.id).sort((a, b) => (a.startedAt ?? a.createdAt).localeCompare(b.startedAt ?? b.createdAt));
    const first = stepRuns[0];
    if (!first) return;
    const at = first.startedAt ?? first.createdAt;
    const previous = steps[i - 1];
    // Handoff: an output of the previous step is an input of this one (18.1 WorkflowStep).
    if (previous && (previous.outputRefs ?? []).some((out) => (step.inputRefs ?? []).some((input) => sameRef(out, input)))) {
      push({ at, actor: orchestrator, text: t('timeline.handoff', { from: i, fromAgent: agentName(previous.assignedAgent), to: i + 1, toAgent: agentName(step.assignedAgent) }) });
    }
    push({ at, actor: orchestrator, text: t('timeline.assign', { n: i + 1, agent: agentName(step.assignedAgent), description: step.description }) });
    for (const run of stepRuns) {
      const name = agentName(run.agent, run.instance);
      const link = { label: t('timeline.agentRun', { id: shortId('ar', run.id) }), to: hrefs.agentRun(projectId, workflow.id, run.id) };
      if (run.status === 'Failed') push({ at: run.endedAt ?? run.startedAt ?? run.createdAt, actor: name, text: t('timeline.failed', { n: i + 1, code: run.error?.code ?? '—' }), tone: 'warn', link });
      else if (run.status === 'Succeeded') push({ at: run.endedAt ?? run.createdAt, actor: name, text: t('timeline.done', { n: i + 1, count: (run.outputRefs ?? step.outputRefs ?? []).length }), link });
      else if (run.status === 'Cancelled') push({ at: run.endedAt ?? run.createdAt, actor: name, text: t('timeline.runCancelled', { n: i + 1 }), link });
      else push({ at: run.startedAt ?? run.createdAt, actor: name, text: t('timeline.running', { n: i + 1 }), link });
      if (run.discarded) push({ at: run.endedAt ?? run.createdAt, actor: name, text: t('timeline.discarded'), tone: 'warn', link });
    }
    if (step.openPromptId) {
      const last = stepRuns.at(-1)!;
      push({ at: last.endedAt ?? last.startedAt ?? last.createdAt, actor: agentName(step.assignedAgent), text: t('timeline.prompt', { n: i + 1 }), tone: 'need', link: { label: t('timeline.answerInChat'), to: hrefs.chat(projectId) } });
    }
  });
  if (workflow.status === 'Interrupted') {
    const lastRun = runs.at(-1);
    push({ at: lastRun?.endedAt ?? lastRun?.startedAt ?? workflow.createdAt, actor: t('actor.system'), text: t('timeline.interrupted'), tone: 'warn' });
  } else if (workflow.endedAt) {
    push({ at: workflow.endedAt, actor: t('actor.system'), text: t('timeline.ended', { state: workflow.status }) });
  }
  entries.sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order);

  return (
    <ol className="sires-mon__timeline" aria-label={t('workflow.view.timeline')} aria-live="polite">
      {entries.map((e) => (
        <li key={e.order} data-tone={e.tone}>
          <time className="sires-num sires-mon__time" dateTime={e.at}>
            {formatTime(e.at, { withSeconds: true })}
          </time>
          <span>
            <strong>{e.actor}</strong> {e.text}
            {e.link && (
              <>
                {' '}
                <Link className="sires-mon__link" to={e.link.to}>
                  {e.link.label}
                </Link>
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Step list (EC17, EC19, EC20) ---------- */

function StepList({ projectId, workflow, runs, tab, selected, now }: { projectId: string; workflow: Workflow; runs: AgentRun[]; tab: DeliberationTabState; selected?: string; now: number }) {
  const { t } = useTranslation(NS);
  const agentName = useAgentName();
  const steps = workflow.steps ?? [];
  return (
    <div className="sires-mon__table-wrap">
      <table className="sires-mon__table sires-mon__steps" aria-label={t('workflow.view.steps')}>
        <thead>
          <tr>
            <th scope="col">{t('steps.step')}</th>
            <th scope="col">{t('steps.agent')}</th>
            <th scope="col">{t('steps.status')}</th>
            <th scope="col">{t('steps.inputs')}</th>
            <th scope="col">{t('steps.outputs')}</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, i) => {
            const stepRuns = runs.filter((r) => r.stepId === step.id);
            const current = step.id === workflow.currentStepId;
            return (
              <tr key={step.id} aria-current={current ? 'step' : undefined} data-step={step.id}>
                <td data-label={t('steps.step')}>
                  <span className="sires-num">{t('activity.stepOf', { current: i + 1, total: steps.length })}</span> <strong>{step.description}</strong>
                  <span className="sires-mon__block sires-mon__muted">
                    {stepRuns.length === 0
                      ? t('steps.noRun')
                      : stepRuns.map((run, k) => (
                          <span key={run.id}>
                            {k > 0 && ' · '}
                            <Link className="sires-mon__link" to={hrefs.agentRun(projectId, workflow.id, run.id)} aria-current={selected === run.id ? 'true' : undefined}>
                              {t('timeline.agentRun', { id: shortId('ar', run.id) })}
                            </Link>{' '}
                            {t('steps.attempts', { count: run.attempts })}
                            {run.status === 'Running' && <span className="sires-num"> · {t('steps.runningFor', { time: elapsedText(run, now) })}</span>}
                          </span>
                        ))}
                  </span>
                  <DeliberationStepNote projectId={projectId} workflowId={workflow.id} step={step} tab={tab} />
                </td>
                <td data-label={t('steps.agent')}>{agentName(step.assignedAgent)}</td>
                <td data-label={t('steps.status')}>
                  <StatusChip status={step.status} entity="workflow-step" />
                </td>
                <td data-label={t('steps.inputs')}>
                  <RefList projectId={projectId} refs={step.inputRefs} />
                </td>
                <td data-label={t('steps.outputs')}>
                  <RefList projectId={projectId} refs={step.outputRefs} />
                  {step.openPromptId && <span className="sires-mon__block">{t('steps.openPrompt', { id: shortId('pr', step.openPromptId) })}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="sires-mon__hint">{t('steps.hint')}</p>
    </div>
  );
}

function RefList({ projectId, refs }: { projectId: string; refs?: Schemas['TypedRef'][] }) {
  if (!refs?.length) return <span className="sires-mon__muted">—</span>;
  return (
    <ul className="sires-mon__refs">
      {refs.map((ref) => (
        <li key={`${ref.type}:${ref.id}`}>
          <RefLink projectId={projectId} value={ref} />
        </li>
      ))}
    </ul>
  );
}

/* ---------- Prompt of a step in the shell's card (EC18; H2) ---------- */

function StepPrompt({ projectId, promptId, onChange }: { projectId: string; promptId: string; onChange: () => void }) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const { idempotency } = useShell();
  const agentName = useAgentName();
  const resource = useResource(async () => (await api.get('/prompts/{promptId}', { path: { promptId } })).data, [promptId]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [elsewhere, setElsewhere] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  const reread = async () => {
    try {
      const fresh = (await api.get('/prompts/{promptId}', { path: { promptId } })).data;
      if (mounted.current) resource.setData(() => fresh);
    } catch {
      // keep the card; the next event brings it up to date
    }
  };
  useEvents({ types: ['prompt.status_changed'], projectId }, (event) => {
    if (event.objectId === promptId) void reread();
  });

  if (resource.value.state === 'loading') return <LoadingState what={t('prompt.title')} rows={1} />;
  if (resource.value.state === 'error') return <ErrorState error={resource.value.error} ns={NS} title={t('prompt.loadFailed')} onRetry={() => void resource.reload()} />;
  const prompt: InteractiveAgentPrompt = resource.value.data;

  const answer = async (response: Schemas['PromptResponse']) => {
    setSubmitting(true);
    setError(null);
    setElsewhere(false);
    try {
      const res = await idempotency.run(`answerPrompt:${prompt.id}:${JSON.stringify(response)}`, (key) =>
        api.post('/prompts/{promptId}/response', { path: { promptId: prompt.id }, body: response, idempotencyKey: key }),
      );
      resource.setData(() => res.data);
      onChange();
    } catch (caught) {
      // Answered, expired or cancelled elsewhere: read it again, never resend.
      if (isApiError(caught) && caught.status === 409) {
        setElsewhere(true);
        await reread();
      } else {
        setError(caught as ApiError);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sires-mon__prompt">
      <PromptCard prompt={prompt} submitting={submitting} agentLabel={agentName(prompt.agent ?? prompt.createdBy?.agent, prompt.createdBy?.instance)} onAnswer={answer}>
        <span className="sires-mon__hint">
          {t('prompt.alsoInChat')}{' '}
          <Link className="sires-mon__link" to={hrefs.chat(projectId)}>
            {t('prompt.chat')}
          </Link>
        </span>
      </PromptCard>
      {elsewhere && (
        <p role="status" className="sires-mon__notice">
          {t('prompt.handledElsewhere')}
        </p>
      )}
      {error && <ErrorState error={error} ns={NS} notSaved={t('prompt.notSent')} />}
    </div>
  );
}
