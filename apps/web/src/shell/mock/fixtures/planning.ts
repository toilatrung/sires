// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Demo data of the planning area (/tasks, /projects/:id/plan, /projects/:id/tasks/:taskId): Research Plan,
// Plan Versions in several states (Superseded, Approved, Proposed) and Tasks across the Task statuses (PRD 9.8).

import type { Fixtures, Schemas } from '../types';
import { ago, agent, id, meta, projects, researcher } from './ids';

type TaskDefinition = Schemas['TaskDefinition'];

const phase = (n: number, order: number, name: string, objective: string): Schemas['Phase'] => ({ id: id('phase', n), order, name, objective });

const ragPhases = [
  phase(1, 1, 'Tổng quan tài liệu', 'Xác định các nghiên cứu RAG trong y sinh từ 2019 đến 2025.'),
  phase(2, 2, 'Trích xuất bằng chứng', 'Trích xuất số liệu về độ chính xác và tỉ lệ trích dẫn sai.'),
  phase(3, 3, 'Tổng hợp và viết', 'Viết chương 2 và bảng so sánh phương pháp.'),
];

const definition = (task: number, version: number, phaseId: number, title: string, objective: string, extra: Partial<TaskDefinition> = {}): TaskDefinition => ({
  planVersionId: id('planVersion', version),
  taskId: id('task', task),
  stableKey: `T${String(task).padStart(2, '0')}`,
  phaseId: id('phase', phaseId),
  title,
  objective,
  executionLabel: 'Available for agent',
  expectedOutputs: [{ artifactType: 'synthesis', description: 'Bản tổng hợp có trích dẫn', required: true }],
  acceptanceCriteria: [
    { id: 'AC1', text: 'Mọi luận điểm có ít nhất một evidence từ Trusted Library.' },
    { id: 'AC2', text: 'Ghi rõ tiêu chí chọn và loại nguồn.' },
  ],
  ...extra,
});

const ragTasks: TaskDefinition[] = [
  definition(1, 2, 1, 'Tìm và sàng lọc tài liệu về RAG trong y sinh', 'Tìm ít nhất 30 nghiên cứu, lọc theo tiêu chí PRISMA.', { proposedAgent: 'discovery' }),
  definition(2, 2, 2, 'Trích xuất bằng chứng về độ chính xác trích dẫn', 'Lấy số liệu precision/recall của trích dẫn từ 12 nghiên cứu đã chọn.', { proposedAgent: 'evidence_retrieval', dependsOn: [id('task', 1)] }),
  definition(3, 2, 2, 'So sánh phương pháp đánh giá độ tin cậy', 'Lập bảng so sánh 5 khung đánh giá.', {
    proposedAgent: 'synthesis', dependsOn: [id('task', 2)],
    expectedOutputs: [{ artifactType: 'table', description: 'Bảng so sánh phương pháp', required: true }],
  }),
  definition(4, 2, 3, 'Viết mục 2.3 — Rủi ro trích dẫn sai', 'Viết 1.500 từ, dẫn ít nhất 8 nguồn.', { proposedAgent: 'writing', dependsOn: [id('task', 3)] }),
  definition(5, 2, 3, 'Xin ý kiến giảng viên hướng dẫn về tiêu chí loại trừ', 'Gửi bản tiêu chí cho TS. Trần Quốc Bảo và ghi nhận góp ý.', {
    executionLabel: 'Manual editor requirement',
    expectedOutputs: [{ artifactType: 'manual_submission', description: 'Biên bản góp ý', required: true }],
  }),
  definition(6, 2, 3, 'Kiểm chứng trích dẫn trong chương 2', 'Kiểm mọi trích dẫn của chương 2 với văn bản gốc.', { proposedAgent: 'verification', dependsOn: [id('task', 4)] }),
];

const learningTasks: TaskDefinition[] = [
  definition(11, 11, 11, 'Collect studies on blended learning outcomes', 'Find peer-reviewed studies (2015–2025) that measure outcomes in blended classrooms.', { proposedAgent: 'discovery' }),
  definition(12, 11, 11, 'Extract effect sizes', 'Extract Cohen’s d and sample sizes from the selected studies.', { proposedAgent: 'evidence_retrieval', dependsOn: [id('task', 11)] }),
  definition(13, 11, 12, 'Draft the related-work section', 'Write 1,200 words comparing measurement frameworks.', { proposedAgent: 'writing', dependsOn: [id('task', 12)] }),
];

const version = (n: number, projectId: string, plan: number, versionNumber: number, status: Schemas['PlanVersionStatus'], hours: number,
  content: Pick<Schemas['PlanVersion'], 'goals' | 'phases' | 'tasks' | 'methods' | 'deliverables' | 'risks'>, changeSummary: string): Schemas['PlanVersion'] => ({
  ...meta('planVersion', n, { projectId, hours, by: agent('orchestrator', 90 + n) }),
  planId: id('plan', plan),
  versionNumber,
  status,
  contextVersionId: id('context', plan),
  changeSummary,
  changeClass: versionNumber === 1 ? 'material' : 'minor',
  ...content,
  ...(status === 'Approved' ? {
    approval: {
      approvedBy: researcher, decidedAt: ago(hours - 2), decision: 'approved', objectType: 'plan_version',
      objectId: id('planVersion', n), objectVersion: 1, apr: 'APR-01',
    },
  } : {}),
});

const ragContent = {
  goals: ['Đánh giá mức độ RAG giảm trích dẫn sai trong tổng quan tài liệu y sinh.', 'Đề xuất quy trình kiểm chứng trích dẫn cho NCS.'],
  methods: ['Tổng quan hệ thống theo PRISMA 2020', 'Phân tích định lượng tỉ lệ trích dẫn sai'],
  deliverables: ['Chương 2 luận án', 'Bảng so sánh phương pháp', 'Sơ đồ quy trình nghiên cứu'],
  risks: ['Thiếu nghiên cứu tiếng Việt', 'Số liệu không đồng nhất giữa các nghiên cứu'],
  phases: ragPhases,
};

const planVersions: Schemas['PlanVersion'][] = [
  version(3, projects.rag, 1, 3, 'Proposed', 6, { ...ragContent, tasks: [...ragTasks, definition(7, 3, 3, 'Vẽ sơ đồ quy trình nghiên cứu', 'Sơ đồ PRISMA cho chương 2.', { proposedAgent: 'diagram' })] },
    'Thêm Task vẽ sơ đồ PRISMA theo góp ý của giảng viên.'),
  version(2, projects.rag, 1, 2, 'Approved', 24 * 9, { ...ragContent, tasks: ragTasks }, 'Tách bước trích xuất bằng chứng thành Task riêng.'),
  version(1, projects.rag, 1, 1, 'Superseded', 24 * 14, { ...ragContent, tasks: ragTasks.slice(0, 4) }, 'Bản đầu tiên do Orchestrator đề xuất.'),
  version(11, projects.learning, 2, 1, 'Approved', 24 * 6, {
    goals: ['Compare how blended-learning studies measure learning outcomes.'],
    methods: ['Meta-analysis of effect sizes'],
    deliverables: ['Related-work section', 'Effect-size table'],
    phases: [phase(11, 1, 'Literature review', 'Collect and screen studies.'), phase(12, 2, 'Writing', 'Draft the related-work section.')],
    tasks: learningTasks,
  }, 'Initial plan proposed by the Orchestrator.'),
];

const plans: Schemas['ResearchPlan'][] = [
  {
    id: id('plan', 1), projectId: projects.rag, baselineVersionId: id('planVersion', 2), openVersionId: id('planVersion', 3),
    versions: planVersions.filter((v) => v.planId === id('plan', 1)).map(({ id: versionId, versionNumber, status, changeSummary, changeClass, createdAt, createdBy }) =>
      ({ id: versionId, versionNumber, status, changeSummary, changeClass, createdAt, createdBy })),
  },
  {
    id: id('plan', 2), projectId: projects.learning, baselineVersionId: id('planVersion', 11), openVersionId: null,
    versions: [{ id: id('planVersion', 11), versionNumber: 1, status: 'Approved', changeSummary: 'Initial plan proposed by the Orchestrator.', changeClass: 'material' }],
  },
];

const task = (definitionOf: TaskDefinition, projectId: string, status: Schemas['TaskStatus'], hours: number, extra: Partial<Schemas['Task']> = {}): Schemas['Task'] => ({
  ...meta('task', Number(definitionOf.taskId.slice(-4)), { projectId, hours }),
  stableKey: definitionOf.stableKey ?? definitionOf.taskId,
  status,
  currentDefinition: definitionOf,
  needsReview: false,
  ...extra,
});

export const tasks: Schemas['Task'][] = [
  task(ragTasks[0]!, projects.rag, 'Completed', 24 * 8, { allowedActions: ['reopen'] }),
  task(ragTasks[1]!, projects.rag, 'In Progress', 30, { activeWorkflowId: id('workflow', 1), allowedActions: ['cancel'] }),
  task(ragTasks[2]!, projects.rag, 'Waiting for User', 20, { activeWorkflowId: id('workflow', 2), allowedActions: ['cancel'] }),
  task(ragTasks[3]!, projects.rag, 'Blocked', 20, {
    lastReadiness: {
      taskId: id('task', 4), planVersionId: id('planVersion', 2), passed: false, at: ago(4),
      checks: [{ code: 'RC-04', passed: false, detail: 'Task tiên quyết “So sánh phương pháp đánh giá độ tin cậy” chưa Completed.', suggestedAction: 'Mở Task tiên quyết.' }],
    },
  }),
  task(ragTasks[4]!, projects.rag, 'Ready', 20, { allowedActions: ['submit_manual'] }),
  task(ragTasks[5]!, projects.rag, 'Draft', 20, { needsReview: true, needsReviewReasons: [{ cause: 'plan_version_proposed', sourceType: 'plan_version', sourceId: id('planVersion', 3), at: ago(6) }] }),
  task(learningTasks[0]!, projects.learning, 'Completed', 24 * 5, { allowedActions: ['reopen'] }),
  task(learningTasks[1]!, projects.learning, 'In Review', 10, { allowedActions: ['review'] }),
  task(learningTasks[2]!, projects.learning, 'Ready', 10, { allowedActions: ['activate'] }),
];

export const planning: Fixtures = {
  ResearchPlan: plans,
  PlanVersion: planVersions,
  Task: tasks,
};
