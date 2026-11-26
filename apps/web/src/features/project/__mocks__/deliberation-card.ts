// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Typed fixtures of the deliberation proposal card (PID-00084 H7), from the block “Đề xuất thảo luận” of Chat.dc.html
// and Chat--deliberation-skipped: an Open proposal, the same-model variant, the missing-configuration flow, Answered,
// Expired, Cancelled, a proposal missing a choice, and the Orchestrator message after “Bỏ qua”. Data only: no
// operation is claimed here (getPrompt, answerPrompt belong to PID-00058; tests override them locally). PID-00058
// merges these into the project area's mocks when its Chat lands.

import { ACCOUNT_ID, id, projectIds } from '../../../shell/mock';
import type { Schemas } from '../../../shell/mock';

type Prompt = Schemas['InteractiveAgentPrompt'];

export const PROJECT_ID = projectIds.rag;
export const WORKFLOW_ID = id('workflow', 52);
export const STEP_ID = id('step', 524);
export const CONNECTION_A = id('connection', 2);
export const CONNECTION_B = id('connection', 1);
/** A connection whose key the provider rejected (testStatus Invalid). */
export const CONNECTION_INVALID = id('connection', 3);

const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const orchestrator: Schemas['ActorRef'] = { type: 'agent', agent: 'orchestrator', agentRunId: id('agentRun', 821) };

const DELIBERATE_CHOICE = {
  id: 'deliberate',
  label: 'Thảo luận',
  consequence: 'Mở phiên thảo luận giữa Orchestrator và hai Analysis Agent; kết quả mang nhãn “qua thảo luận”.',
};
const SKIP_CHOICE = {
  id: 'skip',
  label: 'Bỏ qua',
  consequence: 'Orchestrator tự đưa phương án, kết quả mang nhãn “không qua thảo luận”.',
};

const proposal = (n: number, extra: Partial<Prompt> = {}, proposalExtra: Partial<Schemas['DeliberationProposal']> = {}): Prompt => ({
  id: id('prompt', n),
  accountId: ACCOUNT_ID,
  projectId: PROJECT_ID,
  createdAt: at(30),
  createdBy: orchestrator,
  rowVersion: 1,
  taskId: id('task', 3),
  workflowId: WORKFLOW_ID,
  stepId: STEP_ID,
  createdByAgentRunId: id('agentRun', 821),
  agent: 'orchestrator',
  type: 'choice',
  purpose: 'deliberation_proposal',
  question: 'Mở phiên thảo luận cho vấn đề này?',
  pendingAction: { objectType: 'task', objectId: id('task', 3) },
  choices: [DELIBERATE_CHOICE, SKIP_CHOICE],
  multiSelect: false,
  status: 'Open',
  deliberationProposal: {
    problem: 'Chọn khung so sánh các phương pháp đo hallucination cho T-2.3',
    problemType: 'methodology',
    reason: 'Có ít nhất ba cách so sánh hợp lý; chọn sai sẽ phải làm lại ma trận.',
    participants: [
      { agent: 'orchestrator', providerConnectionId: CONNECTION_A, model: 'claude-sonnet-4-5' },
      { agent: 'analysis', instance: 'A', perspective: 'xây dựng phương án', providerConnectionId: CONNECTION_A, model: 'claude-sonnet-4-5' },
      { agent: 'analysis', instance: 'B', perspective: 'tìm rủi ro và phương án thay thế', providerConnectionId: CONNECTION_B, model: 'gpt-4.1' },
    ],
    estimatedAgentRuns: 7,
    maxRounds: 2,
    sameModelWarning: false,
    costNote: 'Ước tính theo số vòng tối đa; phiên dừng sớm khi các bên đồng thuận.',
    ...proposalExtra,
  },
  ...extra,
});

/** Open, full data (EC01). */
export const openProposal = (): Prompt => proposal(41);

/** Analysis Agent A and B on the same model (EC02). */
export const sameModelProposal = (): Prompt =>
  proposal(42, {}, {
    sameModelWarning: true,
    participants: [
      { agent: 'orchestrator', providerConnectionId: CONNECTION_A, model: 'claude-sonnet-4-5' },
      { agent: 'analysis', instance: 'A', perspective: 'xây dựng phương án', providerConnectionId: CONNECTION_B, model: 'gpt-5' },
      { agent: 'analysis', instance: 'B', perspective: 'tìm rủi ro và phương án thay thế', providerConnectionId: CONNECTION_B, model: 'gpt-5' },
    ],
  });

/** No cost note, a connection the list does not have (EC03). */
export const sparseProposal = (): Prompt =>
  proposal(43, {}, {
    costNote: undefined,
    participants: [
      { agent: 'orchestrator', providerConnectionId: CONNECTION_A, model: 'claude-sonnet-4-5' },
      { agent: 'analysis', instance: 'A', perspective: 'xây dựng phương án', providerConnectionId: id('connection', 99), model: 'mistral-large' },
      { agent: 'analysis', instance: 'B', perspective: 'tìm rủi ro và phương án thay thế', providerConnectionId: CONNECTION_B, model: 'gpt-4.1' },
    ],
  });

/** Analysis Agent missing a valid configuration (EC09): the server's labels and consequences. */
export const missingConfigProposal = (): Prompt =>
  proposal(
    44,
    {
      choices: [
        { id: 'deliberate', label: 'Cấu hình lại rồi thảo luận', consequence: 'Mở Settings → Agent Models để chọn model cho Analysis Agent B, rồi mở phiên.' },
        { id: 'skip', label: 'Tiếp tục không thảo luận', consequence: 'Orchestrator tự đưa phương án, kết quả mang nhãn “không qua thảo luận”.' },
      ],
    },
    {
      reason: 'Analysis Agent B chưa có kết nối hợp lệ (Google AI Studio báo key không hợp lệ), nên chưa mở được phiên.',
      participants: [
        { agent: 'orchestrator', providerConnectionId: CONNECTION_A, model: 'claude-sonnet-4-5' },
        { agent: 'analysis', instance: 'A', perspective: 'xây dựng phương án', providerConnectionId: CONNECTION_A, model: 'claude-sonnet-4-5' },
        { agent: 'analysis', instance: 'B', perspective: 'tìm rủi ro và phương án thay thế', providerConnectionId: CONNECTION_INVALID, model: 'gemini-2.5-pro' },
      ],
    },
  );

/** Answered “Bỏ qua” (read only). */
export const answeredProposal = (): Prompt =>
  proposal(45, {
    status: 'Answered',
    response: { choiceIds: ['skip'], respondedBy: { type: 'researcher', accountId: ACCOUNT_ID }, respondedAt: at(28) },
  });

/** Expired and Cancelled (EC08). */
export const expiredProposal = (): Prompt => proposal(46, { status: 'Expired', statusReason: 'Hết hạn sau 24 giờ không có câu trả lời.' });
export const cancelledProposal = (): Prompt => proposal(47, { status: 'Cancelled', statusReason: 'Workflow wf-52d đã bị hủy.' });

/** Missing the skip choice: the standard card applies (EC10). */
export const withoutSkip = (): Prompt => proposal(48, { choices: [DELIBERATE_CHOICE] });

/** Workflow of the proposal: step 4 of 5 (“bước 4/5 của wf-…”). */
export const workflow = (): Schemas['Workflow'] => ({
  id: WORKFLOW_ID,
  accountId: ACCOUNT_ID,
  projectId: PROJECT_ID,
  createdAt: at(60),
  createdBy: orchestrator,
  rowVersion: 1,
  idempotencyKey: 'wf-52d',
  type: 'task_execution',
  taskId: id('task', 3),
  triggeredBy: { type: 'researcher', accountId: ACCOUNT_ID },
  status: 'Waiting for User',
  steps: [1, 2, 3, 4, 5].map((n) => ({
    id: n === 4 ? STEP_ID : id('step', 520 + n),
    order: n,
    description: n === 4 ? 'Đề xuất thảo luận khung so sánh' : `Bước ${n}`,
    status: n < 4 ? ('Succeeded' as const) : n === 4 ? ('Waiting for User' as const) : ('Pending' as const),
    attemptCount: n <= 4 ? 1 : 0,
  })),
});

/** Provider connections for the names on the cost line. */
export const connections = (): Schemas['ProviderConnection'][] =>
  [
    { id: CONNECTION_A, name: 'Claude cá nhân', provider: 'anthropic' },
    { id: CONNECTION_B, name: 'OpenAI cá nhân', provider: 'openai' },
    { id: CONNECTION_INVALID, name: 'Google AI Studio', provider: 'google', testStatus: 'Invalid' },
  ].map((c) => ({
    ...c,
    accountId: ACCOUNT_ID,
    createdAt: at(60 * 24 * 30),
    createdBy: { type: 'researcher', accountId: ACCOUNT_ID },
    rowVersion: 1,
    baseUrl: '',
    keyHint: '••••',
    testStatus: 'Valid',
    ...c,
  })) as Schemas['ProviderConnection'][];

/** The Orchestrator's message carrying the Open proposal (embeddedPromptId), as the Chat of PID-00058 receives it. */
export const proposalMessage = (): Schemas['Message'] => ({
  id: id('message', 40),
  accountId: ACCOUNT_ID,
  projectId: PROJECT_ID,
  createdAt: at(30),
  createdBy: orchestrator,
  rowVersion: 1,
  conversationId: id('conversation', 1),
  sender: orchestrator,
  agentRunId: id('agentRun', 821),
  content: 'Vấn đề này có nhiều cách làm hợp lý; tôi đề xuất mở một phiên thảo luận trước khi lập ma trận.',
  embeddedPromptId: openProposal().id,
});

/** The Orchestrator's result after “Bỏ qua” (Chat--deliberation-skipped), for PID-00058's label. */
export const skippedResultMessage = (): Schemas['Message'] => ({
  id: id('message', 41),
  accountId: ACCOUNT_ID,
  projectId: PROJECT_ID,
  createdAt: at(27),
  createdBy: orchestrator,
  rowVersion: 1,
  conversationId: id('conversation', 1),
  sender: orchestrator,
  agentRunId: id('agentRun', 822),
  content:
    'Tôi đề xuất so sánh theo ba trục: loại tác vụ, cách gán nhãn và khả năng tái lập. Phương án này chưa được Analysis Agent phản biện. Bạn vẫn có thể yêu cầu mở thảo luận cho vấn đề này ngay trong chat.',
  deliberation: { status: 'skipped', deliberationId: null, recordArtifactVersionId: null },
});
