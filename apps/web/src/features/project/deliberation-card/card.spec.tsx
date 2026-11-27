// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00084: deliberation proposal card (S01 content and states, S02 answer flow) on the mock of PID-00013, with the
// operations of other areas overridden per test.

import { act, screen, waitFor, within } from '@testing-library/react';
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import { useMockServer } from '../../../shell/mock/node';
import type { Schemas } from '../../../shell/mock';
import {
  answeredProposal,
  cancelledProposal,
  expiredProposal,
  missingConfigProposal,
  openProposal,
  PROJECT_ID,
  sameModelProposal,
  sparseProposal,
  withoutSkip,
  WORKFLOW_ID,
} from '../__mocks__/deliberation-card';
import { renderCard, textOf, useCardContext, waitForStream } from './testing';

type Prompt = Schemas['InteractiveAgentPrompt'];

const card = () => screen.getByRole('article');
/** “term: description” lines of the card's facts. */
const facts = () => [...card().querySelectorAll('dt')].map((dt) => `${textOf(dt)}: ${textOf(dt.nextElementSibling)}`);
const answered = (prompt: Prompt, choiceId: string): Prompt => ({
  ...prompt,
  status: 'Answered',
  response: { choiceIds: [choiceId], respondedBy: { type: 'researcher' }, respondedAt: new Date().toISOString() },
});

async function open(prompt: Prompt) {
  const view = renderCard(prompt);
  await screen.findByRole('heading', { level: 3, name: prompt.deliberationProposal!.problem });
  return view;
}

describe('Thẻ đề xuất thảo luận (PID-00084 S01)', () => {
  const mock = useMockServer();

  it('nội dung thẻ (EC01)', async () => {
    useCardContext(mock);
    const { unmountAll } = await open(openProposal());
    const article = card();
    expect(textOf(article.querySelector('.deliberation-card__kind'))).toBe('Đề xuất thảo luận · methodology');
    await waitFor(() => expect(textOf(article.querySelector('.deliberation-card__meta'))).toMatch(/^Orchestrator · \d{2}:\d{2} · bước 4\/5 của wf-052$/));
    // The workflow code links to the workflow page, short code as the monitoring area writes it.
    expect(within(article).getByRole('link', { name: 'wf-052' }).getAttribute('href')).toBe(`/projects/${PROJECT_ID}/activity/workflows/${WORKFLOW_ID}`);
    await waitFor(() =>
      expect(facts()).toEqual([
        'Vì sao thảo luận: Có ít nhất ba cách so sánh hợp lý; chọn sai sẽ phải làm lại ma trận.',
        'Các bên: Orchestrator · Analysis Agent A (xây dựng phương án) · Analysis Agent B (tìm rủi ro và phương án thay thế)',
        'Chi phí: Khoảng 7 Agent Run, tính trên API key của bạn (Claude cá nhân, OpenAI cá nhân). Tối đa 2 vòng sau Vòng 1. Ước tính theo số vòng tối đa; phiên dừng sớm khi các bên đồng thuận.',
      ]),
    );
    expect(within(article).getByRole('button', { name: 'Thảo luận' })).toBeTruthy();
    expect(within(article).getByRole('button', { name: 'Bỏ qua' })).toBeTruthy();
    expect(within(article).getByText('Bỏ qua: Orchestrator tự đưa phương án, kết quả mang nhãn “không qua thảo luận”.')).toBeTruthy();
    expect(within(article).queryByRole('note')).toBeNull();
    expect(within(article).queryByRole('link', { name: 'Mở Agent Models' })).toBeNull();
    unmountAll();
  });

  it('cảnh báo cùng model (EC02)', async () => {
    useCardContext(mock);
    const { unmountAll } = await open(sameModelProposal());
    const note = within(card()).getByRole('note');
    expect(textOf(note)).toBe('Analysis Agent A và B đang dùng cùng model gpt-5. Đổi trong Agent Models');
    expect(within(note).getByRole('link', { name: 'Đổi trong Agent Models' }).getAttribute('href')).toBe('/settings/agents');
    unmountAll();
  });

  it('thiếu dữ liệu chi phí (EC03)', async () => {
    useCardContext(mock);
    const { unmountAll } = await open(sparseProposal());
    // Unknown connection: the party's model instead of the name; no cost note line.
    await waitFor(() => expect(facts()[2]).toBe('Chi phí: Khoảng 7 Agent Run, tính trên API key của bạn (mistral-large, OpenAI cá nhân). Tối đa 2 vòng sau Vòng 1.'));
    expect(card().querySelector('.deliberation-card__note')).toBeNull();
    unmountAll();
  });

  it('Expired, Cancelled (EC08)', async () => {
    useCardContext(mock);
    for (const prompt of [expiredProposal(), cancelledProposal()]) {
      const { unmountAll } = await open(prompt);
      const article = card();
      expect(article.getAttribute('data-status')).toBe(prompt.status);
      expect(within(article).queryAllByRole('button')).toEqual([]);
      expect(textOf(article.querySelector('.deliberation-card__closed'))).toBe(`${prompt.statusReason} Không được tính là đồng ý.`);
      expect(within(article).getByText(prompt.status)).toBeTruthy();
      unmountAll();
    }
  });

  it('thiếu cấu hình (EC09)', async () => {
    useCardContext(mock);
    const { unmountAll } = await open(missingConfigProposal());
    const article = card();
    expect(within(article).getByRole('button', { name: 'Cấu hình lại rồi thảo luận' })).toBeTruthy();
    expect(within(article).getByRole('button', { name: 'Tiếp tục không thảo luận' })).toBeTruthy();
    expect(within(article).getByText(/^Tiếp tục không thảo luận: Orchestrator tự đưa phương án/)).toBeTruthy();
    expect(facts()[0]).toContain('Analysis Agent B chưa có kết nối hợp lệ');
    expect((await within(article).findByRole('link', { name: 'Mở Agent Models' })).getAttribute('href')).toBe('/settings/agents');
    unmountAll();
  });

  it('thiếu cấu hình: kết nối không có trong danh sách, danh sách lỗi, chưa có model (EC09)', async () => {
    const modelsLink = () => within(card()).findByRole('link', { name: 'Mở Agent Models' });
    // A connection the account's list does not have.
    useCardContext(mock);
    let view = await open(sparseProposal());
    expect(await modelsLink()).toBeTruthy();
    view.unmountAll();

    // The list cannot be read.
    mock.use({
      overrides: {
        listProviderConnections: () =>
          new Response(JSON.stringify({ type: 'about:blank', title: 'internal_error', status: 500, code: 'internal_error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/problem+json' },
          }),
      },
    });
    view = await open(openProposal());
    expect(await modelsLink()).toBeTruthy();
    view.unmountAll();

    // An Analysis Agent with no model.
    mock.server.resetHandlers();
    useCardContext(mock);
    const noModel = openProposal();
    noModel.deliberationProposal!.participants[2].model = '';
    view = await open(noModel);
    expect(await modelsLink()).toBeTruthy();
    view.unmountAll();
  });

  it('thiếu lựa chọn dùng thẻ chuẩn (EC10)', async () => {
    useCardContext(mock);
    const prompt = withoutSkip();
    mock.use({ overrides: { answerPrompt: () => new Response('', { status: 503 }) } });
    const { user, unmountAll } = renderCard(prompt);
    expect(await screen.findByText(prompt.question)).toBeTruthy();
    expect(document.querySelector('.deliberation-card')).toBeNull();
    expect(screen.queryByText('Vì sao thảo luận')).toBeNull();
    // The standard card shows a failed answer too.
    await user.click(screen.getByRole('radio', { name: /Thảo luận/ }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(await screen.findByText('Chưa gửi được câu trả lời')).toBeTruthy();
    unmountAll();
  });

  it('bản đọc lại không còn đủ đề xuất: thẻ chuẩn, không lỗi (EC10)', async () => {
    useCardContext(mock);
    const prompt = openProposal();
    mock.use({
      overrides: {
        answerPrompt: () => ({ status: 409, body: { type: 'x', title: 'x', status: 409, code: 'invalid_transition' } }),
        getPrompt: () => ({ status: 200, body: { ...answered(prompt, 'deliberate'), deliberationProposal: undefined } }),
      },
    });
    const { user, unmountAll } = await open(prompt);
    await user.click(within(card()).getByRole('button', { name: 'Bỏ qua' }));
    expect(await screen.findByText('Đề xuất này đã được xử lý ở nơi khác; thẻ hiện trạng thái mới, không gửi lại.')).toBeTruthy();
    expect(document.querySelector('.deliberation-card')).toBeNull();
    expect(screen.getByText(prompt.question)).toBeTruthy();
    unmountAll();
  });

  it('bàn phím (EC11)', async () => {
    useCardContext(mock);
    const prompt = openProposal();
    let body: unknown;
    mock.use({
      overrides: {
        answerPrompt: async ({ request }) => {
          body = await request.json();
          return { status: 200, body: answered(prompt, 'skip') };
        },
      },
    });
    const { user, unmountAll } = await open(prompt);
    const deliberate = within(card()).getByRole('button', { name: 'Thảo luận' });
    const skip = within(card()).getByRole('button', { name: 'Bỏ qua' });
    // Nothing chosen beforehand.
    expect(deliberate.getAttribute('aria-pressed')).toBeNull();
    deliberate.focus();
    await user.tab();
    expect(document.activeElement).toBe(skip);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(body).toEqual({ choiceIds: ['skip'] }));
    // Focus stays on the card after answering.
    await waitFor(() => expect(document.activeElement).toBe(card()));
    unmountAll();
  });

  it('đổi ngôn ngữ và nội dung có HTML (EC12)', async () => {
    useCardContext(mock);
    const prompt = openProposal();
    prompt.deliberationProposal!.problem = '<b>Chọn khung</b> so sánh';
    const { unmountAll } = await open(prompt);
    expect(card().querySelector('h3 b')).toBeNull();
    // The frame applies the account's language (vi) once /me answers; switch after that, as the VI/EN control does.
    await waitFor(async () => {
      if (i18next.language !== 'en') await act(() => i18next.changeLanguage('en'));
      expect(textOf(card().querySelector('.deliberation-card__kind'))).toBe('Deliberation proposal · methodology');
    });
    expect(within(card()).getByText('Why deliberate')).toBeTruthy();
    unmountAll();
    await act(() => i18next.changeLanguage('vi'));
  });
});

describe('Trả lời đề xuất (PID-00084 S02)', () => {
  const mock = useMockServer();

  it('bỏ qua (PID-00084-AC01, UX-MONITOR-007-AC01, EC04)', async () => {
    useCardContext(mock);
    const prompt = openProposal();
    let sent: { body: unknown; key: string | null } | undefined;
    mock.use({
      overrides: {
        answerPrompt: async ({ request }) => {
          sent = { body: await request.json(), key: request.headers.get('idempotency-key') };
          return { status: 200, body: answered(prompt, 'skip') };
        },
      },
    });
    const { user, services, changes, unmountAll } = await open(prompt);
    await waitForStream(services, mock);
    // The card's reads are done (connection names, step of the workflow) before the click.
    await waitFor(() => expect(textOf(card().querySelector('.deliberation-card__meta'))).toContain('bước 4/5'));
    await waitFor(() => expect(facts()[2]).toContain('Claude cá nhân'));
    const after: string[] = [];
    mock.server.events.on('request:start', ({ request }) => after.push(`${request.method} ${new URL(request.url).pathname}`));

    await user.click(within(card()).getByRole('button', { name: 'Bỏ qua' }));
    expect(await within(card()).findByText(/^Bạn đã chọn Bỏ qua/)).toBeTruthy();
    expect(sent?.body).toEqual({ choiceIds: ['skip'] });
    expect(sent?.key).toMatch(/^[0-9a-f-]{36}$/);
    // The answer is in the card's live region; the Chat gets the answered prompt.
    expect(textOf(card().querySelector('[role="status"]'))).toMatch(/^Bạn đã chọn Bỏ qua/);
    expect(changes.map((p) => p.status)).toEqual(['Answered']);

    // The outbox then sends prompt.status_changed for this very answer: not “elsewhere”, nothing read again (EC07).
    const delivered = new Promise<void>((resolve) => {
      const off = services.events.subscribe({ types: ['prompt.status_changed'] }, () => {
        off();
        resolve();
      });
    });
    mock.events.emit({ type: 'prompt.status_changed', projectId: PROJECT_ID, objectType: 'interactive_agent_prompt', objectId: prompt.id, fromState: 'Open', toState: 'Answered' });
    await delivered;
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText(/ở nơi khác/)).toBeNull();
    // Every request after the click: only answerPrompt; the screen opens no session and starts no Agent Run.
    expect(after).toEqual([`POST /api/v1/prompts/${prompt.id}/response`]);
    expect(card().getAttribute('data-status')).toBe('Answered');
    expect(within(card()).queryByRole('link', { name: 'Mở tab Thảo luận' })).toBeNull();
    mock.server.events.removeAllListeners();
    unmountAll();
  });

  it('Chat render lại với bản cũ (Open) sau khi trả lời: thẻ giữ Answered', async () => {
    useCardContext(mock);
    const prompt = openProposal();
    mock.use({ overrides: { answerPrompt: () => ({ status: 200, body: answered(prompt, 'skip') }) } });
    const a = await open(prompt);
    await a.user.click(within(card()).getByRole('button', { name: 'Bỏ qua' }));
    await within(card()).findByText(/^Bạn đã chọn Bỏ qua/);
    a.setPrompt({ ...prompt });
    expect(card().getAttribute('data-status')).toBe('Answered');
    expect(within(card()).queryAllByRole('button')).toEqual([]);
    a.unmountAll();

    // A copy that is newer (closed while the card shows it Open) replaces the card's.
    const b = await open(openProposal());
    b.setPrompt(expiredProposal());
    expect(card().getAttribute('data-status')).toBe('Expired');
    b.setPrompt({ ...openProposal(), id: expiredProposal().id });
    expect(card().getAttribute('data-status')).toBe('Expired');
    b.unmountAll();
  });

  it('thảo luận (EC05)', async () => {
    useCardContext(mock);
    const prompt = openProposal();
    mock.use({ overrides: { answerPrompt: () => ({ status: 200, body: answered(prompt, 'deliberate') }) } });
    const { user, unmountAll } = await open(prompt);
    await user.click(within(card()).getByRole('button', { name: 'Thảo luận' }));
    expect(await within(card()).findByText(/^Bạn đã chọn Thảo luận/)).toBeTruthy();
    expect(within(card()).getByRole('link', { name: 'Mở tab Thảo luận' }).getAttribute('href')).toBe(
      `/projects/${PROJECT_ID}/activity/workflows/${WORKFLOW_ID}?view=deliberation`,
    );
    unmountAll();
  });

  it('bấm hai lần (EC06)', async () => {
    useCardContext(mock);
    const prompt = openProposal();
    let calls = 0;
    mock.use({
      overrides: {
        answerPrompt: () => {
          calls += 1;
          return { status: 200, delayMs: 100, body: answered(prompt, 'skip') };
        },
      },
    });
    const { user, unmountAll } = await open(prompt);
    const skip = within(card()).getByRole('button', { name: 'Bỏ qua' }) as HTMLButtonElement;
    await user.click(skip);
    expect(skip.disabled).toBe(true);
    expect((within(card()).getByRole('button', { name: 'Thảo luận' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(skip);
    await within(card()).findByText(/^Bạn đã chọn Bỏ qua/);
    expect(calls).toBe(1);
    unmountAll();
  });

  it('trả lời ở nơi khác (EC07)', async () => {
    useCardContext(mock);
    // 409: answered elsewhere; the card reads the prompt again and does not send again.
    const first = openProposal();
    let posts = 0;
    mock.use({
      overrides: {
        answerPrompt: () => {
          posts += 1;
          return { status: 409, body: { type: 'x', title: 'x', status: 409, code: 'invalid_transition' } };
        },
        getPrompt: () => ({ status: 200, body: answered(first, 'deliberate') }),
      },
    });
    const a = await open(first);
    await a.user.click(within(card()).getByRole('button', { name: 'Bỏ qua' }));
    expect(await within(card()).findByText('Đề xuất này đã được xử lý ở nơi khác; thẻ hiện trạng thái mới, không gửi lại.')).toBeTruthy();
    expect(within(card()).getByText(/^Bạn đã chọn Thảo luận/)).toBeTruthy();
    expect(posts).toBe(1);
    a.unmountAll();

    // prompt.status_changed of this prompt: read it again.
    mock.server.resetHandlers();
    useCardContext(mock);
    const second = openProposal();
    mock.use({ overrides: { getPrompt: () => ({ status: 200, body: { ...second, status: 'Cancelled', statusReason: 'Workflow đã bị hủy.' } }) } });
    const b = await open(second);
    await waitForStream(b.services, mock);
    mock.events.emit({ type: 'prompt.status_changed', projectId: PROJECT_ID, objectType: 'interactive_agent_prompt', objectId: second.id, fromState: 'Open', toState: 'Cancelled' });
    await waitFor(() => expect(card().getAttribute('data-status')).toBe('Cancelled'));
    expect(within(card()).queryAllByRole('button')).toEqual([]);
    b.unmountAll();
  });

  it('thiếu cấu hình, chọn cấu hình lại: dẫn tới Agent Models, không tới tab Thảo luận', async () => {
    useCardContext(mock);
    const prompt = missingConfigProposal();
    mock.use({ overrides: { answerPrompt: () => ({ status: 200, body: answered(prompt, 'deliberate') }) } });
    const { user, unmountAll } = await open(prompt);
    await within(card()).findByRole('link', { name: 'Mở Agent Models' });
    await user.click(within(card()).getByRole('button', { name: 'Cấu hình lại rồi thảo luận' }));
    const line = await within(card()).findByText(/^Bạn đã chọn Cấu hình lại rồi thảo luận/);
    expect(within(line).getByRole('link', { name: 'Mở Agent Models' }).getAttribute('href')).toBe('/settings/agents');
    expect(within(card()).queryByRole('link', { name: 'Mở tab Thảo luận' })).toBeNull();
    unmountAll();
  });

  it('thẻ đã trả lời chỉ đọc', async () => {
    useCardContext(mock);
    const { unmountAll } = await open(answeredProposal());
    expect(within(card()).queryAllByRole('button')).toEqual([]);
    expect(textOf(card().querySelector('.deliberation-card__answered'))).toMatch(/^Bạn đã chọn Bỏ qua · \d{2}:\d{2}$/);
    unmountAll();
  });
});
