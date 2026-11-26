// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00115 S03: file tree, outline and file operations on the area's stateful mock (H9). Names follow
// specs/acceptance.html and specs/scope.html.

import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { feature } from '.';
import { useMockServer } from '../../shell/mock/node';
import { editorView, openManuscript, otherAreas, typeInEditor, waitForFile } from './__mocks__/render';
import { RAG } from './__mocks__/fixtures';
import { activeFiles, commit, currentSnapshot, resetManuscriptStore, testStore } from './__mocks__/store';

const mock = useMockServer({ features: [feature] });
const requests: string[] = [];
const record = ({ request }: { request: Request }) => {
  requests.push(`${request.method} ${new URL(request.url).pathname}`);
};

// jsdom's URL.createObjectURL cannot read the runtime's Blob (the image viewer's URL) and CodeMirror's scroll into
// view measures text ranges jsdom does not lay out: stand-ins for this file.
const rects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sires-test');
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
  if (!Range.prototype.getClientRects) Range.prototype.getClientRects = rects;
  if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => new DOMRect();
  resetManuscriptStore();
  requests.length = 0;
  mock.server.events.on('request:start', record);
  mock.use({ overrides: otherAreas() });
});
afterEach(() => {
  vi.restoreAllMocks();
  mock.server.events.removeListener('request:start', record);
});

const pane = () => within(screen.getByRole('region', { name: 'Tệp và dàn ý' }));
const rag = () => testStore().projects.get(RAG)!;
const revision = () => rag().manuscript.currentRevisionNumber;
const paths = () => activeFiles(currentSnapshot(rag())).map((row) => row.path);
const commits = () => requests.filter((line) => line === `POST /api/v1/projects/${RAG}/manuscript/revisions`);

async function menu(user: ReturnType<typeof openManuscript> extends Promise<infer V> ? V extends { user: infer U } ? U : never : never, name: string) {
  await user.click(pane().getByRole('button', { name: `Thao tác với ${name}` }));
  return within(await screen.findByRole('menu', { name: `Thao tác với ${name}` }));
}

describe('cây file và thao tác file (S03)', () => {
  it('cảnh báo tham chiếu khi đổi tên (MS-EDITOR-001-AC01, EC10)', async () => {
    const { user } = await openManuscript();
    await user.click((await menu(user, 'sections/method.tex')).getByRole('menuitem', { name: 'Đổi tên hoặc di chuyển' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Đổi tên hoặc di chuyển sections/method.tex' }));
    // Listed before anything is sent.
    expect(await dialog.findByText('main.tex:12')).toBeTruthy();
    expect(dialog.getByText('Build sẽ báo thiếu file nếu chưa sửa các dòng này.')).toBeTruthy();
    expect(commits()).toHaveLength(0);
    const field = dialog.getByRole('textbox', { name: 'Đường dẫn mới' });
    await user.clear(field);
    await user.type(field, 'sections/methods.tex');
    await user.click(dialog.getByRole('button', { name: 'Đổi tên' }));

    const banner = within(await screen.findByRole('region', { name: 'Tham chiếu còn trỏ tên cũ' }));
    expect(banner.getByText('Đã đổi sections/method.tex thành sections/methods.tex')).toBeTruthy();
    expect(banner.getByRole('button', { name: 'main.tex:12' })).toBeTruthy();
    expect(banner.getByText('Build sẽ báo thiếu file nếu chưa sửa các dòng này.')).toBeTruthy();
    expect(commits()).toHaveLength(1);
    expect(revision()).toBe(19);
    expect(paths()).toContain('sections/methods.tex');
    expect(paths()).not.toContain('sections/method.tex');
    expect(await pane().findByRole('button', { name: 'methods.tex' })).toBeTruthy();

    // The link opens the line that still points at the old name.
    await user.click(banner.getByRole('button', { name: 'main.tex:12' }));
    await waitFor(() => expect(editorView().state.doc.lineAt(editorView().state.selection.main.head).number).toBe(12));
  });

  it('đường dẫn có ../ bị từ chối (MS-EDITOR-001-AC03, EC08)', async () => {
    const { user } = await openManuscript();
    await user.click(pane().getByRole('button', { name: 'File mới' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Tạo file' }));
    const field = dialog.getByRole('textbox', { name: 'Đường dẫn file' });
    const tryPath = async (path: string, message: string) => {
      await user.clear(field);
      await user.type(field, path);
      await user.click(dialog.getByRole('button', { name: 'Tạo file' }));
      expect((await dialog.findByRole('alert')).textContent).toBe(`${message} Chưa lưu gì.`);
      expect(field.getAttribute('aria-invalid')).toBe('true');
    };
    await tryPath('../x.tex', 'Không dùng .. để ra ngoài thư mục bản thảo.');
    await tryPath('/x.tex', 'Đường dẫn phải tương đối, không bắt đầu bằng /.');
    await tryPath('sections\\x.tex', 'Dùng / để ngăn thư mục, không dùng \\.');
    await tryPath('sections//x.tex', 'Đường dẫn có đoạn rỗng hoặc “.” (ví dụ //).');
    expect(commits()).toHaveLength(0);
    expect(revision()).toBe(18);

    // A 400 for another path shows the server's field error.
    mock.use({
      overrides: {
        commitManuscriptChanges: () => ({
          status: 400,
          body: { type: 'about:blank', title: 'validation_failed', status: 400, code: 'validation_failed', errors: [{ field: 'changes[0].path', code: 'invalid_value', message: 'Tên file có ký tự không cho phép.' }] },
        }),
      },
    });
    await tryPath('sections/bad:name.tex', 'Server từ chối đường dẫn: Tên file có ký tự không cho phép.');
    expect(commits()).toHaveLength(1);
    expect(revision()).toBe(18);
  });

  it('tên trùng (EC09)', async () => {
    const { user } = await openManuscript();
    await user.click(pane().getByRole('button', { name: 'File mới' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Tạo file' }));
    await user.type(dialog.getByRole('textbox', { name: 'Đường dẫn file' }), 'sections/intro.tex');
    await user.click(dialog.getByRole('button', { name: 'Tạo file' }));
    expect((await dialog.findByRole('alert')).textContent).toBe('Đã có file hoặc thư mục với đường dẫn này. Chưa lưu gì.');
    expect(commits()).toHaveLength(0);
  });

  it('xóa thư mục (EC11)', async () => {
    const { user } = await openManuscript();
    await user.click((await menu(user, 'sections/')).getByRole('menuitem', { name: 'Xóa thư mục' }));
    const dialog = within(await screen.findByRole('alertdialog', { name: 'Xóa thư mục sections/ và 2 file trong đó?' }));
    expect(dialog.getByText(/Xóa mềm 2 file trong một revision; .* khôi phục được từ Lịch sử\./)).toBeTruthy();
    expect(await dialog.findByText('main.tex:11')).toBeTruthy();
    expect(dialog.getByText('main.tex:12')).toBeTruthy();
    expect(commits()).toHaveLength(0);
    await user.click(dialog.getByRole('button', { name: 'Xóa' }));

    const banner = within(await screen.findByRole('region', { name: 'Tham chiếu còn trỏ tên cũ' }));
    expect(banner.getByText('Đã xóa sections')).toBeTruthy();
    expect(banner.getByRole('button', { name: 'main.tex:11' })).toBeTruthy();
    // One commit, one revision with both deletes.
    expect(commits()).toHaveLength(1);
    expect(revision()).toBe(19);
    expect(currentSnapshot(rag()).revision.changes.map((change) => `${change.operation} ${change.path}`)).toEqual(['delete sections/intro.tex', 'delete sections/method.tex']);
    await waitFor(() => expect(pane().queryByRole('button', { name: 'intro.tex' })).toBeNull());
  });

  it('references.bib chỉ đọc (EC12)', async () => {
    const { user } = await openManuscript();
    expect(pane().queryByRole('button', { name: 'Thao tác với bibliography/references.bib' })).toBeNull();
    const row = pane().getByRole('button', { name: 'references.bib' }).closest('li')!;
    expect(within(row).getByText('chỉ đọc')).toBeTruthy();
    // Its folder can take new files but cannot be renamed or deleted.
    const folder = await menu(user, 'bibliography/');
    expect(folder.queryByRole('menuitem', { name: 'Đổi tên hoặc di chuyển' })).toBeNull();
    expect(folder.queryByRole('menuitem', { name: 'Xóa thư mục' })).toBeNull();
    expect(folder.getByRole('note').textContent).toBe('Thư mục có references.bib do System sinh: không đổi tên, không xóa.');
    await user.keyboard('{Escape}');

    await user.click(pane().getByRole('button', { name: 'references.bib' }));
    await waitForFile('bibliography/references.bib');
    expect(screen.getByText(/System sinh từ Trusted Reference — không sửa tay/)).toBeTruthy();
    expect(editorView().state.readOnly).toBe(true);
  });

  it('tải lên hình (EC13)', async () => {
    let uploads = 0;
    mock.use({ overrides: { ...otherAreas(), uploadFile: () => { uploads += 1; return { status: 201, body: { fileUploadId: 'f1000000-0000-4000-8000-000000000001', contentHash: 'sha256:x', sizeBytes: 68, mediaType: 'image/png' } }; } } });
    const { user } = await openManuscript();
    await user.click((await menu(user, 'figures/')).getByRole('menuitem', { name: 'Tải lên vào thư mục' }));
    await user.upload(screen.getByLabelText('Chọn file để tải lên'), new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'flow.png', { type: 'image/png' }));

    expect(await screen.findByText('Đã thêm figures/flow.png vào bản thảo.')).toBeTruthy();
    expect(uploads).toBe(1);
    expect(commits()).toHaveLength(1);
    expect(revision()).toBe(19);
    const added = activeFiles(currentSnapshot(rag())).find((row) => row.path === 'figures/flow.png');
    expect(added?.binary).toBe(true);
    expect(await pane().findByRole('button', { name: 'flow.png' })).toBeTruthy();

    // A .tex file is committed with its text (FileChange.content), no upload.
    await user.click(pane().getByRole('button', { name: 'Tải lên' }));
    await user.upload(screen.getByLabelText('Chọn file để tải lên'), new File(['\\section{Appendix}\n'], 'appendix.tex', { type: 'text/x-tex' }));
    expect(await screen.findByText('Đã thêm appendix.tex vào bản thảo.')).toBeTruthy();
    expect(uploads).toBe(1);
    expect(activeFiles(currentSnapshot(rag())).find((row) => row.path === 'appendix.tex')?.content).toBe('\\section{Appendix}\n');
    expect(revision()).toBe(20);
  });

  it('tải lên quá lớn (EC13)', async () => {
    mock.use({
      overrides: {
        ...otherAreas(),
        uploadFile: () => ({ status: 413, body: { type: 'about:blank', title: 'payload_too_large', status: 413, code: 'payload_too_large', detail: 'Giới hạn 20 MB.' } }),
      },
    });
    const { user } = await openManuscript();
    await user.click(pane().getByRole('button', { name: 'Tải lên' }));
    await user.upload(screen.getByLabelText('Chọn file để tải lên'), new File([new Uint8Array(16)], 'scan.png', { type: 'image/png' }));
    expect(await screen.findByText('File quá lớn')).toBeTruthy();
    expect(screen.getByText(/File vượt giới hạn tải lên của server/)).toBeTruthy();
    expect(screen.getByText('Không có revision nào được tạo.')).toBeTruthy();
    expect(commits()).toHaveLength(0);
    expect(revision()).toBe(18);
  });

  it('thư mục rỗng (EC14)', async () => {
    const first = await openManuscript();
    await first.user.click(pane().getByRole('button', { name: 'Thư mục mới' }));
    let dialog = within(await screen.findByRole('dialog', { name: 'Tạo thư mục' }));
    expect(dialog.getByText(/thư mục mới chỉ có ở màn này tới khi bạn thêm file đầu tiên/)).toBeTruthy();
    await first.user.type(dialog.getByRole('textbox', { name: 'Đường dẫn thư mục' }), 'drafts');
    await first.user.click(dialog.getByRole('button', { name: 'Tạo thư mục' }));
    const folder = await pane().findByRole('group', { name: 'drafts/' });
    expect(within(folder).getByText('Thư mục trống')).toBeTruthy();
    expect(commits()).toHaveLength(0);

    // Reloading the screen drops a folder without files.
    first.unmount();
    const second = await openManuscript();
    expect(pane().queryByRole('group', { name: 'drafts/' })).toBeNull();

    // A folder gets its first file: one revision, the folder stays.
    await second.user.click(pane().getByRole('button', { name: 'Thư mục mới' }));
    dialog = within(await screen.findByRole('dialog', { name: 'Tạo thư mục' }));
    await second.user.type(dialog.getByRole('textbox', { name: 'Đường dẫn thư mục' }), 'appendix');
    await second.user.click(dialog.getByRole('button', { name: 'Tạo thư mục' }));
    await second.user.click((await menu(second.user, 'appendix/')).getByRole('menuitem', { name: 'Tạo file trong thư mục' }));
    dialog = within(await screen.findByRole('dialog', { name: 'Tạo file' }));
    const field = dialog.getByRole('textbox', { name: 'Đường dẫn file' }) as HTMLInputElement;
    expect(field.value).toBe('appendix/');
    await second.user.type(field, 'tables.tex');
    await second.user.click(dialog.getByRole('button', { name: 'Tạo file' }));
    await waitForFile('appendix/tables.tex');
    expect(revision()).toBe(19);
    expect(paths()).toContain('appendix/tables.tex');
    expect(within(pane().getByRole('group', { name: 'appendix/' })).getByRole('button', { name: 'tables.tex' })).toBeTruthy();
  });

  it('xem hình (EC15)', async () => {
    const store = testStore();
    commit(store, rag(), [{ path: 'data/raw.bin', operation: 'add', fileUploadId: 'f1000000-0000-4000-8000-000000000002' }], { createdBy: { type: 'researcher' }, source: 'direct_edit' });
    const { user } = await openManuscript();
    await user.click(pane().getByRole('button', { name: 'prisma.png' }));
    const figure = await screen.findByRole('figure');
    expect(within(figure).getByText('figures/prisma.png')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Nội dung figures/prisma.png' })).toBeNull();

    await user.click(pane().getByRole('button', { name: 'raw.bin' }));
    expect(await screen.findByText('Không xem trước được data/raw.bin. File vẫn được build và export.')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Nội dung data/raw.bin' })).toBeNull();
  });

  it('file đang sửa không đổi tên được (EC17)', async () => {
    const { user } = await openManuscript();
    typeInEditor('\\documentclass{article}\n% sửa dở\n');
    const items = await menu(user, 'main.tex');
    expect((items.getByRole('menuitem', { name: 'Đổi tên hoặc di chuyển' }) as HTMLButtonElement).disabled).toBe(true);
    expect((items.getByRole('menuitem', { name: 'Xóa file' }) as HTMLButtonElement).disabled).toBe(true);
    expect(items.getByRole('note').textContent).toBe('Lưu hoặc bỏ thay đổi trước');
    // The tree marks the unsaved file.
    expect(within(pane().getByRole('button', { name: /^main\.tex/ })).getByLabelText('chưa lưu')).toBeTruthy();
    expect(commits()).toHaveLength(0);
  });

  it('dàn ý theo thứ tự \\input, mở đúng dòng', async () => {
    const { user } = await openManuscript();
    const outline = within(pane().getByRole('region', { name: 'Dàn ý' }));
    const items = await outline.findAllByRole('button');
    expect(items.map((item) => item.textContent)).toEqual(['1Introduction', '2Method']);
    await user.click(outline.getByRole('button', { name: '2Method' }));
    await waitForFile('sections/method.tex');
    await waitFor(() => expect(editorView().state.doc.lineAt(editorView().state.selection.main.head).number).toBe(1));
  });
});
