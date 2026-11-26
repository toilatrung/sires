// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00058 S05: prompts in the chat flow (PID-00058-AC02, UX-PROMPT-001…005, UX-A11Y-002; EC20–EC26).

import type { PublicApi } from '@sires/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFixtures, id, projectIds } from '../../shell/mock';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { resetProjectChatMockState } from './__mocks__';
import { problem, renderProject } from './test-helpers';
import { feature } from '.';

type Prompt = PublicApi.components['schemas']['InteractiveAgentPrompt'];

const mock = useMockServer({ features: [feature] });
beforeEach(() => resetProjectChatMockState());

const PROMPT_ID = id('prompt', 1);
const base = (): Prompt => structuredClone(demoFixtures.InteractiveAgentPrompt!.find((p) => p.id === PROMPT_ID)!);
const withPrompt = (prompt: Prompt) => mock.use({ overrides: { getPrompt: () => ({ status: 200, body: prompt }) } });

async function openChat() {
  const view = renderProject(`/projects/${projectIds.rag}/chat`);
  await waitForFrame();
  return view;
}

const question = () => screen.findByText(base().question);

describe('Prompt trong luồng chat (S05)', () => {
  it('thẻ trong luồng (UX-PROMPT-001-AC01, EC20)', async () => {
    await openChat();
    expect(await question()).toBeTruthy();
    for (const choice of base().choices ?? []) {
      expect(screen.getByText(choice.label)).toBeTruthy();
      if (choice.consequence) expect(screen.getByText(new RegExp(choice.consequence.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy();
    }
    const card = (await question()).closest('.sires-chat__prompt') as HTMLElement;
    expect(within(card).getAllByText(/Synthesis Agent/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Mở task liên quan' }).getAttribute('href')).toBe(`/projects/${projectIds.rag}/tasks/${id('task', 3)}`);
  });

  it('không chọn sẵn (UX-PROMPT-002-AC01, EC24)', async () => {
    const { calls } = await openChat();
    await question();
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.length).toBe(3);
    expect(radios.some((r) => r.checked)).toBe(false);
    expect((screen.getByRole('button', { name: /^Xác nhận/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(calls('POST', `/prompts/${PROMPT_ID}/response`)).toHaveLength(0);
  });

  it('bàn phím (UX-A11Y-002-AC01)', async () => {
    const { user, calls } = await openChat();
    await question();
    const radios = screen.getAllByRole('radio');
    radios[0].focus();
    await user.keyboard('{ArrowDown}');
    expect((radios[1] as HTMLInputElement).checked).toBe(true);
    await user.tab();
    const confirm = screen.getByRole('button', { name: 'Xác nhận' });
    expect(document.activeElement).toBe(confirm);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(calls('POST', `/prompts/${PROMPT_ID}/response`)).toHaveLength(1));
    expect(JSON.parse(calls('POST', `/prompts/${PROMPT_ID}/response`)[0].body ?? '{}')).toMatchObject({ choiceIds: ['coverage'] });
    expect(calls('POST', `/prompts/${PROMPT_ID}/response`)[0].headers['Idempotency-Key']).toBeTruthy();
  });

  it('Answered ở nơi khác (PID-00058-AC02, UX-PROMPT-005-AC01, EC21)', async () => {
    const { calls } = await openChat();
    await question();
    const answered: Prompt = { ...base(), status: 'Answered', response: { choiceIds: ['precision'], respondedBy: { type: 'researcher' }, respondedAt: new Date().toISOString() } };
    withPrompt(answered);
    mock.events.emit({ type: 'prompt.status_changed', projectId: projectIds.rag, objectType: 'prompt', objectId: PROMPT_ID, fromState: 'Open', toState: 'Answered' });
    await waitFor(() => expect(screen.getByText(/Đã chọn:/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /^Xác nhận/ })).toBeNull();
    expect(screen.getByText(/chỉ đọc/)).toBeTruthy();
    expect(calls('POST', `/prompts/${PROMPT_ID}/response`)).toHaveLength(0);
  });

  it('trả lời trễ 409 (EC22)', async () => {
    mock.use({ overrides: { answerPrompt: () => problem(409, 'invalid_transition') } });
    const { user, calls } = await openChat();
    await question();
    await user.click(screen.getAllByRole('radio')[0]);
    withPrompt({ ...base(), status: 'Answered', response: { choiceIds: ['coverage'], respondedBy: { type: 'researcher' }, respondedAt: new Date().toISOString() } });
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(await screen.findByText(/đã được xử lý ở nơi khác/)).toBeTruthy();
    expect(calls('POST', `/prompts/${PROMPT_ID}/response`)).toHaveLength(1);
    expect(screen.getByText(/Đã chọn:/)).toBeTruthy();
  });

  it('Cancelled, Expired (UX-PROMPT-004-AC01, EC23)', async () => {
    withPrompt({ ...base(), status: 'Cancelled', statusReason: 'Plan Version chờ duyệt đã có phiên bản mới.' });
    await openChat();
    expect(await screen.findByText(/Plan Version chờ duyệt đã có phiên bản mới/)).toBeTruthy();
    expect(screen.getByText('Không được tính là đồng ý.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Xác nhận/ })).toBeNull();
  });

  it('sửa và duyệt (UX-PROMPT-003-AC01)', async () => {
    const edit: Prompt = { ...base(), type: 'edit_and_approve', question: 'Kiểm tra metadata trước khi duyệt', choices: undefined, editablePayload: { title: 'Retrieval-augmented generation for NLP' } };
    withPrompt(edit);
    const { user, calls } = await openChat();
    const title = await screen.findByLabelText(/title|Tiêu đề/i);
    await user.clear(title);
    await user.type(title, 'Retrieval-Augmented Generation for Knowledge-Intensive NLP');
    await user.click(screen.getByRole('button', { name: 'Sửa và duyệt' }));
    await waitFor(() => expect(calls('POST', `/prompts/${PROMPT_ID}/response`)).toHaveLength(1));
    expect(JSON.parse(calls('POST', `/prompts/${PROMPT_ID}/response`)[0].body ?? '{}')).toMatchObject({
      decision: 'approved',
      editedPayload: { title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP' },
    });
  });

  it('đề xuất thảo luận thẻ chuẩn (EC26)', async () => {
    withPrompt({
      ...base(),
      purpose: 'deliberation_proposal',
      question: 'Chọn khung so sánh các phương pháp đo hallucination cho T-2.3',
      choices: [
        { id: 'deliberate', label: 'Thảo luận', consequence: 'Khoảng 7 Agent Run.' },
        { id: 'skip', label: 'Bỏ qua', consequence: 'Kết quả mang nhãn “không qua thảo luận”.' },
      ],
    });
    await openChat();
    expect(await screen.findByText('Chọn khung so sánh các phương pháp đo hallucination cho T-2.3')).toBeTruthy();
    const group = screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent ?? '');
    expect(group.some((text) => text.includes('Thảo luận'))).toBe(true);
    expect(group.some((text) => text.includes('Bỏ qua'))).toBe(true);
  });

  it('lỗi tải thẻ có Thử lại (EC20)', async () => {
    let calls = 0;
    mock.use({
      overrides: {
        getPrompt: () => {
          calls += 1;
          return calls === 1 ? problem(503, 'service_unavailable') : { status: 200, body: base() };
        },
      },
    });
    const { user } = await openChat();
    const line = await screen.findByText('Không tải được prompt.');
    await user.click(within(line.closest('p')!).getByRole('button', { name: 'Thử lại' }));
    expect(await question()).toBeTruthy();
  });
});
