// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Agent List (PID-00059 S05; design.md §3, §4; H4, H15): the 10 agents of a project — Orchestrator, eight Specialist
// Agents, Analysis Agent A and B — each with its most urgent work: Chờ bạn > Lỗi > Gián đoạn > Đang chạy > Đang rảnh
// (EC30). Sources: the project's active workflows (current step, its agent and status), the effective Provider
// Connection of each agent (Invalid → Lỗi, EC31) and the deliberation sessions of PID-00083 (Orchestrator, Analysis
// A, B). Names, roles and agent labels follow the interface language (design.md §4 rows; listAgents is not read, so
// an English or Vietnamese registry text never mixes into the other language); entity statuses stay English (EC32).

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ErrorState, LoadingState, StatusChip, formatTime, useApi, useEvents, useStreamSignal } from '../../shell';
import { DeliberationAgentNote, deliberationAgentStates, type DeliberationAgentState } from './deliberation';
import { ACTIVE, NS, allPages, hrefs, loadTaskNames, taskLabel, useResource, type Schemas, type TaskNames, type Workflow } from './shared';

export type AgentState = 'needs-you' | 'error' | 'interrupted' | 'running' | 'idle';
/** Most urgent first (H15). */
export const PRIORITY: AgentState[] = ['needs-you', 'error', 'interrupted', 'running', 'idle'];
/** Style of each label: one chip style of design.md §3 per state, taken from the standard status it stands for. */
const CHIP: Record<AgentState, string> = { 'needs-you': 'Waiting for User', error: 'Failed', interrupted: 'Interrupted', running: 'Running', idle: 'Pending' };

/** The 10 rows of AgentList.dc.html, in order. */
export const ROWS: { key: string; agent: Schemas['AgentName']; instance?: 'A' | 'B'; mono: string }[] = [
  { key: 'orchestrator', agent: 'orchestrator', mono: 'OR' },
  { key: 'discovery', agent: 'discovery', mono: 'DI' },
  { key: 'reference_processing', agent: 'reference_processing', mono: 'RP' },
  { key: 'evidence_retrieval', agent: 'evidence_retrieval', mono: 'ER' },
  { key: 'synthesis', agent: 'synthesis', mono: 'SY' },
  { key: 'writing', agent: 'writing', mono: 'WR' },
  { key: 'verification', agent: 'verification', mono: 'VE' },
  { key: 'diagram', agent: 'diagram', mono: 'DG' },
  { key: 'analysis:A', agent: 'analysis', instance: 'A', mono: 'AA' },
  { key: 'analysis:B', agent: 'analysis', instance: 'B', mono: 'AB' },
];

export interface AgentWork {
  state: AgentState;
  workflow?: Workflow;
  step?: { current: number; total: number };
  /** Connection refused (EC31). */
  connection?: { name: string; code?: string };
  deliberation?: DeliberationAgentState;
}

interface Inputs {
  workflows: Workflow[];
  assignments: Schemas['AgentModelAssignment'][];
  connections: Schemas['ProviderConnection'][];
  deliberations: Schemas['Deliberation'][];
  openPromptIds: Set<string>;
}

/** Work of each row from the project's data, the most urgent kept (EC30, EC31). */
export function agentStates({ workflows, assignments, connections, deliberations, openPromptIds }: Inputs): Record<string, AgentWork> {
  const result: Record<string, AgentWork> = {};
  const offer = (key: string, work: AgentWork) => {
    const old = result[key];
    const rank = (w: AgentWork) => PRIORITY.indexOf(w.state);
    // Same urgency: the deliberation note says more than the step (“thảo luận bước 4/5 · Vòng 2”).
    if (!old || rank(work) < rank(old) || (rank(work) === rank(old) && work.deliberation && !old.deliberation)) result[key] = work;
  };
  for (const workflow of workflows) {
    const steps = workflow.steps ?? [];
    const index = steps.findIndex((s) => s.id === workflow.currentStepId);
    const step = steps[index];
    if (!step?.assignedAgent) continue;
    const position = { current: index + 1, total: steps.length };
    const state: AgentState | undefined =
      step.status === 'Waiting for User' || (workflow.status === 'Waiting for User' && step.openPromptId)
        ? 'needs-you'
        : step.status === 'Failed' && workflow.status !== 'Interrupted'
          ? 'error'
          : workflow.status === 'Interrupted'
            ? 'interrupted'
            : step.status === 'Running' && workflow.status === 'Running'
              ? 'running'
              : undefined;
    if (state) offer(step.assignedAgent, { state, workflow, step: position });
  }
  // Effective connection: the agent's own assignment, else the default one (Agent Models of PID-00036).
  for (const row of ROWS) {
    const own = assignments.find((a) => a.agent === row.agent && (row.instance ? a.instance === row.instance : true));
    const assignment = own ?? assignments.find((a) => a.agent === 'default');
    const connection = assignment && connections.find((c) => c.id === assignment.providerConnectionId);
    if (connection?.testStatus === 'Invalid') offer(row.key, { state: 'error', connection: { name: connection.name, code: connection.lastError?.code } });
  }
  // Only sessions of the project's active workflows: a Failed session of an ended workflow is history, not work.
  const live = deliberations.filter((d) => workflows.some((w) => w.id === d.workflowId));
  const sessions = deliberationAgentStates(live, {
    openDecisionPromptIds: openPromptIds,
    stepOf: (session) => {
      const workflow = workflows.find((w) => w.id === session.workflowId);
      const steps = workflow?.steps ?? [];
      const index = steps.findIndex((s) => s.id === session.stepId);
      return index >= 0 ? { current: index + 1, total: steps.length } : undefined;
    },
  });
  for (const [key, value] of Object.entries(sessions)) {
    if (!value) continue;
    const state: AgentState = value.state === 'waiting' ? 'needs-you' : value.state === 'error' ? 'error' : 'running';
    const workflow = workflows.find((w) => w.id === deliberations.find((d) => d.id === value.deliberationId)?.workflowId);
    offer(key, { state, workflow, step: value.step, deliberation: value });
  }
  return result;
}

export function AgentList({ projectId }: { projectId: string }) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const resource = useResource(async () => {
    const soft = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [workflows, assignments, connections, deliberations, tasks] = await Promise.all([
      allPages((cursor) => api.get('/workflows', { query: { projectId, status: ACTIVE, limit: 100, ...(cursor ? { cursor } : {}) } }).then((r) => r.data)),
      soft(api.get('/agent-model-assignments').then((r) => r.data.items ?? [])),
      soft(api.get('/provider-connections').then((r) => r.data.items ?? [])),
      soft(allPages((cursor) => api.get('/projects/{projectId}/deliberations', { path: { projectId }, query: { ...(cursor ? { cursor } : {}) } }).then((r) => r.data))),
      loadTaskNames(api, [projectId]),
    ]);
    const openPromptIds = new Set(workflows.flatMap((w) => (w.steps ?? []).map((s) => s.openPromptId).filter(Boolean) as string[]));
    return { inputs: { workflows, assignments, connections, deliberations, openPromptIds }, tasks, at: Date.now() };
  }, [projectId]);

  useEvents(
    {
      types: ['workflow.status_changed', 'agent_run.status_changed', 'prompt.status_changed', 'provider_connection.changed', 'deliberation.started', 'deliberation.status_changed'],
      projectId,
    },
    () => void resource.reload(),
  );
  useStreamSignal(() => void resource.reload());

  return (
    <section className="sires-mon__agents" aria-labelledby="sires-mon-agents">
      <h2 id="sires-mon-agents" className="sires-mon__section-title">
        {t('agents.title')}
      </h2>
      {resource.value.state === 'loading' && <LoadingState what={t('agents.loading')} rows={4} />}
      {resource.value.state === 'error' && <ErrorState error={resource.value.error} ns={NS} title={t('agents.loadFailed')} onRetry={() => void resource.reload()} />}
      {resource.value.state === 'ready' && <AgentRows projectId={projectId} {...resource.value.data} />}
    </section>
  );
}

function AgentRows({ projectId, inputs, tasks, at }: { projectId: string; inputs: Inputs; tasks: TaskNames; at: number }) {
  const { t } = useTranslation(NS);
  const work = agentStates(inputs);
  const stateOf = (key: string): AgentState => work[key]?.state ?? 'idle';
  const counts = PRIORITY.map((state) => [state, ROWS.filter((r) => stateOf(r.key) === state).length] as const).filter(([, n]) => n > 0);
  const order: AgentState[] = ['running', 'needs-you', 'error', 'interrupted', 'idle'];
  const summary = order
    .map((state) => counts.find(([s]) => s === state))
    .filter((x): x is readonly [AgentState, number] => Boolean(x))
    .map(([state, n]) => t(`agents.count.${state}`, { count: n }))
    .join(', ');
  return (
    <>
      <p className="sires-mon__lede" aria-live="polite">
        {summary}
      </p>
      <p className="sires-mon__hint">{t('agents.scope', { time: formatTime(at) })}</p>
      <ul className="sires-mon__agent-list">
        {ROWS.map((row) => {
          const w = work[row.key];
          const state = stateOf(row.key);
          const name = t(`agent.${row.agent}`) + (row.instance ? ` ${row.instance}` : '');
          return (
            <li key={row.key} className="sires-mon__agent" data-agent={row.key} data-state={state}>
              <span className="sires-mon__mono" aria-hidden="true">
                {row.mono}
              </span>
              <span className="sires-mon__agent-body">
                <strong>{name}</strong>
                <span className="sires-mon__muted sires-mon__block">{t(`agents.role.${row.agent}`)}</span>
                {w && state !== 'idle' && <AgentDetail projectId={projectId} work={w} tasks={tasks} />}
              </span>
              <StatusChip status={CHIP[state]} entity="workflow">
                {t(`agents.state.${state}`)}
              </StatusChip>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function AgentDetail({ projectId, work, tasks }: { projectId: string; work: AgentWork; tasks: TaskNames }) {
  const { t } = useTranslation(NS);
  if (work.connection) {
    return (
      <span className="sires-mon__block">
        {t('agents.connectionRefused', { name: work.connection.name, code: work.connection.code ?? '—' })}{' '}
        <Link className="sires-mon__link" to={hrefs.providers()}>
          {t('agents.providers')}
        </Link>
      </span>
    );
  }
  const workflow = work.workflow;
  const task = taskLabel(tasks, workflow?.taskId);
  return (
    <span className="sires-mon__block">
      {workflow && (
        <Link className="sires-mon__link" to={hrefs.workflow(workflow.projectId ?? projectId, workflow.id)}>
          {task ?? workflow.type}
        </Link>
      )}{' '}
      {work.deliberation ? (
        <DeliberationAgentNote state={work.deliberation} />
      ) : (
        work.step && <span className="sires-num">{t('agents.step', { current: work.step.current, total: work.step.total })}</span>
      )}
    </span>
  );
}
