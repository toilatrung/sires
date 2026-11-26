// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api/errors';
import { ExecutionLabel, StatusChip } from './states/StatusChip';
import { BASE_STATUSES, statusTone, SUPPLEMENTARY_STATUSES } from './states/statuses';
import { EmptyState, ErrorState, LoadingState, LongOperation } from './states/States';

const problem = (code: string, extra: Record<string, unknown> = {}) =>
  new ApiError('problem', { status: 500, problem: { type: `https://sires.etroy.local/problems/${code}`, title: code, status: 500, code: code as never, ...extra } });

describe('trạng thái dùng chung', () => {
  it('trạng thái lỗi: mô tả, phần đã lưu, hành động, mã lỗi và correlationId; không stack trace, không body thô (UX-STATE-003-AC01)', () => {
    const error = problem('internal_error', { correlationId: '8f2c-41aa', detail: 'Traceback (most recent call last): db.py line 3' });
    render(
      <ErrorState
        error={error}
        title="Không lưu được Plan Version Draft"
        saved="bản trước lúc 09:30."
        notSaved="2 thay đổi gần nhất — vẫn còn trong trình soạn."
        next="Thử lưu lại; nếu vẫn lỗi, sao chép nội dung và tải lại trang."
        onRetry={() => undefined}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Không lưu được Plan Version Draft')).toBeTruthy();
    expect(within(alert).getByText('SIRes gặp lỗi khi xử lý yêu cầu.')).toBeTruthy();
    expect(alert.textContent).toContain('Đã lưu: bản trước lúc 09:30.');
    expect(alert.textContent).toContain('Chưa lưu: 2 thay đổi gần nhất');
    expect(alert.textContent).toContain('Làm gì tiếp: Thử lưu lại');
    expect(within(alert).getByRole('button', { name: 'Thử lại' })).toBeTruthy();
    expect(within(alert).getByText('internal_error · req 8f2c-41aa')).toBeTruthy();
    expect(alert.textContent).not.toContain('Traceback');
    expect(alert.textContent).not.toContain('db.py');
  });

  it('mã chưa dịch: vẫn hiện mã và correlationId (EC12)', () => {
    render(<ErrorState error={problem('readiness_failed', { correlationId: 'c-1' })} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Đã xảy ra lỗi.')).toBeTruthy();
    expect(within(alert).getByText('readiness_failed · req c-1')).toBeTruthy();
  });

  it('lỗi mạng và mã HTTP không phải problem (EC11)', () => {
    const { rerender } = render(<ErrorState error={new ApiError('network')} />);
    expect(screen.getByText('Không kết nối được tới SIRes. Kiểm tra mạng của bạn.')).toBeTruthy();
    expect(screen.getByText('network_error')).toBeTruthy();
    rerender(<ErrorState error={new ApiError('http', { status: 502 })} />);
    expect(screen.getByText('Máy chủ trả mã HTTP 502.')).toBeTruthy();
  });

  it('bảng nhãn: mỗi trạng thái của design.md §3 một kiểu; ngoài bảng thì không tự đặt kiểu (EC20)', () => {
    const expected: Record<string, string> = {
      Draft: 'proposed',
      Proposed: 'proposed',
      'Partially Supported': 'proposed-brand',
      Approved: 'confirmed-brand',
      Ready: 'confirmed-brand',
      Accepted: 'confirmed',
      Trusted: 'confirmed',
      Completed: 'confirmed',
      Succeeded: 'confirmed',
      'Waiting for User': 'needs-you',
      'In Review': 'needs-you',
      'Pending Approval': 'needs-you',
      'In Progress': 'running',
      Running: 'running',
      Indexing: 'running',
      Blocked: 'warning',
      Interrupted: 'warning',
      Conflicting: 'warning',
      Unsupported: 'warning-flag',
      'needs review': 'warning-flag',
      Failed: 'error',
      Invalid: 'error',
      Queued: 'neutral',
      Pending: 'neutral',
      Cancelled: 'neutral',
      Superseded: 'neutral',
      Rejected: 'neutral',
      Paused: 'neutral',
    };
    for (const [status, tone] of Object.entries(expected)) expect([status, statusTone(status)]).toEqual([status, tone]);
    expect(statusTone('Proposed', 'plan-version')).toBe('needs-you');

    render(
      <>
        <StatusChip status="Waiting for User" />
        <StatusChip status="Running" />
        <StatusChip status="Discovered">Discovered — Chưa duyệt</StatusChip>
        <StatusChip status="Khong Co Trong Bang" />
      </>,
    );
    const waiting = screen.getByText('Waiting for User');
    expect(waiting.getAttribute('data-tone')).toBe('needs-you');
    expect(waiting.querySelector('svg')).not.toBeNull();
    expect(screen.getByText('Running').hasAttribute('data-running')).toBe(true);
    expect(screen.getByText('Discovered — Chưa duyệt').getAttribute('data-tone')).toBe('proposed');
    const unknown = screen.getByText('Khong Co Trong Bang');
    expect(unknown.className).toBe('sires-status-text');
    expect(unknown.hasAttribute('data-tone')).toBe(false);
  });

  it('bảng nhãn bổ sung: mỗi trạng thái của H4 một kiểu đúng; Proposed theo loại entity (EC20, S11)', () => {
    const expected: Record<string, string> = {
      Supported: 'confirmed-brand',
      Indexed: 'confirmed',
      Valid: 'confirmed',
      Active: 'confirmed',
      Created: 'neutral',
      'Not Indexed': 'neutral',
      'Not Assessed': 'neutral',
      Untested: 'neutral',
      New: 'neutral',
      Excluded: 'neutral',
      Archived: 'neutral',
      Answered: 'neutral',
      Selected: 'proposed',
      Imported: 'proposed',
      Revoked: 'warning',
      Stale: 'warning-flag',
      Outdated: 'warning-flag',
      Unavailable: 'error',
      Expired: 'neutral-dashed',
    };
    expect(Object.keys(SUPPLEMENTARY_STATUSES).sort()).toEqual(Object.keys(expected).sort());
    for (const [status, tone] of Object.entries(expected)) expect([status, statusTone(status)]).toEqual([status, tone]);
    // The two tables never disagree.
    for (const status of Object.keys(SUPPLEMENTARY_STATUSES)) expect(BASE_STATUSES[status]).toBeUndefined();
    expect(statusTone('Proposed', 'plan-version')).toBe('needs-you');
    expect(statusTone('Proposed', 'change-proposal')).toBe('needs-you');
    expect(statusTone('Proposed', 'artifact')).toBe('proposed');
    expect(statusTone('Proposed')).toBe('proposed');
    render(<StatusChip status="Expired" />);
    expect(screen.getByText('Expired').getAttribute('data-tone')).toBe('neutral-dashed');
  });

  it('execution label: tiếng Anh, icon riêng', () => {
    render(
      <>
        <ExecutionLabel kind="Available for agent" />
        <ExecutionLabel kind="Manual editor requirement" />
      </>,
    );
    expect(screen.getByText('Available for agent').getAttribute('data-kind')).toBe('agent');
    expect(screen.getByText('Manual editor requirement').getAttribute('data-kind')).toBe('manual');
  });

  it('đang tải có role status; skeleton aria-hidden theo bố cục dòng', () => {
    const { container } = render(<LoadingState what="Trusted Library" rows={3} />);
    expect(screen.getByRole('status').textContent).toBe('Đang tải Trusted Library…');
    const list = container.querySelector('ul');
    expect(list?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('[data-skeleton]')).toHaveLength(6);
  });

  it('thao tác dài: bước, agent, thời gian đã chạy, hoạt động gần nhất, rời trang được; không spinner', () => {
    const started = new Date(Date.now() - (6 * 60 + 12) * 1000);
    const { container, rerender } = render(
      <LongOperation
        title="Đang tìm evidence cho T-2.2"
        actor="Evidence Retrieval Agent"
        startedAt={started}
        step={{ current: 2, total: 4 }}
        latest={{ at: '2026-11-27T02:51:40Z', text: 'đã truy xuất 31 đoạn từ 9 reference' }}
        onCancel={() => undefined}
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Bước 2/4 · Evidence Retrieval Agent · 06:1');
    expect(within(status).getByRole('img', { name: 'Bước 2 trên 4' })).toBeTruthy();
    expect(status.textContent).toContain('đã truy xuất 31 đoạn từ 9 reference');
    expect(screen.getByText(/Rời trang được; kết quả báo qua notification\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeTruthy();
    expect(container.querySelector('[data-progress=""]')).not.toBeNull();

    rerender(<LongOperation title="Revision 18 · pdfLaTeX" actor="System" startedAt={new Date(Date.now() - 12_000)} />);
    expect(screen.getByRole('status').textContent).toContain('System · đã chạy 00:1');
    expect(container.querySelector('[data-progress="indeterminate"]')).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Chưa biết thời lượng còn lại' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hủy' })).toBeNull();
  });

  it('trống: lý do và một hành động do màn truyền', () => {
    render(<EmptyState title="Chưa có project nào" reason="Tạo project để làm rõ câu hỏi nghiên cứu." action={<button type="button">Tạo project</button>} />);
    expect(screen.getByText('Chưa có project nào')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tạo project' })).toBeTruthy();
  });
});
