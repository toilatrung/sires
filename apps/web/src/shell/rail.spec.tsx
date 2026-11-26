// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderShellFrame, waitForFrame } from './test/render';
import { json, shellStub } from './test/stub';

const AREAS = [
  ['Overview', '/projects/p1/overview'],
  ['Project AI Chat', '/projects/p1/chat'],
  ['Plan and Tasks', '/projects/p1/plan'],
  ['References and Evidence', '/projects/p1/evidence'],
  ['Research Artifacts', '/projects/p1/artifacts'],
  ['Manuscript', '/projects/p1/manuscript'],
  ['Agent Activity', '/projects/p1/activity'],
  ['Activity and History', '/projects/p1/history'],
];

describe('ProjectRail', () => {
  it('tám khu vực và mục đang chọn; tên project, Plan, Active task', async () => {
    renderShellFrame({ path: '/projects/p1/evidence' });
    await waitForFrame();
    const rail = await screen.findByRole('complementary', { name: 'Khu vực Project' });
    const links = within(rail).getAllByRole('link');
    expect(links.map((a) => [a.firstElementChild?.textContent, a.getAttribute('href')])).toEqual(AREAS);
    expect(within(rail).getByRole('link', { name: 'References and Evidence' }).getAttribute('aria-current')).toBe('page');
    expect(links.filter((a) => a.getAttribute('aria-current') === 'page')).toHaveLength(1);
    await waitFor(() => expect(within(rail).getByText('RAG trong tổng quan tài liệu')).toBeTruthy());
    await waitFor(() => expect(within(rail).getByText('Plan v3 · Approved')).toBeTruthy());
    await waitFor(() => expect(within(rail).getByText('T-2.3')).toBeTruthy());
    expect(within(rail).getByText(/So sánh phương pháp đo/)).toBeTruthy();
  });

  it('manuscript ẩn rail (EC16)', async () => {
    const { router } = renderShellFrame({ path: '/projects/p1/manuscript/sections/intro.tex' });
    await waitForFrame();
    await screen.findByRole('navigation', { name: 'Vị trí' });
    expect(screen.queryByRole('complementary', { name: 'Khu vực Project' })).toBeNull();
    await router.navigate('/projects/p1/overview');
    expect(await screen.findByRole('complementary', { name: 'Khu vực Project' })).toBeTruthy();
  });

  it('nhãn giữ tiếng Anh (EC05)', async () => {
    const { user } = renderShellFrame({ path: '/projects/p1/overview' });
    await waitForFrame();
    const names = () =>
      within(screen.getByRole('complementary', { name: /Khu vực Project|Project areas/ }))
        .getAllByRole('link')
        .map((a) => a.firstElementChild?.textContent);
    await screen.findByRole('complementary', { name: 'Khu vực Project' });
    expect(names()).toEqual(AREAS.map(([n]) => n));
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(names()).toEqual(AREAS.map(([n]) => n));
  });

  it('Bỏ active task gửi setActiveTask với taskId null', async () => {
    const { user, stub } = renderShellFrame({ path: '/projects/p1/overview' });
    await waitForFrame();
    const button = await screen.findByRole('button', { name: 'Bỏ active task' });
    await user.click(button);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Bỏ active task' })).toBeNull());
    const put = stub.calls('/api/v1/projects/p1/active-task', 'PUT');
    expect(put).toHaveLength(1);
    expect(JSON.parse(put[0].body ?? '{}')).toEqual({ taskId: null });
    expect(put[0].headers['X-CSRF-Token']).toBe('csrf-1');
  });
});

describe('ProjectRail: khu vực theo đường dẫn, số đếm', () => {
  it('route claims thuộc References and Evidence (research)', async () => {
    renderShellFrame({ path: '/projects/p1/claims/c1' });
    await waitForFrame();
    const rail = await screen.findByRole('complementary', { name: 'Khu vực Project' });
    expect(within(rail).getByRole('link', { name: 'References and Evidence' }).getAttribute('aria-current')).toBe('page');
  });

  it('không hiện số 0 (nguồn hasCount: chỉ khi lớn hơn 0)', async () => {
    const stub = shellStub();
    stub.on('GET', '/api/v1/pending-actions', () => json({ items: [], nextCursor: null, openCount: 0 }));
    const { services } = renderShellFrame({ path: '/projects/p1/overview', stub });
    await waitForFrame();
    const rail = await screen.findByRole('complementary', { name: 'Khu vực Project' });
    await waitFor(() => expect(stub.calls('/api/v1/pending-actions', 'GET', { projectId: 'p1' }).length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 30));
    expect(rail.querySelectorAll('.sires-rail__count')).toHaveLength(0);
    // A zero count next to a positive one: only the positive one shows.
    act(() => (services.navigation as unknown as { setProject(patch: object): void }).setProject({ areaCounts: { plan: 0, evidence: 2 } }));
    await waitFor(() => expect(within(rail).getByLabelText('2 việc chờ bạn')).toBeTruthy());
    expect(rail.querySelectorAll('.sires-rail__count')).toHaveLength(1);
    expect(within(rail).getByRole('link', { name: /^Plan and Tasks/ }).querySelector('.sires-rail__count')).toBeNull();
  });
});
