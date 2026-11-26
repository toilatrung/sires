// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Shared dialog of the shell (design.md §4): aria, focus on open, Tab kept inside, Escape, focus back to the opener,
// busy confirm, form dialog.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, Dialog } from './dialog/Dialog';

function Harness({ onConfirm, busy = false }: { onConfirm: () => void; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Hủy Task
      </button>
      <button type="button">Nút khác của trang</button>
      {open && (
        <ConfirmDialog title="Hủy T-2.2?" confirmLabel="Hủy Task" cancelLabel="Giữ nguyên" busy={busy} danger onCancel={() => setOpen(false)} onConfirm={onConfirm}>
          <p>Task chuyển Cancelled; 2 artifact đã tạo vẫn giữ.</p>
          <label>
            Lý do
            <textarea />
          </label>
        </ConfirmDialog>
      )}
    </>
  );
}

describe('Dialog dùng chung', () => {
  it('xác nhận: aria, focus phương án an toàn, Tab giữ trong dialog, Esc hủy, trả focus', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    const opener = screen.getByRole('button', { name: 'Hủy Task' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Hủy T-2.2?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('2 artifact đã tạo vẫn giữ');
    const keep = screen.getByRole('button', { name: 'Giữ nguyên' });
    const reason = screen.getByRole('textbox', { name: 'Lý do' });
    const confirm = screen.getAllByRole('button', { name: 'Hủy Task' }).find((b) => dialog.contains(b))!;
    expect(confirm.getAttribute('data-variant')).toBe('danger');
    expect(document.activeElement).toBe(keep);
    // Order inside: textarea, keep, confirm. Tab from the last wraps to the first, Shift+Tab from the first to the last.
    await user.tab();
    expect(document.activeElement).toBe(confirm);
    await user.tab();
    expect(document.activeElement).toBe(reason);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirm);
    // Typing keeps the focus in the field.
    reason.focus();
    await user.type(reason, 'Đổi phạm vi');
    expect(document.activeElement).toBe(reason);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('đang gửi: nút xác nhận vô hiệu', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} busy />);
    await user.click(screen.getByRole('button', { name: 'Hủy Task' }));
    const dialog = screen.getByRole('dialog');
    const confirm = screen.getAllByRole('button', { name: 'Hủy Task' }).find((b) => dialog.contains(b)) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('dạng form: focus ô đầu, Enter gửi', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <Dialog title="Đổi tên kết nối" onCancel={() => undefined} onSubmit={onSubmit} actions={<button type="submit">Lưu</button>}>
        <label>
          Tên
          <input defaultValue="OpenAI cá nhân" />
        </label>
      </Dialog>,
    );
    const field = screen.getByRole('textbox', { name: 'Tên' });
    expect(document.activeElement).toBe(field);
    await user.type(field, ' 2{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
