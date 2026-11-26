// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AREA_BY_KIND, groupByArea } from './navigation/navigation';
import * as fx from './test/fixtures';
import { renderShellFrame, waitForFrame } from './test/render';
import { json, shellStub } from './test/stub';

const banner = () => within(screen.getByRole('banner'));
const rail = () => within(screen.getByRole('complementary', { name: 'Khu vực Project' }));

describe('dữ liệu điều hướng (H1)', () => {
  it('số Pending Actions từ API: openCount của GET /pending-actions, chưa đọc từ unreadCount (UX-LAYOUT-001-AC01)', async () => {
    const { stub } = renderShellFrame({ path: '/dashboard' });
    await waitForFrame();
    await waitFor(() => expect(banner().getByRole('link', { name: 'Pending Actions 8' })).toBeTruthy());
    expect(banner().getByRole('link', { name: 'Notifications, 3 chưa đọc' })).toBeTruthy();
    const pending = stub.calls('/api/v1/pending-actions', 'GET', { limit: '1' })[0];
    expect(pending.query.get('status')).toBe('Open');
    expect(pending.query.get('projectId')).toBeNull();
    expect(stub.calls('/api/v1/notifications', 'GET', { status: 'Unread', limit: '1' })).toHaveLength(1);
  });

  it('cập nhật số qua SSE: pending_action.changed, notification.created (EC24)', async () => {
    const stub = shellStub();
    const { router } = renderShellFrame({ path: '/projects/p1/overview', stub });
    await waitForFrame();
    await waitFor(() => expect(rail().getByLabelText('2 việc chờ bạn')).toBeTruthy());
    await waitFor(() => expect(stub.sse).toHaveLength(1));

    stub.on('GET', '/api/v1/pending-actions', (req) =>
      req.query.get('projectId')
        ? json({ items: fx.projectPendingActions.slice(1), nextCursor: null, openCount: 7 })
        : json({ items: [], nextCursor: null, openCount: 7 }),
    );
    stub.on('GET', '/api/v1/notifications', () => json({ items: [], nextCursor: null, unreadCount: 4 }));
    stub.sse[0].send({ id: 'e-1', event: 'pending_action.changed', data: { id: 'e-1', type: 'pending_action.changed', projectId: 'p1', at: '2026-11-27T09:00:00Z' } });
    stub.sse[0].send({ id: 'e-2', event: 'notification.created', data: { id: 'e-2', type: 'notification.created', at: '2026-11-27T09:00:01Z' } });

    await waitFor(() => expect(banner().getByRole('link', { name: 'Pending Actions 7' })).toBeTruthy());
    await waitFor(() => expect(banner().getByRole('link', { name: 'Notifications, 4 chưa đọc' })).toBeTruthy());
    await waitFor(() => expect(rail().getByLabelText('1 việc chờ bạn', { selector: '[href="/projects/p1/chat"] *' })).toBeTruthy());
    // No page reload: same router location key.
    expect(router.state.location.pathname).toBe('/projects/p1/overview');
  });

  it('nhóm số theo khu vực theo cột “Xử lý tại” của PRD 4.4; Reference approval chỉ tính trên TopBar (EC33)', async () => {
    expect(AREA_BY_KIND).toEqual({
      interactive_prompt: 'chat',
      plan_approval: 'plan',
      task_review: 'plan',
      manual_work: 'plan',
      manuscript_change_proposal: 'manuscript',
      recovery_decision: 'activity',
      reference_approval: undefined,
    });
    expect(groupByArea(fx.projectPendingActions)).toEqual({ chat: 2, plan: 3, manuscript: 1, activity: 1 });

    renderShellFrame({ path: '/projects/p1/overview' });
    await waitForFrame();
    await waitFor(() => expect(rail().getByLabelText('2 việc chờ bạn')).toBeTruthy());
    const count = (name: string) => rail().getByRole('link', { name: new RegExp(`^${name}`) }).querySelector('.sires-rail__count')?.textContent ?? null;
    expect(count('Overview')).toBeNull();
    expect(count('Project AI Chat')).toBe('2');
    expect(count('Plan and Tasks')).toBe('3');
    expect(count('References and Evidence')).toBeNull();
    expect(count('Research Artifacts')).toBeNull();
    expect(count('Manuscript')).toBe('1');
    expect(count('Agent Activity')).toBe('1');
    expect(count('Activity and History')).toBeNull();
    // 7 in the rail + 1 Reference approval = 8 on the TopBar.
    expect(banner().getByRole('link', { name: 'Pending Actions 8' })).toBeTruthy();
  });

  it('bộ chuyển chỉ có project Active (EC34)', async () => {
    const { user, stub } = renderShellFrame({ path: '/dashboard' });
    await waitForFrame();
    await waitFor(() => expect(stub.calls('/api/v1/projects', 'GET', { status: 'Active' })).toHaveLength(1));
    await user.click(banner().getByRole('button', { name: /Chuyển ngữ cảnh/ }));
    const options = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Global', 'RAG trong tổng quan tài liệu', 'Độ tin cậy của LLM trong giáo dục']);
  });

  it('bộ chuyển bỏ project Archived ngay cả khi API trả về', async () => {
    const stub = shellStub();
    stub.on('GET', '/api/v1/projects', () => json({ items: fx.projects, nextCursor: null }));
    const { user } = renderShellFrame({ path: '/dashboard', stub });
    await waitForFrame();
    await user.click(banner().getByRole('button', { name: /Chuyển ngữ cảnh/ }));
    await waitFor(() => expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(3));
    expect(within(screen.getByRole('listbox')).queryByText('Project đã lưu trữ')).toBeNull();
  });

  it('project Archived mở bằng URL: không đánh dấu nhầm Global là ngữ cảnh đang chọn', async () => {
    const { user } = renderShellFrame({ path: '/projects/p9/overview' });
    await waitForFrame();
    await waitFor(() => expect(banner().getByRole('button', { name: 'Chuyển ngữ cảnh: Project đã lưu trữ' })).toBeTruthy());
    await user.click(banner().getByRole('button', { name: /Chuyển ngữ cảnh/ }));
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(0);
  });

  it('project 404: “không tìm thấy”, không tiết lộ project có tồn tại hay không (EC23)', async () => {
    renderShellFrame({ path: '/projects/khong-co/overview' });
    await waitForFrame();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Không tìm thấy project')).toBeTruthy();
    expect(within(alert).getByText('Project này không có hoặc bạn không có quyền xem.')).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'Khu vực Project' })).toBeNull();
  });

  it('tải lại khi cần tải lại: server báo không còn phát lại được (PID-00012-AC04, S12)', async () => {
    const stub = shellStub();
    renderShellFrame({ path: '/projects/p1/overview', stub });
    await waitForFrame();
    await waitFor(() => expect(rail().getByLabelText('2 việc chờ bạn')).toBeTruthy());
    await waitFor(() => expect(stub.sse).toHaveLength(1));
    const before = {
      pending: stub.calls('/api/v1/pending-actions').length,
      unread: stub.calls('/api/v1/notifications', 'GET', { status: 'Unread', limit: '1' }).length,
      project: stub.calls('/api/v1/projects/p1').length,
      session: stub.calls('/api/v1/auth/session').length,
    };

    stub.sse[0].end();
    await waitFor(() => expect(stub.sse).toHaveLength(2));
    stub.sse[1].send({ id: 'e-100', event: 'replay.unavailable', data: { id: 'e-100', type: 'replay.unavailable', at: '2026-11-27T10:00:00Z' } });

    await waitFor(() => expect(stub.calls('/api/v1/projects/p1').length).toBe(before.project + 1));
    expect(stub.calls('/api/v1/pending-actions').length).toBeGreaterThan(before.pending);
    expect(stub.calls('/api/v1/notifications', 'GET', { status: 'Unread', limit: '1' }).length).toBe(before.unread + 1);
    // Background reloads never touch the session (S13).
    expect(stub.calls('/api/v1/auth/session').length).toBe(before.session);
  });

  it('nối lại bình thường: không tải lại dữ liệu điều hướng', async () => {
    const stub = shellStub();
    renderShellFrame({ path: '/dashboard', stub });
    await waitForFrame();
    await waitFor(() => expect(stub.sse).toHaveLength(1));
    await waitFor(() => expect(stub.calls('/api/v1/notifications', 'GET', { status: 'Unread', limit: '1' })).toHaveLength(1));
    stub.sse[0].end();
    await waitFor(() => expect(stub.sse).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 30));
    expect(stub.calls('/api/v1/notifications', 'GET', { status: 'Unread', limit: '1' })).toHaveLength(1);
  });
});
