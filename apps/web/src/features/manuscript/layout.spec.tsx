// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00115 S02: frame of the Manuscript screen on the mock of PID-00013 — init (H5), Archived (H20), not found,
// loading and per-region errors, hiding the right pane and the tablet tabs (H4), language switch (EC07). Names follow
// specs/acceptance.html and specs/scope.html.

import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { feature } from '.';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { ARCHIVED_PROJECT, RAG } from './__mocks__/fixtures';
import { editorText, editorView, main, openManuscript, otherAreas, projectPath, renderManuscript, typeInEditor, viewport } from './__mocks__/render';
import { initProject, resetManuscriptStore, testStore } from './__mocks__/store';

const mock = useMockServer({ features: [feature] });
let restore: (() => void) | undefined;

beforeEach(() => {
  resetManuscriptStore();
  mock.use({ overrides: otherAreas() });
});
afterEach(() => {
  restore?.();
  restore = undefined;
});

const region = (name: string | RegExp) => main().queryByRole('region', { name });

describe('khung màn Manuscript (S02)', () => {
  it('khởi tạo Default (MS-INIT-001, EC01)', async () => {
    resetManuscriptStore('not-initialized');
    const { user } = renderManuscript();
    await waitForFrame();
    expect(await main().findByRole('heading', { level: 1, name: 'Bản thảo' })).toBeTruthy();
    const def = main().getByRole('radio', { name: /Default — mẫu bài báo/ }) as HTMLInputElement;
    const blank = main().getByRole('radio', { name: /Blank — để trống/ }) as HTMLInputElement;
    expect(def.checked || blank.checked).toBe(false);
    expect(main().getByText(/sections\/introduction\.tex và bibliography\/references\.bib/)).toBeTruthy();
    const submit = main().getByRole('button', { name: 'Khởi tạo bản thảo' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await user.click(def);
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    await user.click(submit);
    await screen.findByRole('textbox', { name: /main\.tex$/ });
    expect(editorText()).toContain('\\input{sections/introduction}');
    expect(testStore().projects.get(RAG)!.manuscript.initMode).toBe('Default');
    expect(main().getByText('revision 1')).toBeTruthy();
  });

  it('khởi tạo khi đã có (MS-INIT-001-AC03, EC02)', async () => {
    resetManuscriptStore('not-initialized');
    const { user } = renderManuscript();
    await waitForFrame();
    await user.click(await main().findByRole('radio', { name: /Default — mẫu bài báo/ }));
    // Another tab creates it first: the mock answers 409; the screen reloads and shows that manuscript.
    initProject(testStore(), RAG, 'Blank', 'pdflatex');
    await user.click(main().getByRole('button', { name: 'Khởi tạo bản thảo' }));
    await screen.findByRole('textbox', { name: /main\.tex$/ });
    expect(testStore().projects.get(RAG)!.manuscript.initMode).toBe('Blank');
    expect(editorText()).not.toContain('\\input{sections/introduction}');
    expect(main().queryByRole('alert')).toBeNull();
    expect(main().queryByText(/Chưa lưu được|Bản thảo chưa được tạo/)).toBeNull();
  });

  it('project Archived chỉ đọc (H20, EC03)', async () => {
    await openManuscript(projectPath(ARCHIVED_PROJECT));
    await main().findByRole('region', { name: 'Project đã lưu trữ (Archived) — chỉ đọc' });
    const toolbar = main().getByRole('toolbar', { name: 'Thanh công cụ bản thảo' });
    expect(within(toolbar).queryByRole('button', { name: 'Lưu' })).toBeNull();
    expect(within(toolbar).queryByRole('button', { name: 'Build PDF' })).toBeNull();
    expect(editorView().state.readOnly).toBe(true);
    // Viewing still works: history and the PDF pane stay available.
    expect(within(toolbar).getByRole('tab', { name: 'Lịch sử' })).toBeTruthy();
    expect(within(toolbar).getByRole('tab', { name: 'PDF' })).toBeTruthy();
  });

  it('project Archived ở nơi khác: lệnh ghi báo theo mã và tải lại (EC03)', async () => {
    const { user } = await openManuscript();
    typeInEditor(`${editorText()}% sửa\n`);
    testStore().archived.add(RAG);
    await user.click(main().getByRole('button', { name: 'Lưu' }));
    expect(await main().findByText('Project đã lưu trữ; không thay đổi được bản thảo.')).toBeTruthy();
    expect(main().getByText(/project_archived/)).toBeTruthy();
    expect(editorText()).toContain('% sửa');
    expect(testStore().projects.get(RAG)!.manuscript.currentRevisionNumber).toBe(18);
  });

  it('không tìm thấy (EC04)', async () => {
    renderManuscript(projectPath('1a000000-0000-4000-8000-000000000999'));
    await waitForFrame();
    expect(await screen.findByText('Không tìm thấy project')).toBeTruthy();
    expect(screen.queryByRole('toolbar', { name: 'Thanh công cụ bản thảo' })).toBeNull();
  });

  it('lỗi tại vùng (EC05)', async () => {
    mock.use({ overrides: { listManuscriptFiles: () => ({ status: 503 } as never) } });
    const { user } = renderManuscript();
    await waitForFrame();
    // Loading: skeleton of the real layout with one status line.
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    const editor = await main().findByRole('region', { name: 'Soạn thảo' });
    const retry = await within(editor).findByRole('button', { name: /Thử lại/ });
    expect(within(editor).getAllByText(/503|service_unavailable|http_error/).length).toBeGreaterThan(0);
    // The other regions still work.
    expect(main().getByRole('toolbar', { name: 'Thanh công cụ bản thảo' })).toBeTruthy();
    expect(region('PDF')).toBeTruthy();
    mock.server.resetHandlers();
    mock.use({ overrides: otherAreas() });
    await user.click(retry);
    await screen.findByRole('textbox', { name: /main\.tex$/ });
  });

  it('ẩn vùng phải (UX-MS-001, EC06)', async () => {
    const { user } = await openManuscript();
    expect(region('PDF')).toBeTruthy();
    await user.click(main().getByRole('button', { name: 'Ẩn vùng xem' }));
    expect(region('PDF')).toBeNull();
    expect(region('Soạn thảo')).toBeTruthy();
    await user.click(main().getByRole('tab', { name: 'Lịch sử' }));
    expect(region('Lịch sử')).toBeTruthy();
  });

  it('tablet ba tab (UX-RESP-001, EC06)', async () => {
    restore = viewport(1024);
    const { user } = await openManuscript();
    const tabs = main().getByRole('tablist', { name: 'Vùng màn hình' });
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Tệp', 'Soạn thảo', 'Xem']);
    expect(within(tabs).getByRole('tab', { name: 'Soạn thảo' }).getAttribute('aria-selected')).toBe('true');
    expect(region('Soạn thảo')).toBeTruthy();
    expect(region('Tệp và dàn ý')).toBeNull();
    await user.click(within(tabs).getByRole('tab', { name: 'Tệp' }));
    expect(region('Tệp và dàn ý')).toBeTruthy();
    expect(region('Soạn thảo')).toBeNull();
    // A right-pane tab of the toolbar opens “Xem”.
    await user.click(main().getByRole('tab', { name: 'Build log' }));
    expect(within(tabs).getByRole('tab', { name: 'Xem' }).getAttribute('aria-selected')).toBe('true');
    expect(region('Build log')).toBeTruthy();
  });

  it('đổi ngôn ngữ giữ nội dung (UX-I18N-002, UX-I18N-003, EC07)', async () => {
    const { user } = await openManuscript();
    typeInEditor(`${editorText()}% đang sửa\n`);
    expect(await main().findByText(/1 file chưa lưu/)).toBeTruthy();
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'EN' }));
    await waitFor(() => expect(main().getByRole('toolbar', { name: 'Manuscript toolbar' })).toBeTruthy());
    expect(main().getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(main().getByText(/1 unsaved file\(s\)/)).toBeTruthy();
    expect(editorText()).toContain('% đang sửa');
    expect(main().getByRole('tab', { name: 'History' })).toBeTruthy();
    // Terms stay in English in both languages (Build PDF, Build log).
    expect(main().getByRole('tab', { name: 'Build log' })).toBeTruthy();
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'VI' }));
    await waitFor(() => expect(main().getByRole('button', { name: 'Lưu' })).toBeTruthy());
    expect(editorText()).toContain('% đang sửa');
  });
});
