// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00037 S02–S04: Research Projects list, create form and lifecycle, on the mock of PID-00013 with the area's
// stateful overrides (H9). Names follow specs/acceptance.html and specs/scope.html.

import { screen, waitFor, within } from '@testing-library/react';
import i18next from 'i18next';
import { beforeEach, describe, expect, it } from 'vitest';
import { feature } from '.';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { fixtures, project, unavailable } from './__mocks__/fixtures-for-test';
import { renderGlobal } from './__mocks__/render';
import { resetGlobalStore } from './__mocks__/store';

const mock = useMockServer({ features: [feature] });
const main = () => within(screen.getByRole('main'));
const RAG = 'Ứng dụng RAG trong tổng quan tài liệu y sinh';
const SALINITY = 'Mô hình dự báo xâm nhập mặn vùng Đồng bằng sông Cửu Long';
const LEARNING = 'Measuring learning outcomes in blended classrooms';
const CREDIT = 'Explainable credit scoring for microfinance';

beforeEach(() => resetGlobalStore());

async function openProjects(path = '/projects') {
  const view = renderGlobal(path);
  await waitForFrame();
  await main().findByRole('heading', { level: 1, name: 'Research Projects' });
  return view;
}

async function rowMenu(user: { click: (el: Element) => Promise<void> }, name: string, item: string) {
  await user.click(await main().findByRole('button', { name: `Thao tác cho ${name}` }));
  await user.click(main().getByRole('menuitem', { name: item }));
}

describe('Research Projects — danh sách (S02)', () => {
  it('ba tab có số đã tải', async () => {
    await openProjects();
    expect(await main().findByRole('tab', { name: 'Active · 3' })).toBeTruthy();
    expect(main().getByRole('tab', { name: 'Archived · 1' })).toBeTruthy();
    expect(main().getByRole('tab', { name: 'Đã xóa (30 ngày) · 0' })).toBeTruthy();
    expect(main().getByRole('link', { name: RAG }).getAttribute('href')).toMatch(/^\/projects\/.+\/overview$/);
    const rag = main().getByRole('link', { name: RAG }).closest('tr') as HTMLElement;
    expect(within(rag).getByText('Approved')).toBeTruthy();
    expect(within(rag).getByText('3 việc')).toBeTruthy();
  });

  it('tải thêm (EC14)', async () => {
    resetGlobalStore({ projects: Array.from({ length: 55 }, (_, i) => project(i + 1, `Project số ${i + 1}`)), pendingActions: [], workflows: [] });
    const { user } = await openProjects();
    expect(await main().findByRole('tab', { name: 'Active · 50+' })).toBeTruthy();
    expect(main().getAllByRole('row').length).toBe(51); // header + 50
    await user.click(main().getByRole('button', { name: 'Tải thêm' }));
    expect(await main().findByRole('tab', { name: 'Active · 55' })).toBeTruthy();
    expect(main().getAllByRole('row').length).toBe(56);
    expect(main().queryByRole('button', { name: 'Tải thêm' })).toBeNull();
  });

  it('trống và lọc rỗng (EC15)', async () => {
    const { user } = await openProjects();
    await user.type(await main().findByLabelText('Lọc project'), 'không có đề tài này');
    expect(main().getByText('Không có project khớp “không có đề tài này”')).toBeTruthy();
    await user.click(main().getByRole('button', { name: 'Xóa lọc' }));
    expect(main().getByRole('link', { name: RAG })).toBeTruthy();
    await user.type(main().getByLabelText('Lọc project'), 'xâm nhập mặn');
    expect(main().getAllByRole('row').length).toBe(2);
    await user.click(main().getByRole('tab', { name: /Đã xóa/ }));
    expect(main().getByText('Không có project đã xóa trong 30 ngày qua')).toBeTruthy();
  });

  it('nội dung HTML hiện dạng chữ (EC18)', async () => {
    resetGlobalStore({ projects: [project(1, '<img src=x onerror=alert(1)>', { shortDescription: '<script>alert(2)</script>' })] });
    await openProjects();
    expect(await main().findByRole('link', { name: '<img src=x onerror=alert(1)>' })).toBeTruthy();
    expect(main().getByText('<script>alert(2)</script>')).toBeTruthy();
    expect(document.querySelector('main img')).toBeNull();
    expect(document.querySelector('main script')).toBeNull();
  });

  it('định dạng hoạt động cuối (EC20)', async () => {
    const today = new Date();
    today.setHours(9, 42, 0, 0);
    resetGlobalStore({ projects: [project(1, 'Hôm nay', { lastActivityAt: today.toISOString() }), project(2, 'Hôm trước', { lastActivityAt: '2026-10-30T03:00:00.000Z' })] });
    await openProjects();
    expect(await main().findByText('09:42 hôm nay')).toBeTruthy();
    expect(main().getByText('30/10/2026')).toBeTruthy();
  });

  it('đang tải (EC21)', async () => {
    mock.use({ overrides: { listProjects: () => ({ status: 200, body: { items: [], nextCursor: null }, delayMs: 400 }) } });
    renderGlobal('/projects');
    await waitForFrame();
    expect(await main().findByText('Đang tải danh sách project…')).toBeTruthy();
    expect(await main().findByText('Chưa có project đang hoạt động')).toBeTruthy();
  });
});

describe('Research Projects — tạo project (S03)', () => {
  it('tạo project mở chat (PROJ-CRUD-001-AC01)', async () => {
    let sent: unknown;
    let key: string | null = null;
    mock.use({
      overrides: {
        createProject: ({ body, request }) => {
          sent = body;
          key = request.headers.get('Idempotency-Key');
          return { status: 201, body: project(9, body?.name ?? '') };
        },
      },
    });
    const { user, router } = await openProjects();
    await user.click(main().getByRole('button', { name: 'Tạo project' }));
    const form = await screen.findByRole('complementary', { name: 'Tạo project' });
    expect(within(form).queryByText(/Default|Blank/)).toBeNull(); // no manuscript template (H5)
    await user.type(within(form).getByLabelText('Tên project'), '  Đề tài mới  ');
    await user.type(within(form).getByLabelText('Câu hỏi nghiên cứu ban đầu'), 'RAG có giảm trích dẫn sai?');
    await user.click(within(form).getByRole('button', { name: 'Tạo và mở chat' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${project(9, '').id}/chat`));
    expect(sent).toEqual({ name: 'Đề tài mới', context: { researchQuestion: 'RAG có giảm trích dẫn sai?' } });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('thiếu câu hỏi nghiên cứu (PROJ-CRUD-001-AC02, EC06)', async () => {
    let calls = 0;
    mock.use({ overrides: { createProject: () => ((calls += 1), { status: 400 }) } });
    const { user } = await openProjects('/projects?new=1');
    const form = await screen.findByRole('complementary', { name: 'Tạo project' });
    await user.type(within(form).getByLabelText('Tên project'), 'Chỉ có tên');
    await user.click(within(form).getByRole('button', { name: 'Tạo và mở chat' }));
    const question = within(form).getByLabelText('Câu hỏi nghiên cứu ban đầu');
    expect(question.getAttribute('aria-invalid')).toBe('true');
    expect(within(form).getByText(/Trường này bắt buộc\. Chưa lưu\./)).toBeTruthy();
    expect(calls).toBe(0);
  });

  it('lỗi giữ dữ liệu form (EC07)', async () => {
    const keys: Array<string | null> = [];
    let fail = true;
    mock.use({
      overrides: {
        createProject: ({ body, request }) => {
          keys.push(request.headers.get('Idempotency-Key'));
          if (fail) return unavailable();
          return { status: 201, body: project(10, body?.name ?? '') };
        },
      },
    });
    const { user, router } = await openProjects('/projects?new=1');
    const form = await screen.findByRole('complementary', { name: 'Tạo project' });
    await user.type(within(form).getByLabelText('Tên project'), 'Đề tài lỗi mạng');
    await user.type(within(form).getByLabelText('Câu hỏi nghiên cứu ban đầu'), 'Câu hỏi');
    await user.click(within(form).getByRole('button', { name: 'Tạo và mở chat' }));
    expect((await within(form).findByRole('alert')).textContent).toContain('service_unavailable');
    expect((within(form).getByLabelText('Tên project') as HTMLInputElement).value).toBe('Đề tài lỗi mạng');
    fail = false;
    await user.click(within(form).getByRole('button', { name: 'Tạo và mở chat' }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/chat$/));
    expect(keys.length).toBe(2);
    expect(keys[1]).toBe(keys[0]); // same Idempotency-Key on retry after 5xx
  });

  it('cảnh báo trùng tên (EC08)', async () => {
    const { user } = await openProjects('/projects?new=1');
    await main().findByRole('tab', { name: 'Active · 3' });
    const form = screen.getByRole('complementary', { name: 'Tạo project' });
    await user.type(within(form).getByLabelText('Tên project'), RAG.toUpperCase());
    expect(within(form).getByText(/Đã có project Active cùng tên/)).toBeTruthy();
    expect((within(form).getByRole('button', { name: 'Tạo và mở chat' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('đổi ngôn ngữ giữ form (EC16)', async () => {
    const { user } = await openProjects('/projects?new=1');
    const form = await screen.findByRole('complementary', { name: 'Tạo project' });
    const name = within(form).getByLabelText('Tên project');
    await user.type(name, 'Đang gõ dở');
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'EN' }));
    await waitFor(() => expect(i18next.language).toBe('en'));
    const formEn = screen.getByRole('complementary', { name: 'Create project' });
    expect((within(formEn).getByLabelText('Project name') as HTMLInputElement).value).toBe('Đang gõ dở');
  });
});

describe('Research Projects — vòng đời (S04)', () => {
  it('Archived chỉ đọc (PROJ-CRUD-002-AC02, EC13)', async () => {
    const { user } = await openProjects();
    await user.click(await main().findByRole('tab', { name: /^Archived/ }));
    await rowMenu(user, CREDIT, 'Xem thông tin');
    const dialog = screen.getByRole('dialog', { name: 'Sửa thông tin project' });
    expect((within(dialog).getByLabelText('Tên project') as HTMLInputElement).readOnly).toBe(true);
    expect((within(dialog).getByLabelText('Mô tả ngắn') as HTMLTextAreaElement).readOnly).toBe(true);
    expect(within(dialog).getByText(/chỉ đọc\. Mở lại project để sửa/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Mở lại' }));
    expect(await main().findByRole('tab', { name: 'Active · 4' })).toBeTruthy();
  });

  it('chặn khi còn workflow (PROJ-CRUD-003-AC01, PROJ-CRUD-003-AC08, EC09)', async () => {
    mock.use({
      overrides: {
        listWorkflows: () => ({ status: 200, body: { items: [fixtures.workflow(5, 'Running', 'x'), fixtures.workflow(6, 'Waiting for User', 'x')], nextCursor: null } }),
      },
    });
    const { user } = await openProjects();
    await rowMenu(user, RAG, 'Lưu trữ');
    let dialog = screen.getByRole('alertdialog', { name: `Lưu trữ “${RAG}”?` });
    await user.click(within(dialog).getByRole('button', { name: 'Lưu trữ project' }));
    expect(await within(dialog).findByText('Không lưu trữ được: project còn workflow đang hoạt động.')).toBeTruthy();
    expect(await within(dialog).findByText('Running')).toBeTruthy();
    expect(within(dialog).getByText('Waiting for User')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Lưu trữ project' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Giữ project' }));
    expect(main().getByRole('tab', { name: 'Active · 3' })).toBeTruthy();

    await rowMenu(user, RAG, 'Xóa');
    dialog = screen.getByRole('alertdialog', { name: `Xóa “${RAG}”?` });
    await user.click(within(dialog).getByRole('button', { name: 'Xóa project' }));
    expect(await within(dialog).findByText('Không xóa được: project còn workflow đang hoạt động.')).toBeTruthy();
    expect(main().getByRole('link', { name: RAG })).toBeTruthy();
  });

  it('xóa rồi khôi phục (PROJ-CRUD-003-AC05, PROJ-CRUD-003-AC06, EC19)', async () => {
    const { user } = await openProjects();
    await rowMenu(user, LEARNING, 'Xóa');
    const dialog = screen.getByRole('alertdialog', { name: `Xóa “${LEARNING}”?` });
    expect(within(dialog).getByText(/Plan, Task, evidence, artifact, bản thảo, lịch sử chat/)).toBeTruthy();
    expect(within(dialog).getByText(/Khôi phục được trong 30 ngày/)).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Giữ project'); // the safe option has focus
    await user.click(within(dialog).getByRole('button', { name: 'Xóa project' }));
    expect(await main().findByRole('tab', { name: 'Active · 2' })).toBeTruthy();
    expect(main().queryByRole('link', { name: LEARNING })).toBeNull();

    await user.click(main().getByRole('tab', { name: 'Đã xóa (30 ngày) · 1' }));
    const row = main().getByText(LEARNING).closest('tr') as HTMLElement;
    const purge = new Date(Date.now() + 30 * 86_400_000);
    const expected = `${String(purge.getDate()).padStart(2, '0')}/${String(purge.getMonth() + 1).padStart(2, '0')}/${purge.getFullYear()}`;
    expect(within(row).getByText(expected)).toBeTruthy();
    await user.click(within(row).getByRole('button', { name: `Khôi phục ${LEARNING}` }));
    expect(await main().findByRole('tab', { name: 'Active · 3' })).toBeTruthy();
    expect(main().getByText(`Đã khôi phục “${LEARNING}”.`)).toBeTruthy();
  });

  it('hủy dialog không đổi gì (EC10)', async () => {
    let calls = 0;
    mock.use({ overrides: { deleteProject: () => ((calls += 1), { status: 404 }) } });
    const { user } = await openProjects();
    await rowMenu(user, SALINITY, 'Xóa');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await rowMenu(user, SALINITY, 'Xóa');
    await user.click(screen.getByRole('button', { name: 'Giữ project' }));
    expect(calls).toBe(0);
    expect(main().getByRole('tab', { name: 'Active · 3' })).toBeTruthy();
  });

  it('khôi phục quá hạn (EC11)', async () => {
    resetGlobalStore({
      projects: [project(1, 'Đã xóa lâu', { deletedAt: '2026-10-01T00:00:00.000Z', purgeAfter: '2026-10-31T00:00:00.000Z', statusBeforeDeletion: 'Active' })],
    });
    const { user } = await openProjects();
    await user.click(await main().findByRole('tab', { name: 'Đã xóa (30 ngày) · 1' }));
    await user.click(main().getByRole('button', { name: 'Khôi phục Đã xóa lâu' }));
    expect((await main().findByRole('alert')).textContent).toContain('không còn khôi phục được');
    expect(main().getByRole('alert').textContent).toContain('restore_window_expired');
  });

  it('sửa xung đột phiên bản (EC12)', async () => {
    let first = true;
    const ifMatch: Array<string | null> = [];
    mock.use({
      overrides: {
        updateProject: ({ request, body }) => {
          ifMatch.push(request.headers.get('If-Match'));
          if (first) {
            first = false;
            return { status: 412 };
          }
          return { status: 200, body: project(1, body?.name ?? 'x') };
        },
      },
    });
    const { user } = await openProjects();
    await rowMenu(user, RAG, 'Sửa thông tin');
    const dialog = screen.getByRole('dialog', { name: 'Sửa thông tin project' });
    const name = within(dialog).getByLabelText('Tên project');
    await user.clear(name);
    await user.type(name, 'Tên mới của tôi');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(await within(dialog).findByText(/đã được sửa ở nơi khác/)).toBeTruthy();
    expect((within(dialog).getByLabelText('Tên project') as HTMLInputElement).value).toBe('Tên mới của tôi');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(ifMatch[0]).toBe('"3"');
  });
});
