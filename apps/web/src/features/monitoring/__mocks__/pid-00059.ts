// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Mock of PID-00059 (Agent Activity, Workflow, Agent Run, Agent List, History; H6): the 10 operations the monitoring
// area owns, with a store that keeps changes for one dev session. Commands follow PRD 18.2: an invalid one answers
// 409 invalid_transition; a valid one changes the workflow and, on the dev server, pushes workflow.status_changed.
// Data: the shared demo workflows plus the RAG project's workflows of the reference screens: wf-52d (T-2.3, five
// steps, step 4 is the deliberation of PID-00083) and one workflow in each other state (S01: all eight states).

import type { PublicApi } from '@sires/contracts';
import { ACCOUNT_ID, id, projectIds, type EventInput, type Fixtures, type Overrides } from '../../../shell/mock';
import { DELIBERATION_ID } from './deliberation';

type Schemas = PublicApi.components['schemas'];
type Workflow = Schemas['Workflow'];
type AgentRun = Schemas['AgentRun'];
type Step = Schemas['WorkflowStep'];
type AuditEvent = Schemas['AuditEvent'];
type TypedRef = Schemas['TypedRef'];

/** wf-52d of Workflow.dc.html: T-2.3, Discovery → … → Synthesis, at step 4 of 5. Same id as the deliberation scenario
 * of PID-00083 (`id('workflow', 52)`, step 4 = `id('step', 524)`), so both mocks describe one workflow. */
export const WF_52D = id('workflow', 52);
/** One workflow of the RAG project in each remaining state (reference screens: Paused, Created, Interrupted, ended). */
export const WF = { paused: id('workflow', 53), created: id('workflow', 54), failed: id('workflow', 55), cancelled: id('workflow', 56), interrupted: id('workflow', 57), succeeded: id('workflow', 58) };

const iso = (hoursAgo = 0) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const ACTOR = { type: 'researcher' as const, accountId: ACCOUNT_ID };
const ref = (type: string, n: number, version?: number): TypedRef => ({ type, id: id(type === 'evidence' ? 'reference' : type === 'research_context_version' ? 'context' : 'reference', n), ...(version ? { version } : {}) });

interface StepSpec {
  agent: Schemas['AgentName'];
  description: string;
  status: Schemas['StepStatus'];
  inputs?: TypedRef[];
  outputs?: TypedRef[];
  run?: Partial<AgentRun>;
  extra?: Partial<Step>;
}

function build(n: number, status: Workflow['status'], taskId: string, startedHoursAgo: number | undefined, specs: StepSpec[], extra: Partial<Workflow> = {}) {
  const workflowId = id('workflow', n);
  const runs: AgentRun[] = [];
  const steps: Step[] = specs.map((spec, i) => {
    const stepId = id('step', n * 10 + i + 1);
    const runId = id('agentRun', n * 10 + i + 1);
    const ran = spec.status !== 'Pending' && !(spec.status === 'Cancelled' && !spec.run);
    if (ran) {
      const start = (startedHoursAgo ?? 0) - i * 0.25;
      const running = spec.status === 'Running' && status === 'Running';
      runs.push({
        id: runId,
        accountId: ACCOUNT_ID,
        createdAt: iso(start),
        createdBy: { type: 'agent', agent: spec.agent, agentRunId: runId },
        rowVersion: 1,
        projectId: projectIds.rag,
        workflowId,
        stepId,
        agent: spec.agent,
        instance: null,
        providerConnectionId: id('connection', 1),
        provider: 'openai',
        model: 'gpt-4.1-mini',
        adapterVersion: '2026.11',
        status: running ? 'Running' : spec.status === 'Failed' ? 'Failed' : spec.status === 'Cancelled' ? 'Cancelled' : 'Succeeded',
        attempts: 1,
        inputSummary: running ? '' : spec.description,
        contextManifest: running ? {} : { entities: [{ type: 'task', id: taskId }, ...(spec.inputs ?? [])], evidenceIds: [] },
        toolCalls: running ? [] : [{ name: 'search_scholar', argumentsSummary: 'phương pháp đo hallucination, 2019–2026', resultSummary: '18 kết quả' }],
        outputRefs: spec.outputs ?? [],
        structuredOutput: running ? {} : { items: (spec.outputs ?? []).length },
        usage: running ? { noData: true, inputTokens: null, outputTokens: null, calls: 0 } : { noData: false, inputTokens: 12_000 + i * 1_500, outputTokens: 1_800 + i * 200, calls: 1 },
        startedAt: iso(start),
        ...(running ? {} : { endedAt: iso(start - 0.2) }),
        hasDebugTranscript: false,
        discarded: false,
        ...spec.run,
      } as AgentRun);
    }
    return {
      id: stepId,
      order: i + 1,
      description: spec.description,
      assignedAgent: spec.agent,
      status: spec.status,
      inputRefs: spec.inputs ?? [],
      outputRefs: spec.outputs ?? [],
      attemptCount: ran ? 1 : 0,
      agentRunIds: ran ? [runId] : [],
      ...spec.extra,
    } as Step;
  });
  const workflow: Workflow = {
    id: workflowId,
    accountId: ACCOUNT_ID,
    createdAt: iso(startedHoursAgo ?? 0.1),
    createdBy: ACTOR,
    rowVersion: 1,
    projectId: projectIds.rag,
    idempotencyKey: `wf-${n}`,
    type: 'task_execution',
    taskId,
    planVersionId: id('planVersion', 2),
    triggeredBy: ACTOR,
    status,
    steps,
    ...(startedHoursAgo === undefined ? {} : { startedAt: iso(startedHoursAgo) }),
    ...extra,
  };
  return { workflow, runs };
}

/** The five steps of T-2.3 (Workflow.dc.html): outputs of a step are the inputs of the next one (handoff). */
const discovered = [ref('reference', 21), ref('reference', 22)];
const filtered = [ref('reference', 21)];
const evidence = [ref('evidence', 31), ref('evidence', 32)];

function seed(): { workflows: Workflow[]; runs: AgentRun[]; audit: AuditEvent[] } {
  const t23 = id('task', 3);
  const all = [
    build(52, 'Running', t23, 2, [
      { agent: 'discovery', description: 'Tìm tài liệu trên Google Scholar', status: 'Succeeded', inputs: [ref('research_context_version', 1, 4)], outputs: discovered, run: { attempts: 2, hasDebugTranscript: true, usage: { noData: false, inputTokens: 14_200, outputTokens: 2_050, calls: 2, extra: { cost: 0.042, currency: 'USD' } } } },
      { agent: 'discovery', description: 'Lọc theo phạm vi năm xuất bản', status: 'Succeeded', inputs: discovered, outputs: filtered },
      { agent: 'evidence_retrieval', description: 'Truy xuất evidence cho từng phương pháp đo', status: 'Succeeded', inputs: filtered, outputs: evidence },
      { agent: 'orchestrator', description: 'Chọn khung so sánh (có thể mở thảo luận)', status: 'Running', inputs: evidence, extra: { deliberationId: DELIBERATION_ID }, run: { deliberationId: DELIBERATION_ID } },
      { agent: 'synthesis', description: 'Lập ma trận so sánh phương pháp', status: 'Pending' },
    ]),
    build(53, 'Paused', id('task', 1), 6, [
      { agent: 'discovery', description: 'Tìm nghiên cứu về RAG trong y sinh', status: 'Succeeded', outputs: discovered },
      { agent: 'reference_processing', description: 'Chuẩn hóa metadata của 18 kết quả', status: 'Pending', inputs: discovered },
    ]),
    build(54, 'Created', id('task', 4), undefined, [{ agent: 'writing', description: 'Viết mục 2.3 — Rủi ro trích dẫn sai', status: 'Pending' }]),
    build(57, 'Interrupted', id('task', 4), 3, [
      { agent: 'discovery', description: 'Tìm tài liệu trên Google Scholar', status: 'Succeeded', outputs: discovered },
      { agent: 'discovery', description: 'Lọc theo phạm vi năm xuất bản', status: 'Succeeded', inputs: discovered, outputs: filtered },
      { agent: 'evidence_retrieval', description: 'Truy xuất evidence cho từng phương pháp đo', status: 'Failed', inputs: filtered, run: { error: { code: 'interrupted', message: 'Mất kết nối hạ tầng.' } } },
    ]),
    build(55, 'Failed', id('task', 2), 30, [
      { agent: 'evidence_retrieval', description: 'Truy xuất đoạn liên quan từ 12 reference', status: 'Failed', run: { error: { code: 'auth_failed', message: 'Provider từ chối key.' }, attempts: 1 } },
    ]),
    build(56, 'Cancelled', id('task', 3), 28, [
      { agent: 'discovery', description: 'Tìm tài liệu trên Semantic Scholar', status: 'Succeeded', outputs: discovered },
      { agent: 'evidence_retrieval', description: 'Truy xuất evidence', status: 'Cancelled' },
    ]),
    build(58, 'Succeeded', id('task', 1), 48, [
      { agent: 'discovery', description: 'Tìm nghiên cứu về RAG trong y sinh', status: 'Succeeded', outputs: discovered },
      { agent: 'reference_processing', description: 'Chuẩn hóa metadata', status: 'Succeeded', inputs: discovered, outputs: filtered },
    ]),
  ];
  const byId = (n: number) => all.find((w) => w.workflow.id === id('workflow', n))!;
  const w52 = byId(52).workflow;
  w52.currentStepId = w52.steps![3]!.id;
  w52.lastCheckpointId = id('audit', 523);
  w52.lastCheckpoint = { id: id('audit', 523), stepId: w52.steps![2]!.id, sequence: 3, savedOutputRefs: evidence, consistent: true, at: iso(1.3) };
  const w53 = byId(53).workflow;
  w53.currentStepId = w53.steps![1]!.id;
  const w57 = byId(57).workflow;
  w57.currentStepId = w57.steps![2]!.id;
  w57.lastError = { code: 'interrupted', message: 'Mất kết nối hạ tầng ở bước 3.', agentRunId: w57.steps![2]!.agentRunIds![0] };
  w57.lastCheckpointId = id('audit', 572);
  w57.lastCheckpoint = { id: id('audit', 572), stepId: w57.steps![1]!.id, sequence: 2, savedOutputRefs: [...discovered, ...filtered], consistent: true, at: iso(2.6) };
  const w55 = byId(55).workflow;
  w55.endedAt = iso(29.8);
  w55.lastError = { code: 'auth_failed', message: 'Provider từ chối key.', agentRunId: w55.steps![0]!.agentRunIds![0] };
  const w56 = byId(56).workflow;
  w56.endedAt = iso(27.5);
  const w58 = byId(58).workflow;
  w58.endedAt = iso(47.4);

  const audit: AuditEvent[] = [
    auditEvent(501, ACTOR, 'workflow.cancelled', 'workflow', w56.id, 27.5, 'Hủy workflow của T-2.3.', { fromState: 'Running', toState: 'Cancelled' }),
    auditEvent(502, { type: 'agent', agent: 'orchestrator' }, 'workflow.created', 'workflow', w52.id, 2, 'Tạo workflow, lập 5 bước; giao bước 1 cho Discovery Agent.', { toState: 'Created' }),
    auditEvent(503, { type: 'agent', agent: 'discovery' }, 'agent_run.succeeded', 'agent_run', w52.steps![0]!.agentRunIds![0]!, 1.8, 'Hoàn tất bước 1 — 2 discovered result.', { toState: 'Succeeded' }),
    auditEvent(504, { type: 'system' }, 'workflow.status_changed', 'workflow', w57.id, 2.4, 'Mất kết nối hạ tầng ở bước 3 → Interrupted.', { fromState: 'Running', toState: 'Interrupted' }),
    auditEvent(505, ACTOR, 'task.activated', 'task', t23, 2.05, 'Xác nhận thực thi T-2.3.', { apr: 'APR-02', fromState: 'Ready', toState: 'Queued' }),
    auditEvent(506, { type: 'agent', agent: 'evidence_retrieval' }, 'agent_run.succeeded', 'agent_run', w52.steps![2]!.agentRunIds![0]!, 1.3, 'Hoàn tất bước 3 — 2 evidence.', { toState: 'Succeeded' }),
  ];
  return { workflows: all.map((w) => w.workflow), runs: all.flatMap((w) => w.runs), audit };
}

function auditEvent(n: number, actor: Schemas['ActorRef'], action: string, objectType: string, objectId: string, hoursAgo: number, summary: string, extra: Partial<AuditEvent> = {}): AuditEvent {
  return { id: id('audit', n), accountId: ACCOUNT_ID, projectId: projectIds.rag, actor, action, objectType, objectId, summary, at: iso(hoursAgo), ...extra };
}

interface State {
  workflows: Workflow[];
  runs: AgentRun[];
  audit: AuditEvent[];
}

let state: State | null = null;

function init(fixtures: Fixtures): State {
  if (state) return state;
  const extra = seed();
  state = {
    workflows: [...extra.workflows, ...structuredClone([...(fixtures.Workflow ?? [])])],
    runs: [...extra.runs, ...structuredClone([...(fixtures.AgentRun ?? [])])],
    audit: [...extra.audit, ...structuredClone([...(fixtures.AuditEvent ?? [])])],
  };
  return state;
}

/** Drop the store so the next request seeds it again (tests reset between cases). */
export function resetMonitoringMockState(): void {
  state = null;
}

type MockCode = 'invalid_transition' | 'not_found' | 'validation_failed';
/** Problem Details as a Response: some statuses are not declared for the operation and the runtime keeps a Response. */
const problem = (status: 400 | 404 | 409, code: MockCode, title: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ type: `https://sires.example/problems/${code}`, title, status, code, ...extra }), { status, headers: { 'Content-Type': 'application/problem+json' } });

function emit(workflow: Workflow, from: string): void {
  const events = (globalThis as { siresMock?: { events?: { emit(event: EventInput): unknown } } }).siresMock?.events;
  events?.emit({ type: 'workflow.status_changed', projectId: workflow.projectId, objectType: 'workflow', objectId: workflow.id, fromState: from, toState: workflow.status });
}

/** Command → allowed source states (PRD 18.2; H8, DEC-53). */
const FROM: Record<'pause' | 'resume' | 'cancel', Workflow['status'][]> = {
  pause: ['Running', 'Waiting for User'],
  resume: ['Paused'],
  cancel: ['Created', 'Running', 'Waiting for User', 'Paused', 'Interrupted'],
};

/** Page of a list: `cursor` is the offset of the next item (the contract's cursor is opaque). */
function page<T>(items: T[], query: object) {
  const { limit: size, cursor } = query as { limit?: unknown; cursor?: unknown };
  const limit = Number(size ?? 50);
  const start = Number(cursor ?? 0);
  return { items: structuredClone(items.slice(start, start + limit)), nextCursor: start + limit < items.length ? String(start + limit) : null };
}

function command(fixtures: Fixtures, workflowId: string, name: keyof typeof FROM) {
  const s = init(fixtures);
  const workflow = s.workflows.find((w) => w.id === workflowId);
  if (!workflow) return problem(404, 'not_found', 'Không có workflow');
  if (!FROM[name].includes(workflow.status)) return problem(409, 'invalid_transition', `Không ${name} được workflow ${workflow.status}`, { currentState: workflow.status });
  const from = workflow.status;
  if (name === 'pause') workflow.status = 'Paused';
  // A resumed workflow goes back to waiting while a blocking prompt is still Open (DEC-53, EC11).
  if (name === 'resume') workflow.status = workflow.steps?.some((step) => step.status === 'Waiting for User') ? 'Waiting for User' : 'Running';
  if (name === 'cancel') {
    workflow.status = 'Cancelled';
    workflow.endedAt = iso();
    for (const step of workflow.steps ?? []) if (step.status === 'Pending' || step.status === 'Running' || step.status === 'Waiting for User') step.status = 'Cancelled';
    s.audit.unshift(auditEvent(600 + s.audit.length, ACTOR, 'workflow.cancelled', 'workflow', workflow.id, 0, 'Hủy workflow.', { fromState: from, toState: 'Cancelled' }));
  }
  workflow.rowVersion += 1;
  emit(workflow, from);
  return { status: 200 as const, body: structuredClone(workflow) };
}

/** Every value of an array query parameter, repeated (`status=Running&status=Paused`, what the shell client sends;
 * the runtime's `query` keeps only the last one) or comma-separated (`status=Running,Paused`, the contract's explode: false). */
const queryList = (request: Request, name: string) => {
  const values = new URL(request.url).searchParams.getAll(name).flatMap((v) => v.split(',')).filter(Boolean);
  return values.length ? values : undefined;
};

export const overrides: Overrides = {
  listWorkflows: ({ query, request, fixtures }) => {
    const statuses = queryList(request, 'status');
    const items = init(fixtures)
      .workflows.filter((w) => (!query.projectId || w.projectId === query.projectId) && (!statuses || statuses.includes(w.status)) && (!query.taskId || w.taskId === query.taskId))
      .sort((a, b) => (b.endedAt ?? b.startedAt ?? b.createdAt).localeCompare(a.endedAt ?? a.startedAt ?? a.createdAt));
    return { status: 200 as const, body: page(items, query) };
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
    if (workflow.status !== 'Interrupted') return problem(409, 'invalid_transition', 'Workflow không ở trạng thái Interrupted', { currentState: workflow.status });
    if (!body) return problem(400, 'validation_failed', 'Thiếu quyết định');
    if (body.decision === 'continue' && !workflow.lastCheckpoint?.consistent) return problem(409, 'invalid_transition', 'Không có checkpoint nhất quán', { currentState: workflow.status });
    if (body.decision === 'rerun_step' && !workflow.steps?.some((step) => step.id === body.stepId)) return problem(400, 'validation_failed', 'Chọn bước để chạy lại');
    const from = workflow.status;
    if (body.decision === 'cancel') {
      workflow.status = 'Cancelled';
      workflow.endedAt = iso();
    } else {
      workflow.status = 'Running';
      const stepId = body.decision === 'rerun_step' ? body.stepId : workflow.currentStepId;
      workflow.currentStepId = stepId;
      const step = workflow.steps?.find((x) => x.id === stepId);
      if (step) step.status = 'Running';
    }
    workflow.rowVersion += 1;
    emit(workflow, from);
    return { status: 200 as const, body: structuredClone(workflow) };
  },
  listAgentRuns: ({ params, query, fixtures }) => {
    const items = init(fixtures)
      .runs.filter((r) => r.workflowId === params.workflowId && (!query.agent || r.agent === query.agent) && (!query.deliberationId || r.deliberationId === query.deliberationId))
      .sort((a, b) => (a.startedAt ?? a.createdAt).localeCompare(b.startedAt ?? b.createdAt));
    // listAgentRuns takes no cursor: every Agent Run of the workflow in one page.
    return { status: 200 as const, body: { items: structuredClone(items), nextCursor: null } };
  },
  getAgentRun: ({ params, fixtures }) => {
    const run = init(fixtures).runs.find((r) => r.id === params.agentRunId);
    return run ? { status: 200 as const, body: structuredClone(run) } : problem(404, 'not_found', 'Không có Agent Run');
  },
  getAgentRunDebugTranscript: ({ params, fixtures }) => {
    const run = init(fixtures).runs.find((r) => r.id === params.agentRunId);
    if (!run?.hasDebugTranscript) return problem(404, 'not_found', 'Toàn văn đã hết hạn hoặc không lưu');
    const captured = run.startedAt ?? iso();
    return {
      status: 200 as const,
      body: {
        agentRunId: run.id,
        capturedAt: captured,
        expiresAt: new Date(Date.parse(captured) + 30 * 86_400_000).toISOString(),
        request: { messages: [{ role: 'user', content: run.inputSummary }] },
        response: { content: 'Đã tìm 18 tài liệu phù hợp.' },
      },
    };
  },
  listProjectAuditEvents: ({ params, query, fixtures }) => {
    const items = init(fixtures)
      .audit.filter(
        (e) =>
          e.projectId === params.projectId &&
          (!query.actorType || e.actor.type === query.actorType) &&
          (!query.objectType || e.objectType === query.objectType) &&
          (!query.objectId || e.objectId === query.objectId),
      )
      .sort((a, b) => b.at.localeCompare(a.at));
    return { status: 200 as const, body: page(items, query) };
  },
};
