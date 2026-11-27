// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00036 S01: the Settings frame on the PID-00013 mock (EC01–EC03).

import { screen, waitFor, within } from '@testing-library/react';
import i18next from 'i18next';
import { beforeEach, describe, expect, it } from 'vitest';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { resetSettingsMockState } from './__mocks__';
import { problem, renderSettings } from './test-helpers';
import { feature } from '.';

const mock = useMockServer({ features: [feature] });

beforeEach(() => resetSettingsMockState());

describe('khung Settings (S01)', () => {
  it('/settings chuyển profile (EC01)', async () => {
    const { router } = renderSettings('/settings');
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/profile'));
    expect(await screen.findByRole('heading', { level: 2, name: 'Profile' })).toBeTruthy();
  });

  it('route lạ (EC01)', async () => {
    renderSettings('/settings/khong-co');
    await waitForFrame();
    expect(await screen.findByText('Không tìm thấy trang')).toBeTruthy();
    expect(screen.getByText('Không có trang nào ở /settings/khong-co.')).toBeTruthy();
  });

  it('menu bốn mục', async () => {
    const { user, router } = renderSettings('/settings/providers');
    await waitForFrame();
    const menu = within(await screen.findByRole('navigation', { name: 'Mục cài đặt' }));
    const links = menu.getAllByRole('link').map((a) => a.textContent);
    expect(links).toEqual(['Profile', 'Provider Connections', 'Agent Models', 'Preferences']);
    expect(menu.getByRole('link', { name: 'Provider Connections' }).getAttribute('aria-current')).toBe('page');
    expect(menu.getByRole('link', { name: 'Profile' }).getAttribute('aria-current')).toBeNull();
    await user.click(menu.getByRole('link', { name: 'Agent Models' }));
    expect(router.state.location.pathname).toBe('/settings/agents');
    expect(await screen.findByRole('heading', { level: 2, name: 'Agent Models' })).toBeTruthy();
  });

  it('đang tải', async () => {
    mock.use({ overrides: { listProviderConnections: () => ({ status: 200, body: { items: [], nextCursor: null }, delayMs: 5000 }) } });
    renderSettings('/settings/providers');
    await waitForFrame();
    expect(await screen.findByText('Đang tải Provider Connections…')).toBeTruthy();
  });

  it('lỗi tải (EC02)', async () => {
    let calls = 0;
    mock.use({
      overrides: {
        listProviderConnections: () => {
          calls += 1;
          return calls === 1 ? problem(503, 'service_unavailable') : { status: 200, body: { items: [], nextCursor: null } };
        },
      },
    });
    const { user } = renderSettings('/settings/providers');
    await waitForFrame();
    expect(await screen.findByText('SIRes tạm thời không phục vụ được.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Thêm API key của bạn để agent hoạt động')).toBeTruthy();
    expect(calls).toBe(2);
  });

  it('đổi ngôn ngữ giữ form (EC03)', async () => {
    const { user } = renderSettings('/settings/profile');
    await waitForFrame();
    const name = await screen.findByLabelText(/^Họ tên hiển thị/);
    await user.clear(name);
    await user.type(name, 'Tên đang sửa');
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'EN' }));
    await waitFor(() => expect(i18next.language).toBe('en'));
    expect(await screen.findByRole('heading', { level: 2, name: 'Profile' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    expect((screen.getByLabelText(/^Display name/) as HTMLInputElement).value).toBe('Tên đang sửa');
  });
});
