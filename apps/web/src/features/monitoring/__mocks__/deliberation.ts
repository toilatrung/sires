// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Mock of the Deliberation tab (PID-00083 H4), in its own file: stateful overrides of listDeliberations and
// getDeliberation on one store, and the scenarios of the reference screens Workflow--view-deliberation-running,
// -done, -failed, -cancelled (session dl-3c1 of workflow wf-52d, T-2.3). Operations of PID-00059, PID-00060
// (getWorkflow, getPrompt, answerPrompt…) are not claimed: tests override them. The line that merges
// `deliberationMocks` into the area's mocks (monitoring/__mocks__/index.ts) is added by the PR merged last.

import { ACCOUNT_ID, id, projectIds } from '../../../shell/mock';
import type { EventInput, FeatureMocks, Schemas } from '../../../shell/mock';

type Detail = Schemas['DeliberationDetail'];
type Entry = Schemas['DeliberationEntry'];
type Party = Schemas['DeliberationPartyRef'];

export const PROJECT_ID = projectIds.rag;
export const WORKFLOW_ID = id('workflow', 52);
export const STEP_ID = id('step', 524);
export const DELIBERATION_ID = id('workflow', 301); // dl-3c1
export const OLDER_DELIBERATION_ID = id('workflow', 300);
export const DECISION_PROMPT_ID = id('prompt', 61);
export const RECORD_VERSION_ID = id('artifactVersion', 61);
export const CONNECTION_CLAUDE = id('connection', 2);
export const CONNECTION_OPENAI = id('connection', 1);

const ORCH: Party = { agent: 'orchestrator' };
const A: Party = { agent: 'analysis', instance: 'A' };
const B: Party = { agent: 'analysis', instance: 'B' };
export const PARTIES = { ORCH, A, B };

const minutes = (m: number) => new Date(Date.UTC(2026, 10, 27, 10, 0) + m * 60_000).toISOString();
const run = (n: number) => id('agentRun', 800 + n);
let sequence = 0;
const entryId = (n: number) => id('message', 300 + n);

function entry(n: number, author: Party, round: number, type: Entry['type'], content: Entry['content'], extra: Partial<Entry> = {}): Entry {
  return {
    id: entryId(n),
    accountId: ACCOUNT_ID,
    projectId: PROJECT_ID,
    createdAt: minutes(n),
    createdBy: { type: 'agent', agent: author.agent, ...(author.instance ? { instance: author.instance } : {}) },
    rowVersion: 1,
    workflowId: WORKFLOW_ID,
    deliberationId: DELIBERATION_ID,
    round,
    author: { ...author, agentRunId: run(n) },
    type,
    content,
    status: 'final',
    ...extra,
  };
}

const point = (pointId: string, text: string, extra: Partial<Schemas['DeliberationPoint']> = {}) => ({ id: pointId, text, assumption: false, ...extra });

export const brief: Schemas['ProblemBrief'] = {
  problem: 'Chọn khung so sánh các phương pháp đo hallucination cho T-2.3.',
  problemType: 'methodology',
  contextRefs: [
    { type: 'research_context', id: id('context', 4), version: 4 },
    { type: 'task', id: id('task', 3), version: 3 },
  ],
  constraints: ['Chỉ nguồn 2019–2026 (câu trả lời prompt 09:44)', 'xong trong 2 tuần'],
  criteria: ['Tái lập được', 'Đủ evidence', 'Thời gian'],
  knownOptions: ['Ma trận theo benchmark', 'Phân loại theo cơ chế đo'],
  perspectives: [
    { participant: A, perspective: 'Xây dựng phương án' },
    { participant: B, perspective: 'Tìm rủi ro và phương án thay thế' },
  ],
};

/** Entries of the reference screens (positions of round 1, critiques of round 2, synthesis). */
export const entries = {
  brief: () => entry(1, ORCH, 0, 'problem_brief', brief),
  posO: () =>
    entry(6, ORCH, 1, 'position', {
      option: 'So sánh theo 3 trục: loại tác vụ, cách gán nhãn, khả năng tái lập',
      points: [
        { ...point('O1', 'Ba trục phủ cả tiêu chí tái lập và tiêu chí đủ evidence.', { sourceRefs: [{ type: 'evidence', id: id('evidence', 9) }, { type: 'evidence', id: id('evidence', 12) }] }), kind: 'rationale' },
        { ...point('O2', 'Làm xong trong 2 tuần với 14 Trusted Reference đã chọn.', { sourceRefs: [{ type: 'research_context', id: id('context', 4), version: 4 }] }), kind: 'rationale', criterion: 'Thời gian' },
      ],
      confidence: 'medium',
    }),
  posA: () =>
    entry(5, A, 1, 'position', {
      option: 'Ma trận theo benchmark công bố (TruthfulQA, HaluEval, FActScore)',
      points: [
        { ...point('A1', 'Cả ba benchmark có số liệu công bố, lập ma trận nhanh.', { sourceRefs: [{ type: 'reference', id: id('reference', 3) }, { type: 'reference', id: id('reference', 7) }] }), kind: 'rationale' },
        { ...point('A2', 'Cách so theo benchmark phổ biến trong lĩnh vực.', { assumption: true }), kind: 'assumption' },
      ],
      confidence: 'high',
    }),
  posB: () =>
    entry(7, B, 1, 'position', {
      option: 'Phân loại theo cơ chế đo: đối chiếu nguồn, tự nhất quán, người chấm',
      points: [
        { ...point('B1', 'Các benchmark dùng phiên bản dataset khác nhau, số liệu không so trực tiếp được.', { sourceRefs: [{ type: 'evidence', id: id('evidence', 14) }] }), kind: 'risk' },
        { ...point('B2', 'Cách gán nhãn của người chấm khó tái lập.', { assumption: true }), kind: 'assumption' },
      ],
      confidence: 'medium',
    }),
  critO: () =>
    entry(15, ORCH, 2, 'critique', {
      targetEntryId: entryId(5),
      points: [
        { ...point('OC1', 'Chưa có Trusted Reference nào xác nhận; giữ nhãn giả định.'), targetEntryId: entryId(5), targetPointId: 'A2', kind: 'disagree' },
        { ...point('OC2', 'E-14 ghi rõ hai phiên bản HaluEval.'), targetEntryId: entryId(7), targetPointId: 'B1', kind: 'agree' },
      ],
    }),
  critA: () =>
    entry(16, A, 2, 'critique', {
      targetEntryId: entryId(7),
      points: [{ ...point('AC1', 'R-11 công bố quy trình gán nhãn, giảm rủi ro tái lập.', { sourceRefs: [{ type: 'reference', id: id('reference', 11) }] }), targetEntryId: entryId(7), targetPointId: 'B2', kind: 'add_information' }],
    }),
  posA2: () =>
    entry(
      18,
      A,
      2,
      'position',
      {
        option: 'Ma trận benchmark kèm trục cơ chế đo',
        points: [{ ...point('A3', 'Ghi rõ phiên bản dataset trong ma trận để xử lý rủi ro B1.', { sourceRefs: [{ type: 'evidence', id: id('evidence', 14) }] }), kind: 'rationale' }],
        confidence: 'high',
      },
      { supersedesEntryId: entryId(5), changeReason: 'B1 và E-14: số liệu benchmark không so trực tiếp được.' },
    ),
  critB: () =>
    entry(17, B, 2, 'critique', {
      targetEntryId: entryId(5),
      points: [
        { ...point('BC1', 'Số liệu công bố dùng phiên bản dataset khác nhau (E-14).', { sourceRefs: [{ type: 'evidence', id: id('evidence', 14) }] }), targetEntryId: entryId(5), targetPointId: 'A1', kind: 'disagree' },
        { ...point('BC2', 'Thời gian 2 tuần khớp ràng buộc.'), targetEntryId: entryId(6), targetPointId: 'O2', kind: 'agree' },
      ],
    }),
  synthesis: () =>
    entry(24, ORCH, 3, 'synthesis', {
      consensus: [
        'Khả năng tái lập là tiêu chí ưu tiên (cả ba bên).',
        'Số liệu benchmark công bố không so trực tiếp được khi khác phiên bản dataset (B1; Orchestrator đồng ý; A đổi lập trường).',
      ],
      disagreements: [
        {
          point: 'Trục chính của bảng so sánh',
          positions: [
            { participant: ORCH, entryId: entryId(6), pointId: 'O1', summary: 'ba trục tác vụ, gán nhãn, tái lập' },
            { participant: A, entryId: entryId(18), pointId: 'A3', summary: 'benchmark kèm trục cơ chế đo' },
            { participant: B, entryId: entryId(7), pointId: 'B1', summary: 'chỉ theo cơ chế đo' },
          ],
        },
      ],
      options: [
        { id: 'opt-o', label: 'Orchestrator — ba trục', proposedBy: [ORCH], tradeoffs: [{ criterion: 'Tái lập được', assessment: 'Cao' }, { criterion: 'Đủ evidence', assessment: 'Trung bình' }, { criterion: 'Thời gian', assessment: '2 tuần' }] },
        { id: 'opt-a', label: 'A — benchmark kèm cơ chế đo', proposedBy: [A], tradeoffs: [{ criterion: 'Tái lập được', assessment: 'Trung bình' }, { criterion: 'Đủ evidence', assessment: 'Cao' }, { criterion: 'Thời gian', assessment: '1,5 tuần' }] },
        { id: 'opt-b', label: 'B — theo cơ chế đo', proposedBy: [B], tradeoffs: [{ criterion: 'Tái lập được', assessment: 'Cao (B2 là giả định)' }, { criterion: 'Đủ evidence', assessment: 'Trung bình' }, { criterion: 'Thời gian', assessment: '2,5 tuần' }] },
      ],
      recommendation: { optionId: 'opt-a', rationale: 'phương án A đã sửa — đủ evidence nhất và vẫn có trục tái lập; ghi rõ phiên bản dataset trong ma trận để xử lý rủi ro B1.' },
      questions: ['Có cần thêm benchmark tiếng Việt không?'],
      finalPositionEntryIds: [entryId(6), entryId(18), entryId(7)],
    }),
};

function participant(party: Party, connection: string, connectionName: string, model: string, status: Schemas['ParticipantStatus'] = 'idle', current?: string): Schemas['DeliberationParticipant'] {
  return { ...party, providerConnectionId: connection, providerConnectionName: connectionName, provider: connection === CONNECTION_CLAUDE ? 'anthropic' : 'openai', model, status, currentAgentRunId: current ?? null };
}

const usage = (party: Party | undefined, runs: number, input: number, output: number, cost: number) => ({
  ...(party ?? {}),
  inputTokens: input,
  outputTokens: output,
  calls: runs,
  cost,
  currency: 'USD',
  agentRunCount: runs,
  noDataAgentRunCount: 0,
  costAgentRunCount: runs,
});

/** Base session dl-3c1; scenarios change rounds, entries and status. */
function session(overrides: Partial<Detail> = {}): Detail {
  return {
    id: DELIBERATION_ID,
    accountId: ACCOUNT_ID,
    projectId: PROJECT_ID,
    createdAt: minutes(2),
    createdBy: { type: 'agent', agent: 'orchestrator' },
    rowVersion: 1,
    workflowId: WORKFLOW_ID,
    stepId: STEP_ID,
    problemType: 'methodology',
    brief,
    participants: [
      participant(ORCH, CONNECTION_CLAUDE, 'Claude cá nhân', 'claude-sonnet-5-5'),
      participant(A, CONNECTION_OPENAI, 'OpenAI cá nhân', 'gpt-5'),
      participant(B, CONNECTION_OPENAI, 'OpenAI cá nhân', 'gpt-5'),
    ],
    currentRound: 1,
    maxRounds: 2,
    contextSnapshotId: id('context', 21),
    status: 'Running',
    sameModelWarning: true,
    startedAt: minutes(2),
    rounds: [{ round: 1, kind: 'independent', closed: false }],
    entries: [entries.brief()],
    contextSnapshot: {
      id: id('context', 21),
      projectId: PROJECT_ID,
      deliberationId: DELIBERATION_ID,
      entities: Array.from({ length: 7 }, (_, i) => ({ type: 'reference', id: id('reference', i + 1) })),
      outdated: false,
      createdAt: minutes(2),
    },
    usageByParticipant: [usage(ORCH, 1, 6100, 1300, 0.04), usage(A, 1, 7400, 1450, 0.03), usage(B, 1, 7900, 1520, 0.03)] as Schemas['ParticipantUsage'][],
    usageTotal: usage(undefined, 3, 21400, 4270, 0.1),
    ...overrides,
  };
}

const running = (party: Party, n: number) => participant(party, party.agent === 'orchestrator' ? CONNECTION_CLAUDE : CONNECTION_OPENAI, party.agent === 'orchestrator' ? 'Claude cá nhân' : 'OpenAI cá nhân', party.agent === 'orchestrator' ? 'claude-sonnet-5-5' : 'gpt-5', 'running', run(n));

export const scenarios = {
  /** Round 1 open: only the Problem Brief, three pending positions (PID-00083-AC01). */
  round1: (): Detail =>
    session({
      participants: [running(ORCH, 50), running(A, 51), running(B, 52)],
      pendingEntries: [ORCH, A, B].map((author) => ({ round: 1, author, type: 'position' as const })),
    }),
  /** Round 1 closed, round 2 open (EC03). */
  round2: (): Detail =>
    session({
      currentRound: 2,
      participants: [running(ORCH, 53), running(A, 54), running(B, 55)],
      rounds: [
        { round: 1, kind: 'independent', closed: true, closedAt: minutes(7) },
        { round: 2, kind: 'cross_critique', closed: false },
      ],
      entries: [entries.brief(), entries.posO(), entries.posA(), entries.posB()],
      pendingEntries: [ORCH, A, B].map((author) => ({ round: 2, author, type: 'critique' as const })),
    }),
  /** Completed with two rounds, synthesis, decision prompt (UX-MONITOR-006-AC01). */
  completed: (): Detail =>
    session({
      currentRound: 3,
      status: 'Completed',
      endedAt: minutes(24),
      rounds: [
        { round: 1, kind: 'independent', closed: true, closedAt: minutes(7) },
        { round: 2, kind: 'cross_critique', closed: true, closedAt: minutes(17) },
        { round: 3, kind: 'synthesis', closed: true, closedAt: minutes(24) },
      ],
      entries: [entries.brief(), entries.posO(), entries.posA(), entries.posB(), entries.critO(), entries.critA(), entries.posA2(), entries.critB(), entries.synthesis()],
      synthesisEntryId: entryId(24),
      recordArtifactId: id('artifact', 61),
      recordArtifactVersionId: RECORD_VERSION_ID,
      decisionPromptId: DECISION_PROMPT_ID,
      usageByParticipant: [usage(ORCH, 3, 18420, 3960, 0.11), usage(A, 2, 15210, 2880, 0.07), usage(B, 2, 16050, 3120, 0.08)] as Schemas['ParticipantUsage'][],
      usageTotal: usage(undefined, 7, 49680, 9960, 0.26),
    }),
  /** Failed in round 1: B has no position after retries (EC13). */
  failed: (): Detail =>
    session({
      status: 'Failed',
      endedAt: minutes(6),
      participants: [
        participant(ORCH, CONNECTION_CLAUDE, 'Claude cá nhân', 'claude-sonnet-5-5'),
        participant(A, CONNECTION_OPENAI, 'OpenAI cá nhân', 'gpt-5'),
        { ...participant(B, CONNECTION_OPENAI, 'OpenAI cá nhân', 'gpt-5', 'error'), currentAgentRunId: id('agentRun', 812) },
      ],
      rounds: [{ round: 1, kind: 'independent', closed: true, closedAt: minutes(6) }],
      entries: [entries.brief(), entries.posO(), entries.posA()],
      decisionPromptId: DECISION_PROMPT_ID,
      usageByParticipant: [usage(ORCH, 1, 6100, 1300, 0.04), usage(A, 1, 7400, 1450, 0.03), { ...usage(B, 1, 0, 0, 0), noDataAgentRunCount: 1, costAgentRunCount: 0 }] as Schemas['ParticipantUsage'][],
      usageTotal: { ...usage(undefined, 3, 13500, 2750, 0.07), noDataAgentRunCount: 1 },
    }),
  /** Completed, its Context Snapshot outdated after a Reference changed (EC12). */
  outdated: (): Detail => {
    const detail = scenarios.completed();
    detail.snapshotOutdated = true;
    detail.contextSnapshot = { ...detail.contextSnapshot, outdated: true, changedEntities: [{ type: 'reference', id: id('reference', 15), newVersion: 2 }] };
    return detail;
  },
  /** Cancelled in round 2: entries kept (EC14). */
  cancelled: (): Detail =>
    session({
      status: 'Cancelled',
      currentRound: 2,
      endedAt: minutes(12),
      rounds: [
        { round: 1, kind: 'independent', closed: true, closedAt: minutes(7) },
        { round: 2, kind: 'cross_critique', closed: false },
      ],
      entries: [entries.brief(), entries.posO(), entries.posA(), entries.posB()],
    }),
};

/** Usage summary of a list row. */
const summary = (detail: Detail): Schemas['Deliberation'] => {
  const row: Partial<Detail> = { ...detail };
  for (const key of ['rounds', 'entries', 'pendingEntries', 'synthesisEntryId', 'contextSnapshot', 'snapshotOutdated', 'usageByParticipant', 'chosenOptionIds'] as const) delete row[key];
  return row as Schemas['Deliberation'];
};

/* ---------- Store ---------- */

/** dev:mock starts with two sessions of the workflow (the picker, EC20); tests reset to the scenario they need. */
let store: Detail[] = [{ ...scenarios.completed(), id: OLDER_DELIBERATION_ID, startedAt: minutes(-60 * 24), problemType: 'plan_structure' }, scenarios.round1()];
type Emit = (event: EventInput) => void;
let emitter: Emit | undefined;

/** Back to one scenario (or several sessions, newest last); tests call it before each test. */
export function resetDeliberationMock(...sessions: Detail[]): void {
  store = sessions.length ? sessions : [scenarios.round1()];
  sequence = 0;
}

export function deliberationState(): Detail[] {
  return store;
}

export function setDeliberationEmitter(emit: Emit | undefined): void {
  emitter = emit;
}

function emit(event: EventInput): void {
  (emitter ?? (globalThis as { siresMock?: { events?: { emit: Emit } } }).siresMock?.events?.emit)?.(event);
}

/** Close the open round of a session: its entries become visible, then deliberation.round_closed (EC19). */
export function closeRound(deliberationId: string, revealed: Entry[]): void {
  const detail = store.find((d) => d.id === deliberationId)!;
  const open = detail.rounds.find((r) => !r.closed)!;
  open.closed = true;
  open.closedAt = minutes(10 + ++sequence);
  detail.entries = [...detail.entries, ...revealed];
  detail.pendingEntries = (detail.pendingEntries ?? []).filter((p) => p.round !== open.round);
  detail.rowVersion += 1;
  emit({ type: 'deliberation.round_closed', projectId: detail.projectId, objectType: 'deliberation', objectId: detail.id });
}

const find = (deliberationId: string) => {
  const detail = store.find((d) => d.id === deliberationId);
  if (!detail) throw new Error(`no session ${deliberationId} in the deliberation mock`);
  return detail;
};

/** Retract an entry of a session (EC08), then deliberation.entry_retracted. */
export function retractEntry(deliberationId: string, targetEntryId: string, reason: string): void {
  const detail = find(deliberationId);
  const target = detail.entries.find((e) => e.id === targetEntryId);
  if (!target) throw new Error(`no entry ${targetEntryId}`);
  target.status = 'retracted';
  detail.entries = [...detail.entries, { ...target, id: entryId(90 + ++sequence), type: 'retraction', status: 'final', supersedesEntryId: undefined, content: { targetEntryId, reason } }];
  detail.rowVersion += 1;
  emit({ type: 'deliberation.entry_retracted', projectId: detail.projectId, objectType: 'deliberation', objectId: detail.id });
}

/** Change the status of a session (Completed, Failed, Cancelled), then deliberation.status_changed. */
export function setDeliberationStatus(deliberationId: string, status: Detail['status']): void {
  const detail = find(deliberationId);
  const fromState = detail.status;
  detail.status = status;
  if (status !== 'Running') detail.endedAt = minutes(30 + ++sequence);
  detail.rowVersion += 1;
  emit({ type: 'deliberation.status_changed', projectId: detail.projectId, objectType: 'deliberation', objectId: detail.id, fromState, toState: status });
}

/** A Reference of the snapshot changed (EC12), then context_snapshot.outdated. */
export function markSnapshotOutdated(deliberationId: string, changed: NonNullable<Detail['contextSnapshot']['changedEntities']>): void {
  const detail = find(deliberationId);
  detail.snapshotOutdated = true;
  detail.contextSnapshot = { ...detail.contextSnapshot, outdated: true, changedEntities: changed };
  detail.rowVersion += 1;
  emit({ type: 'context_snapshot.outdated', projectId: detail.projectId, objectType: 'context_snapshot', objectId: detail.contextSnapshotId });
}

/** Problem of a session that is not there, as the mock runtime answers 404 (shell/mock/runtime.ts). */
const notFound = () =>
  new Response(JSON.stringify({ type: 'https://sires.etroy.local/problems/not_found', title: 'Không tìm thấy', status: 404, code: 'not_found' }), {
    status: 404,
    headers: { 'content-type': 'application/problem+json' },
  });

export const deliberationMocks: FeatureMocks = {
  overrides: {
    listDeliberations: ({ params, query }) => {
      const items = store
        .filter((d) => d.projectId === params.projectId)
        .filter((d) => !query.workflowId || d.workflowId === query.workflowId)
        .filter((d) => !query.status || d.status === query.status)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .map(summary);
      return { status: 200, body: { items, nextCursor: null } };
    },
    getDeliberation: ({ params }) => {
      const detail = store.find((d) => d.id === params.deliberationId && d.projectId === params.projectId);
      return detail ? { status: 200, body: structuredClone(detail) } : notFound();
    },
  },
};
