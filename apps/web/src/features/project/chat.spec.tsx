// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00058 S01, S03, S04, S06: Project AI Chat (PID-00058-AC01, UX-CHAT-001-AC01, UX-CHAT-002-AC01; EC07–EC19,
// EC27–EC31).

import type { PublicApi } from '@sires/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import i18next from 'i18next';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFixtures, id, projectIds, type EventInput } from '../../shell/mock';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { resetProjectChatMockState } from './__mocks__';
import { openProposal, proposalMessage, skippedResultMessage } from './__mocks__/deliberation-card';
import { problem, renderProject } from './test-helpers';
import { feature } from '.';

type Schemas = PublicApi.components['schemas'];
type Message = Schemas['Message'];

const mock = useMockServer({ features: [feature] });
beforeEach(() => resetProjectChatMockState());

const P = projectIds.rag;
const CONVERSATION = id('conversation', 1);
const RUN = '7c000000-0000-4000-8000-000000007f21';
/** Raw provider text that must never be shown; built at run time so no key-shaped literal sits in the source. */
const PROVIDER_TEXT = ['sk', 'provider', 'said', 'this'].join('-');
const fixtureMessages = () => structuredClone(demoFixtures.Message!.filter((m) => m.conversationId === CONVERSATION));
const page = (items: Message[], nextCursor: string | null = null) => ({ status: 200 as const, body: { items, nextCursor } });
const message = (n: number, extra: Partial<Message>): Message =>
  ({ id: id('message', 900 + n), accountId: 'a', createdAt: new Date(Date.now() - (10 - n) * 60_000).toISOString(), createdBy: { type: 'researcher' }, rowVersion: 1, projectId: P, conversationId: CONVERSATION, sender: { type: 'researcher' }, content: `tin ${n}`, ...extra }) as Message;
const delta = (seq: number, text: string, extra: Record<string, unknown> = {}) =>
  mock.events.emit({ type: 'chat.delta', projectId: P, conversationId: CONVERSATION, agentRunId: RUN, seq, text, ...extra } as EventInput);
const composer = () => screen.getByLabelText('Tin nhắn cho Orchestrator') as HTMLTextAreaElement;
const items = () => screen.getAllByRole('listitem').filter((li) => li.classList.contains('sires-chat__message'));

async function openChat(projectId = P) {
  const view = renderProject(`/projects/${projectId}/chat`);
  await waitForFrame();
  await screen.findByRole('complementary', { name: 'Context của cuộc trò chuyện' });
  return view;
}

async function send(user: ReturnType<typeof renderProject>['user'], text: string) {
  await user.type(composer(), text);
  await user.click(screen.getByRole('button', { name: 'Gửi' }));
}

describe('Chat: tin nhắn (S03)', () => {
  it('tham chiếu active task (UX-CHAT-001-AC01, EC10)', async () => {
    const task = demoFixtures.Task!.find((t) => t.id === id('task', 2))!;
    const { user, calls } = await openChat();
    expect(screen.getByText(new RegExp(`Active task: ${task.stableKey}`))).toBeTruthy();
    expect(screen.getByText(`· Tin nhắn sẽ mang tham chiếu ${task.stableKey}`)).toBeTruthy();
    await send(user, 'Chạy tiếp Task này');
    await waitFor(() => expect(calls('POST', `/conversations/${CONVERSATION}/messages`)).toHaveLength(1));
    expect(JSON.parse(calls('POST', `/conversations/${CONVERSATION}/messages`)[0]!.body ?? '{}')).toEqual({ content: 'Chạy tiếp Task này', activeTaskId: task.id });
    const sent = (await screen.findByText('Chạy tiếp Task này')).closest('li')!;
    expect(within(sent).getByText(task.stableKey)).toBeTruthy();
  });

  it('tên agent và Agent Run (UX-CHAT-002-AC01, EC17)', async () => {
    mock.use({
      overrides: {
        listMessages: () =>
          page([
            message(2, { sender: { type: 'agent', agent: 'analysis', instance: 'B', agentRunId: 'run-b' }, agentRunId: 'run-b', content: 'phản biện' }),
            message(1, { sender: { type: 'agent', agent: 'synthesis', agentRunId: RUN }, agentRunId: RUN, content: 'bảng so sánh' }),
          ]),
      },
    });
    await openChat();
    const synthesis = (await screen.findByText('bảng so sánh')).closest('li')!;
    expect(within(synthesis).getByText('Synthesis Agent')).toBeTruthy();
    expect(within(synthesis).getByRole('link', { name: 'Agent Run ar-7f21' }).getAttribute('href')).toBe(`/projects/${P}/activity/agent-runs/${RUN}`);
    expect(within(screen.getByText('phản biện').closest('li')!).getByText('Analysis Agent B')).toBeTruthy();
  });

  it('hội thoại đầu tiên (EC07)', async () => {
    const { user, calls } = await openChat(projectIds.salinity);
    expect(screen.getByText(/Chưa có tin nhắn/)).toBeTruthy();
    await send(user, 'Bắt đầu nhé');
    await waitFor(() => expect(calls('POST', '/conversations')).toHaveLength(1));
    expect(JSON.parse(calls('POST', '/conversations')[0]!.body ?? '{}')).toEqual({ scope: 'project', projectId: projectIds.salinity });
    await waitFor(() => expect(calls('POST', /^\/conversations\/[^/]+\/messages$/)).toHaveLength(1));
  });

  it('tải tin cũ hơn (EC08)', async () => {
    const [m1, m2, m3] = [message(1, { content: 'cũ nhất' }), message(2, { content: 'giữa' }), message(3, { content: 'mới nhất' })];
    mock.use({ overrides: { listMessages: ({ query }) => (query.cursor ? page([m1!]) : page([m3!, m2!], 'c2')) } });
    const { user } = await openChat();
    expect(await screen.findByText('mới nhất')).toBeTruthy();
    expect(screen.queryByText('cũ nhất')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Tải tin cũ hơn' }));
    await screen.findByText('cũ nhất');
    expect(items().map((li) => li.querySelector('.sires-chat__content')?.textContent)).toEqual(['cũ nhất', 'giữa', 'mới nhất']);
    expect(screen.queryByRole('button', { name: 'Tải tin cũ hơn' })).toBeNull();
  });

  it('gửi tin nhắn (EC09)', async () => {
    let calls = 0;
    mock.use({
      overrides: {
        sendMessage: ({ body }) => {
          calls += 1;
          return calls === 1 ? problem(503, 'service_unavailable') : { status: 202, body: { message: message(5, { content: body!.content }), workflowId: 'wf-9' } };
        },
      },
    });
    const view = await openChat();
    const sendButton = () => screen.getByRole('button', { name: 'Gửi' }) as HTMLButtonElement;
    expect(sendButton().disabled).toBe(true);
    await view.user.click(composer());
    await view.user.paste('a'.repeat(20001));
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByText('Tin nhắn dài hơn 20000 ký tự.')).toBeTruthy();
    await view.user.clear(composer());
    await send(view.user, 'Lỗi mạng thì giữ');
    expect(await screen.findByText(/SIRes tạm thời không phục vụ được/)).toBeTruthy();
    expect(composer().value).toBe('Lỗi mạng thì giữ');
    await view.user.click(sendButton());
    await waitFor(() => expect(view.calls('POST', `/conversations/${CONVERSATION}/messages`)).toHaveLength(2));
    const [first, second] = view.calls('POST', `/conversations/${CONVERSATION}/messages`);
    expect(second!.headers['Idempotency-Key']).toBe(first!.headers['Idempotency-Key']);
    await waitFor(() => expect(composer().value).toBe(''));
  });

  it('bỏ active task (EC11)', async () => {
    const { user, calls } = await openChat();
    await user.click(within(composer().closest('form')!).getByRole('button', { name: 'Bỏ active task' }));
    await waitFor(() => expect(calls('PUT', `/projects/${P}/active-task`)).toHaveLength(1));
    expect(JSON.parse(calls('PUT', `/projects/${P}/active-task`)[0]!.body ?? '{}')).toEqual({ taskId: null });
    await waitFor(() => expect(screen.queryByText(/Active task:/)).toBeNull());
  });

  it('nháp (EC12)', async () => {
    const first = await openChat();
    await first.user.type(composer(), 'đang gõ dở');
    first.unmountAll();
    await openChat();
    expect(composer().value).toBe('đang gõ dở');
  });

  it('nhãn thảo luận (EC18)', async () => {
    mock.use({
      overrides: {
        listMessages: () =>
          page([
            message(2, { sender: { type: 'agent', agent: 'orchestrator' }, content: 'phương án B', deliberation: { status: 'skipped', deliberationId: null, recordArtifactVersionId: null } }),
            message(1, { sender: { type: 'agent', agent: 'orchestrator' }, content: 'phương án A', deliberation: { status: 'deliberated', deliberationId: 'd-1', recordArtifactVersionId: null } }),
          ]),
      },
    });
    await openChat();
    expect(within((await screen.findByText('phương án B')).closest('li')!).getByText('Không qua thảo luận')).toBeTruthy();
    expect(within(screen.getByText('phương án A').closest('li')!).getByText('Qua thảo luận')).toBeTruthy();
  });

  it('nội dung có HTML (EC19)', async () => {
    mock.use({ overrides: { listMessages: () => page([message(1, { content: '<b>đậm</b><script>x()</script>\ndòng 2' })]) } });
    await openChat();
    const content = await screen.findByText(/dòng 2/);
    expect(content.textContent).toBe('<b>đậm</b><script>x()</script>\ndòng 2');
    expect(content.querySelector('b, script')).toBeNull();
  });

  it('archived chỉ đọc (EC27)', async () => {
    const archived = { ...structuredClone(demoFixtures.ResearchProject!.find((p) => p.id === P)!), status: 'Archived' as const };
    mock.use({ overrides: { getProject: () => ({ status: 200, body: archived }) } });
    await openChat();
    expect(screen.queryByLabelText('Tin nhắn cho Orchestrator')).toBeNull();
    expect(screen.getByText('Archived — chỉ đọc')).toBeTruthy();
  });
});

describe('Chat: chữ xuất hiện dần (S04)', () => {
  it('chữ xuất hiện dần (PID-00058-AC01, EC15)', async () => {
    const { user } = await openChat();
    await send(user, 'Chạy T-2.3');
    await screen.findByText('Chạy T-2.3');
    delta(1, 'Readiness check ');
    const draft = (await screen.findByText(/^Readiness check/)).closest('li')!;
    expect(within(draft).getByText('Orchestrator')).toBeTruthy();
    expect(within(draft).getByRole('link', { name: 'Agent Run ar-7f21' })).toBeTruthy();
    delta(2, 'Đạt.');
    await waitFor(() => expect(draft.querySelector('.sires-chat__content')?.textContent).toBe('Readiness check Đạt.'));
    delta(3, ' Discovery Agent bắt đầu.', { final: true });
    await waitFor(() => expect(draft.querySelector('.sires-chat__content')?.textContent).toBe('Readiness check Đạt. Discovery Agent bắt đầu.'));
    const saved = message(9, { sender: { type: 'agent', agent: 'orchestrator', agentRunId: RUN }, agentRunId: RUN, content: 'Readiness check Đạt. Discovery Agent bắt đầu.', createdAt: new Date().toISOString() });
    mock.use({ overrides: { listMessages: () => page([saved, ...fixtureMessages().reverse()]) } });
    mock.events.emit({ type: 'message.posted', projectId: P, objectType: 'message', objectId: saved.id });
    await waitFor(() => expect(screen.getAllByText('Readiness check Đạt. Discovery Agent bắt đầu.')).toHaveLength(1));
    expect(screen.getByText('Readiness check Đạt. Discovery Agent bắt đầu.').closest('li')!.hasAttribute('data-draft')).toBe(false);
    delta(2, 'Đạt.');
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelectorAll('[data-draft]')).toHaveLength(0);
  });

  it('đang trả lời (EC13)', async () => {
    const { user } = await openChat();
    await send(user, 'Có ai không?');
    expect((await screen.findByText('Orchestrator đang trả lời…')).closest('[role="status"]')).toBeTruthy();
    delta(1, 'Có.');
    await waitFor(() => expect(screen.queryByText('Orchestrator đang trả lời…')).toBeNull());
  });

  it('delta trùng, sai thứ tự (EC14)', async () => {
    await openChat();
    delta(1, 'A');
    await screen.findByText('A');
    delta(2, 'B');
    delta(2, 'B');
    delta(1, 'A');
    mock.events.emit({ type: 'chat.delta', projectId: P, conversationId: 'other-conversation', agentRunId: RUN, seq: 3, text: 'X' } as EventInput);
    await screen.findByText('AB');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('AB')).toBeTruthy();
    expect(screen.queryByText(/ABX|ABB|ABA/)).toBeNull();
  });

  it('mất SSE giữa stream (EC16)', async () => {
    await openChat();
    delta(1, 'đang dở');
    await screen.findByText('đang dở');
    mock.events.disconnect();
    // The node mock sends the new connection's headers with its first record: a durable event opens it, and the
    // client reports “reconnected”.
    await new Promise((r) => setTimeout(r, 100));
    mock.events.emit({ type: 'notification.created', objectType: 'notification', objectId: id('notification', 1) });
    await waitFor(() => expect(screen.queryByText('đang dở')).toBeNull(), { timeout: 4000 });
    // History read again, nothing doubled.
    for (const m of fixtureMessages()) expect(screen.getAllByText(m.content)).toHaveLength(1);
  });
});

describe('Chat: context và lỗi (S01, S06)', () => {
  it('tin đã lưu kết thúc dòng đang trả lời (EC13)', async () => {
    const { user } = await openChat();
    await send(user, 'Chỉ cần tin đã lưu');
    await screen.findByText('Orchestrator đang trả lời…');
    mock.events.emit({ type: 'message.posted', projectId: P, objectType: 'message', objectId: id('message', 999) });
    await waitFor(() => expect(screen.queryByText('Orchestrator đang trả lời…')).toBeNull());
  });

  it('lỗi provider tạm thời (EC28)', async () => {
    mock.use({
      overrides: {
        getWorkflow: ({ params }) => ({ status: 200, body: { id: params.workflowId, status: 'Failed', lastError: { code: 'timeout', agentRunId: 'run-t' } } as unknown as Schemas['Workflow'] }),
        getAgentRun: () => ({ status: 200, body: { id: 'run-t', agent: 'evidence_retrieval', status: 'Failed', error: { code: 'timeout' } } as unknown as Schemas['AgentRun'] }),
      },
    });
    const { user } = await openChat();
    await send(user, 'Truy xuất evidence');
    await screen.findByText('Truy xuất evidence');
    mock.events.emit({ type: 'workflow.status_changed', projectId: P, objectType: 'workflow', objectId: id('workflow', 601), fromState: 'Running', toState: 'Failed' });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('System đã thử lại');
    expect(within(alert).getByRole('link', { name: 'Mở Agent Activity' }).getAttribute('href')).toBe(`/projects/${P}/activity`);
  });

  it('lỗi provider (EC28)', async () => {
    mock.use({
      overrides: {
        getWorkflow: ({ params }) => ({ status: 200, body: { id: params.workflowId, status: 'Failed', lastError: { code: 'auth_failed', message: PROVIDER_TEXT, agentRunId: 'run-x' } } as unknown as Schemas['Workflow'] }),
        getAgentRun: () => ({ status: 200, body: { id: 'run-x', agent: 'discovery', status: 'Failed', error: { code: 'auth_failed', message: PROVIDER_TEXT }, providerConnectionId: 'pc-1' } as unknown as Schemas['AgentRun'] }),
        listProviderConnections: () => ({ status: 200, body: { items: [{ id: 'pc-1', name: 'Claude cá nhân' } as Schemas['ProviderConnection']], nextCursor: null } }),
      },
    });
    const { user } = await openChat();
    await send(user, 'Tìm tài liệu');
    await screen.findByText('Tìm tài liệu');
    mock.events.emit({ type: 'workflow.status_changed', projectId: P, objectType: 'workflow', objectId: id('workflow', 601), fromState: 'Running', toState: 'Failed' });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Discovery Agent chưa trả lời được.');
    expect(alert.textContent).toContain('Kết nối: Claude cá nhân.');
    expect(alert.textContent).toContain('auth_failed');
    expect(alert.textContent).not.toContain(PROVIDER_TEXT);
    expect(within(alert).getByRole('link', { name: 'Mở Provider Connections' }).getAttribute('href')).toBe('/settings/providers');
  });

  it('khung context (EC29)', async () => {
    const selections = Array.from({ length: 14 }, (_, i) => ({ id: `sel-${i}`, referenceId: id('reference', i + 1), status: 'Active', reference: { indexingStatus: i < 12 ? 'Indexed' : 'Pending' } }));
    mock.use({ overrides: { listProjectReferences: () => ({ status: 200, body: { items: selections, nextCursor: null } as never }) } });
    await openChat();
    const panel = within(screen.getByRole('complementary', { name: 'Context của cuộc trò chuyện' }));
    expect(await panel.findByText('phiên bản 4 · 1 giả định mở')).toBeTruthy();
    expect(panel.getByText('14 · 12 Indexed')).toBeTruthy();
    expect(panel.getByText(/^(Gửi|Không gửi \(tắt trong Profile\))$/)).toBeTruthy();
    expect(panel.getByRole('link', { name: 'Xem workflow đang chạy' })).toBeTruthy();
    expect(panel.getByRole('link', { name: 'Đổi trong Profile' }).getAttribute('href')).toBe('/settings/profile');
  });

  it('khung context khi chưa có gì (EC29)', async () => {
    await openChat(projectIds.salinity);
    const panel = within(screen.getByRole('complementary', { name: 'Context của cuộc trò chuyện' }));
    await panel.findByText('phiên bản 1 · 0 giả định mở');
    expect(panel.getAllByText('Chưa có').length).toBeGreaterThanOrEqual(2);
    expect(panel.queryByRole('link', { name: 'Xem workflow đang chạy' })).toBeNull();
  });

  it('đổi ngôn ngữ, đang tải, lỗi (EC31)', async () => {
    const { user } = await openChat();
    await user.type(composer(), 'giữ nguyên');
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'EN' }));
    await waitFor(() => expect(i18next.language).toBe('en'));
    expect((screen.getByLabelText('Message to the Orchestrator') as HTMLTextAreaElement).value).toBe('giữ nguyên');
  });

  it('đang tải và lỗi tải (EC31)', async () => {
    let calls = 0;
    mock.use({
      overrides: {
        listConversations: () => {
          calls += 1;
          return calls === 1 ? problem(503, 'service_unavailable') : { status: 200, body: { items: [] } };
        },
      },
    });
    const view = renderProject(`/projects/${P}/chat`);
    await waitForFrame();
    expect(await screen.findByText('SIRes tạm thời không phục vụ được.')).toBeTruthy();
    await view.user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText(/Chưa có tin nhắn/)).toBeTruthy();
  });
});

describe('Chat: đề xuất thảo luận (PID-00084 trong luồng)', () => {
  it('bỏ qua thảo luận ra nhãn Không qua thảo luận (PID-00084-AC01)', async () => {
    const proposal = openProposal();
    let skipped = false;
    const newestFirst = (list: Message[]) => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    mock.use({
      overrides: {
        listMessages: () => page(newestFirst([...fixtureMessages(), proposalMessage(), ...(skipped ? [skippedResultMessage()] : [])])),
        answerPrompt: ({ params }) => {
          if (params.promptId !== proposal.id) return problem(409, 'invalid_transition');
          skipped = true;
          return { status: 200, body: { ...proposal, status: 'Answered', response: { choiceIds: ['skip'], respondedBy: { type: 'researcher' }, respondedAt: new Date().toISOString() } } };
        },
      },
    });
    const { user, calls } = await openChat();
    // The proposal of the flow is the card of PID-00084, not the standard prompt card.
    await user.click(await screen.findByRole('button', { name: 'Bỏ qua' }));
    expect(await screen.findByText(/^Bạn đã chọn Bỏ qua/)).toBeTruthy();
    expect(JSON.parse(calls('POST', `/prompts/${proposal.id}/response`)[0]!.body ?? '{}')).toEqual({ choiceIds: ['skip'] });
    // The Orchestrator's result arrives: it carries the label of Chat--deliberation-skipped.
    mock.events.emit({ type: 'message.posted', projectId: P, objectType: 'message', objectId: skippedResultMessage().id });
    const result = (await screen.findByText(/^Tôi đề xuất so sánh theo ba trục/)).closest('li')!;
    expect(within(result).getByText('Không qua thảo luận')).toBeTruthy();
  });
});
