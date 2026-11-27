// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00060 S04: content of the Assistant panel. Conversation operations belong to the project area's mocks
// (PID-00060 H8); these tests override them locally.

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Schemas } from '../../shell/mock/types';
import { feature } from '.';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { RAG_ID, conversation, message, unavailable } from './__mocks__/fixtures-for-test';
import { renderGlobal } from './__mocks__/render';
import { resetGlobalStore } from './__mocks__/store';

const mock = useMockServer({ features: [feature] });
const panel = () => within(screen.getByRole('complementary', { name: 'Trợ lý' }));

interface Calls {
  created: unknown[];
  sent: Array<{ body: unknown; key: string | null; conversationId: string }>;
}

/** Local overrides of the conversation operations (owned by the project area's mocks). */
function conversations(initial: Schemas['Conversation'][], history: Schemas['Message'][] = []) {
  const calls: Calls = { created: [], sent: [] };
  let rows = [...initial];
  let messages = [...history];
  mock.use({
    overrides: {
      listConversations: () => ({ status: 200, body: { items: rows } }),
      createConversation: ({ body }) => {
        calls.created.push(body);
        const row = conversation(9);
        rows = [row];
        return { status: 201, body: row };
      },
      listMessages: () => ({ status: 200, body: { items: [...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), nextCursor: null } }),
      sendMessage: ({ body, request, params }) => {
        calls.sent.push({ body, key: request.headers.get('Idempotency-Key'), conversationId: params.conversationId });
        const row = message(50 + calls.sent.length, params.conversationId, 'researcher', body?.content ?? '', { createdAt: new Date().toISOString() });
        messages = [...messages, row];
        return { status: 202, body: { message: row } };
      },
      listProviderConnections: ({ generated }) => ({ status: 200, body: generated(200) }),
    },
  });
  return {
    calls,
    reply: (row: Schemas['Message']) => {
      messages = [...messages, row];
      mock.events.emit({ type: 'message.posted', objectType: 'message', objectId: row.id });
    },
  };
}

async function openAssistant(path = '/library') {
  const view = renderGlobal(path);
  await waitForFrame();
  await view.user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Trợ lý' }));
  await panel().findByText('Global AI Assistant');
  return view;
}

beforeEach(() => resetGlobalStore());

describe('Global AI Assistant (S04)', () => {
  it('khung cạnh trang hiện tại (UX-LAYOUT-002-AC01, EC17)', async () => {
    conversations([]);
    const { router } = await openAssistant('/library');
    expect(panel().getByText('Global — không có ngữ cảnh project')).toBeTruthy();
    expect(panel().getByText(/không bao giờ đọc nội dung project/)).toBeTruthy();
    // The page stays: same route, main still rendered next to the panel.
    expect(router.state.location.pathname).toBe('/library');
    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('TS-01-05 không gửi dữ liệu project (WS-CHAT-001-AC01, EC16)', async () => {
    const chat = conversations([]);
    const { user } = await openAssistant('/dashboard');
    await user.type(panel().getByLabelText('Tin nhắn'), 'Tóm tắt evidence của project RAG');
    await user.click(panel().getByRole('button', { name: 'Gửi' }));
    await waitFor(() => expect(chat.calls.sent.length).toBe(1));
    expect(chat.calls.created).toEqual([{ scope: 'global' }]);
    expect(chat.calls.sent[0]!.body).toEqual({ content: 'Tóm tắt evidence của project RAG' });
    chat.reply(
      message(60, conversation(9).id, 'orchestrator', 'Trợ lý Global không đọc nội dung project. Mở Project AI Chat của project đó.', {
        createdAt: new Date(Date.now() + 1000).toISOString(),
        links: [{ label: 'Ứng dụng RAG trong tổng quan tài liệu y sinh', objectType: 'project', objectId: RAG_ID }],
      }),
    );
    const link = await panel().findByRole('link', { name: 'Ứng dụng RAG trong tổng quan tài liệu y sinh' });
    expect(link.getAttribute('href')).toBe(`/projects/${RAG_ID}/overview`);
  });

  it('lịch sử hội thoại (WS-CHAT-001-AC03)', async () => {
    const id = conversation(1).id;
    conversations([conversation(1), conversation(2, 'project')], [message(1, id, 'researcher', 'Câu hỏi hôm qua'), message(2, id, 'orchestrator', 'Trả lời hôm qua')]);
    await openAssistant();
    const first = await panel().findByText('Câu hỏi hôm qua');
    const second = panel().getByText('Trả lời hôm qua');
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('tạo hội thoại khi gửi tin đầu (EC13)', async () => {
    const chat = conversations([]);
    await openAssistant();
    expect(await panel().findByText(/Chưa có hội thoại/)).toBeTruthy();
    expect(chat.calls.created).toEqual([]);
  });

  it('gửi lỗi giữ nội dung (EC14)', async () => {
    const chat = conversations([conversation(1)]);
    let fail = true;
    const keys: Array<string | null> = [];
    mock.use({
      overrides: {
        sendMessage: ({ request, params, body }) => {
          keys.push(request.headers.get('Idempotency-Key'));
          if (fail) return unavailable();
          return { status: 202, body: { message: message(70, params.conversationId, 'researcher', body?.content ?? '') } };
        },
      },
    });
    const { user } = await openAssistant();
    await user.type(panel().getByLabelText('Tin nhắn'), 'Tin quan trọng');
    await user.click(panel().getByRole('button', { name: 'Gửi' }));
    expect((await panel().findByRole('alert')).textContent).toContain('service_unavailable');
    expect((panel().getByLabelText('Tin nhắn') as HTMLTextAreaElement).value).toBe('Tin quan trọng');
    fail = false;
    await user.click(panel().getByRole('button', { name: 'Gửi' }));
    await waitFor(() => expect((panel().getByLabelText('Tin nhắn') as HTMLTextAreaElement).value).toBe(''));
    expect(keys.length).toBe(2);
    expect(keys[1]).toBe(keys[0]);
    expect(chat.calls.sent.length).toBe(0); // the local override above answered both sends
  });

  it('chưa có provider (EC15)', async () => {
    conversations([]);
    mock.use({ overrides: { listProviderConnections: () => ({ status: 200, body: { items: [] } }) } });
    await openAssistant();
    expect(await panel().findByText(/Chưa có Provider Connection/)).toBeTruthy();
    expect(panel().getByRole('link', { name: 'Settings › Agent Models' }).getAttribute('href')).toBe('/settings/agents');
    expect((panel().getByLabelText('Tin nhắn') as HTMLTextAreaElement).disabled).toBe(false);
  });

  it('trả lời qua message.posted (EC18)', async () => {
    const chat = conversations([conversation(1)]);
    const { user } = await openAssistant();
    await user.type(panel().getByLabelText('Tin nhắn'), 'Có bài nào về dense retrieval?');
    await user.click(panel().getByRole('button', { name: 'Gửi' }));
    expect(await panel().findByText('Orchestrator đang trả lời…')).toBeTruthy();
    chat.reply(message(61, conversation(1).id, 'orchestrator', 'Có 2 Trusted Reference phù hợp.', { createdAt: new Date(Date.now() + 1000).toISOString() }));
    expect(await panel().findByText('Có 2 Trusted Reference phù hợp.')).toBeTruthy();
    await waitFor(() => expect(panel().queryByText('Orchestrator đang trả lời…')).toBeNull());
  });

  it('tin nhắn dạng chữ (EC12)', async () => {
    const id = conversation(1).id;
    conversations([conversation(1)], [message(1, id, 'orchestrator', '<script>alert(1)</script>')]);
    await openAssistant();
    expect(await panel().findByText('<script>alert(1)</script>')).toBeTruthy();
    expect(document.querySelector('aside script')).toBeNull();
  });
});
