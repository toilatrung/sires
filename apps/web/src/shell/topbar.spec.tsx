// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderShell, waitForFrame } from './test/render';
import { shellStub } from './test/stub';

const banner = () => within(screen.getByRole('banner'));

describe('TopBar', () => {
  for (const path of ['/dashboard', '/discover', '/pending-actions', '/projects/p1/overview', '/projects/p1/manuscript/main.tex']) {
    it(`thanh điều hướng mọi màn: ${path} (UX-LAYOUT-001-AC01)`, async () => {
      renderShell({ path });
      await waitForFrame();
      expect(banner().getByRole('button', { name: /Chuyển ngữ cảnh/ })).toBeTruthy();
      await waitFor(() => expect(banner().getByRole('link', { name: 'Pending Actions 8' })).toBeTruthy());
      expect(banner().getByRole('group', { name: 'Ngôn ngữ giao diện' })).toBeTruthy();
      expect(banner().getByRole('link', { name: 'Settings' })).toBeTruthy();
      await waitFor(() => expect(banner().getByRole('link', { name: 'Notifications, 3 chưa đọc' })).toBeTruthy());
    });
  }

  it('ngữ cảnh Global: tab Global, nút Trợ lý; ngữ cảnh Project: đường dẫn Global / khu vực, không tab, không Trợ lý', async () => {
    const { router } = renderShell({ path: '/library/r1' });
    await waitForFrame();
    const tabs = within(screen.getByRole('navigation', { name: 'Khu vực Global' }));
    expect(tabs.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Dashboard',
      'Research Projects',
      'Discover',
      'Trusted Library',
      'Tasks & Plan',
      'Agent Activity',
    ]);
    expect(tabs.getByRole('link', { name: 'Trusted Library' }).getAttribute('aria-current')).toBe('page');
    expect(banner().getByRole('button', { name: 'Trợ lý' })).toBeTruthy();

    await router.navigate('/projects/p1/plan');
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Khu vực Global' })).toBeNull());
    expect(banner().queryByRole('button', { name: 'Trợ lý' })).toBeNull();
    const trail = banner().getByRole('navigation', { name: 'Vị trí' });
    expect(trail.textContent).toBe('Global/Plan and Tasks');
    await waitFor(() => expect(banner().getByRole('button', { name: 'Chuyển ngữ cảnh: RAG trong tổng quan tài liệu' }).textContent).toContain('Project'));
  });

  it('chuyển về Global (UX-LAYOUT-003-AC01)', async () => {
    const { router, user } = renderShell({ path: '/projects/p1/overview' });
    await waitForFrame();
    const switcher = await waitFor(() => banner().getByRole('button', { name: 'Chuyển ngữ cảnh: RAG trong tổng quan tài liệu' }));
    await user.click(switcher);
    const list = screen.getByRole('listbox', { name: 'Chọn ngữ cảnh' });
    await user.click(within(list).getByRole('option', { name: 'Global' }));

    expect(router.state.location.pathname).toBe('/dashboard');
    const button = banner().getByRole('button', { name: 'Chuyển ngữ cảnh: Global' });
    expect(button.textContent).toContain('Global');
    expect(within(screen.getByRole('navigation', { name: 'Khu vực Global' })).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe('page');
  });

  it('bộ chuyển ngữ cảnh dùng được bằng bàn phím', async () => {
    const { router, user } = renderShell({ path: '/dashboard' });
    await waitForFrame();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Chuyển ngữ cảnh: Global' })).toBeTruthy());
    const switcher = screen.getByRole('button', { name: 'Chuyển ngữ cảnh: Global' });
    switcher.focus();
    await user.keyboard('{Enter}');
    const list = await screen.findByRole('listbox');
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(3));
    expect(document.activeElement).toBe(list);
    await user.keyboard('{ArrowDown}');
    expect(list.getAttribute('aria-activedescendant')).toBe(within(list).getByRole('option', { name: 'RAG trong tổng quan tài liệu' }).id);
    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/projects/p1/overview');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Chuyển ngữ cảnh/ }));

    await user.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('nhãn giữ tiếng Anh ở cả hai ngôn ngữ (EC05)', async () => {
    const { user } = renderShell({ path: '/dashboard' });
    await waitForFrame();
    const fixed = ['Dashboard', 'Research Projects', 'Discover', 'Trusted Library', 'Tasks & Plan', 'Agent Activity'];
    const names = () => within(screen.getByRole('navigation', { name: /Khu vực Global|Global areas/ })).getAllByRole('link').map((a) => a.textContent);
    expect(names()).toEqual(fixed);
    expect(banner().getByRole('link', { name: /^Pending Actions/ })).toBeTruthy();
    await user.click(banner().getByRole('button', { name: 'EN' }));
    expect(names()).toEqual(fixed);
    expect(banner().getByRole('link', { name: /^Pending Actions/ })).toBeTruthy();
    expect(banner().getByRole('link', { name: 'Settings' })).toBeTruthy();
  });

  it('trợ lý: mở khung bên phải cạnh màn hiện tại, không đổi route (EC22, UX-LAYOUT-002)', async () => {
    const { router, user } = renderShell({ path: '/discover' });
    await waitForFrame();
    const toggle = banner().getByRole('button', { name: 'Trợ lý' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    const panel = screen.getByRole('complementary', { name: 'Trợ lý' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
    expect(within(panel).getByText('Global — không có ngữ cảnh project')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/discover');
    expect(screen.getByRole('main').textContent).toContain('discover');
    await user.click(within(panel).getByRole('button', { name: 'Đóng Trợ lý' }));
    expect(screen.queryByRole('complementary', { name: 'Trợ lý' })).toBeNull();
  });

  it('chưa có dữ liệu điều hướng: không hiện số giả (Shell-frame khối 9)', async () => {
    const stub = shellStub();
    stub.on('GET', '/api/v1/pending-actions', () => new Response(null, { status: 503 }));
    stub.on('GET', '/api/v1/notifications', () => new Response(null, { status: 503 }));
    renderShell({ path: '/dashboard', stub });
    await waitForFrame();
    await waitFor(() => expect(stub.calls('/api/v1/notifications', 'GET', { status: 'Unread', limit: '1' })).toHaveLength(1));
    expect(banner().getByRole('link', { name: /^Pending Actions/ }).textContent).toBe('Pending Actions');
    expect(banner().getByRole('link', { name: 'Notifications' }).textContent).toBe('');
  });
});
