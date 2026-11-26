// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { features } from './features';
import { renderShellFrame, waitForFrame } from './test/render';

describe('feature routes', () => {
  it('no two feature areas claim the same path', () => {
    const paths = features.flatMap((f) => f.routes.map((r) => r.path));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('/ → /dashboard (PRD 4.3)', async () => {
    const { router } = renderShellFrame({ path: '/' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'));
  });

  it('route lạ: trạng thái “không tìm thấy” trong khung, không màn trắng (EC06)', async () => {
    renderShellFrame({ path: '/khong-co/trang-nay' });
    await waitForFrame();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Không tìm thấy trang')).toBeTruthy();
    expect(within(alert).getByText('Không có trang nào ở /khong-co/trang-nay.')).toBeTruthy();
    expect(within(alert).getByRole('link', { name: 'Về Dashboard' }).getAttribute('href')).toBe('/dashboard');
    // Still inside the frame.
    expect(screen.getByRole('navigation', { name: 'Khu vực Global' })).toBeTruthy();
  });

  it('sign-in không khung: không TopBar, không rail, chỉ VI/EN (EC17)', async () => {
    const { stub } = renderShellFrame({ path: '/sign-in?returnTo=%2Fdashboard' });
    expect(await screen.findByRole('group', { name: 'Ngôn ngữ giao diện' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Khu vực Global' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Pending Actions/ })).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.getByText('sign-in')).toBeTruthy();
    // The sign-in screen does not check the session or open SSE.
    expect(stub.requests).toHaveLength(0);
  });
});
