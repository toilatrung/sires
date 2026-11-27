// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00060 S03: Notifications on the mock of PID-00013 with the area's stateful overrides (H8).

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { feature } from '.';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { RAG_ID, notification, unavailable } from './__mocks__/fixtures-for-test';
import { renderGlobal } from './__mocks__/render';
import { resetGlobalStore } from './__mocks__/store';

const mock = useMockServer({ features: [feature] });
const main = () => within(screen.getByRole('main'));

beforeEach(() => resetGlobalStore());

async function openNotifications() {
  const view = renderGlobal('/notifications');
  await waitForFrame();
  await main().findByRole('heading', { level: 1, name: 'Notifications' });
  return view;
}

describe('Notifications (S03)', () => {
  it('mới nhất trên, chấm đọc và chưa đọc có nhãn', async () => {
    resetGlobalStore({ notifications: [notification(30, 'completion', 'Cũ hơn', { status: 'Read' }), notification(1, 'failure', 'Mới hơn')] });
    await openNotifications();
    const items = await main().findAllByRole('listitem');
    const rows = items.filter((item) => item.classList.contains('g-notification'));
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining('Mới hơn'), expect.stringContaining('Cũ hơn')]);
    expect(within(rows[0]!).getByText('Chưa đọc')).toBeTruthy();
    expect(within(rows[1]!).getByText('Đã đọc')).toBeTruthy();
    expect(within(rows[0]!).getByText('Failure').getAttribute('data-tone')).toBe('error');
  });

  it('không có liên kết khi loại lạ (EC09)', async () => {
    resetGlobalStore({ notifications: [notification(1, 'completion', 'Loại lạ', { objectType: 'weird_thing' }), notification(2, 'completion', 'Task thiếu project', { projectId: undefined })] });
    await openNotifications();
    await main().findByText('Loại lạ');
    expect(main().queryByRole('link', { name: 'Mở Task' })).toBeNull();
  });

  it('mở là đánh dấu đã đọc (EC10)', async () => {
    const bodies: unknown[] = [];
    mock.use({
      overrides: {
        markNotificationsRead: ({ body }) => {
          bodies.push(body);
          return { status: 204 };
        },
      },
    });
    resetGlobalStore({ notifications: [notification(1, 'blocked_task', 'Task bị chặn')] });
    const { user, router } = await openNotifications();
    await user.click(await main().findByRole('link', { name: 'Mở Task' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${RAG_ID}/tasks/${notification(1, 'blocked_task', '').objectId}`));
    expect(bodies).toEqual([{ ids: [notification(1, 'blocked_task', '').id] }]);
  });

  it('mở vẫn điều hướng khi đánh dấu lỗi (EC10)', async () => {
    mock.use({ overrides: { markNotificationsRead: () => unavailable() } });
    resetGlobalStore({ notifications: [notification(1, 'provider_issue', 'Kết nối lỗi', { projectId: undefined, objectType: 'provider_connection' })] });
    const { user, router } = await openNotifications();
    await user.click(await main().findByRole('link', { name: 'Mở Provider Connections' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/providers'));
  });

  it('đánh dấu khi đang lọc (EC11)', async () => {
    const bodies: unknown[] = [];
    mock.use({
      overrides: {
        markNotificationsRead: ({ body }) => {
          bodies.push(body);
          return { status: 204 };
        },
      },
    });
    resetGlobalStore({ notifications: [notification(1, 'failure', 'Lỗi A'), notification(2, 'completion', 'Xong B')] });
    const { user } = await openNotifications();
    await user.click(await main().findByRole('button', { name: /^Failure/ }));
    await user.click(main().getByRole('button', { name: 'Đánh dấu các mục đang hiện đã đọc' }));
    await waitFor(() => expect(bodies).toEqual([{ ids: [notification(1, 'failure', '').id] }]));
    await user.click(main().getByRole('button', { name: /^Tất cả/ }));
    await user.click(main().getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }));
    await waitFor(() => expect(bodies[1]).toEqual({ all: true }));
  });

  it('nội dung HTML hiện dạng chữ (EC12)', async () => {
    resetGlobalStore({ notifications: [notification(1, 'failure', '<img src=x onerror=alert(1)>')] });
    await openNotifications();
    expect(await main().findByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('main img')).toBeNull();
  });
});
