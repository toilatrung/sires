// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Mock of the planning area (PID-00082 H5): stateful overrides of the 23 operations of path 09 the area owns, on
// one store (./store). Operations of other areas (getSharedContext, setActiveTask, listWorkflows, listArtifacts…) are
// not claimed here: the composed dev mock answers them, tests override them locally. Projects other than the RAG project read the
// shared demo data (shell/mock/fixtures/planning.ts), read only.

import { defineMocks, type Fixtures } from '../../../shell/mock';
import { operations } from './generated';
import { outputFixtures } from './fixtures';
import * as store from './store';

// Every operation can answer 404 for a resource of another account or none (OWN-03), declared or not: raw Response.
const notFound = (what: string) =>
  new Response(JSON.stringify(store.problem(404, 'not_found', `${what} không có.`)), { status: 404, headers: { 'content-type': 'application/problem+json' } });
const conflict = (detail: string) => ({ status: 409 as const, body: store.problem(409, 'invalid_transition', detail) });

/** Shared demo data of another project. */
const shared = {
  plan: (fixtures: Fixtures, projectId: string) => fixtures.ResearchPlan?.find((p) => p.projectId === projectId),
  version: (fixtures: Fixtures, projectId: string, versionId: string) => fixtures.PlanVersion?.find((v) => v.id === versionId && v.projectId === projectId),
  tasks: (fixtures: Fixtures, projectId: string) => (fixtures.Task ?? []).filter((t) => t.projectId === projectId),
};

function versionOf(projectId: string, planVersionId: string) {
  return store.isRag(projectId) && store.planningState().planExists ? store.findVersion(planVersionId) : undefined;
}

function taskOf(projectId: string, taskId: string) {
  return store.isRag(projectId) ? store.findTask(taskId) : undefined;
}

export default defineMocks({
  operations,
  fixtures: outputFixtures(),
  overrides: {
    getPlan: ({ params, fixtures }) => {
      if (!store.isRag(params.projectId)) {
        const plan = shared.plan(fixtures, params.projectId);
        return plan ? { status: 200, body: plan } : notFound('Research Plan');
      }
      return store.planningState().planExists ? { status: 200, body: store.planOf() } : notFound('Research Plan');
    },
    requestPlanProposal: ({ params }) => {
      if (!store.isRag(params.projectId)) return { status: 202 };
      return store.requestProposal() ? { status: 202 } : { status: 409, body: store.problem(409, 'open_plan_version_exists', 'Đã có Plan Version đang mở.') };
    },
    getPlanVersion: ({ params, fixtures }) => {
      const version = versionOf(params.projectId, params.planVersionId) ?? shared.version(fixtures, params.projectId, params.planVersionId);
      return version ? { status: 200, body: version, headers: { etag: store.etagOf(version) } } : notFound('Plan Version');
    },
    updatePlanVersionDraft: ({ params, body, request }) => {
      const version = versionOf(params.projectId, params.planVersionId);
      if (!version) return notFound('Plan Version');
      if (version.status !== 'Draft') return conflict('Chỉ sửa được Plan Version Draft.');
      if (!store.matches(request.headers.get('if-match'), version)) {
        return { status: 412, body: store.problem(412, 'precondition_failed', 'Draft đã đổi ở nơi khác.') };
      }
      Object.assign(version, body ?? {}, { rowVersion: version.rowVersion + 1, updatedAt: new Date().toISOString() });
      return { status: 200, body: version, headers: { etag: store.etagOf(version) } };
    },
    submitPlanVersion: ({ params }) => {
      const version = versionOf(params.projectId, params.planVersionId);
      if (!version) return notFound('Plan Version');
      const result = store.submit(version);
      if (result.ok) return { status: 200, body: version };
      return result.status === 409 ? { status: 409, body: result.problem } : { status: 422, body: result.problem };
    },
    approvePlanVersion: ({ params, body }) => {
      const version = versionOf(params.projectId, params.planVersionId);
      if (!version) return notFound('Plan Version');
      if (body?.versionNumber !== undefined && body.versionNumber !== version.versionNumber) return conflict('Plan Version đã đổi, hãy đọc lại.');
      return store.approve(version) ? { status: 200, body: version } : conflict(`Plan Version v${version.versionNumber} không ở Proposed.`);
    },
    rejectPlanVersion: ({ params, body }) => {
      const version = versionOf(params.projectId, params.planVersionId);
      if (!version) return notFound('Plan Version');
      if (!body?.reason?.trim()) return { status: 400, body: store.problem(400, 'validation_failed', 'Thiếu lý do từ chối.') };
      return store.reject(version, body.reason) ? { status: 200, body: version } : conflict(`Plan Version v${version.versionNumber} không ở Proposed.`);
    },
    withdrawPlanVersion: ({ params }) => {
      const version = versionOf(params.projectId, params.planVersionId);
      if (!version) return notFound('Plan Version');
      const draft = store.withdraw(version);
      return draft ? { status: 201, body: draft } : conflict(`Plan Version v${version.versionNumber} không ở Proposed.`);
    },
    diffPlanVersion: ({ params, query }) => {
      const version = versionOf(params.projectId, params.planVersionId);
      const against = query.against ? store.findVersion(query.against) : store.baseline();
      if (!version || !against) return notFound('Plan Version');
      return { status: 200, body: store.diff(version, against) };
    },
    getPlanVersionImpact: ({ params }) => {
      const version = versionOf(params.projectId, params.planVersionId);
      return version ? { status: 200, body: store.impact(version) } : notFound('Plan Version');
    },
    listTasks: ({ params, query, fixtures }) => {
      const statuses = query.status ? (Array.isArray(query.status) ? query.status.map(String) : String(query.status).split(',')) : undefined;
      const source = store.isRag(params.projectId) ? store.planningState().tasks : shared.tasks(fixtures, params.projectId);
      const items = source
        .filter((t) => !statuses || statuses.includes(t.status))
        .filter((t) => !query.phaseId || t.currentDefinition.phaseId === query.phaseId)
        .filter((t) => !query.executionLabel || t.currentDefinition.executionLabel === query.executionLabel);
      return { status: 200, body: { items, nextCursor: null } };
    },
    getTask: ({ params, fixtures }) => {
      const task = taskOf(params.projectId, params.taskId) ?? shared.tasks(fixtures, params.projectId).find((t) => t.id === params.taskId);
      return task ? { status: 200, body: task, headers: { etag: store.etagOf(task) } } : notFound('Task');
    },
    getTaskReadiness: ({ params }) => {
      const task = taskOf(params.projectId, params.taskId);
      if (!task) return notFound('Task');
      return { status: 200, body: task.lastReadiness ?? store.recheck(task) };
    },
    recheckTaskReadiness: ({ params }) => {
      const task = taskOf(params.projectId, params.taskId);
      return task ? { status: 200, body: store.recheck(task) } : notFound('Task');
    },
    activateTask: ({ params }) => {
      const task = taskOf(params.projectId, params.taskId);
      if (!task) return notFound('Task');
      const result = store.activate(task);
      return 'task' in result ? { status: 202, body: result } : { status: 409, body: result };
    },
    dequeueTask: ({ params }) => {
      const task = taskOf(params.projectId, params.taskId);
      if (!task) return notFound('Task');
      return store.dequeue(task) ? { status: 200, body: task } : conflict(`Task ${task.stableKey} không ở Queued.`);
    },
    cancelTask: ({ params }) => {
      const task = taskOf(params.projectId, params.taskId);
      if (!task) return notFound('Task');
      return store.cancel(task) ? { status: 200, body: task } : conflict(`Task ${task.stableKey} đã kết thúc.`);
    },
    submitManualWork: ({ params, body }) => {
      const task = taskOf(params.projectId, params.taskId);
      if (!task) return notFound('Task');
      if (!body?.outputs?.length || body.outputs.some((o) => !o.content?.trim())) {
        return { status: 400, body: store.problem(400, 'validation_failed', 'Mỗi đầu ra cần nội dung.') };
      }
      return store.submitManual(task) ? { status: 201, body: task } : conflict(`Task ${task.stableKey} không ở In Progress.`);
    },
    updateTaskChecklist: ({ params, body, request }) => {
      const task = taskOf(params.projectId, params.taskId);
      if (!task) return notFound('Task');
      if (!store.matches(request.headers.get('if-match'), task)) {
        return { status: 412, body: store.problem(412, 'precondition_failed', 'Task đã đổi ở nơi khác.') };
      }
      task.checklistState = body?.items ?? [];
      task.rowVersion += 1;
      return { status: 200, body: task, headers: { etag: store.etagOf(task) } };
    },
    listTaskReviews: ({ params }) => {
      const items = store.planningState().reviews.filter((r) => r.taskId === params.taskId);
      return { status: 200, body: { items, nextCursor: null } };
    },
    reviewTask: ({ params, body }) => {
      const task = taskOf(params.projectId, params.taskId);
      if (!task) return notFound('Task');
      if (!body) return { status: 400, body: store.problem(400, 'validation_failed', 'Thiếu nội dung nghiệm thu.') };
      const record = store.review(task, body);
      return record ? { status: 201, body: { review: record, task } } : conflict(`Task ${task.stableKey} không ở In Review.`);
    },
    reopenTask: ({ params }) => {
      const task = taskOf(params.projectId, params.taskId);
      if (!task) return notFound('Task');
      return store.reopen(task) ? { status: 200, body: task } : conflict(`Task ${task.stableKey} không ở Completed.`);
    },
    confirmTaskStillValid: ({ params }) => {
      const task = taskOf(params.projectId, params.taskId);
      if (!task) return notFound('Task');
      return store.confirmValid(task) ? { status: 200, body: task } : conflict(`Task ${task.stableKey} không mang cờ needs review.`);
    },
  },
});
