// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PromptCard, type InteractiveAgentPrompt } from './prompt-card/PromptCard';

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
    render(
      <>
        <button type="button">trước</button>
        <PromptCard prompt={prompt()} onConfirm={onConfirm} agentLabel="Discovery Agent" />
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

  it('prompt không có phương án (edit_and_approve): khung và trạng thái của shell, điều khiển do khu vực truyền', () => {
    render(
      <PromptCard prompt={prompt({ type: 'edit_and_approve', choices: [] })}>
        <button type="button">Sửa và duyệt</button>
        <button type="button">Từ chối</button>
      </PromptCard>,
    );
    expect(screen.getByText('edit_and_approve · Open')).toBeTruthy();
    expect(screen.getByText('Giới hạn năm xuất bản cho Task T-2.3?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Xác nhận/ })).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Sửa và duyệt', 'Từ chối']);
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
