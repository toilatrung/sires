// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00060 S02: Pending Actions on the mock of PID-00013 with the area's stateful overrides (H8). Names follow
// specs/acceptance.html and specs/scope.html.

import { screen, waitFor, within } from '@testing-library/react';
import i18next from 'i18next';
import { beforeEach, describe, expect, it } from 'vitest';
import { feature } from '.';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { pendingAction } from './__mocks__/fixtures-for-test';
import { renderGlobal } from './__mocks__/render';
import { globalStore, resetGlobalStore } from './__mocks__/store';

const mock = useMockServer({ features: [feature] });
const main = () => within(screen.getByRole('main'));

beforeEach(() => resetGlobalStore());

async function openPending() {
  const view = renderGlobal('/pending-actions');
  await waitForFrame();
  await main().findByRole('heading', { level: 1, name: 'Pending Actions' });
  return view;
}

const expiredGroup = () => main().getByRole('region', { name: /^Hết hiệu lực/ });

describe('Pending Actions (S02)', () => {
  it('hết hiệu lực nằm ở nhóm riêng (PID-00060-AC01, UX-PENDING-002-AC01, EC01)', async () => {
    await openPending();
    const group = await main().findByRole('region', { name: 'Hết hiệu lực · 2' });
    expect(within(group).getByText(/Cancelled: workflow đã bị hủy\. Không được tính là đồng ý\./)).toBeTruthy();
    expect(within(group).getByText(/Outdated: main\.tex đã đổi/)).toBeTruthy();
    // Not in the Open list.
    const list = main().getAllByRole('list').find((el) => el.classList.contains('g-pending-list')) as HTMLElement;
    expect(within(list).queryByText(/Bổ sung nguồn cho T-1\.3/)).toBeNull();
    expect(within(list).getAllByRole('listitem').length).toBe(9);
  });

  it('đánh dấu đã xem (EC02)', async () => {
    const { user } = await openPending();
    await main().findByRole('region', { name: 'Hết hiệu lực · 2' });
    await user.click(within(expiredGroup()).getAllByRole('button', { name: 'Đánh dấu đã xem' })[0]!);
    expect(await main().findByRole('region', { name: 'Hết hiệu lực · 1' })).toBeTruthy();

    // Already resolved in another tab: 409 → reload, no red error.
    mock.use({ overrides: { acknowledgePendingAction: () => ({ status: 409 }) } });
    await user.click(within(expiredGroup()).getByRole('button', { name: 'Đánh dấu đã xem' }));
    await waitFor(() => expect(main().queryByRole('alert')).toBeNull());
  });

  it('cũ nhất ở trên, mở đúng ngữ cảnh (UX-PENDING-001-AC01)', async () => {
    resetGlobalStore({ pendingActions: [pendingAction(1, 'task_review', 'Việc mới hơn'), pendingAction(30, 'plan_approval', 'Việc cũ hơn')] });
    const { user, router } = await openPending();
    const titles = (await main().findAllByText(/^Việc (mới|cũ) hơn$/)).map((el) => el.textContent);
    expect(titles).toEqual(['Việc cũ hơn', 'Việc mới hơn']);
    await user.click(main().getByRole('link', { name: 'Mở để duyệt: Việc cũ hơn' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(pendingAction(30, 'plan_approval', '').deepLink));
  });

  it('thiếu deepLink (EC03)', async () => {
    resetGlobalStore({ pendingActions: [pendingAction(1, 'manual_work', 'Không có địa chỉ', { deepLink: undefined })] });
    await openPending();
    const button = await main().findByRole('button', { name: 'Mở Task' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(main().getByText('Chưa có địa chỉ để mở việc này.')).toBeTruthy();
  });

  it('project không còn (EC04)', async () => {
    resetGlobalStore({
      pendingActions: [pendingAction(1, 'task_review', 'Của project đã xóa', { projectId: '1a000000-0000-4000-8000-000000000099', status: 'Expired', expiryReason: 'project đã xóa' })],
    });
    await openPending();
    const group = await main().findByRole('region', { name: 'Hết hiệu lực · 1' });
    expect(within(group).getByText('Của project đã xóa')).toBeTruthy();
    expect(within(group).getByText(/project đã xóa Không được tính là đồng ý/)).toBeTruthy();
  });

  it('reference approval ở Trusted Library (EC05)', async () => {
    resetGlobalStore({ pendingActions: [pendingAction(1, 'reference_approval', '2 reference chờ duyệt', { projectId: undefined, deepLink: '/library' })] });
    await openPending();
    expect(await main().findByText('Trusted Library')).toBeTruthy();
  });

  it('trống (EC06)', async () => {
    resetGlobalStore({ pendingActions: [] });
    await openPending();
    expect(await main().findByText('Không có việc nào chờ bạn')).toBeTruthy();
    expect(main().getByRole('link', { name: 'Về Dashboard' }).getAttribute('href')).toBe('/dashboard');
  });

  it('tải thêm (EC07)', async () => {
    resetGlobalStore({ pendingActions: Array.from({ length: 105 }, (_, i) => pendingAction(i + 1, 'task_review', `Việc ${i + 1}`)) });
    const { user } = await openPending();
    expect(await main().findByRole('button', { name: /Task review request\s*100\+/ })).toBeTruthy();
    await user.click(main().getByRole('button', { name: 'Tải thêm' }));
    expect(await main().findByRole('button', { name: /Task review request\s*105$/ })).toBeTruthy();
  });

  it('tải lại khi có sự kiện (EC08)', async () => {
    await openPending();
    await main().findByText('Chọn tiêu chí so sánh cho bảng phương pháp');
    const store = globalStore({});
    store.pendingActions.push(pendingAction(200, 'manual_work', 'Việc vừa phát sinh'));
    mock.events.emit({ type: 'pending_action.changed', objectType: 'pending_action', objectId: pendingAction(200, 'manual_work', '').id, toState: 'Open' });
    expect(await main().findByText('Việc vừa phát sinh')).toBeTruthy();
  });

  it('lọc theo loại', async () => {
    const { user } = await openPending();
    await user.click(await main().findByRole('button', { name: /^Plan approval request/ }));
    await waitFor(() => expect(main().queryByText('Chọn tiêu chí so sánh cho bảng phương pháp')).toBeNull());
    expect(main().getByText(/Duyệt Plan Version 3/)).toBeTruthy();
  });

  it('đổi ngôn ngữ (EC29)', async () => {
    const { user } = await openPending();
    await main().findByText('Chọn tiêu chí so sánh cho bảng phương pháp');
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'EN' }));
    await waitFor(() => expect(i18next.language).toBe('en'));
    expect((await main().findAllByRole('link', { name: /^Answer: / })).length).toBeGreaterThan(0);
    expect(main().getAllByText('Interactive Agent Prompt').length).toBeGreaterThan(0);
    expect(main().getByRole('region', { name: 'Expired · 2' })).toBeTruthy();
  });

  it('định dạng thời điểm (EC30)', async () => {
    const today = new Date();
    today.setHours(9, 42, 0, 0);
    resetGlobalStore({
      pendingActions: [
        pendingAction(1, 'task_review', 'Hôm nay', { createdAt: today.toISOString() }),
        pendingAction(2, 'task_review', 'Ngày khác', { createdAt: new Date(2026, 9, 29, 16, 20).toISOString() }),
      ],
    });
    await openPending();
    expect(await main().findByText('09:42')).toBeTruthy();
    expect(main().getByText('29/10 16:20')).toBeTruthy();
  });
});
