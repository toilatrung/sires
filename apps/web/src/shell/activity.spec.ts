// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderShellFrame, waitForFrame } from './test/render';
import { json, shellStub } from './test/stub';
import * as fx from './test/fixtures';

/** Headers the shell may send; anything else would be a user-activity marker, which H11 forbids. */
const ALLOWED_HEADERS = new Set(['Accept', 'Content-Type', 'X-CSRF-Token', 'If-Match', 'Idempotency-Key', 'Last-Event-ID']);
const sessionCalls = (stub: ReturnType<typeof shellStub>) => stub.calls('/api/v1/auth/session').length;

describe('hoạt động của người dùng (H6, H11)', () => {
  it('request chạy nền không tính: SSE, nối lại, gọi lại GET sau sự kiện SSE không gọi GET /auth/session, không header đánh dấu (INT-OIDC-003-AC02, EC32)', async () => {
    const stub = shellStub();
    renderShellFrame({ path: '/projects/p1/overview', stub });
    await waitForFrame();
    await waitFor(() => expect(stub.sse).toHaveLength(1));
    await waitFor(() => expect(stub.calls('/api/v1/projects/p1/tasks/' + fx.TASK_ID)).toHaveLength(1));
    // Opening the app = one check of the session.
    expect(sessionCalls(stub)).toBe(1);
    const before = stub.requests.length;

    stub.sse[0].send({ id: 'e-1', event: 'pending_action.changed', data: { id: 'e-1', type: 'pending_action.changed', projectId: 'p1', at: '2026-11-27T09:00:00Z' } });
    stub.sse[0].send({ id: 'e-2', event: 'notification.created', data: { id: 'e-2', type: 'notification.created', at: '2026-11-27T09:00:00Z' } });
    stub.sse[0].send({ id: 'e-3', event: 'project.lifecycle_changed', data: { id: 'e-3', type: 'project.lifecycle_changed', projectId: 'p1', at: '2026-11-27T09:00:00Z' } });
    stub.sse[0].send({ id: 'e-4', event: 'plan_version.status_changed', data: { id: 'e-4', type: 'plan_version.status_changed', projectId: 'p1', at: '2026-11-27T09:00:00Z' } });
    stub.sse[0].end();
    await waitFor(() => expect(stub.sse).toHaveLength(2));
    await waitFor(() => expect(stub.calls('/api/v1/projects/p1/plan').length).toBeGreaterThanOrEqual(2));
    await new Promise((r) => setTimeout(r, 30));

    expect(stub.requests.length).toBeGreaterThan(before + 4);
    expect(sessionCalls(stub)).toBe(1);
    for (const request of stub.requests) {
      for (const header of Object.keys(request.headers)) expect([request.path, header, ALLOWED_HEADERS.has(header)]).toEqual([request.path, header, true]);
    }
  });

  it('điều hướng gọi getSession đúng một lần cho mỗi lần điều hướng; chuyển hướng không tính', async () => {
    const stub = shellStub();
    const { router, user } = renderShellFrame({ path: '/', stub });
    await waitForFrame();
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'));
    // / → /dashboard is a redirect: still only the opening check.
    expect(sessionCalls(stub)).toBe(1);

    await user.click(within(screen.getByRole('navigation', { name: 'Khu vực Global' })).getByRole('link', { name: 'Discover' }));
    await waitFor(() => expect(sessionCalls(stub)).toBe(2));

    await router.navigate('/projects/p1/overview');
    await waitFor(() => expect(sessionCalls(stub)).toBe(3));

    await router.navigate(-1);
    await waitFor(() => expect(router.state.location.pathname).toBe('/discover'));
    await waitFor(() => expect(sessionCalls(stub)).toBe(4));

    await new Promise((r) => setTimeout(r, 30));
    expect(sessionCalls(stub)).toBe(4);
  });

  it('không gọi theo chu kỳ: 13 giờ không thao tác thì không có GET /auth/session nào thêm', async () => {
    const stub = shellStub();
    renderShellFrame({ path: '/dashboard', stub });
    await waitForFrame();
    await waitFor(() => expect(stub.sse).toHaveLength(1));
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(13 * 60 * 60 * 1000);
    } finally {
      vi.useRealTimers();
    }
    await new Promise((r) => setTimeout(r, 20));
    expect(sessionCalls(stub)).toBe(1);
  });

  it('lệnh ghi của người dùng là lệnh ghi bình thường: không kèm GET /auth/session, có X-CSRF-Token', async () => {
    const stub = shellStub();
    const { user } = renderShellFrame({ path: '/projects/p1/overview', stub });
    await waitForFrame();
    const button = await screen.findByRole('button', { name: 'Bỏ active task' });
    const before = sessionCalls(stub);
    await user.click(button);
    await waitFor(() => expect(stub.calls('/api/v1/projects/p1/active-task', 'PUT')).toHaveLength(1));
    expect(sessionCalls(stub)).toBe(before);
    expect(stub.calls('/api/v1/projects/p1/active-task', 'PUT')[0].headers['X-CSRF-Token']).toBe('csrf-1');
  });

  it('getSession lúc điều hướng cập nhật csrfToken; 401 vào luồng phiên hết hạn', async () => {
    const stub = shellStub();
    const { router, services } = renderShellFrame({ path: '/dashboard', stub });
    await waitForFrame();
    stub.on('GET', '/api/v1/auth/session', () => json({ ...fx.session, csrfToken: 'csrf-2' }));
    await router.navigate('/discover');
    await waitFor(() => expect(services.session.current.status === 'signed-in' && services.session.current.session.csrfToken).toBe('csrf-2'));

    stub.on('GET', '/api/v1/auth/session', () => new Response(JSON.stringify({ code: 'unauthenticated', status: 401, title: 'x', type: 'x' }), { status: 401, headers: { 'content-type': 'application/problem+json' } }));
    await router.navigate('/library');
    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
    expect(new URLSearchParams(router.state.location.search).get('reason')).toBe('session-expired');
    expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe('/library');
  });
});

describe('chuyển hướng giữa phiên', () => {
  it('điều hướng replace (chuyển hướng) không gọi GET /auth/session (INT-OIDC-003-AC02)', async () => {
    const stub = shellStub();
    const { router } = renderShellFrame({ path: '/dashboard', stub });
    await waitForFrame();
    const before = stub.calls('/api/v1/auth/session').length;
    await router.navigate('/discover', { replace: true });
    await waitFor(() => expect(router.state.location.pathname).toBe('/discover'));
    await new Promise((r) => setTimeout(r, 30));
    expect(stub.calls('/api/v1/auth/session').length).toBe(before);
    // A user navigation after it still counts.
    await router.navigate('/library');
    await waitFor(() => expect(stub.calls('/api/v1/auth/session').length).toBe(before + 1));
  });
});
