// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00036 S05: Profile on the PID-00013 mock (UX-SETTINGS-001-AC01, AC02; EC29–EC36, EC54).

import type { PublicApi } from '@sires/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ACCOUNT_ID } from '../../shell/mock';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { resetSettingsMockState } from './__mocks__';
import { problem, renderSettings } from './test-helpers';
import { feature } from '.';

type Account = PublicApi.components['schemas']['Account'];

const mock = useMockServer({ features: [feature] });

beforeEach(() => resetSettingsMockState());

const input = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const save = () => screen.getByRole('button', { name: 'Lưu thay đổi' });

async function openProfile() {
  const view = renderSettings('/settings/profile');
  await waitForFrame();
  await screen.findByLabelText(/^Họ tên hiển thị/);
  return view;
}

describe('Profile (S05)', () => {
  it('lần đầu (UX-SETTINGS-001-AC01, EC29)', async () => {
    mock.use({
      overrides: {
        getMe: ({ fixtures }) => {
          const account = structuredClone(fixtures.Account!.find((a) => a.id === ACCOUNT_ID)!) as Account;
          account.profile = { ...account.profile, displayName: 'Nguyễn Thảo', email: 'thao@example.org', avatarUrl: undefined };
          account.preferences = { ...account.preferences, includeResearchFieldInContext: false };
          return { status: 200, body: account, headers: { ETag: `"${account.rowVersion}"` } };
        },
      },
    });
    const { container } = await openProfile();
    expect(input(/^Họ tên hiển thị/).value).toBe('Nguyễn Thảo');
    const email = input(/^Email/);
    expect(email.value).toBe('thao@example.org');
    expect(email.readOnly).toBe(true);
    expect(screen.getByText('Chỉ đọc · do eTroy quản lý')).toBeTruthy();
    const toggle = screen.getByRole('switch', { name: 'Dùng lĩnh vực nghiên cứu làm context cho agent · Tắt' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /Đổi ảnh đại diện/ })).toBeNull();
    expect(within(screen.getByRole('main')).getByText('NT')).toBeTruthy();
  });

  it('URL Scholar sai (UX-SETTINGS-001-AC02, EC30)', async () => {
    const { user, calls } = await openProfile();
    await user.clear(input(/^URL hồ sơ Google Scholar/));
    await user.type(input(/^URL hồ sơ Google Scholar/), 'scholar.google.com/citations?user=abc');
    await user.click(save());
    expect(screen.getByText('URL không đúng định dạng — cần bắt đầu bằng https://. Chưa lưu thay đổi.')).toBeTruthy();
    expect(input(/^URL hồ sơ Google Scholar/).getAttribute('aria-invalid')).toBe('true');
    expect(calls('PATCH', '/me/profile')).toHaveLength(0);
  });

  it('giới hạn độ dài (EC31)', async () => {
    const { user, calls } = await openProfile();
    await user.clear(input(/^Họ tên hiển thị/));
    await user.click(input(/^Họ tên hiển thị/));
    await user.paste('a'.repeat(201));
    await user.click(input(/^Đơn vị công tác/));
    await user.paste('b'.repeat(301));
    await user.click(save());
    expect(screen.getByText('Tên hiển thị tối đa 200 ký tự.')).toBeTruthy();
    expect(screen.getByText('Đơn vị công tác tối đa 300 ký tự.')).toBeTruthy();
    expect(calls('PATCH', '/me/profile')).toHaveLength(0);
    await user.clear(input(/^Họ tên hiển thị/));
    await user.click(save());
    expect(screen.getByText('Nhập tên hiển thị.')).toBeTruthy();
  });

  it('xóa trắng (EC32)', async () => {
    const { user, calls } = await openProfile();
    await user.clear(input(/^URL hồ sơ Google Scholar/));
    await user.clear(input(/^Đơn vị công tác/));
    await user.click(save());
    await screen.findByText('Đã lưu.');
    const patch = calls('PATCH', '/me/profile');
    expect(patch).toHaveLength(1);
    expect(JSON.parse(patch[0].body ?? '{}')).toEqual({ affiliation: '', googleScholarProfileUrl: null });
    expect(patch[0].headers['Content-Type']).toBe('application/merge-patch+json');
    expect(patch[0].headers['If-Match']).toBeTruthy();
    expect(patch[0].headers['X-CSRF-Token']).toBeTruthy();
  });

  it('hai lệnh (EC33)', async () => {
    const { user, calls } = await openProfile();
    await user.clear(input(/^Họ tên hiển thị/));
    await user.type(input(/^Họ tên hiển thị/), 'Minh Anh');
    await user.click(screen.getByRole('switch'));
    await user.click(save());
    await screen.findByText('Đã lưu.');
    const profile = calls('PATCH', '/me/profile');
    const prefs = calls('PATCH', '/me/preferences');
    expect(JSON.parse(profile[0].body ?? '{}')).toEqual({ displayName: 'Minh Anh' });
    expect(JSON.parse(prefs[0].body ?? '{}')).toEqual({ includeResearchFieldInContext: false });
    expect(prefs[0].headers['If-Match']).not.toBe(profile[0].headers['If-Match']);
  });

  it('hai lệnh, lệnh sau lỗi (EC33)', async () => {
    mock.use({ overrides: { updatePreferences: () => problem(503, 'service_unavailable') } });
    const { user } = await openProfile();
    await user.clear(input(/^Họ tên hiển thị/));
    await user.type(input(/^Họ tên hiển thị/), 'Minh Anh');
    await user.click(screen.getByRole('switch'));
    await user.click(save());
    expect(await screen.findByText(/Đã lưu thông tin hồ sơ\./)).toBeTruthy();
    expect(screen.getByText(/Chưa lưu thiết lập ngữ cảnh cho agent\./)).toBeTruthy();
  });

  it('412 (EC34)', async () => {
    mock.use({ overrides: { updateProfile: () => problem(412, 'precondition_failed') } });
    const { user, calls } = await openProfile();
    const before = calls('GET', '/me').length;
    await user.clear(input(/^Họ tên hiển thị/));
    await user.type(input(/^Họ tên hiển thị/), 'Tên mới');
    await user.click(save());
    expect(await screen.findByText(/Dữ liệu đã thay đổi ở nơi khác/)).toBeTruthy();
    expect(screen.getByText(/precondition_failed/)).toBeTruthy();
    await waitFor(() => expect(calls('GET', '/me').length).toBe(before + 1));
    expect(input(/^Họ tên hiển thị/).value).toBe('Tên mới');
    expect(calls('PATCH', '/me/profile')).toHaveLength(1);
  });

  it('hủy (EC35)', async () => {
    const { user } = await openProfile();
    const original = input(/^Họ tên hiển thị/).value;
    await user.clear(input(/^Họ tên hiển thị/));
    await user.type(input(/^Họ tên hiển thị/), 'Đang đổi');
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(input(/^Họ tên hiển thị/).value).toBe(original);
  });

  it('nháp (EC36)', async () => {
    const first = await openProfile();
    await first.user.clear(input(/^Lĩnh vực nghiên cứu/));
    await first.user.type(input(/^Lĩnh vực nghiên cứu/), 'RAG cho khoa học');
    first.unmountAll();
    await openProfile();
    expect(input(/^Lĩnh vực nghiên cứu/).value).toBe('RAG cho khoa học');
  });

  it('tên có HTML (EC54)', async () => {
    const { user, container } = await openProfile();
    await user.clear(input(/^Họ tên hiển thị/));
    await user.type(input(/^Họ tên hiển thị/), '<b>Thảo</b>');
    await user.click(save());
    await screen.findByText('Đã lưu.');
    expect(input(/^Họ tên hiển thị/).value).toBe('<b>Thảo</b>');
    expect(container.querySelector('main b')).toBeNull();
  });
});
