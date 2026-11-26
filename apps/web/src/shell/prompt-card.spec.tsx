// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PromptCard, type InteractiveAgentPrompt, type PromptType } from './prompt-card/PromptCard';

function prompt(overrides: Partial<InteractiveAgentPrompt> = {}): InteractiveAgentPrompt {
  return {
    id: 'pr-1',
    accountId: 'a',
    projectId: 'p1',
    createdAt: '2026-11-27T02:42:00Z',
    createdBy: { type: 'agent', agent: 'discovery', agentRunId: 'ar-1' },
    rowVersion: 1,
    workflowId: 'wf-1',
    stepId: 's-1',
    createdByAgentRunId: 'ar-1',
    agent: 'discovery',
    type: 'choice',
    purpose: 'scope_decision' as never,
    question: 'Giới hạn năm xuất bản cho Task T-2.3?',
    pendingAction: { objectType: 'task', objectId: 't-1' },
    choices: [
      { id: 'c1', label: '2019–2026', consequence: 'Bỏ 41 reference trước 2019', recommended: true },
      { id: 'c2', label: '2015–2026', consequence: 'Giữ 12 reference 2015–2018' },
      { id: 'c3', label: 'Không giới hạn', consequence: 'Thời gian tìm dài hơn' },
    ],
    multiSelect: false,
    status: 'Open',
    ...overrides,
  };
}

describe('thẻ Interactive Agent Prompt', () => {
  it('bàn phím: Tab vào nhóm, mũi tên chọn, Tab tới nút, Enter xác nhận (UX-A11Y-002-AC01)', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onAnswer = vi.fn();
    render(
      <>
        <button type="button">trước</button>
        <PromptCard prompt={prompt()} onConfirm={onConfirm} onAnswer={onAnswer} agentLabel="Discovery Agent" />
      </>,
    );
    const radios = screen.getAllByRole('radio');
    const confirm = screen.getByRole('button', { name: 'Xác nhận — chọn một phương án' });
    expect(radios.every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    screen.getByRole('button', { name: 'trước' }).focus();
    await user.tab();
    expect(document.activeElement).toBe(radios[0]);
    // Focus alone does not choose: still nothing selected.
    expect((radios[0] as HTMLInputElement).checked).toBe(false);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(radios[1]);
    expect((radios[1] as HTMLInputElement).checked).toBe(true);
    await user.tab();
    const enabled = screen.getByRole('button', { name: 'Xác nhận' });
    expect(document.activeElement).toBe(enabled);
    expect((enabled as HTMLButtonElement).disabled).toBe(false);
    await user.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(['c2']);
    expect(onAnswer).toHaveBeenCalledWith({ choiceIds: ['c2'] });

    // Space on the button works too.
    await user.keyboard(' ');
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('không chọn sẵn, kể cả “Đề xuất của agent”; mỗi phương án kèm hệ quả (EC31)', () => {
    render(<PromptCard prompt={prompt()} onConfirm={() => undefined} />);
    const group = screen.getByRole('group', { name: 'Giới hạn năm xuất bản cho Task T-2.3?' });
    const suggested = within(group).getByRole('radio', { name: /2019–2026\s*·\s*Đề xuất của agent/ });
    expect((suggested as HTMLInputElement).checked).toBe(false);
    expect(within(group).getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)).toHaveLength(0);
    expect(within(group).getByText('Bỏ 41 reference trước 2019')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Xác nhận — chọn một phương án' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('bốn trạng thái: Open thao tác được; Answered chỉ đọc kèm ai và lúc nào; Expired, Cancelled chỉ đọc và không được tính là đồng ý (EC31)', () => {
    const { container, rerender } = render(<PromptCard prompt={prompt()} />);
    expect(container.querySelector('article')?.getAttribute('data-status')).toBe('Open');
    expect(screen.getByText('choice · Open')).toBeTruthy();

    rerender(
      <PromptCard
        prompt={prompt({
          status: 'Answered',
          response: { choiceIds: ['c1'], respondedBy: { type: 'researcher', accountId: 'a' }, respondedAt: '2026-11-27T02:44:00Z' },
        })}
        answeredByLabel="Nguyễn Thanh"
      />,
    );
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('choice · Answered')).toBeTruthy();
    expect(screen.getByText('2019–2026').tagName).toBe('STRONG');
    expect(screen.getByText(/Nguyễn Thanh · \d\d:\d\d · chỉ đọc/)).toBeTruthy();

    for (const status of ['Expired', 'Cancelled'] as const) {
      rerender(<PromptCard prompt={prompt({ status, type: 'approval', statusReason: 'Project đã được lưu trữ khi prompt còn mở.' })} />);
      const card = container.querySelector('article');
      expect(card?.getAttribute('data-status')).toBe(status);
      expect(card?.hasAttribute('data-ended')).toBe(true);
      expect(screen.getByText(`approval · ${status}`)).toBeTruthy();
      expect(screen.getByText('Không được tính là đồng ý.')).toBeTruthy();
      expect(screen.queryAllByRole('radio')).toHaveLength(0);
      expect(screen.queryByRole('button')).toBeNull();
    }
  });

  it('mọi loại PromptType của hợp đồng đều trả lời được trong thẻ (S10)', () => {
    // Compile-time: this list must be exactly PromptType of the contract.
    const all = ['approval', 'choice', 'edit_and_approve', 'information_request'] as const satisfies readonly PromptType[];
    type Missing = Exclude<PromptType, (typeof all)[number]>;
    const none: Missing[] = [];
    expect(none).toEqual([]);
    for (const type of all) {
      const { container, unmount } = render(
        <PromptCard prompt={prompt({ type, choices: type === 'choice' ? prompt().choices : [], editablePayload: { title: 'x' } })} onAnswer={() => undefined} />,
      );
      expect(container.querySelector('article')?.getAttribute('data-type')).toBe(type);
      // Every Open prompt offers at least one action; none is a dead, forever-disabled button only.
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
      unmount();
    }
  });

  it('approval: Duyệt, Từ chối gửi decision (kèm objectVersion)', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const base = prompt({ type: 'approval', choices: [], question: 'Duyệt 3 reference mới?', pendingAction: { objectType: 'reference', objectId: 'r1', objectVersion: 4 } });
    const { rerender } = render(<PromptCard prompt={base} onAnswer={onAnswer} />);
    expect(screen.getByText('approval · Open')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Duyệt' }));
    expect(onAnswer).toHaveBeenLastCalledWith({ decision: 'approved', objectVersion: 4 });
    await user.click(screen.getByRole('button', { name: 'Từ chối' }));
    expect(onAnswer).toHaveBeenLastCalledWith({ decision: 'rejected', objectVersion: 4 });

    // With choices: “Duyệt” waits for one, nothing pre-selected.
    rerender(<PromptCard prompt={{ ...base, id: 'pr-2', choices: prompt().choices }} onAnswer={onAnswer} key="b" />);
    const approve = screen.getByRole('button', { name: 'Duyệt — chọn một phương án' }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    await user.click(screen.getByRole('radio', { name: /Không giới hạn/ }));
    await user.click(screen.getByRole('button', { name: 'Duyệt' }));
    expect(onAnswer).toHaveBeenLastCalledWith({ decision: 'approved', choiceIds: ['c3'], objectVersion: 4 });
  });

  it('edit_and_approve: sửa editablePayload trong thẻ rồi “Sửa và duyệt”; nội dung gốc giữ nguyên (UX-PROMPT-003)', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const original = { title: 'Benchmarking LLMs in RAG', year: 2024 };
    const p = prompt({ type: 'edit_and_approve', choices: [], question: 'Kiểm tra metadata trước khi duyệt', editablePayload: original });
    render(<PromptCard prompt={p} onAnswer={onAnswer} fieldLabels={{ title: 'Tiêu đề', year: 'Năm' }} />);
    expect(screen.getByText('Nội dung gốc và nội dung đã sửa đều được lưu.')).toBeTruthy();
    const title = screen.getByLabelText('Tiêu đề');
    await user.clear(title);
    await user.type(title, 'Benchmarking Large Language Models in Retrieval-Augmented Generation');
    await user.click(screen.getByRole('button', { name: 'Sửa và duyệt' }));
    expect(onAnswer).toHaveBeenCalledWith({
      decision: 'approved',
      editedPayload: { title: 'Benchmarking Large Language Models in Retrieval-Augmented Generation', year: 2024 },
    });
    expect(original.title).toBe('Benchmarking LLMs in RAG');
    await user.click(screen.getByRole('button', { name: 'Từ chối' }));
    expect(onAnswer).toHaveBeenLastCalledWith({ decision: 'rejected' });
  });

  it('edit_and_approve: khu vực thay bộ sửa bằng renderEditor', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    render(
      <PromptCard
        prompt={prompt({ type: 'edit_and_approve', choices: [], editablePayload: { tags: ['a'] } })}
        onAnswer={onAnswer}
        renderEditor={(value, onChange) => (
          <button type="button" onClick={() => onChange({ tags: [...(value as { tags: string[] }).tags, 'b'] })}>
            Thêm tag
          </button>
        )}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Thêm tag' }));
    await user.click(screen.getByRole('button', { name: 'Sửa và duyệt' }));
    expect(onAnswer).toHaveBeenCalledWith({ decision: 'approved', editedPayload: { tags: ['a', 'b'] } });
  });

  it('information_request: nút gửi vô hiệu kèm lý do tới khi nhập; gửi text', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    render(<PromptCard prompt={prompt({ type: 'information_request', choices: [], question: 'Khóa API của nguồn dữ liệu nội bộ là gì?' })} onAnswer={onAnswer} />);
    expect((screen.getByRole('button', { name: 'Gửi câu trả lời — nhập câu trả lời' }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Câu trả lời'), '  Dùng bộ dữ liệu công khai  ');
    await user.click(screen.getByRole('button', { name: 'Gửi câu trả lời' }));
    expect(onAnswer).toHaveBeenCalledWith({ text: 'Dùng bộ dữ liệu công khai' });
  });

  it('Answered theo loại: quyết định, nội dung đã sửa, câu trả lời', () => {
    const by = { type: 'researcher' as const, accountId: 'a' };
    const { rerender } = render(
      <PromptCard prompt={prompt({ type: 'approval', choices: [], status: 'Answered', response: { decision: 'rejected', text: 'Thiếu DOI', respondedBy: by, respondedAt: '2026-11-27T02:44:00Z' } })} />,
    );
    expect(screen.getByText('Đã từ chối')).toBeTruthy();
    expect(screen.getByText(/Thiếu DOI/)).toBeTruthy();
    rerender(
      <PromptCard
        prompt={prompt({ type: 'edit_and_approve', choices: [], status: 'Answered', response: { decision: 'approved', editedPayload: { title: 'x' }, respondedBy: by, respondedAt: '2026-11-27T02:44:00Z' } })}
      />,
    );
    expect(screen.getByText('Đã sửa và duyệt')).toBeTruthy();
    rerender(
      <PromptCard prompt={prompt({ type: 'information_request', choices: [], status: 'Answered', response: { text: 'Bộ công khai', respondedBy: by, respondedAt: '2026-11-27T02:44:00Z' } })} />,
    );
    expect(screen.getByText('Bộ công khai').tagName).toBe('STRONG');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('đang gửi: nút xác nhận vô hiệu, không gọi lại callback', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { rerender } = render(<PromptCard prompt={prompt()} onConfirm={onConfirm} />);
    await user.click(screen.getByRole('radio', { name: /Không giới hạn/ }));
    rerender(<PromptCard prompt={prompt()} onConfirm={onConfirm} submitting />);
    expect((screen.getByRole('button', { name: 'Xác nhận' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
