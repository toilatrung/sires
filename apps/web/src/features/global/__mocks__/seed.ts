// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Extra demo rows the global area adds to the shared demo world (PID-00060 S01, H13): prompts of every type the
// shell's prompt card handles — approval, information_request, edit_and_approve and a deliberation proposal for
// PID-00084 — their pending actions, a Recovery decision, and two Expired items (UX-PENDING-002).

import { agent, id, meta, projects, system } from '../../../shell/mock/fixtures/ids';
import type { Schemas } from '../../../shell/mock/types';

type Prompt = Schemas['InteractiveAgentPrompt'];
type PendingAction = Schemas['PendingAction'];

const chat = (projectId: string) => `/projects/${projectId}/chat`;

export const extraPrompts: Prompt[] = [
  {
    ...meta('prompt', 4, { projectId: projects.rag, hours: 2, by: agent('orchestrator', 95) }),
    taskId: id('task', 3), workflowId: id('workflow', 2), stepId: id('step', 23), createdByAgentRunId: id('agentRun', 95), agent: 'orchestrator',
    type: 'choice', purpose: 'deliberation_proposal', blocking: true,
    question: 'Mở phiên thảo luận để chọn tiêu chí so sánh cho bảng phương pháp?',
    deliberationProposal: {
      problem: 'Chọn tiêu chí chính cho bảng so sánh 5 khung RAG',
      problemType: 'methodology',
      reason: 'Hai nhóm nghiên cứu dùng hai cách đo khác nhau; chọn sai làm bảng không so sánh được.',
      participants: [
        { agent: 'analysis', instance: 'A', perspective: 'Ưu tiên số liệu định lượng', providerConnectionId: id('connection', 1), model: 'claude-sonnet-4-5' },
        { agent: 'analysis', instance: 'B', perspective: 'Ưu tiên độ phủ nguồn', providerConnectionId: id('connection', 2), model: 'gpt-4.1' },
      ],
      estimatedAgentRuns: 7,
      maxRounds: 2,
      sameModelWarning: false,
    },
    pendingAction: { objectType: 'task', objectId: id('task', 3) },
    choices: [
      { id: 'deliberate', label: 'Mở phiên thảo luận', consequence: 'Hai Analysis Agent trình bày lập trường, Orchestrator tổng hợp; khoảng 7 Agent Run.', recommended: true },
      { id: 'skip', label: 'Bỏ qua, tiếp tục không thảo luận', consequence: 'Kết quả mang nhãn “không qua thảo luận”.' },
    ],
    multiSelect: false, status: 'Open',
  },
  {
    ...meta('prompt', 5, { projectId: projects.rag, hours: 5, by: agent('writing', 96) }),
    taskId: id('task', 5), workflowId: id('workflow', 1), stepId: id('step', 13), createdByAgentRunId: id('agentRun', 96), agent: 'writing',
    type: 'edit_and_approve', purpose: 'general', blocking: false,
    question: 'Duyệt đoạn mở đầu mục 2.3 trước khi đưa vào bản thảo?',
    editablePayload: { heading: '2.3 Kiểm chứng trích dẫn', summary: 'RAG giảm 38% trích dẫn không có căn cứ trên 5 bộ dữ liệu.' },
    pendingAction: { apr: 'APR-05', objectType: 'task', objectId: id('task', 5), objectVersion: 2 },
    multiSelect: false, status: 'Open',
  },
  {
    ...meta('prompt', 6, { projectId: projects.learning, hours: 8, by: agent('discovery', 97) }),
    taskId: id('task', 13), workflowId: id('workflow', 3), stepId: id('step', 32), createdByAgentRunId: id('agentRun', 97), agent: 'discovery',
    type: 'information_request', purpose: 'general', blocking: true,
    question: 'Which publication years should the follow-up search cover?',
    pendingAction: { objectType: 'task', objectId: id('task', 13) },
    multiSelect: false, status: 'Open',
  },
  {
    ...meta('prompt', 7, { projectId: projects.rag, hours: 30, by: agent('discovery', 98) }),
    taskId: id('task', 1), workflowId: id('workflow', 5), stepId: id('step', 14), createdByAgentRunId: id('agentRun', 98), agent: 'discovery',
    type: 'choice', purpose: 'general', blocking: false,
    question: 'Bổ sung nguồn cho T-1.3 từ Semantic Scholar?',
    pendingAction: { objectType: 'task', objectId: id('task', 1) },
    choices: [{ id: 'yes', label: 'Có' }, { id: 'no', label: 'Không' }],
    multiSelect: false, status: 'Cancelled', statusReason: 'workflow đã bị hủy',
  },
];

const pending = (n: number, projectId: string | undefined, kind: Schemas['PendingActionKind'], objectType: string, objectId: string, title: string, deepLink: string, hours: number, extra: Partial<PendingAction> = {}): PendingAction => ({
  ...meta('pendingAction', n, { ...(projectId ? { projectId } : {}), hours, by: system }),
  kind, objectType, objectId, title, status: 'Open', deepLink, ...extra,
});

export const extraPendingActions: PendingAction[] = [
  pending(5, projects.learning, 'interactive_prompt', 'interactive_agent_prompt', id('prompt', 2), 'Approve the extracted effect sizes for 9 studies', chat(projects.learning), 9.5),
  pending(6, projects.salinity, 'recovery_decision', 'workflow', id('workflow', 4), 'Chọn tiếp tục, chạy lại hay hủy indexing bị gián đoạn',
    `/projects/${projects.salinity}/activity/workflows/${id('workflow', 4)}`, 49),
  pending(7, projects.rag, 'interactive_prompt', 'interactive_agent_prompt', id('prompt', 4), 'Mở phiên thảo luận chọn tiêu chí so sánh?', chat(projects.rag), 2),
  pending(8, projects.rag, 'interactive_prompt', 'interactive_agent_prompt', id('prompt', 5), 'Duyệt đoạn mở đầu mục 2.3', chat(projects.rag), 5),
  pending(9, projects.learning, 'interactive_prompt', 'interactive_agent_prompt', id('prompt', 6), 'Publication years for the follow-up search', chat(projects.learning), 8),
  pending(10, projects.rag, 'interactive_prompt', 'interactive_agent_prompt', id('prompt', 7), 'Bổ sung nguồn cho T-1.3 từ Semantic Scholar', chat(projects.rag), 30, {
    status: 'Expired', expiryReason: 'Cancelled: workflow đã bị hủy.',
  }),
  pending(11, projects.rag, 'manuscript_change_proposal', 'change_proposal', id('revision', 7), 'Writing Agent đề xuất sửa mục 2', `/projects/${projects.rag}/manuscript`, 40, {
    status: 'Expired', expiryReason: 'Outdated: main.tex đã đổi so với revision gốc.',
  }),
];

