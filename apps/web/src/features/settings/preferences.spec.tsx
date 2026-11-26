// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00036 S07: Preferences on the PID-00013 mock (UX-SETTINGS-004-AC01, UX-SETTINGS-005-AC01; EC34, EC48–EC53).

import { screen, waitFor, within } from '@testing-library/react';
import i18next from 'i18next';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatDate } from '../../shell';
import { ACCOUNT_ID } from '../../shell/mock';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { resetSettingsMockState } from './__mocks__';
import { current, initState } from './__mocks__/store';
import { problem, renderSettings } from './test-helpers';
import { feature } from '.';

const mock = useMockServer({ features: [feature] });

beforeEach(() => resetSettingsMockState());

const save = () => screen.getByRole('button', { name: 'Lưu thay đổi' });
const threshold = (name: RegExp) => screen.getByLabelText(name) as HTMLInputElement;

async function openPreferences() {
  const view = renderSettings('/settings/preferences');
  await waitForFrame();
  await screen.findByRole('switch');
  return view;
}

function adjustThresholds() {
  initState({ accountId: ACCOUNT_ID });
  const s = current();
  s.thresholds = { ...s.thresholds, claimSupport: { ...s.thresholds.claimSupport, partiallySupported: 0.55 }, isDefault: false };
}

describe('Preferences (S07)', () => {
  it('debug (UX-SETTINGS-004-AC01, EC49)', async () => {
    const { user, calls } = await openPreferences();
    const toggle = screen.getByRole('switch', { name: 'Chế độ debug · Tắt' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    const explain = toggle.getAttribute('aria-describedby');
    const text = document.getElementById(explain ?? '')?.textContent ?? '';
    expect(text).toContain('30 ngày');
    expect(text).toContain('chỉ chủ tài khoản xem được');
    expect(text).toContain('Tắt không xóa toàn văn đã lưu');
    await user.click(toggle);
    const until = new Date();
    until.setDate(until.getDate() + 30);
    expect(screen.getByRole('switch', { name: `Chế độ debug · Bật · lưu tới ${formatDate(until.toISOString())}` }).getAttribute('aria-checked')).toBe('true');
    await user.click(save());
    await screen.findByText('Đã lưu.');
    const patch = calls('PATCH', '/me/preferences');
    expect(patch).toHaveLength(1);
    expect(JSON.parse(patch[0].body ?? '{}')).toEqual({ debugMode: true });
  });

  it('khôi phục mặc định (UX-SETTINGS-005-AC01, EC51)', async () => {
    adjustThresholds();
    const { user, calls } = await openPreferences();
    const group = within(screen.getByRole('region', { name: /Ngưỡng kiểm chứng/ }));
    expect(group.getByText('đã chỉnh')).toBeTruthy();
    expect(threshold(/^Partially Supported/).value).toBe('0,55');
    await user.clear(threshold(/^Supported/));
    await user.type(threshold(/^Supported/), '0,9');

    await user.click(group.getByRole('button', { name: 'Khôi phục mặc định' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Giữ ngưỡng hiện tại' }));
    expect(calls('POST', '/me/verification-thresholds/reset')).toHaveLength(0);

    await user.click(group.getByRole('button', { name: 'Khôi phục mặc định' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Khôi phục mặc định' }));
    await waitFor(() => expect(calls('POST', '/me/verification-thresholds/reset')).toHaveLength(1));
    await waitFor(() => expect(threshold(/^Partially Supported/).value).toBe('0,50'));
    expect(threshold(/^Supported/).value).toBe('0,80');
    expect(group.queryByText('đã chỉnh')).toBeNull();
  });

  it('ngôn ngữ sau khi lưu (EC48)', async () => {
    const { user, calls } = await openPreferences();
    await user.click(screen.getByRole('radio', { name: 'English' }));
    expect(i18next.language).toBe('vi');
    await user.click(save());
    await waitFor(() => expect(i18next.language).toBe('en'));
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeTruthy();
    const patch = calls('PATCH', '/me/preferences');
    expect(patch).toHaveLength(1);
    expect(JSON.parse(patch[0].body ?? '{}')).toEqual({ uiLanguage: 'en' });
  });

  it('ngưỡng sai (EC50)', async () => {
    const { user, calls } = await openPreferences();
    await user.clear(threshold(/^Supported/));
    await user.type(threshold(/^Supported/), '1,5');
    await user.click(save());
    expect(screen.getByText('Nhập số từ 0 đến 1, ví dụ 0,8.')).toBeTruthy();
    expect(calls('PUT', '/me/verification-thresholds')).toHaveLength(0);
    await user.clear(threshold(/^Supported/));
    await user.type(threshold(/^Supported/), '0,75');
    await user.click(save());
    await screen.findByText('Đã lưu.');
    const put = calls('PUT', '/me/verification-thresholds');
    expect(JSON.parse(put[0].body ?? '{}')).toMatchObject({ claimSupport: { supported: 0.75, partiallySupported: 0.5 }, citationMismatch: { mismatch: 0.6 } });
    expect(put[0].headers['If-Match']).toBeTruthy();
  });

  it('chưa có giá trị mặc định (EC52)', async () => {
    await openPreferences();
    const group = within(screen.getByRole('region', { name: /Ngưỡng kiểm chứng/ }));
    expect(group.queryByText('đã chỉnh')).toBeNull();
    expect(group.queryByText(/^Mặc định$/)).toBeNull();
    expect(group.getAllByRole('textbox')).toHaveLength(3);
    expect(group.queryByText(/Conflicting/)).toBeNull();
  });

  it('hai lệnh (EC53)', async () => {
    mock.use({ overrides: { updateVerificationThresholds: () => problem(503, 'service_unavailable') } });
    const { user } = await openPreferences();
    await user.click(screen.getByRole('switch'));
    await user.clear(threshold(/^Supported/));
    await user.type(threshold(/^Supported/), '0,85');
    await user.click(save());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Đã lưu: ngôn ngữ và chế độ debug.');
    expect(alert.textContent).toContain('Chưa lưu: ngưỡng kiểm chứng.');
  });

  it('412 (EC34)', async () => {
    mock.use({ overrides: { updatePreferences: () => problem(412, 'precondition_failed') } });
    const { user, calls } = await openPreferences();
    const before = calls('GET', '/me').length;
    await user.click(screen.getByRole('switch'));
    await user.click(save());
    expect(await screen.findByText(/Dữ liệu đã đổi ở nơi khác/)).toBeTruthy();
    await waitFor(() => expect(calls('GET', '/me').length).toBe(before + 1));
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
    expect(calls('PATCH', '/me/preferences')).toHaveLength(1);
  });
});

describe('Preferences sau #126 và tự QC', () => {
  it('ngưỡng mặc định từng dòng (H16, EC52)', async () => {
    adjustThresholds();
    await openPreferences();
    const group = within(screen.getByRole('region', { name: /Ngưỡng kiểm chứng/ }));
    expect(group.getByText('Mặc định 0,80')).toBeTruthy();
    expect(group.getByText('Mặc định 0,50')).toBeTruthy();
    expect(group.getByText('Mặc định 0,60')).toBeTruthy();
    // Only the adjusted row carries “đã chỉnh”.
    expect(group.getAllByText('đã chỉnh')).toHaveLength(1);
    expect(threshold(/^Partially Supported đã chỉnh/).value).toBe('0,55');
  });

  it('ETag mới sau khi lưu ngưỡng (H12)', async () => {
    const { user, calls } = await openPreferences();
    await user.clear(threshold(/^Supported/));
    await user.type(threshold(/^Supported/), '0,85');
    await user.click(save());
    await screen.findByText('Đã lưu.');
    await user.clear(threshold(/^Supported/));
    await user.type(threshold(/^Supported/), '0,9');
    await user.click(save());
    await waitFor(() => expect(calls('PUT', '/me/verification-thresholds')).toHaveLength(2));
    const [first, second] = calls('PUT', '/me/verification-thresholds');
    expect(second.headers['If-Match']).toBeTruthy();
    expect(second.headers['If-Match']).not.toBe(first.headers['If-Match']);
  });

  it('lỗi trường ngưỡng từ máy chủ (EC50)', async () => {
    mock.use({
      overrides: {
        updateVerificationThresholds: () =>
          new Response(JSON.stringify({ type: 'x', title: 'x', status: 400, code: 'validation_failed', errors: [{ field: 'claimSupport.partiallySupported', code: 'too_big' }] }), {
            status: 400,
            headers: { 'Content-Type': 'application/problem+json' },
          }),
      },
    });
    const { user } = await openPreferences();
    await user.clear(threshold(/^Partially Supported/));
    await user.type(threshold(/^Partially Supported/), '0,7');
    await user.click(save());
    await waitFor(() => expect(threshold(/^Partially Supported/).getAttribute('aria-invalid')).toBe('true'));
    expect(threshold(/^Partially Supported/).getAttribute('aria-describedby')).toBe('sires-threshold-partiallySupported-error');
  });

  it('412 khi lưu ngưỡng (EC34)', async () => {
    mock.use({ overrides: { updateVerificationThresholds: () => problem(412, 'precondition_failed') } });
    const { user, calls } = await openPreferences();
    await user.clear(threshold(/^Supported/));
    await user.type(threshold(/^Supported/), '0,85');
    await user.click(save());
    expect(await screen.findByText(/Dữ liệu đã đổi ở nơi khác/)).toBeTruthy();
    await waitFor(() => expect(calls('GET', '/me/verification-thresholds').length).toBeGreaterThan(1));
    expect(threshold(/^Supported/).value).toBe('0,85');
  });

  it('lưu lỗi giữ ngôn ngữ (EC48)', async () => {
    mock.use({ overrides: { updatePreferences: () => problem(503, 'service_unavailable') } });
    const { user } = await openPreferences();
    await user.click(screen.getByRole('radio', { name: 'English' }));
    await user.click(save());
    await screen.findByRole('alert');
    expect(i18next.language).toBe('vi');
  });
});
