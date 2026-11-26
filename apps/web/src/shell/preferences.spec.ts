// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { screen, waitFor, within } from '@testing-library/react';
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import * as fx from './test/fixtures';
import { renderShell, waitForFrame } from './test/render';
import { json, problem, shellStub } from './test/stub';

const banner = () => within(screen.getByRole('banner'));

describe('lưu ngôn ngữ vào Preferences (H2)', () => {
  it('lưu ngôn ngữ: đổi ngay rồi PATCH /me/preferences với If-Match theo ETag của GET /me, X-CSRF-Token (PID-00012-AC03)', async () => {
    const stub = shellStub();
    let release: (r: Response) => void = () => undefined;
    stub.on('PATCH', '/api/v1/me/preferences', () => new Promise<Response>((resolve) => (release = resolve)));
    const { user, services } = renderShell({ path: '/dashboard', stub });
    await waitForFrame();
    await waitFor(() => expect(stub.calls('/api/v1/me')).toHaveLength(1));

    await user.click(banner().getByRole('button', { name: 'EN' }));

    // English at once, before the server answered.
    expect(i18next.language).toBe('en');
    expect(banner().getByRole('button', { name: 'Assistant' })).toBeTruthy();
    await waitFor(() => expect(stub.calls('/api/v1/me/preferences', 'PATCH')).toHaveLength(1));
    const patch = stub.calls('/api/v1/me/preferences', 'PATCH')[0];
    expect(patch.headers['If-Match']).toBe('"v7"');
    expect(patch.headers['X-CSRF-Token']).toBe('csrf-1');
    expect(patch.headers['Content-Type']).toBe('application/merge-patch+json');
    expect(JSON.parse(patch.body ?? '')).toEqual({ uiLanguage: 'en' });

    release(json(fx.account('en'), { headers: { etag: '"v8"' } }));
    // 200 → the new ETag is kept for the next save.
    await waitFor(() => expect(services.session.current.status === 'signed-in' && services.session.current.accountEtag).toBe('"v8"'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('412 đọc lại GET /me rồi gửi lại với ETag mới (EC26)', async () => {
    const stub = shellStub();
    let patches = 0;
    stub.on('PATCH', '/api/v1/me/preferences', () => {
      patches += 1;
      return patches === 1 ? problem(412, 'precondition_failed') : json(fx.account('en'), { headers: { etag: '"v9"' } });
    });
    const { user, services } = renderShell({ path: '/dashboard', stub });
    await waitForFrame();
    await waitFor(() => expect(stub.calls('/api/v1/me')).toHaveLength(1));
    stub.on('GET', '/api/v1/me', () => json(fx.account('vi'), { headers: { etag: '"v8"' } }));

    await user.click(banner().getByRole('button', { name: 'EN' }));

    await waitFor(() => expect(stub.calls('/api/v1/me/preferences', 'PATCH')).toHaveLength(2));
    const [first, second] = stub.calls('/api/v1/me/preferences', 'PATCH');
    expect(first.headers['If-Match']).toBe('"v7"');
    expect(second.headers['If-Match']).toBe('"v8"');
    expect(stub.calls('/api/v1/me')).toHaveLength(2);
    // Re-reading Preferences (still vi on the server) does not switch the interface back.
    expect(i18next.language).toBe('en');
    await waitFor(() => expect(services.session.current.status === 'signed-in' && services.session.current.accountEtag).toBe('"v9"'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lần gửi lại vẫn 412: xử lý như lỗi khác (EC26 → EC27)', async () => {
    const stub = shellStub();
    stub.on('PATCH', '/api/v1/me/preferences', () => problem(412, 'precondition_failed'));
    const { user } = renderShell({ path: '/dashboard', stub });
    await waitForFrame();
    await user.click(banner().getByRole('button', { name: 'EN' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Language not saved to Preferences')).toBeTruthy();
    expect(stub.calls('/api/v1/me/preferences', 'PATCH')).toHaveLength(2);
  });

  it('lỗi giữ ngôn ngữ trong phiên: English vẫn dùng, báo chưa lưu, mã lỗi (EC27)', async () => {
    const stub = shellStub();
    stub.on('PATCH', '/api/v1/me/preferences', () => problem(500, 'internal_error', { correlationId: 'req-77' }));
    const { user } = renderShell({ path: '/dashboard', stub });
    await waitForFrame();
    await user.click(banner().getByRole('button', { name: 'EN' }));

    const alert = await screen.findByRole('alert');
    expect(i18next.language).toBe('en');
    expect(within(alert).getByText('Language not saved to Preferences')).toBeTruthy();
    expect(alert.textContent).toContain('Not saved: the interface uses English for this session.');
    expect(alert.textContent).toContain('What next: Try again, or change it in Settings → Preferences.');
    expect(within(alert).getByText('internal_error · req req-77')).toBeTruthy();
    expect(banner().getByRole('button', { name: 'EN' }).getAttribute('aria-pressed')).toBe('true');

    await user.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('GET /me lỗi lúc mở: khi lưu thì đọc lại và báo đúng lỗi thật', async () => {
    const stub = shellStub();
    stub.on('GET', '/api/v1/me', () => problem(500, 'internal_error', { correlationId: 'req-me' }));
    const { user } = renderShell({ path: '/dashboard', stub });
    await waitForFrame();
    await waitFor(() => expect(stub.calls('/api/v1/me')).toHaveLength(1));
    await user.click(banner().getByRole('button', { name: 'EN' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('internal_error · req req-me')).toBeTruthy();
    expect(stub.calls('/api/v1/me')).toHaveLength(2);
    expect(stub.calls('/api/v1/me/preferences', 'PATCH')).toHaveLength(0);
    expect(i18next.language).toBe('en');
  });

  it('chưa đăng nhập không lưu: ở /sign-in chỉ đổi trong phiên, không gửi PATCH (EC28)', async () => {
    const stub = shellStub({ signedIn: false });
    const { user } = renderShell({ path: '/sign-in', stub });
    await user.click(await screen.findByRole('button', { name: 'EN' }));
    expect(i18next.language).toBe('en');
    expect(screen.getByRole('group', { name: 'Interface language' })).toBeTruthy();
    expect(stub.calls('/api/v1/me/preferences', 'PATCH')).toHaveLength(0);
    expect(stub.requests).toHaveLength(0);
  });
});
