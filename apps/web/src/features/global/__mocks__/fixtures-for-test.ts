// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Rows and replies used by the global area's tests (typed by the public contract).

import type { Schemas } from '../../../shell/mock/types';

const ACCOUNT = '5b0e7c2a-4f1d-4c8e-9a6b-2d3f8e1a7c90';
const uuid = (prefix: string, n: number) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

export function project(n: number, name: string, extra: Partial<Schemas['ResearchProject']> = {}): Schemas['ResearchProject'] {
  return {
    id: uuid('f1', n),
    accountId: ACCOUNT,
    createdAt: iso(24 * 30),
    createdBy: { type: 'researcher', accountId: ACCOUNT },
    rowVersion: 1,
    name,
    status: 'Active',
    currentContextVersionId: uuid('f2', n),
    lastActivityAt: iso(n),
    summary: { taskCounts: {}, openPendingActions: 0, activeWorkflows: 0, hasApprovedPlan: false },
    ...extra,
  };
}

function workflow(n: number, status: Schemas['WorkflowStatus'], projectId: string): Schemas['Workflow'] {
  return {
    id: uuid('f3', n),
    accountId: ACCOUNT,
    projectId,
    createdAt: iso(5),
    createdBy: { type: 'researcher', accountId: ACCOUNT },
    rowVersion: 1,
    idempotencyKey: `wf-test-${n}`,
    type: 'task_execution',
    triggeredBy: { type: 'researcher', accountId: ACCOUNT },
    status,
  };
}

export const fixtures = {
  active: project(1, 'Đề tài đang làm'),
  archived: project(2, 'Đề tài đã lưu trữ', { status: 'Archived', archivedAt: iso(48) }),
  interrupted: (n: number) => workflow(n, 'Interrupted', uuid('f1', 1)),
  workflow,
};

/** 503 service_unavailable as the gateway sends it (status not declared on every operation). */
export function unavailable(): Response {
  return new Response(JSON.stringify({ type: 'https://sires.etroy.local/problems/service_unavailable', title: 'service_unavailable', status: 503, code: 'service_unavailable' }), {
    status: 503,
    headers: { 'content-type': 'application/problem+json' },
  });
}
