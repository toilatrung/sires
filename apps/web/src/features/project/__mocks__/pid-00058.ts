// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Mock of PID-00058 (Overview, Project AI Chat; H5): the 9 operations the project area owns, with a store that keeps
// changes for one dev session. In the dev server a sent message is answered like the reference screen: three
// `chat.delta` of one Agent Run, then `message.posted` (S04). Tests reset the store with resetProjectChatMockState()
// and push events themselves with `mock.events.emit`.

import type { PublicApi } from '@sires/contracts';
import { ACCOUNT_ID, id, projectIds, type EventInput, type Fixtures, type Overrides } from '../../../shell/mock';

type Schemas = PublicApi.components['schemas'];
type Project = Schemas['ResearchProject'];
type ContextVersion = Schemas['ResearchContextVersion'];
type SharedContext = Schemas['SharedContextView'];
type Conversation = Schemas['Conversation'];
type Message = Schemas['Message'];

const ME: Schemas['ActorRef'] = { type: 'researcher', accountId: ACCOUNT_ID };

const iso = (hoursAgo = 0) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

/** Research context of the RAG project, as on Overview and Chat (version 4, one open assumption). */
const RAG_CONTEXT = {
  researchQuestion: 'RAG trên tập nguồn đã duyệt có làm giảm tỷ lệ claim không có căn cứ trong literature review do LLM hỗ trợ không?',
  objectives: ['So sánh ba cấu hình truy xuất', 'Đo tỷ lệ claim có evidence', 'Đề xuất quy trình cho NCS'],
  constraints: ['Tài liệu tiếng Anh, 2019–2026', 'Chỉ dùng PDF truy cập hợp lệ'],
  outputType: 'article' as const,
  manuscriptLanguage: 'vi' as const,
  citationStyle: 'plainnat',
};

interface State {
  activeTask: Map<string, string | null>;
  contexts: Map<string, ContextVersion[]>;
  conversations: Conversation[];
  messages: Message[];
  seq: number;
}

let state: State | null = null;

function version(projectId: string, n: number, input: Partial<Schemas['ResearchContextInput']> & { researchQuestion: string }, hoursAgo: number): ContextVersion {
  return {
    id: `1b000000-0000-4058-8000-${String(Number.parseInt(projectId.slice(-4), 16) * 100 + n).padStart(12, '0')}`,
    accountId: ACCOUNT_ID,
    createdAt: iso(hoursAgo),
    createdBy: ME,
    rowVersion: 1,
    projectId,
    versionNumber: n,
    confirmedBy: ME,
    ...input,
  } as ContextVersion;
}

function init(fixtures: Fixtures): State {
  if (state) return state;
  const contexts = new Map<string, ContextVersion[]>();
  for (const project of fixtures.ResearchProject ?? []) {
    const rag = project.id === projectIds.rag;
    const latest = rag ? 4 : 1;
    contexts.set(
      project.id,
      Array.from({ length: latest }, (_, i) => version(project.id, i + 1, rag ? RAG_CONTEXT : { researchQuestion: project.shortDescription ?? project.name }, 24 * (latest - i))),
    );
  }
  state = {
    activeTask: new Map(),
    contexts,
    conversations: structuredClone([...(fixtures.Conversation ?? [])]),
    messages: structuredClone([...(fixtures.Message ?? [])]),
    seq: 0,
  };
  return state;
}

/** Drop the store so the next request seeds it again (tests reset between cases). */
export function resetProjectChatMockState(): void {
  state = null;
}

function project(fixtures: Fixtures, projectId: string): Project | undefined {
  const row = fixtures.ResearchProject?.find((p) => p.id === projectId);
  if (!row) return undefined;
  const s = init(fixtures);
  return s.activeTask.has(projectId) ? { ...row, activeTaskId: s.activeTask.get(projectId) ?? undefined } : structuredClone(row);
}

function currentContext(fixtures: Fixtures, projectId: string): ContextVersion | undefined {
  const versions = init(fixtures).contexts.get(projectId) ?? [];
  return versions[versions.length - 1];
}

/** Shared context of a project: current research context, the RAG project's open assumption, 14 selected References. */
export function sharedContext(fixtures: Fixtures, projectId: string): SharedContext {
  const rag = projectId === projectIds.rag;
  const plan = fixtures.ResearchPlan?.find((p) => p.projectId === projectId);
  return {
    researchContext: currentContext(fixtures, projectId),
    baselinePlanVersionId: plan?.baselineVersionId ?? undefined,
    activeContextItems: rag
      ? [
          {
            id: id('context', 41),
            accountId: ACCOUNT_ID,
            createdAt: iso(30),
            createdBy: { type: 'agent', agent: 'orchestrator' },
            rowVersion: 1,
            projectId,
            scope: 'project',
            kind: 'assumption',
            content: { text: 'Đánh giá thủ công 50 claim là đủ cỡ mẫu.' },
            sourceType: 'message',
            sourceId: id('message', 2),
            status: 'Active',
          } as Schemas['ContextItem'],
        ]
      : [],
    selectedReferenceIds: rag ? Array.from({ length: 14 }, (_, i) => id('reference', i + 1)) : [],
    activeWorkflowIds: rag ? [id('workflow', 1)] : [],
  };
}

/** The answer of the dev demo: three deltas of one Agent Run, then the saved message (S04, PID-00058-AC01). */
function answerLater(conversationId: string, projectId: string | undefined, activeTaskId: string | null | undefined): void {
  const events = (globalThis as { siresMock?: { events?: { emit(event: EventInput): unknown } } }).siresMock?.events;
  if (!events || !state) return;
  const s = state;
  s.seq += 1;
  const agentRunId = id('agentRun', 700 + s.seq);
  const parts = ['Readiness check ', 'Đạt.', ' Discovery Agent bắt đầu.'];
  parts.forEach((text, i) => {
    setTimeout(() => {
      events.emit({ type: 'chat.delta', projectId, conversationId, agentRunId, seq: i + 1, text, final: i === parts.length - 1 } as EventInput);
    }, 600 * (i + 1));
  });
  setTimeout(() => {
    const reply: Message = {
      id: id('message', 700 + s.seq),
      accountId: ACCOUNT_ID,
      createdAt: iso(),
      createdBy: { type: 'agent', agent: 'orchestrator', agentRunId },
      rowVersion: 1,
      projectId,
      conversationId,
      sender: { type: 'agent', agent: 'orchestrator', agentRunId },
      content: parts.join(''),
      agentRunId,
      activeTaskId: activeTaskId ?? undefined,
    } as Message;
    s.messages.push(reply);
    events.emit({ type: 'message.posted', projectId, objectType: 'message', objectId: reply.id });
  }, 600 * (parts.length + 1));
}

type MockCode = 'validation_failed' | 'not_found' | 'base_revision_mismatch';
/** Problem Details as a Response: some of these statuses are not declared for the operation, and the runtime keeps a
 * Response as it is (PID-00013). */
const problem = (status: 400 | 404 | 409, code: MockCode, title: string) =>
  new Response(JSON.stringify({ type: `https://sires.example/problems/${code}`, title, status, code }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });

export const overrides: Overrides = {
  getProject: ({ params, fixtures }) => {
    const row = project(fixtures, params.projectId);
    return row ? { status: 200 as const, body: row, headers: { ETag: `"${row.rowVersion}"` } } : problem(404, 'not_found', 'Không có project');
  },
  setActiveTask: ({ params, body, fixtures }) => {
    const s = init(fixtures);
    if (!project(fixtures, params.projectId)) return problem(404, 'not_found', 'Không có project');
    s.activeTask.set(params.projectId, body?.taskId ?? null);
    return { status: 200 as const, body: project(fixtures, params.projectId)! };
  },
  listContextVersions: ({ params, fixtures }) => {
    const versions = init(fixtures).contexts.get(params.projectId) ?? [];
    return { status: 200 as const, body: { items: [...versions].reverse(), nextCursor: null } };
  },
  createContextVersion: ({ params, body, fixtures }) => {
    const s = init(fixtures);
    const versions = s.contexts.get(params.projectId);
    if (!versions) return problem(404, 'not_found', 'Không có project');
    if (!body?.researchQuestion?.trim()) return problem(400, 'validation_failed', 'Thiếu câu hỏi nghiên cứu');
    const latest = versions[versions.length - 1];
    if (body.basedOnVersionId && latest && body.basedOnVersionId !== latest.id) return problem(409, 'base_revision_mismatch', 'Research context đã có version mới hơn');
    const input: Partial<typeof body> = { ...body };
    delete input.basedOnVersionId;
    const next = version(params.projectId, (latest?.versionNumber ?? 0) + 1, { ...input, researchQuestion: body.researchQuestion }, 0);
    versions.push(next);
    return { status: 201 as const, body: next };
  },
  getSharedContext: ({ params, fixtures }) => {
    if (!project(fixtures, params.projectId)) return problem(404, 'not_found', 'Không có project');
    return { status: 200 as const, body: sharedContext(fixtures, params.projectId) };
  },
  listConversations: ({ query, fixtures }) => {
    const s = init(fixtures);
    const items = s.conversations.filter((c) => (!query.scope || c.scope === query.scope) && (!query.projectId || c.projectId === query.projectId));
    return { status: 200 as const, body: { items } };
  },
  createConversation: ({ body, fixtures }) => {
    const s = init(fixtures);
    if (!body) return problem(400, 'validation_failed', 'Thiếu scope');
    s.seq += 1;
    const row = { id: id('conversation', 500 + s.seq), accountId: ACCOUNT_ID, createdAt: iso(), createdBy: ME, rowVersion: 1, projectId: body.projectId, scope: body.scope, lastMessageAt: iso() } as Conversation;
    s.conversations.push(row);
    return { status: 201 as const, body: row };
  },
  listMessages: ({ params, query, fixtures }) => {
    const s = init(fixtures);
    if (!s.conversations.some((c) => c.id === params.conversationId)) return problem(404, 'not_found', 'Không có hội thoại');
    const newestFirst = s.messages.filter((m) => m.conversationId === params.conversationId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const limit = Number(query.limit ?? 50);
    const start = Number(query.cursor ?? 0);
    const items = newestFirst.slice(start, start + limit);
    return { status: 200 as const, body: { items, nextCursor: start + limit < newestFirst.length ? String(start + limit) : null } };
  },
  sendMessage: ({ params, body, fixtures }) => {
    const s = init(fixtures);
    const conversation = s.conversations.find((c) => c.id === params.conversationId);
    if (!conversation) return problem(404, 'not_found', 'Không có hội thoại');
    if (!body?.content?.trim()) return problem(400, 'validation_failed', 'Tin nhắn trống');
    s.seq += 1;
    const message = {
      id: id('message', 600 + s.seq),
      accountId: ACCOUNT_ID,
      createdAt: iso(),
      createdBy: ME,
      rowVersion: 1,
      projectId: conversation.projectId,
      conversationId: conversation.id,
      sender: ME,
      content: body.content,
      activeTaskId: body.activeTaskId,
    } as Message;
    s.messages.push(message);
    conversation.lastMessageAt = message.createdAt;
    answerLater(conversation.id, conversation.projectId, body.activeTaskId);
    return { status: 202 as const, body: { message, workflowId: id('workflow', 600 + s.seq) } };
  },
};
