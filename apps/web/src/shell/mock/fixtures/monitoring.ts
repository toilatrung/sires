// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Demo data of the monitoring area (/activity, /projects/:id/activity, /history): workflows in several states,
// their Agent Runs and Audit Events.

import type { Fixtures, Schemas } from '../types';
import { ago, agent, id, meta, projects, researcher } from './ids';

const step = (workflow: number, order: number, description: string, assignedAgent: Schemas['AgentName'], status: Schemas['StepStatus'], runs: number[], extra: Partial<Schemas['WorkflowStep']> = {}): Schemas['WorkflowStep'] => ({
  id: id('step', workflow * 10 + order), order, description, assignedAgent, status, attemptCount: runs.length ? 1 : 0,
  agentRunIds: runs.map((run) => id('agentRun', run)), ...extra,
});

export const workflows: Schemas['Workflow'][] = [
  {
    ...meta('workflow', 1, { projectId: projects.rag, hours: 3 }),
    idempotencyKey: 'wf-task-02-run-1', type: 'task_execution', taskId: id('task', 2), planVersionId: id('planVersion', 2),
    triggeredBy: researcher, status: 'Running', currentStepId: id('step', 12), startedAt: ago(3),
    steps: [
      step(1, 1, 'Truy xuất đoạn liên quan từ 12 reference đã chọn', 'evidence_retrieval', 'Succeeded', [1]),
      step(1, 2, 'Trích xuất số liệu precision/recall của trích dẫn', 'evidence_retrieval', 'Running', [2]),
      step(1, 3, 'Tổng hợp bảng số liệu', 'synthesis', 'Pending', []),
    ],
  },
  {
    ...meta('workflow', 2, { projectId: projects.rag, hours: 20 }),
    idempotencyKey: 'wf-task-03-run-1', type: 'task_execution', taskId: id('task', 3), planVersionId: id('planVersion', 2),
    triggeredBy: researcher, status: 'Waiting for User', currentStepId: id('step', 22), startedAt: ago(20),
    steps: [
      step(2, 1, 'Đọc 5 khung đánh giá độ tin cậy', 'synthesis', 'Succeeded', [3]),
      step(2, 2, 'Hỏi Researcher chọn tiêu chí so sánh', 'synthesis', 'Waiting for User', [4], { openPromptId: id('prompt', 1) }),
    ],
  },
  {
    ...meta('workflow', 3, { projectId: projects.learning, hours: 24 * 5 }),
    idempotencyKey: 'wf-discovery-learning-1', type: 'discovery', taskId: id('task', 11), triggeredBy: researcher,
    status: 'Succeeded', startedAt: ago(24 * 5), endedAt: ago(24 * 5 - 1),
    steps: [step(3, 1, 'Search OpenAlex and Crossref for blended-learning outcome studies', 'discovery', 'Succeeded', [5])],
  },
  {
    ...meta('workflow', 4, { projectId: projects.salinity, hours: 50 }),
    idempotencyKey: 'wf-indexing-salinity-1', type: 'indexing', triggeredBy: researcher, status: 'Interrupted', startedAt: ago(50),
    lastError: { code: 'rate_limited', message: 'Provider giới hạn tốc độ; có thể tiếp tục từ checkpoint gần nhất.', agentRunId: id('agentRun', 6) },
    lastCheckpointId: id('step', 41),
    steps: [step(4, 1, 'Tạo embedding cho 2 PDF mới', 'reference_processing', 'Failed', [6])],
  },
];

const run = (n: number, workflow: number, stepId: number, name: Schemas['AgentName'], status: Schemas['AgentRunStatus'], hours: number, summary: string, tokens: [number, number] | null): Schemas['AgentRun'] => ({
  ...meta('agentRun', n, { projectId: workflows[workflow - 1]!.projectId, hours, by: agent(name, n) }),
  workflowId: id('workflow', workflow), stepId: id('step', stepId), agent: name,
  providerConnectionId: id('connection', ['orchestrator', 'synthesis', 'writing', 'verification'].includes(name) ? 2 : 1),
  provider: ['orchestrator', 'synthesis', 'writing', 'verification'].includes(name) ? 'anthropic' : 'openai',
  model: ['orchestrator', 'synthesis', 'writing', 'verification'].includes(name) ? 'claude-sonnet-4-5' : 'gpt-4.1-mini',
  adapterVersion: '2026.11', inputSummary: summary,
  contextManifest: { entities: [{ type: 'task', id: id('task', workflow === 3 ? 11 : workflow + 1) }], evidenceIds: [] },
  structuredOutput: {},
  usage: tokens ? { noData: false, inputTokens: tokens[0], outputTokens: tokens[1], calls: 1 } : { noData: true, inputTokens: null, outputTokens: null, calls: 0 },
  status, attempts: 1, startedAt: ago(hours), ...(status === 'Running' ? {} : { endedAt: ago(Math.max(0, hours - 0.2)) }), discarded: false,
});

const agentRuns: Schemas['AgentRun'][] = [
  run(1, 1, 11, 'evidence_retrieval', 'Succeeded', 3, 'Truy xuất đoạn về độ chính xác trích dẫn từ 12 reference.', [18_420, 2_310]),
  run(2, 1, 12, 'evidence_retrieval', 'Running', 1, 'Trích xuất số liệu precision/recall.', null),
  run(3, 2, 21, 'synthesis', 'Succeeded', 20, 'Đọc 5 khung đánh giá độ tin cậy.', [24_900, 3_120]),
  run(4, 2, 22, 'synthesis', 'Succeeded', 19, 'Đề xuất tiêu chí so sánh và hỏi Researcher.', [6_100, 820]),
  run(5, 3, 31, 'discovery', 'Succeeded', 24 * 5, 'Search for blended-learning outcome studies, 2015–2025.', [4_300, 1_950]),
  { ...run(6, 4, 41, 'reference_processing', 'Failed', 50, 'Tạo embedding cho 2 PDF mới.', [0, 0]), error: { code: 'rate_limited', message: '429 từ provider sau 3 lần thử.' } },
];

const audit = (n: number, projectId: string | undefined, action: string, objectType: string, objectId: string, hours: number, summary: string, extra: Partial<Schemas['AuditEvent']> = {}): Schemas['AuditEvent'] => ({
  id: id('audit', n), accountId: meta('audit', n).accountId, ...(projectId ? { projectId } : {}), actor: researcher,
  action, objectType, objectId, summary, at: ago(hours), ...extra,
});

const auditEvents: Schemas['AuditEvent'][] = [
  audit(1, projects.rag, 'plan_version.approved', 'plan_version', id('planVersion', 2), 24 * 9 - 2, 'Duyệt Plan Version 2.', { apr: 'APR-01', fromState: 'Proposed', toState: 'Approved' }),
  audit(2, projects.rag, 'task.activated', 'task', id('task', 2), 3, 'Kích hoạt Task “Trích xuất bằng chứng về độ chính xác trích dẫn”.', { fromState: 'Ready', toState: 'Queued' }),
  audit(3, undefined, 'reference.approved', 'reference', id('reference', 3), 24 * 6, 'Đưa reference vào Trusted Library.', { apr: 'APR-03', fromState: 'Pending Approval', toState: 'Trusted' }),
  audit(4, undefined, 'provider_connection.tested', 'provider_connection', id('connection', 3), 26, 'Kiểm tra kết nối Google AI Studio: Invalid.'),
];

export const monitoring: Fixtures = {
  Workflow: workflows,
  AgentRun: agentRuns,
  AuditEvent: auditEvents,
};
