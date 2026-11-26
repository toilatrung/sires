// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import { safeReturnTo, signInPath } from './session/session';
import { renderShell, waitForFrame } from './test/render';
import { problem, shellStub } from './test/stub';

const where = (router: { state: { location: { pathname: string; search: string } } }) =>
  `${router.state.location.pathname}${router.state.location.search}`;

describe('phiên', () => {
  it('chưa đăng nhập: GET /auth/session 401 → /sign-in kèm đường dẫn quay lại /dashboard (UX-AUTH-001-AC01, EC07)', async () => {
    const { router, stub } = renderShell({ path: '/dashboard', stub: shellStub({ signedIn: false }) });
    await waitFor(() => expect(where(router)).toBe('/sign-in?returnTo=%2Fdashboard'));
    // /sign-in renders without TopBar; only VI/EN.
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Khu vực Global' })).toBeNull());
    expect(screen.getByRole('group', { name: 'Ngôn ngữ giao diện' }).closest('.sires-frameless')).not.toBeNull();
    // No account data requested without a session.
    expect(stub.calls('/api/v1/me')).toHaveLength(0);
  });

  it('ngôn ngữ theo Preferences: có phiên và uiLanguage = en → English khi tải ứng dụng (EC02)', async () => {
    renderShell({ path: '/dashboard', stub: shellStub({ uiLanguage: 'en' }) });
    await waitFor(() => expect(i18next.language).toBe('en'));
    expect(await screen.findByRole('navigation', { name: 'Global areas' })).toBeTruthy();
  });

  it('phiên hết hạn: 401 khi đang dùng → SignIn session-expired kèm đường dẫn quay lại, nháp đã lưu, SSE đóng (EC08)', async () => {
    const stub = shellStub();
    const { router, services } = renderShell({ path: '/projects/p1/chat?tab=1', stub });
    await waitForFrame();
    const flush = vi.spyOn(services.drafts, 'flushAll');
    const close = vi.spyOn(services.events, 'close');

    stub.on('GET', '/api/v1/dashboard', () => problem(401, 'unauthenticated'));
    await expect(services.api.get('/dashboard')).rejects.toMatchObject({ status: 401 });

    await waitFor(() => expect(where(router)).toBe('/sign-in?reason=session-expired&returnTo=%2Fprojects%2Fp1%2Fchat%3Ftab%3D1'));
    expect(flush).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalled();
    expect(services.session.current.status).toBe('expired');
    // A second 401 does not start the flow again.
    await expect(services.api.get('/dashboard')).rejects.toMatchObject({ status: 401 });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('sau khi phiên hết hạn, quay lại màn có khung thì kiểm phiên lại (không treo ở “đang kiểm phiên”)', async () => {
    const stub = shellStub();
    const { router, services } = renderShell({ path: '/dashboard', stub });
    await waitForFrame();
    await router.navigate('/discover');
    await waitFor(() => expect(stub.calls('/api/v1/auth/session')).toHaveLength(2));
    stub.on('GET', '/api/v1/auth/session', () => problem(401, 'unauthenticated'));
    services.session.expire();
    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
    // The expiry replaced /discover; Back lands on /dashboard, a framed screen.
    await router.navigate(-1);
    await waitFor(() => expect(where(router)).toBe('/sign-in?returnTo=%2Fdashboard'));
  });

  it('lỗi mạng khi kiểm phiên: báo lỗi trong khung, không chuyển SignIn', async () => {
    const stub = shellStub();
    stub.on('GET', '/api/v1/auth/session', () => {
      throw new TypeError('offline');
    });
    const { router } = renderShell({ path: '/dashboard', stub });
    expect(await screen.findByText('Không kiểm được phiên đăng nhập')).toBeTruthy();
    expect(screen.getByText('network_error')).toBeTruthy();
    expect(where(router)).toBe('/dashboard');
  });

  it('đường dẫn quay lại chỉ nhận đường dẫn tương đối bắt đầu bằng / (startLogin returnTo ^/)', () => {
    expect(safeReturnTo('/projects/p1/chat')).toBe('/projects/p1/chat');
    expect(safeReturnTo('//evil.example')).toBeUndefined();
    expect(safeReturnTo('https://evil.example')).toBeUndefined();
    expect(safeReturnTo('/sign-in?returnTo=%2Fx')).toBeUndefined();
    expect(signInPath({ returnTo: '//evil.example' })).toBe('/sign-in');
  });
});
