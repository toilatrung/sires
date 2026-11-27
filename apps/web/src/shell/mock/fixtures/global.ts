// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Demo data of the global area (/dashboard, /projects, /pending-actions, /notifications). Counts on the dashboard
// are computed from the other areas' rows so every screen tells the same story.

import type { Fixtures, Schemas } from '../types';
import { library } from './library';
import { monitoring } from './monitoring';
import { ago, id, meta, projects as ids, system } from './ids';
import { tasks } from './planning';

const project = (n: number, projectId: string, name: string, shortDescription: string, language: Schemas['Language'], hours: number, extra: Partial<Schemas['ResearchProject']> = {}): Schemas['ResearchProject'] => ({
  ...meta('project', n, { hours: 24 * 20 + n * 24, version: 3 }),
  id: projectId,
  name,
  shortDescription,
  status: 'Active',
  currentContextVersionId: id('context', n),
  agentResponseLanguage: language,
  lastActivityAt: ago(hours),
  ...extra,
});

const count = (projectId: string) => {
  const own = tasks.filter((task) => task.projectId === projectId);
  const byStatus: Record<string, number> = {};
  for (const task of own) byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
  return byStatus;
};

export const projects: Schemas['ResearchProject'][] = [
  project(1, ids.rag, 'Ứng dụng RAG trong tổng quan tài liệu y sinh',
    'Luận án tiến sĩ: đánh giá mức độ RAG giảm trích dẫn sai và đề xuất quy trình kiểm chứng cho NCS.', 'vi', 1, {
      activeTaskId: id('task', 2),
      summary: { taskCounts: count(ids.rag), openPendingActions: 3, activeWorkflows: 2, hasApprovedPlan: true },
    }),
  project(2, ids.learning, 'Measuring learning outcomes in blended classrooms',
    'Master’s thesis: meta-analysis of how blended-learning studies measure outcomes.', 'en', 10, {
      activeTaskId: id('task', 12),
      summary: { taskCounts: count(ids.learning), openPendingActions: 1, activeWorkflows: 0, hasApprovedPlan: true },
    }),
  project(3, ids.salinity, 'Mô hình dự báo xâm nhập mặn vùng Đồng bằng sông Cửu Long',
    'Đề tài cấp cơ sở: so sánh mô hình học máy dự báo độ mặn 14 ngày.', 'vi', 50, {
      summary: { taskCounts: {}, openPendingActions: 0, activeWorkflows: 0, hasApprovedPlan: false },
    }),
  project(4, ids.credit, 'Explainable credit scoring for microfinance',
    'Completed course project on interpretable credit models.', 'en', 24 * 40, {
      status: 'Archived', archivedAt: ago(24 * 30),
      summary: { taskCounts: {}, openPendingActions: 0, activeWorkflows: 0, hasApprovedPlan: true },
    }),
];

const pending = (n: number, projectId: string | undefined, kind: Schemas['PendingActionKind'], objectType: string, objectId: string, title: string, deepLink: string, hours: number): Schemas['PendingAction'] => ({
  ...meta('pendingAction', n, { ...(projectId ? { projectId } : {}), hours, by: system }),
  kind, objectType, objectId, title, status: 'Open', deepLink,
});

const pendingActions: Schemas['PendingAction'][] = [
  pending(1, ids.rag, 'plan_approval', 'plan_version', id('planVersion', 3), 'Duyệt Plan Version 3 — thêm Task vẽ sơ đồ PRISMA',
    `/projects/${ids.rag}/plan/versions/${id('planVersion', 3)}`, 6),
  pending(2, ids.rag, 'interactive_prompt', 'interactive_agent_prompt', id('prompt', 1), 'Chọn tiêu chí so sánh cho bảng phương pháp',
    `/projects/${ids.rag}/tasks/${id('task', 3)}`, 19),
  pending(3, undefined, 'reference_approval', 'reference', id('reference', 5), '2 reference mới chờ đưa vào Trusted Library', '/library?status=Pending%20Approval', 30),
  pending(4, ids.learning, 'task_review', 'task', id('task', 12), 'Review extracted effect sizes', `/projects/${ids.learning}/tasks/${id('task', 12)}`, 10),
];

const notification = (n: number, projectId: string | undefined, kind: Schemas['Notification']['kind'], message: string, status: Schemas['Notification']['status'], hours: number, object?: [string, string]): Schemas['Notification'] => ({
  ...meta('notification', n, { ...(projectId ? { projectId } : {}), hours, by: system }),
  kind, message, status, ...(object ? { objectType: object[0], objectId: object[1] } : {}),
});

const notifications: Schemas['Notification'][] = [
  notification(1, ids.rag, 'completion', 'Task “Tìm và sàng lọc tài liệu về RAG trong y sinh” đã hoàn thành: 32 nghiên cứu được chọn.', 'Unread', 2, ['task', id('task', 1)]),
  notification(2, ids.rag, 'blocked_task', 'Task “Viết mục 2.3” đang bị chặn: chờ Task so sánh phương pháp.', 'Unread', 4, ['task', id('task', 4)]),
  notification(3, ids.salinity, 'failure', 'Indexing bị gián đoạn do provider giới hạn tốc độ. Tiếp tục từ checkpoint?', 'Unread', 50, ['workflow', id('workflow', 4)]),
  notification(4, undefined, 'provider_issue', 'Kết nối Google AI Studio không hợp lệ. Kiểm tra lại API key.', 'Read', 26, ['provider_connection', id('connection', 3)]),
  notification(5, ids.learning, 'completion', 'Discovery finished: 14 studies match your inclusion criteria.', 'Read', 24 * 5, ['workflow', id('workflow', 3)]),
];

const references = library.Reference ?? [];
const workflows = monitoring.Workflow ?? [];

const dashboard: Schemas['Dashboard'] = {
  pendingActions,
  interruptedWorkflows: workflows.filter((workflow) => workflow.status === 'Interrupted'),
  recentProjects: projects.filter((row) => row.status === 'Active'),
  unreadNotifications: notifications.filter((row) => row.status === 'Unread').length,
  library: {
    trusted: references.filter((row) => row.approvalStatus === 'Trusted').length,
    pendingApproval: references.filter((row) => row.approvalStatus === 'Pending Approval').length,
    indexingFailed: references.filter((row) => row.indexingStatus === 'Failed').length,
  },
};

export const global: Fixtures = {
  ResearchProject: projects,
  PendingAction: pendingActions,
  Notification: notifications,
  Dashboard: [dashboard],
};
