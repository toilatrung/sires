// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Demo data of the project area (/projects/:id/overview, /projects/:id/chat): the project conversation with the
// Orchestrator and the interactive prompts agents raised.

import type { Fixtures, Schemas } from '../types';
import { ago, agent, id, meta, projects, researcher } from './ids';

const conversations: Schemas['Conversation'][] = [
  { ...meta('conversation', 1, { projectId: projects.rag, hours: 24 * 9 }), scope: 'project', title: 'Trao đổi với Orchestrator', lastMessageAt: ago(1) },
  { ...meta('conversation', 2, { projectId: projects.learning, hours: 24 * 6 }), scope: 'project', title: 'Orchestrator chat', lastMessageAt: ago(10) },
  { ...meta('conversation', 3, { hours: 24 * 2 }), scope: 'global', title: 'Trợ lý', lastMessageAt: ago(26) },
];

const message = (n: number, conversation: number, projectId: string | undefined, sender: Schemas['ActorRef'], hours: number, content: string, extra: Partial<Schemas['Message']> = {}): Schemas['Message'] => ({
  ...meta('message', n, { ...(projectId ? { projectId } : {}), hours, by: sender }),
  conversationId: id('conversation', conversation), sender, content, ...extra,
});

const messages: Schemas['Message'][] = [
  message(1, 1, projects.rag, researcher, 4, 'Bắt đầu trích xuất bằng chứng về độ chính xác trích dẫn cho chương 2 nhé.', { activeTaskId: id('task', 2) }),
  message(2, 1, projects.rag, agent('orchestrator', 91), 3.9, 'Tôi đã kích hoạt Task “Trích xuất bằng chứng về độ chính xác trích dẫn”. Evidence Retrieval đang đọc 12 reference đã chọn; bạn có thể theo dõi ở Agent Activity.', {
    activeTaskId: id('task', 2), agentRunId: id('agentRun', 91),
    links: [{ label: 'Agent Activity', objectType: 'workflow', objectId: id('workflow', 1) }],
  }),
  message(3, 1, projects.rag, agent('orchestrator', 92), 19, 'Synthesis Agent cần bạn chọn tiêu chí so sánh trước khi lập bảng.', { embeddedPromptId: id('prompt', 1), agentRunId: id('agentRun', 92) }),
  message(4, 2, projects.learning, researcher, 10.2, 'Can you summarise the effect sizes you extracted so far?'),
  message(5, 2, projects.learning, agent('orchestrator', 93), 10, 'So far 9 of 14 studies report Cohen’s d; the pooled estimate is d = 0.31 (95% CI 0.22–0.40). The extraction is waiting for your review.', { agentRunId: id('agentRun', 93) }),
  message(6, 3, undefined, researcher, 26, 'Project nào đang có việc chờ tôi?'),
  message(7, 3, undefined, agent('orchestrator', 94), 25.9, 'Có 3 việc đang chờ bạn: duyệt Plan Version 3 của “Ứng dụng RAG…”, chọn tiêu chí so sánh, và duyệt 2 reference mới.', { agentRunId: id('agentRun', 94) }),
];

export const prompts: Schemas['InteractiveAgentPrompt'][] = [
  {
    ...meta('prompt', 1, { projectId: projects.rag, hours: 19, by: agent('synthesis', 4) }),
    taskId: id('task', 3), workflowId: id('workflow', 2), stepId: id('step', 22), createdByAgentRunId: id('agentRun', 4), agent: 'synthesis',
    type: 'choice', purpose: 'general', blocking: true,
    question: 'Bảng so sánh nên dùng tiêu chí nào làm cột chính?',
    pendingAction: { objectType: 'task', objectId: id('task', 3) },
    choices: [
      { id: 'precision', label: 'Độ chính xác trích dẫn (precision)', consequence: 'So sánh theo số liệu định lượng của 5 khung.', recommended: true, rationale: '4/5 nghiên cứu báo cáo chỉ số này.' },
      { id: 'coverage', label: 'Độ phủ nguồn (coverage)', consequence: 'Cần thêm số liệu từ 2 nghiên cứu chưa index.' },
      { id: 'cost', label: 'Chi phí kiểm chứng', consequence: 'Ít nghiên cứu báo cáo; bảng sẽ thưa.' },
    ],
    multiSelect: false, status: 'Open',
  },
  {
    ...meta('prompt', 2, { projectId: projects.learning, hours: 10, by: agent('evidence_retrieval', 7) }),
    taskId: id('task', 12), workflowId: id('workflow', 3), stepId: id('step', 31), createdByAgentRunId: id('agentRun', 5), agent: 'evidence_retrieval',
    type: 'approval', purpose: 'general', blocking: false,
    question: 'Approve the extracted effect sizes for 9 studies?',
    pendingAction: { apr: 'APR-04', objectType: 'task', objectId: id('task', 12) },
    multiSelect: false, status: 'Open',
  },
  {
    ...meta('prompt', 3, { projectId: projects.rag, hours: 24 * 8, by: agent('discovery', 41) }),
    taskId: id('task', 1), workflowId: id('workflow', 1), stepId: id('step', 11), createdByAgentRunId: id('agentRun', 1), agent: 'discovery',
    type: 'information_request', purpose: 'general',
    question: 'Có giới hạn ngôn ngữ của nguồn không?',
    pendingAction: { objectType: 'task', objectId: id('task', 1) },
    multiSelect: false, status: 'Answered',
    response: { respondedBy: researcher, respondedAt: ago(24 * 8 - 1), text: 'Chỉ tiếng Anh và tiếng Việt.' },
  },
];

export const project: Fixtures = {
  Conversation: conversations,
  Message: messages,
  InteractiveAgentPrompt: prompts,
};
