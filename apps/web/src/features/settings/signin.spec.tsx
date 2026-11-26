// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00036 S02: SignIn (PID-00036-AC02, UX-AUTH-001-AC01, UX-AUTH-002-AC01, EC05–EC12). The browser navigation goes
// through the shell's BrowserNavigator, so the test reads `browser.assigned` instead of a real window.location.

import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMockServer } from '../../shell/mock/node';
import { resetSettingsMockState } from './__mocks__';
import { problem, renderSettings } from './test-helpers';
import { feature } from '.';

const mock = useMockServer({ features: [feature] });

const signedOut = () => mock.use({ overrides: { getSession: () => problem(401, 'unauthenticated') } });

beforeEach(() => resetSettingsMockState());

describe('SignIn (S02)', () => {
  it('chỉ một hành động (UX-AUTH-001-AC01)', async () => {
    signedOut();
    const { user, browser, container } = renderSettings('/sign-in?returnTo=/dashboard');
    expect(await screen.findByRole('heading', { name: 'Đăng nhập vào SIRes' })).toBeTruthy();
    expect(screen.getByText(/thuộc nền tảng eTroy\. Tài khoản của bạn do eTroy quản lý\./)).toBeTruthy();
    const buttons = screen.getAllByRole('button').filter((b) => !['VI', 'EN'].includes(b.textContent ?? ''));
    expect(buttons.map((b) => b.textContent)).toEqual(['Đăng nhập bằng eTroy']);
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(screen.queryByText(/quên mật khẩu|đăng ký|Google/i)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Đăng nhập bằng eTroy' }));
    expect(browser.assigned).toEqual(['/api/v1/auth/login?returnTo=%2Fdashboard']);
  });

  it('oidc_unavailable (PID-00036-AC02, UX-AUTH-002-AC01, EC05)', async () => {
    renderSettings('/sign-in?error=oidc_unavailable');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('eTroy tạm thời không phản hồi');
    expect(alert.textContent).toContain('Chưa có dữ liệu nào bị thay đổi');
    expect(alert.textContent).toContain('liên hệ quản trị eTroy');
    expect(alert.textContent).toContain('Mã lỗi: oidc_unavailable');
    const button = screen.getByRole('button', { name: 'Đăng nhập bằng eTroy' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('login_cancelled (EC06)', async () => {
    renderSettings('/sign-in?error=login_cancelled');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Bạn đã hủy đăng nhập ở eTroy');
    expect(alert.textContent).toContain('Mã lỗi: login_cancelled');
  });

  it('mã lạ (EC07)', async () => {
    renderSettings('/sign-in?error=SOMETHING_<b>ODD</b>');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Đăng nhập không thành công');
    expect(alert.textContent).toContain('Mã lỗi: something_<b>odd</b>');
    expect(alert.querySelector('b')).toBeNull();
  });

  it('phiên hết hạn (EC08)', async () => {
    signedOut();
    renderSettings('/sign-in?reason=session-expired&returnTo=/projects');
    expect((await screen.findByRole('status')).textContent).toContain('Phiên đăng nhập đã hết hạn');
  });

  it('phiên hết hạn cùng lỗi chỉ hiện lỗi (EC08)', async () => {
    renderSettings('/sign-in?reason=session-expired&error=login_failed');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/Phiên đăng nhập đã hết hạn/)).toBeNull();
  });

  it('đã có phiên chuyển đi (EC09)', async () => {
    const { router } = renderSettings('/sign-in?returnTo=/settings/agents');
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/agents'));
  });

  it('returnTo không hợp lệ (EC10)', async () => {
    signedOut();
    const { user, browser } = renderSettings('/sign-in?returnTo=//evil.example/x');
    await user.click(await screen.findByRole('button', { name: 'Đăng nhập bằng eTroy' }));
    expect(browser.assigned).toEqual(['/api/v1/auth/login?returnTo=%2Fdashboard']);
  });

  it('bấm hai lần (EC11)', async () => {
    signedOut();
    const { user, browser } = renderSettings('/sign-in');
    const button = await screen.findByRole('button', { name: 'Đăng nhập bằng eTroy' });
    await user.click(button);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.textContent).toBe('Đang chuyển tới eTroy…');
    await user.click(button);
    expect(browser.assigned).toHaveLength(1);
  });

  it('tiếng Anh theo namespace settings', async () => {
    const { user } = renderSettings('/sign-in?error=oidc_unavailable');
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect((await screen.findByRole('alert')).textContent).toContain('eTroy is temporarily not responding');
    expect(screen.getByRole('button', { name: 'Sign in with eTroy' })).toBeTruthy();
  });
});

describe('SignIn chế độ mock', () => {
  it('chế độ mock (EC12)', async () => {
    vi.stubEnv('VITE_SIRES_MOCK', '1');
    try {
      signedOut();
      const { user, browser, router } = renderSettings('/sign-in?returnTo=/settings/agents');
      // In this test the mock session is signed out, so the frame sends the user back to /sign-in afterwards;
      // what matters is that the button went straight to returnTo without leaving for eTroy.
      const visited: string[] = [];
      router.subscribe((state) => visited.push(state.location.pathname));
      await user.click(await screen.findByRole('button', { name: 'Đăng nhập bằng eTroy' }));
      await waitFor(() => expect(visited).toContain('/settings/agents'));
      expect(browser.assigned).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
