// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Mock of PID-00059 (Agent Activity, Workflow, Agent Run, Agent List, History; H6): the 10 operations the monitoring
// area owns, with a store that keeps changes for one dev session. Commands follow PRD 18.2: an invalid one answers
// 409 invalid_transition; a valid one changes the workflow and, on the dev server, pushes workflow.status_changed.
// Data: the shared demo workflows plus wf-52d (T-2.3, five steps) of the reference screens.

import type { PublicApi } from '@sires/contracts';
import { ACCOUNT_ID, id, projectIds, type EventInput, type Fixtures, type Overrides } from '../../../shell/mock';

type Schemas = PublicApi.components['schemas'];
type Workflow = Schemas['Workflow'];
type AgentRun = Schemas['AgentRun'];
type Step = Schemas['WorkflowStep'];

/** wf-52d of Workflow.dc.html: T-2.3, Discovery → … → Verification, running at step 3 of 5. Same id as the deliberation
 * scenario of PID-00083 (`id('workflow', 52)`, step 4 = `id('step', 524)`), so both mocks describe one workflow. */
export const WF_52D = id('workflow', 52);

const iso = (hoursAgo = 0) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const ACTOR = { type: 'researcher' as const, accountId: ACCOUNT_ID };

function wf52d(): { workflow: Workflow; runs: AgentRun[] } {
  const agents: Array<[Schemas['AgentName'], string, Schemas['StepStatus']]> = [
    ['discovery', 'Tìm tài liệu về phương pháp đo hallucination', 'Succeeded'],
    ['reference_processing', 'Chuẩn hóa metadata 14 reference', 'Succeeded'],
    ['evidence_retrieval', 'Truy xuất evidence cho ma trận so sánh', 'Running'],
    ['synthesis', 'Lập ma trận so sánh phương pháp', 'Pending'],
    ['verification', 'Kiểm chứng claim của ma trận', 'Pending'],
  ];
  const runs: AgentRun[] = [];
  const steps: Step[] = agents.map(([agent, description, status], i) => {
    const stepId = id('step', 521 + i);
    const runId = id('agentRun', 521 + i);
    if (status !== 'Pending') {
      runs.push({
        id: runId,
        accountId: ACCOUNT_ID,
        createdAt: iso(2 - i * 0.4),
        createdBy: { type: 'agent', agent, agentRunId: runId },
        rowVersion: 1,
        projectId: projectIds.rag,
        workflowId: WF_52D,
        stepId,
        agent,
        providerConnectionId: id('connection', 1),
        provider: 'openai',
        model: 'gpt-4.1-mini',
        adapterVersion: '2026.11',
        status: status === 'Running' ? 'Running' : 'Succeeded',
        attempts: 1,
        inputSummary: description,
        contextManifest: { entities: [{ type: 'task', id: id('task', 3) }], evidenceIds: [] },
        structuredOutput: status === 'Succeeded' ? { items: 14 } : {},
        usage: { noData: false, inputTokens: 12000 + i * 1500, outputTokens: 1800 + i * 200, calls: 1, ...(i === 0 ? { extra: { cost: 0.042, currency: 'USD' } } : {}) },
        startedAt: iso(2 - i * 0.4),
        endedAt: status === 'Running' ? undefined : iso(1.8 - i * 0.4),
        hasDebugTranscript: i === 0,
        discarded: false,
      } as AgentRun);
    }
    return { id: stepId, order: i + 1, description, assignedAgent: agent, status, attemptCount: status === 'Pending' ? 0 : 1, agentRunIds: status === 'Pending' ? [] : [runId] } as Step;
  });
  const workflow = {
    id: WF_52D,
    accountId: ACCOUNT_ID,
    createdAt: iso(2),
    createdBy: ACTOR,
    rowVersion: 1,
    projectId: projectIds.rag,
    idempotencyKey: 'wf-52d',
    type: 'task_execution',
    taskId: id('task', 3),
    triggeredBy: ACTOR,
    status: 'Running',
    currentStepId: steps[2]!.id,
    steps,
    startedAt: iso(2),
    lastCheckpointId: steps[1]!.id,
  } as Workflow;
  return { workflow, runs };
}

interface State {
  workflows: Workflow[];
  runs: AgentRun[];
}

let state: State | null = null;

function init(fixtures: Fixtures): State {
  if (state) return state;
  const extra = wf52d();
  state = {
    workflows: [extra.workflow, ...structuredClone([...(fixtures.Workflow ?? [])])],
    runs: [...extra.runs, ...structuredClone([...(fixtures.AgentRun ?? [])])],
  };
  return state;
}

/** Drop the store so the next request seeds it again (tests reset between cases). */
export function resetMonitoringMockState(): void {
  state = null;
}

type MockCode = 'invalid_transition' | 'not_found' | 'validation_failed';
/** Problem Details as a Response: some statuses are not declared for the operation and the runtime keeps a Response. */
const problem = (status: 400 | 404 | 409, code: MockCode, title: string) =>
  new Response(JSON.stringify({ type: `https://sires.example/problems/${code}`, title, status, code }), { status, headers: { 'Content-Type': 'application/problem+json' } });

function emit(workflow: Workflow, from: string): void {
  const events = (globalThis as { siresMock?: { events?: { emit(event: EventInput): unknown } } }).siresMock?.events;
  events?.emit({ type: 'workflow.status_changed', projectId: workflow.projectId, objectType: 'workflow', objectId: workflow.id, fromState: from, toState: workflow.status });
}

/** Command → allowed source states and the target state (PRD 18.2; H8). */
const TRANSITIONS: Record<'pause' | 'resume' | 'cancel', { from: Workflow['status'][]; to: Workflow['status'] }> = {
  pause: { from: ['Running', 'Waiting for User'], to: 'Paused' },
  resume: { from: ['Paused'], to: 'Running' },
  cancel: { from: ['Created', 'Running', 'Waiting for User', 'Paused', 'Interrupted'], to: 'Cancelled' },
};

function command(fixtures: Fixtures, workflowId: string, name: keyof typeof TRANSITIONS) {
  const s = init(fixtures);
  const workflow = s.workflows.find((w) => w.id === workflowId);
  if (!workflow) return problem(404, 'not_found', 'Không có workflow');
  const rule = TRANSITIONS[name];
  if (!rule.from.includes(workflow.status)) return problem(409, 'invalid_transition', `Không ${name} được workflow ${workflow.status}`);
  const from = workflow.status;
  workflow.status = rule.to;
  if (rule.to === 'Cancelled') workflow.endedAt = iso();
  emit(workflow, from);
  return { status: 200 as const, body: structuredClone(workflow) };
}

export const overrides: Overrides = {
  listWorkflows: ({ query, fixtures }) => {
    const s = init(fixtures);
    const statuses = query.status ? (Array.isArray(query.status) ? query.status : [query.status]) : undefined;
    const items = s.workflows
      .filter((w) => (!query.projectId || w.projectId === query.projectId) && (!statuses || statuses.includes(w.status)))
      .sort((a, b) => (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt));
    const limit = Number(query.limit ?? 50);
    const start = Number(query.cursor ?? 0);
    return { status: 200 as const, body: { items: items.slice(start, start + limit), nextCursor: start + limit < items.length ? String(start + limit) : null } };
  },
  getWorkflow: ({ params, fixtures }) => {
    const workflow = init(fixtures).workflows.find((w) => w.id === params.workflowId);
    return workflow ? { status: 200 as const, body: structuredClone(workflow) } : problem(404, 'not_found', 'Không có workflow');
  },
  pauseWorkflow: ({ params, fixtures }) => command(fixtures, params.workflowId, 'pause'),
  resumeWorkflow: ({ params, fixtures }) => command(fixtures, params.workflowId, 'resume'),
  cancelWorkflow: ({ params, fixtures }) => command(fixtures, params.workflowId, 'cancel'),
  decideWorkflowRecovery: ({ params, body, fixtures }) => {
    const s = init(fixtures);
    const workflow = s.workflows.find((w) => w.id === params.workflowId);
    if (!workflow) return problem(404, 'not_found', 'Không có workflow');
    if (workflow.status !== 'Interrupted') return problem(409, 'invalid_transition', 'Workflow không ở trạng thái Interrupted');
    if (!body) return problem(400, 'validation_failed', 'Thiếu quyết định');
    if (body.decision === 'continue' && !workflow.lastCheckpointId) return problem(409, 'invalid_transition', 'Không có checkpoint nhất quán');
    if (body.decision === 'rerun_step' && !workflow.steps?.some((step) => step.id === body.stepId)) return problem(400, 'validation_failed', 'Chọn bước để chạy lại');
    const from = workflow.status;
    workflow.status = body.decision === 'cancel' ? 'Cancelled' : 'Running';
    if (body.decision === 'rerun_step') workflow.currentStepId = body.stepId;
    emit(workflow, from);
    return { status: 200 as const, body: structuredClone(workflow) };
  },
  listAgentRuns: ({ params, fixtures }) => {
    const items = init(fixtures).runs.filter((r) => r.workflowId === params.workflowId);
    return { status: 200 as const, body: { items, nextCursor: null } };
  },
  getAgentRun: ({ params, fixtures }) => {
    const run = init(fixtures).runs.find((r) => r.id === params.agentRunId);
    return run ? { status: 200 as const, body: structuredClone(run) } : problem(404, 'not_found', 'Không có Agent Run');
  },
  getAgentRunDebugTranscript: ({ params, fixtures }) => {
    const run = init(fixtures).runs.find((r) => r.id === params.agentRunId);
    if (!run?.hasDebugTranscript) return problem(404, 'not_found', 'Toàn văn đã hết hạn hoặc không lưu');
    return {
      status: 200 as const,
      body: { agentRunId: run.id, capturedAt: run.startedAt ?? iso(), expiresAt: iso(-24 * 29), request: { messages: [{ role: 'user', content: run.inputSummary }] }, response: { content: 'Đã tìm 14 tài liệu phù hợp.' } },
    };
  },
  listProjectAuditEvents: ({ params, query, fixtures }) => {
    const items = (fixtures.AuditEvent ?? []).filter(
      (e) => e.projectId === params.projectId && (!query.actorType || e.actor.type === query.actorType) && (!query.objectId || e.objectId === query.objectId),
    );
    return { status: 200 as const, body: { items: structuredClone([...items]), nextCursor: null } };
  },
};
