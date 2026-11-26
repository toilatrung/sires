// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DraftStore } from './drafts/store';
import * as fx from './test/fixtures';
import { renderShell, waitForFrame } from './test/render';
import { problem, shellStub } from './test/stub';

const avatar = () => within(screen.getByRole('banner')).getByRole('button', { name: 'Tài khoản: Nguyễn Thanh' });

describe('menu avatar và đăng xuất (H9, PC-05 P3)', () => {
  it('đăng xuất từ menu avatar: xóa nháp, đóng SSE, form POST /auth/logout kèm CSRF để tới trang kết thúc phiên (PID-00012-AC06)', async () => {
    const { user, services, browser, stub } = renderShell({ path: '/dashboard' });
    await waitForFrame();
    await waitFor(() => expect(avatar().textContent).toBe('NT'));
    await waitFor(() => expect(stub.sse).toHaveLength(1));
    localStorage.setItem(DraftStore.key(fx.ACCOUNT_ID, '/projects/p1/chat', 'chat.composer'), JSON.stringify({ value: 'x' }));
    const close = vi.spyOn(services.events, 'close');

    await user.click(avatar());
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Hồ sơ', 'Đăng xuất']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Đăng xuất' }));

    await waitFor(() => expect(browser.forms).toHaveLength(1));
    expect(browser.forms[0]).toEqual({ action: '/api/v1/auth/logout', fields: { csrfToken: 'csrf-1' } });
    expect(close).toHaveBeenCalled();
    expect(services.events.status).toBe('closed');
    expect(localStorage.getItem(DraftStore.key(fx.ACCOUNT_ID, '/projects/p1/chat', 'chat.composer'))).toBeNull();
    // The shell does not POST logout with fetch: the browser must follow the 303 to the IdP.
    expect(stub.calls('/api/v1/auth/logout', 'POST')).toHaveLength(0);
    // A late 401 after signing out is not a “session expired”.
    stub.on('GET', '/api/v1/dashboard', () => problem(401, 'unauthenticated'));
    await services.api.get('/dashboard').catch(() => undefined);
    expect(services.session.current.status).toBe('signed-out');
  });

  it('menu bằng bàn phím: mở, di chuyển, chọn, Escape đóng và trả focus', async () => {
    const { user, browser } = renderShell({ path: '/projects/p1/overview' });
    await waitForFrame();
    await waitFor(() => expect(avatar().textContent).toBe('NT'));
    avatar().focus();
    await user.keyboard('{Enter}');
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(avatar().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(avatar());

    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Đăng xuất' }));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(browser.forms).toHaveLength(1));
  });

  it('hồ sơ mở /settings/profile', async () => {
    const { user, router } = renderShell({ path: '/dashboard' });
    await waitForFrame();
    await user.click(avatar());
    await user.click(screen.getByRole('menuitem', { name: 'Hồ sơ' }));
    expect(router.state.location.pathname).toBe('/settings/profile');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('nhãn menu theo ngôn ngữ giao diện', async () => {
    const { user } = renderShell({ path: '/dashboard' });
    await waitForFrame();
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'EN' }));
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Account: Nguyễn Thanh' }));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Profile', 'Sign out']);
  });

  it('phiên đã hết khi đăng xuất (GET /auth/session 401): về /sign-in, không gửi form', async () => {
    const stub = shellStub();
    const { services, router, browser } = renderShell({ path: '/dashboard', stub });
    await waitForFrame();
    services.session.markSignedOut();
    stub.on('GET', '/api/v1/auth/session', () => problem(401, 'unauthenticated'));
    await services.signOut();
    expect(browser.forms).toHaveLength(0);
    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
  });
});
