// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// One in-memory store of Plan and Task for the planning mock (PID-00082 S01, H5): commands follow the state tables
// of PRD 9.8 (Task) and 5.2 (Plan Version); a command not allowed in the current state answers 409, a stale If-Match
// 412; status changes emit task.status_changed / plan_version.status_changed on the mock /events.

import { ACCOUNT_ID, id } from '../../../shell/mock';
import type { EventInput, Schemas } from '../../../shell/mock';
import { addedEdges, findCycles } from '../graph';
import { initialReviews, initialTasks, initialVersions, PASS_DETAIL, PLAN_ID, PROJECT_ID, readiness } from './fixtures';

type PlanVersion = Schemas['PlanVersion'];
type Task = Schemas['Task'];
type TaskStatus = Schemas['TaskStatus'];

export interface PlanningState {
  planExists: boolean;
  versions: PlanVersion[];
  tasks: Task[];
  reviews: Schemas['TaskReview'][];
}

const fresh = (): PlanningState => ({ planExists: true, versions: initialVersions(), tasks: initialTasks(), reviews: initialReviews() });
let state: PlanningState = fresh();
let counter = 100;

/** Back to the fixtures (tests call it before each test). */
export function resetPlanningMock(options: { withoutPlan?: boolean } = {}): void {
  state = fresh();
  if (options.withoutPlan) state.planExists = false;
}

export function planningState(): PlanningState {
  return state;
}

type Emit = (event: EventInput) => void;
let emitter: Emit | undefined;

/** Where status-change events go: the test's `mock.events.emit`; in dev the mock worker's stream. */
export function setPlanningEmitter(emit: Emit | undefined): void {
  emitter = emit;
}

function emit(event: EventInput): void {
  const target = emitter ?? (globalThis as { siresMock?: { events?: { emit: Emit } } }).siresMock?.events?.emit;
  target?.(event);
}

const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

export function problem(status: number, code: Schemas['ErrorCode'], detail: string): Schemas['Problem'] {
  return { type: `https://sires.etroy.local/problems/${code}`, title: code, status, code, detail };
}

export const isRag = (projectId: string | undefined) => projectId === PROJECT_ID;

export function baseline(): PlanVersion | undefined {
  return state.versions.find((v) => v.status === 'Approved');
}

export function openVersion(): PlanVersion | undefined {
  return state.versions.find((v) => v.status === 'Draft' || v.status === 'Proposed');
}

export function planOf(): Schemas['ResearchPlan'] {
  return {
    id: PLAN_ID,
    projectId: PROJECT_ID,
    baselineVersionId: baseline()?.id ?? null,
    openVersionId: openVersion()?.id ?? null,
    versions: [...state.versions]
      .sort((a, b) => b.versionNumber - a.versionNumber)
      .map(({ id, versionNumber, status, changeSummary }) => ({ id, versionNumber, status, changeSummary })),
  };
}

export function findVersion(id: string): PlanVersion | undefined {
  return state.versions.find((v) => v.id === id);
}

export function findTask(id: string): Task | undefined {
  return state.tasks.find((t) => t.id === id);
}

const etagOf = (row: { rowVersion: number }) => `"${row.rowVersion}"`;
export const matches = (ifMatch: string | null, row: { rowVersion: number }) => ifMatch === etagOf(row) || ifMatch === String(row.rowVersion);
export { etagOf };

function setVersionStatus(version: PlanVersion, status: Schemas['PlanVersionStatus']): void {
  const fromState = version.status;
  version.status = status;
  version.rowVersion += 1;
  version.updatedAt = now();
  emit({ type: 'plan_version.status_changed', projectId: PROJECT_ID, objectType: 'plan_version', objectId: version.id, fromState, toState: status });
}

function setTaskStatus(task: Task, status: TaskStatus, allowedActions: Task['allowedActions']): void {
  const fromState = task.status;
  task.status = status;
  // allowedActions is readOnly for clients; the mock server sets it.
  (task as { allowedActions?: Task['allowedActions'] }).allowedActions = allowedActions;
  task.rowVersion += 1;
  task.updatedAt = now();
  emit({ type: 'task.status_changed', projectId: PROJECT_ID, objectType: 'task', objectId: task.id, fromState, toState: status });
}

/* ---------- Plan Version commands (5.2) ---------- */

export function submit(version: PlanVersion): { ok: true } | { ok: false; status: 409 | 422; problem: Schemas['Problem'] } {
  if (version.status !== 'Draft') return { ok: false, status: 409, problem: problem(409, 'invalid_transition', `Plan Version v${version.versionNumber} không ở Draft.`) };
  const cycles = findCycles(version.tasks ?? []);
  if (cycles.length) {
    const key = (id: string) => version.tasks?.find((t) => t.taskId === id)?.stableKey ?? id;
    return { ok: false, status: 422, problem: problem(422, 'dependency_cycle', `Chu trình ${[...cycles[0]!, cycles[0]![0]!].map(key).join(' → ')}`) };
  }
  setVersionStatus(version, 'Proposed');
  return { ok: true };
}

export function approve(version: PlanVersion): boolean {
  if (version.status !== 'Proposed') return false;
  const previous = baseline();
  if (previous) setVersionStatus(previous, 'Superseded');
  setVersionStatus(version, 'Approved');
  return true;
}

export function reject(version: PlanVersion, reason: string): boolean {
  if (version.status !== 'Proposed') return false;
  version.rejectionReason = reason;
  setVersionStatus(version, 'Rejected');
  return true;
}

/** Withdraw a Proposed version back into editing: it becomes Rejected (“rút lại để sửa”), a new Draft copies it. */
export function withdraw(version: PlanVersion): PlanVersion | undefined {
  if (version.status !== 'Proposed') return undefined;
  version.rejectionReason = 'Rút lại để sửa';
  setVersionStatus(version, 'Rejected');
  const number = Math.max(...state.versions.map((v) => v.versionNumber)) + 1;
  const draftId = newId('2b');
  const draft: PlanVersion = {
    ...structuredClone(version),
    id: draftId,
    versionNumber: number,
    status: 'Draft',
    basedOnVersionId: version.id,
    rowVersion: 1,
    createdAt: now(),
    provenance: null,
    tasks: (version.tasks ?? []).map((t) => ({ ...t, planVersionId: draftId })),
  };
  state.versions.push(draft);
  emit({ type: 'plan_version.status_changed', projectId: PROJECT_ID, objectType: 'plan_version', objectId: draftId, toState: 'Draft' });
  return draft;
}

/** Changes of `to` against `from` (PlanDiff), with the material change codes of PRD 9.11. */
export function diff(to: PlanVersion, from: PlanVersion): Schemas['PlanDiff'] {
  const changes: NonNullable<Schemas['PlanDiff']['changes']> = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (!same(from.goals, to.goals)) changes.push({ path: 'goals', operation: 'modified', before: from.goals, after: to.goals, materialChangeCode: 'MC-01' });
  if (!same(from.methods, to.methods)) changes.push({ path: 'methods', operation: 'modified', before: from.methods, after: to.methods, materialChangeCode: 'MC-02' });
  const keyIn = (version: PlanVersion) => (id: string) => version.tasks?.find((t) => t.taskId === id)?.stableKey ?? id;
  const before = new Map((from.tasks ?? []).map((t) => [t.taskId, t]));
  const after = new Map((to.tasks ?? []).map((t) => [t.taskId, t]));
  for (const [taskId, task] of after) {
    const old = before.get(taskId);
    const key = task.stableKey ?? taskId;
    if (!old) {
      changes.push({ path: `tasks/${key}`, operation: 'added', after: { title: task.title, stableKey: key }, materialChangeCode: 'MC-03' });
      continue;
    }
    if (!same(old.dependsOn, task.dependsOn)) {
      changes.push({
        path: `tasks/${key}/dependsOn`,
        operation: 'modified',
        before: (old.dependsOn ?? []).map(keyIn(from)),
        after: (task.dependsOn ?? []).map(keyIn(to)),
        materialChangeCode: 'MC-05',
      });
    }
    if (old.executionLabel !== task.executionLabel) {
      changes.push({ path: `tasks/${key}/executionLabel`, operation: 'modified', before: old.executionLabel, after: task.executionLabel, materialChangeCode: 'MC-06' });
    }
    if (old.title !== task.title) changes.push({ path: `tasks/${key}/title`, operation: 'modified', before: old.title, after: task.title });
    if (old.phaseId !== task.phaseId) changes.push({ path: `tasks/${key}/phaseId`, operation: 'modified', before: old.phaseId, after: task.phaseId, materialChangeCode: 'MC-08' });
  }
  for (const [taskId, task] of before) {
    if (!after.has(taskId)) changes.push({ path: `tasks/${task.stableKey ?? taskId}`, operation: 'removed', before: { title: task.title }, materialChangeCode: 'MC-04' });
  }
  return { fromVersionId: from.id, toVersionId: to.id, changes };
}

export function impact(version: PlanVersion): Schemas['ImpactReport'] {
  const base = baseline();
  const affected: NonNullable<Schemas['ImpactReport']['affected']> = [];
  if (base) {
    for (const change of diff(version, base).changes ?? []) {
      const match = /^tasks\/([^/]+)\/dependsOn$/.exec(change.path ?? '');
      const task = match && state.tasks.find((t) => t.stableKey === match[1]);
      if (task) affected.push({ objectType: 'task', objectId: task.id, effect: 'needs_review', reason: 'Dependency đổi' });
    }
  }
  return { planVersionId: version.id, changeClass: version.changeClass ?? 'minor', affected };
}

/** Cycle edges a Draft added compared with its base (for “Bỏ dependency X → Y”). */
export function addedCycleEdges(version: PlanVersion) {
  const base = findVersion(version.basedOnVersionId ?? '') ?? baseline();
  return addedEdges(version.tasks ?? [], base?.tasks ?? []);
}

/* ---------- Task commands (9.8) ---------- */

export function recheck(task: Task): Schemas['ReadinessResult'] {
  const deps = task.currentDefinition.dependsOn ?? [];
  const pending = deps.map(findTask).filter((t) => t && t.status !== 'Completed') as Task[];
  const checks: Schemas['ReadinessCheck'][] = [
    pending.length
      ? { code: 'RC-04', passed: false, detail: `Dependency ${pending.map((t) => t.stableKey).join(', ')} chưa Completed` }
      : { code: 'RC-04', passed: true, detail: PASS_DETAIL['RC-04'] },
    ...(task.lastReadiness?.checks.filter((c) => c.code !== 'RC-04') ?? []),
  ];
  const result = readiness(task.id, checks, 0);
  task.lastReadiness = result;
  return result;
}

export function activate(task: Task): Schemas['TaskActivation'] | Schemas['Problem'] {
  if (task.status !== 'Ready') return problem(409, 'invalid_transition', `Task ${task.stableKey} đang ${task.status}, chỉ thực thi khi Ready.`);
  if (task.lastReadiness && !task.lastReadiness.passed) return problem(409, 'readiness_failed', 'Readiness check không đạt.');
  const manual = task.currentDefinition.executionLabel === 'Manual editor requirement';
  setTaskStatus(task, 'In Progress', manual ? ['submit_manual', 'cancel'] : ['cancel']);
  return { task, workflow: null };
}

export function dequeue(task: Task): boolean {
  if (task.status !== 'Queued') return false;
  setTaskStatus(task, 'Ready', ['activate', 'cancel', 'recheck_readiness']);
  return true;
}

export function cancel(task: Task): boolean {
  if (['Completed', 'Cancelled'].includes(task.status)) return false;
  setTaskStatus(task, 'Cancelled', []);
  return true;
}

export function submitManual(task: Task): boolean {
  if (task.status !== 'In Progress' || task.currentDefinition.executionLabel !== 'Manual editor requirement') return false;
  setTaskStatus(task, 'In Review', ['review', 'cancel']);
  return true;
}

export function review(task: Task, body: Schemas['TaskReviewCreate']): Schemas['TaskReview'] | undefined {
  if (task.status !== 'In Review') return undefined;
  const record: Schemas['TaskReview'] = {
    id: newId('7d'),
    accountId: task.accountId,
    projectId: PROJECT_ID,
    createdAt: now(),
    createdBy: { type: 'researcher', accountId: task.accountId },
    rowVersion: 1,
    taskId: task.id,
    ...body,
  };
  state.reviews.push(record);
  if (body.outcome === 'accepted') setTaskStatus(task, 'Completed', ['reopen']);
  else if (body.outcome === 'returned') setTaskStatus(task, 'In Progress', ['cancel']);
  else setTaskStatus(task, 'Blocked', ['recheck_readiness', 'cancel']);
  return record;
}

export function reopen(task: Task): boolean {
  if (task.status !== 'Completed') return false;
  setTaskStatus(task, 'Ready', ['activate', 'cancel', 'recheck_readiness']);
  return true;
}

export function confirmValid(task: Task): boolean {
  if (!task.needsReview) return false;
  task.needsReview = false;
  task.needsReviewReasons = [];
  task.rowVersion += 1;
  emit({ type: 'task.status_changed', projectId: PROJECT_ID, objectType: 'task', objectId: task.id, fromState: task.status, toState: task.status });
  return true;
}

/**
 * Ask the Orchestrator for a Plan. Without a Plan the mock answers as if the proposal were done at once: the fixture
 * Plan appears and plan_version.status_changed tells the screens. With an open version already: 409.
 */
/** Workflow of a Plan proposal, the body of the 202 of requestPlanProposal. */
export function proposalWorkflow(projectId: string): Schemas['Workflow'] {
  const now = new Date().toISOString();
  return {
    id: id('workflow', 90),
    accountId: ACCOUNT_ID,
    projectId,
    createdAt: now,
    createdBy: { type: 'researcher', accountId: ACCOUNT_ID },
    rowVersion: 1,
    idempotencyKey: `plan-proposal-${projectId}`,
    type: 'plan_proposal',
    triggeredBy: { type: 'researcher', accountId: ACCOUNT_ID },
    status: 'Running',
    startedAt: now,
    steps: [],
  };
}

export function requestProposal(): boolean {
  if (state.planExists && openVersion()) return false;
  state.planExists = true;
  const open = openVersion();
  if (open) emit({ type: 'plan_version.status_changed', projectId: PROJECT_ID, objectType: 'plan_version', objectId: open.id, toState: open.status });
  return true;
}
