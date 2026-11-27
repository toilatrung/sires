// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Mocks the global area owns (PID-00037 H9): Research Project lifecycle and the dashboard, with state, 409 and 412
// as the contract describes them. Other areas' operations (listProviderConnections, listWorkflows) are not
// claimed here; tests override them locally.

import { defineMocks } from '../../../shell/mock';
import type { Schemas } from '../../../shell/mock/types';
import { operations } from './generated';
import { activeWorkflows, dashboard, expirePendingActions, globalStore, isDeleted, purgeAfter } from './store';

type Problem = Schemas['Problem'];
type Project = Schemas['ResearchProject'];

const PAGE = 50;

function problem(status: number, code: Schemas['ErrorCode'], detail?: string, extra: Partial<Problem> = {}): Problem {
  return { type: `https://sires.etroy.local/problems/${code}`, title: code, status, code, ...(detail ? { detail } : {}), ...extra };
}

const etag = (project: Project) => ({ ETag: `"${project.rowVersion}"` });

function touch(project: Project): void {
  const now = new Date().toISOString();
  project.rowVersion += 1;
  project.updatedAt = now;
  project.lastActivityAt = now;
}

function page<T>(rows: T[], cursor: string | undefined, limit: string | undefined) {
  const start = Number(cursor ?? 0) || 0;
  const size = Math.max(1, Math.min(200, Number(limit ?? PAGE) || PAGE));
  const items = rows.slice(start, start + size);
  return { items, nextCursor: start + size < rows.length ? String(start + size) : null };
}

export default defineMocks({
  operations,
  overrides: {
    listProjects: ({ query, fixtures }) => {
      const store = globalStore(fixtures);
      const status = query.status;
      const rows = store.projects.filter((project) =>
        status === 'deleted' ? isDeleted(project) : !isDeleted(project) && (!status || project.status === status),
      );
      const sort = query.sort ?? 'lastActivityAt';
      rows.sort((a, b) =>
        sort === 'name' ? a.name.localeCompare(b.name) : sort === 'createdAt' ? b.createdAt.localeCompare(a.createdAt) : b.lastActivityAt.localeCompare(a.lastActivityAt),
      );
      return { status: 200, body: page(rows, query.cursor, query.limit) };
    },

    createProject: ({ body, request, fixtures }) => {
      const store = globalStore(fixtures);
      const key = request.headers.get('Idempotency-Key') ?? '';
      const again = store.created.get(key);
      const existing = again ? store.projects.find((project) => project.id === again) : undefined;
      if (existing) return { status: 201, body: existing, headers: { ...etag(existing), Location: `/api/v1/projects/${existing.id}` } };
      const name = body?.name?.trim() ?? '';
      const question = body?.context?.researchQuestion?.trim() ?? '';
      const errors: NonNullable<Problem['errors']> = [];
      if (!name) errors.push({ field: 'name', code: 'required' });
      if (!question) errors.push({ field: 'context.researchQuestion', code: 'required' });
      if (errors.length) return { status: 400, body: problem(400, 'validation_failed', undefined, { errors }) };
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const project: Project = {
        id,
        accountId: store.projects[0]?.accountId ?? '5b0e7c2a-4f1d-4c8e-9a6b-2d3f8e1a7c90',
        createdAt: now,
        createdBy: { type: 'researcher', accountId: store.projects[0]?.accountId ?? '5b0e7c2a-4f1d-4c8e-9a6b-2d3f8e1a7c90' },
        updatedAt: now,
        rowVersion: 1,
        name,
        ...(body?.shortDescription?.trim() ? { shortDescription: body.shortDescription.trim() } : {}),
        ...(body?.agentResponseLanguage ? { agentResponseLanguage: body.agentResponseLanguage } : {}),
        status: 'Active',
        currentContextVersionId: crypto.randomUUID(),
        lastActivityAt: now,
        summary: { taskCounts: {}, openPendingActions: 0, activeWorkflows: 0, hasApprovedPlan: false },
      };
      store.projects.push(project);
      if (key) store.created.set(key, id);
      return { status: 201, body: project, headers: { ...etag(project), Location: `/api/v1/projects/${id}` } };
    },

    updateProject: ({ params, body, request, fixtures }) => {
      const store = globalStore(fixtures);
      const project = store.projects.find((row) => row.id === params.projectId && !isDeleted(row));
      if (!project) return { status: 404, body: problem(404, 'not_found') };
      const ifMatch = request.headers.get('If-Match')?.replace(/^W\//, '').replace(/"/g, '');
      if (ifMatch !== String(project.rowVersion)) return { status: 412, body: problem(412, 'precondition_failed') };
      if (project.status === 'Archived') return { status: 409, body: problem(409, 'project_archived', undefined, { currentState: 'Archived' }) };
      if (body?.name !== undefined) {
        if (!body.name.trim()) return { status: 409, body: problem(409, 'invalid_transition') };
        project.name = body.name.trim();
      }
      if (body?.shortDescription !== undefined) project.shortDescription = body.shortDescription;
      if (body?.agentResponseLanguage !== undefined) project.agentResponseLanguage = body.agentResponseLanguage;
      touch(project);
      return { status: 200, body: project, headers: etag(project) };
    },

    archiveProject: ({ params, request, fixtures }) => {
      const store = globalStore(fixtures);
      const key = request.headers.get('Idempotency-Key') ?? '';
      const project = store.projects.find((row) => row.id === params.projectId && !isDeleted(row));
      if (!project) return { status: 400, body: problem(400, 'validation_failed') };
      if (key && store.changed.get(key) === project.id && project.status === 'Archived') return { status: 200, body: project };
      if (project.status !== 'Active') return { status: 409, body: problem(409, 'invalid_transition', undefined, { currentState: project.status }) };
      if (activeWorkflows(store, project.id).length) return { status: 409, body: problem(409, 'active_workflow_exists') };
      project.status = 'Archived';
      project.archivedAt = new Date().toISOString();
      touch(project);
      expirePendingActions(store, project.id, 'project đã lưu trữ');
      if (key) store.changed.set(key, project.id);
      return { status: 200, body: project };
    },

    unarchiveProject: ({ params, fixtures }) => {
      const store = globalStore(fixtures);
      const project = store.projects.find((row) => row.id === params.projectId && !isDeleted(row));
      if (!project || project.status !== 'Archived') return { status: 409, body: problem(409, 'invalid_transition', undefined, project ? { currentState: project.status } : {}) };
      project.status = 'Active';
      delete project.archivedAt;
      touch(project);
      return { status: 200, body: project };
    },

    deleteProject: ({ params, request, fixtures }) => {
      const store = globalStore(fixtures);
      const key = request.headers.get('Idempotency-Key') ?? '';
      const project = store.projects.find((row) => row.id === params.projectId);
      if (!project) return { status: 404, body: problem(404, 'not_found') };
      if (isDeleted(project)) {
        return key && store.changed.get(key) === project.id ? { status: 200, body: project } : { status: 404, body: problem(404, 'not_found') };
      }
      if (activeWorkflows(store, project.id).length) return { status: 409, body: problem(409, 'active_workflow_exists') };
      const now = new Date();
      project.statusBeforeDeletion = project.status;
      project.deletedAt = now.toISOString();
      project.purgeAfter = purgeAfter(now);
      touch(project);
      expirePendingActions(store, project.id, 'project đã xóa');
      if (key) store.changed.set(key, project.id);
      return { status: 200, body: project };
    },

    restoreProject: ({ params, fixtures }) => {
      const store = globalStore(fixtures);
      const project = store.projects.find((row) => row.id === params.projectId && isDeleted(row));
      if (!project) return { status: 404, body: problem(404, 'not_found') };
      if (project.purgeAfter && Date.parse(project.purgeAfter) <= Date.now()) return { status: 409, body: problem(409, 'restore_window_expired') };
      project.status = project.statusBeforeDeletion ?? 'Active';
      delete project.deletedAt;
      delete project.purgeAfter;
      delete project.statusBeforeDeletion;
      touch(project);
      return { status: 200, body: project };
    },

    getDashboard: ({ fixtures }) => ({ status: 200, body: dashboard(globalStore(fixtures)) }),
  },
});
