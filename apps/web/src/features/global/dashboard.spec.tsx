// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00037 S05, S06: Dashboard frame, first-run, API key banner, recovery banner — on the mock of PID-00013 with
// the area's stateful overrides (H9). Names follow specs/acceptance.html and specs/scope.html.

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { feature } from '.';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { fixtures, unavailable } from './__mocks__/fixtures-for-test';
import { renderGlobal } from './__mocks__/render';
import { resetGlobalStore } from './__mocks__/store';

const mock = useMockServer({ features: [feature] });
const main = () => within(screen.getByRole('main'));

beforeEach(() => resetGlobalStore());

describe('Dashboard — khung (S05)', () => {
  it('thứ tự khối (UX-LAYOUT-004-AC01)', async () => {
    renderGlobal('/dashboard');
    await waitForFrame();
    const pending = await main().findByRole('heading', { level: 1, name: /việc chờ bạn/ });
    // Blocks in the UX-LAYOUT-004 order: pending actions, running workflows, recent projects, recent errors.
    const order = [pending, ...['Workflow đang chạy', 'Project gần đây', 'Lỗi gần đây'].map((name) => main().getByRole('heading', { name }))];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(pending.textContent).toBe('4 việc chờ bạn');
    expect(main().getByRole('link', { name: 'Tất cả Pending Actions' }).getAttribute('href')).toBe('/pending-actions');
  });

  it('bỏ project Archived (WS-DASHBOARD-001-AC04, EC05)', async () => {
    mock.use({
      overrides: {
        getDashboard: () => ({ status: 200, body: { pendingActions: [], interruptedWorkflows: [], recentProjects: [fixtures.active, fixtures.archived] } }),
      },
    });
    renderGlobal('/dashboard');
    await waitForFrame();
    expect(await main().findByRole('link', { name: fixtures.active.name })).toBeTruthy();
    expect(main().queryByText(fixtures.archived.name)).toBeNull();
  });

  it('lỗi tại khối (EC03)', async () => {
    mock.use({
      overrides: {
        getDashboard: () => unavailable(),
        listProviderConnections: () => ({ status: 200, body: { items: [] } }),
      },
    });
    renderGlobal('/dashboard');
    await waitForFrame();
    const alerts = await main().findAllByRole('alert');
    expect(alerts.length).toBe(2); // pending block and recent projects block
    expect(alerts[0]!.textContent).toContain('service_unavailable');
    expect(main().getAllByRole('button', { name: 'Thử lại' }).length).toBe(2);
    // The API key banner comes from its own request and still shows (EC02, EC03).
    expect(main().getByText('Thêm API key của bạn để agent hoạt động')).toBeTruthy();
  });
});

describe('Dashboard — first-run và banner (S06)', () => {
  it('first-run tạo project (PID-00037-AC01, WS-DASHBOARD-001-AC03, EC01)', async () => {
    resetGlobalStore({ projects: [], pendingActions: [], workflows: [], notifications: [] });
    const { user, router } = renderGlobal('/dashboard');
    await waitForFrame();
    expect(await main().findByRole('heading', { level: 1, name: 'Không có việc nào chờ bạn' })).toBeTruthy();
    expect(main().getByText('Chưa có project đang hoạt động')).toBeTruthy();
    const create = main().getByRole('link', { name: 'Tạo project' });
    expect(create.getAttribute('data-variant')).toBe('primary');
    expect(main().getByRole('link', { name: /Research Projects/ }).getAttribute('href')).toBe('/projects');

    await user.click(create);
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects'));
    const form = await screen.findByRole('complementary', { name: 'Tạo project' });
    await user.type(within(form).getByLabelText('Tên project'), 'Đề tài đầu tiên');
    await user.type(within(form).getByLabelText('Câu hỏi nghiên cứu ban đầu'), 'RAG có giảm trích dẫn sai không?');
    await user.click(within(form).getByRole('button', { name: 'Tạo và mở chat' }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/projects\/[0-9a-f-]{36}\/chat$/));
  });

  it('banner API key (UX-SETTINGS-002-AC02, EC02)', async () => {
    mock.use({ overrides: { listProviderConnections: () => ({ status: 200, body: { items: [] } }) } });
    const first = renderGlobal('/dashboard');
    await waitForFrame();
    expect(await main().findByText('Thêm API key của bạn để agent hoạt động')).toBeTruthy();
    expect(main().getByRole('link', { name: 'Mở Provider Connections' }).getAttribute('href')).toBe('/settings/providers');
    first.unmountAll();

    // With a connection (demo data) there is no banner.
    mock.server.resetHandlers();
    const second = renderGlobal('/dashboard');
    await waitForFrame();
    await main().findByRole('heading', { level: 1, name: /việc chờ bạn/ });
    expect(main().queryByText('Thêm API key của bạn để agent hoạt động')).toBeNull();
    second.unmountAll();

    // The list failing hides the banner without breaking the other blocks.
    mock.use({ overrides: { listProviderConnections: () => unavailable() } });
    renderGlobal('/dashboard');
    await waitForFrame();
    expect(await main().findByRole('heading', { name: 'Project gần đây' })).toBeTruthy();
    expect(main().queryByText('Thêm API key của bạn để agent hoạt động')).toBeNull();
  });

  it('banner khôi phục (UX-STATE-005-AC01, EC04)', async () => {
    renderGlobal('/dashboard');
    await waitForFrame();
    // Demo data: the salinity indexing workflow is Interrupted.
    const banner = await main().findByText('Một workflow bị gián đoạn khi bạn rời phiên');
    const box = banner.closest('[data-kind="recovery"]') as HTMLElement;
    const action = within(box).getByRole('link', { name: 'Mở Recovery decision' });
    expect(action.getAttribute('href')).toMatch(/^\/projects\/[0-9a-f-]+\/activity\/workflows\/[0-9a-f-]+$/);
  });

  it('banner khôi phục nhiều workflow mở Pending Actions (EC04)', async () => {
    mock.use({
      overrides: {
        getDashboard: () => ({ status: 200, body: { pendingActions: [], interruptedWorkflows: [fixtures.interrupted(1), fixtures.interrupted(2)], recentProjects: [] } }),
      },
    });
    renderGlobal('/dashboard');
    await waitForFrame();
    expect(await main().findByText('2 workflow bị gián đoạn khi bạn rời phiên')).toBeTruthy();
    expect(main().getByRole('link', { name: 'Mở Pending Actions' }).getAttribute('href')).toBe('/pending-actions');
  });
});
