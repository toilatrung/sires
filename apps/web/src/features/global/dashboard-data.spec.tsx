// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00060 S06: data of the dashboard blocks (H7) in the frame of PID-00037, on the mock of PID-00013.

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { feature } from '.';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { LEARNING_ID, RAG_ID, notification, pendingAction, unavailable } from './__mocks__/fixtures-for-test';
import { renderGlobal } from './__mocks__/render';
import { resetGlobalStore } from './__mocks__/store';

const mock = useMockServer({ features: [feature] });
const main = () => within(screen.getByRole('main'));
const block = (name: string) => main().getByRole('region', { name });

beforeEach(() => resetGlobalStore());

async function openDashboard() {
  const view = renderGlobal('/dashboard');
  await waitForFrame();
  await main().findByRole('heading', { level: 1, name: /việc chờ bạn/ });
  return view;
}

describe('Khối dữ liệu Dashboard (S06)', () => {
  it('hai prompt ở hai project (WS-DASHBOARD-001-AC01)', async () => {
    resetGlobalStore({
      pendingActions: [
        pendingAction(2, 'interactive_prompt', 'Prompt ở RAG', { projectId: RAG_ID, deepLink: `/projects/${RAG_ID}/chat` }),
        pendingAction(1, 'interactive_prompt', 'Prompt ở Learning', { projectId: LEARNING_ID, deepLink: `/projects/${LEARNING_ID}/chat` }),
      ],
    });
    const { user, router } = await openDashboard();
    const pending = block('2 việc chờ bạn');
    expect(await within(pending).findByText(/Ứng dụng RAG trong tổng quan tài liệu y sinh ·/)).toBeTruthy();
    expect(within(pending).getByText(/Measuring learning outcomes in blended classrooms ·/)).toBeTruthy();
    await user.click(within(pending).getByRole('link', { name: 'Trả lời: Prompt ở Learning' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${LEARNING_ID}/chat`));
  });

  it('workflow Interrupted (WS-DASHBOARD-001-AC02)', async () => {
    await openDashboard();
    const workflows = block('Workflow đang chạy');
    expect(await within(workflows).findByText('Interrupted')).toBeTruthy();
    const action = within(workflows).getByRole('link', { name: 'Mở Recovery decision' });
    // The Recovery decision pending action of that workflow gives the target (PID-00037 H4).
    expect(action.getAttribute('href')).toMatch(/\/activity\/workflows\//);
    // Running and Waiting for User workflows of the demo world are listed too.
    expect(await within(workflows).findByText('Running')).toBeTruthy();
  });

  it('pending action trước project (UX-LAYOUT-004-AC01)', async () => {
    await openDashboard();
    const firstRow = (await main().findAllByRole('listitem')).find((item) => item.classList.contains('g-pending'))!;
    const projects = main().getByRole('heading', { name: 'Project gần đây' });
    expect(firstRow.compareDocumentPosition(projects) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('cùng dấu hiệu cần bạn xử lý (UX-STATUS-001-AC01)', async () => {
    resetGlobalStore({
      pendingActions: [pendingAction(1, 'task_review', 'Task đang Waiting for User'), pendingAction(2, 'reference_approval', 'Reference Pending Approval', { projectId: undefined })],
    });
    await openDashboard();
    const pending = block('2 việc chờ bạn');
    const task = await within(pending).findByText('Task review request');
    const reference = within(pending).getByText('Reference approval');
    expect(task.closest('.sires-chip')?.getAttribute('data-tone')).toBe('needs-you');
    expect(reference.closest('.sires-chip')?.getAttribute('data-tone')).toBe('needs-you');
  });

  it('khối workflow lỗi (EC26)', async () => {
    mock.use({ overrides: { listWorkflows: () => unavailable() } });
    await openDashboard();
    const workflows = block('Workflow đang chạy');
    expect((await within(workflows).findByRole('alert')).textContent).toContain('service_unavailable');
    expect(within(workflows).getByText('Interrupted')).toBeTruthy();
  });

  it('cột Bản thảo (EC27)', async () => {
    await openDashboard();
    const projects = block('Project gần đây');
    const rag = (await within(projects).findByRole('link', { name: 'Ứng dụng RAG trong tổng quan tài liệu y sinh' })).closest('tr') as HTMLElement;
    expect(await within(rag).findByText(/^Build (OK|lỗi)|^Đang build|^Chưa build/)).toBeTruthy();
    const learning = within(projects).getByRole('link', { name: 'Measuring learning outcomes in blended classrooms' }).closest('tr') as HTMLElement;
    expect(await within(learning).findByText('Chưa khởi tạo')).toBeTruthy();
  });

  it('cột Bản thảo lỗi khác hiện gạch (EC27)', async () => {
    mock.use({ overrides: { getManuscript: () => unavailable() } });
    await openDashboard();
    const projects = block('Project gần đây');
    const rag = (await within(projects).findByRole('link', { name: 'Ứng dụng RAG trong tổng quan tài liệu y sinh' })).closest('tr') as HTMLElement;
    await waitFor(() => expect(within(rag).getAllByText('—').length).toBeGreaterThan(0));
  });

  it('lỗi gần đây trống (EC28)', async () => {
    resetGlobalStore({ notifications: [notification(1, 'completion', 'Xong việc')] });
    await openDashboard();
    expect(await within(block('Lỗi gần đây')).findByText('Không có lỗi gần đây')).toBeTruthy();
  });

  it('lỗi gần đây có liên kết', async () => {
    resetGlobalStore({ notifications: [notification(1, 'failure', 'Indexing thất bại', { objectType: 'workflow' })] });
    await openDashboard();
    const errors = block('Lỗi gần đây');
    expect(await within(errors).findByText('Indexing thất bại')).toBeTruthy();
    expect(within(errors).getByRole('link', { name: 'Xem workflow' })).toBeTruthy();
  });
});
