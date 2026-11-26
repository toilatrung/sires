// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Navigation fixtures of the shell tests (rule 1.4.4), consistent with the reference screens: TopBar.html shows
// Pending Actions 8 and 3 unread; ProjectRail.html shows “RAG trong tổng quan tài liệu”, Plan v3 · Approved,
// Project AI Chat 2, Plan and Tasks 3, Manuscript 1 and Active task T-2.3.

import type { PublicApi } from '@sires/contracts';

type Schemas = PublicApi.components['schemas'];

export const ACCOUNT_ID = '00000000-0000-4000-8000-0000000000a1';
export const OTHER_ACCOUNT_ID = '00000000-0000-4000-8000-0000000000b2';
export const PROJECT_ID = 'p1';
export const ARCHIVED_PROJECT_ID = 'p9';
export const TASK_ID = '00000000-0000-4000-8000-0000000000c3';

const meta = (id: string) => ({
  id,
  accountId: ACCOUNT_ID,
  createdAt: '2026-11-01T08:00:00Z',
  createdBy: { type: 'researcher' as const, accountId: ACCOUNT_ID },
  rowVersion: 7,
});

export const session = { accountId: ACCOUNT_ID, expiresAt: '2026-11-27T20:00:00Z', csrfToken: 'csrf-1' };

export function account(uiLanguage: 'vi' | 'en' = 'vi'): Schemas['Account'] {
  return {
    ...meta(ACCOUNT_ID),
    authIdentity: { issuer: 'https://id.etroy.local', subject: 'nthanh' },
    profile: { displayName: 'Nguyễn Thanh', email: 'nthanh@example.edu' },
    preferences: { uiLanguage, includeResearchFieldInContext: false, debugMode: false },
  };
}

export const projects: Schemas['ResearchProject'][] = [
  {
    ...meta(PROJECT_ID),
    name: 'RAG trong tổng quan tài liệu',
    status: 'Active',
    currentContextVersionId: 'ctx-1',
    activeTaskId: TASK_ID,
    lastActivityAt: '2026-11-26T09:00:00Z',
  },
  {
    ...meta('p2'),
    name: 'Độ tin cậy của LLM trong giáo dục',
    status: 'Active',
    currentContextVersionId: 'ctx-2',
    lastActivityAt: '2026-11-25T09:00:00Z',
  },
  {
    ...meta(ARCHIVED_PROJECT_ID),
    name: 'Project đã lưu trữ',
    status: 'Archived',
    currentContextVersionId: 'ctx-9',
    lastActivityAt: '2026-10-01T09:00:00Z',
  },
];

export const plan: Schemas['ResearchPlan'] = {
  id: 'plan-1',
  projectId: PROJECT_ID,
  baselineVersionId: 'pv-3',
  openVersionId: 'pv-4',
  versions: [
    { id: 'pv-3', versionNumber: 3, status: 'Approved' },
    { id: 'pv-4', versionNumber: 4, status: 'Proposed' },
  ],
};

export const task = { ...meta(TASK_ID), stableKey: 'T-2.3', status: 'In Progress', needsReview: false, currentDefinition: { title: 'So sánh phương pháp đo' } };

type Kind = Schemas['PendingActionKind'];
const pending = (id: string, kind: Kind, projectId?: string) => ({ ...meta(id), projectId, kind, objectType: 'x', objectId: id, status: 'Open' as const });

/** Open pending actions of project p1: chat 2, plan 3, manuscript 1, agent activity 1, plus one Reference approval. */
export const projectPendingActions = [
  pending('pa-1', 'interactive_prompt', PROJECT_ID),
  pending('pa-2', 'interactive_prompt', PROJECT_ID),
  pending('pa-3', 'plan_approval', PROJECT_ID),
  pending('pa-4', 'task_review', PROJECT_ID),
  pending('pa-5', 'manual_work', PROJECT_ID),
  pending('pa-6', 'manuscript_change_proposal', PROJECT_ID),
  pending('pa-7', 'recovery_decision', PROJECT_ID),
  pending('pa-8', 'reference_approval', PROJECT_ID),
];

export const OPEN_COUNT = 8;
export const UNREAD_COUNT = 3;
