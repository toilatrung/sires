// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00115 S04: editing and saving on the mock of PID-00013 — one commit = one revision (H6), the 409 rules of H7,
// the shell's draft store and the restore banner (H8), revision events (H19). Names follow specs/acceptance.html
// and specs/scope.html.

import { waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { feature } from '.';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { RAG } from './__mocks__/fixtures';
import { editorText, main, openManuscript, otherAreas, renderManuscript, stopEvents, typeInEditor, waitForFile, wireEvents } from './__mocks__/render';
import { activeFiles, currentSnapshot, resetManuscriptStore, serverEdit, testStore } from './__mocks__/store';

const mock = useMockServer({ features: [feature] });

beforeEach(() => {
  resetManuscriptStore();
  localStorage.clear();
  mock.use({ overrides: otherAreas() });
});
afterEach(() => stopEvents());

const rag = () => testStore().projects.get(RAG)!;
const serverText = (path: string) => activeFiles(currentSnapshot(rag())).find((row) => row.path === path)!.content;
const saveButton = () => main().getByRole('button', { name: 'Lưu' });

async function openFile(user: ReturnType<typeof renderManuscript>['user'], path: string) {
  const files = main().getByRole('region', { name: 'Tệp và dàn ý' });
  const name = path.split('/').pop()!.replace(/[.]/g, '\\.');
  const button = within(files).getAllByRole('button', { name: new RegExp(`^${name}`) })[0]!;
  await user.click(button);
  await waitForFile(path);
}

describe('editor, lưu và nháp (S04)', () => {
  it('lưu nhiều file một revision (H6, EC16)', async () => {
    const { user } = await openManuscript();
    // Nothing changed: Ctrl+S and Lưu send nothing.
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
    await user.keyboard('{Control>}s{/Control}');
    expect(rag().manuscript.currentRevisionNumber).toBe(18);

    typeInEditor(`${editorText()}% main\n`);
    await openFile(user, 'sections/method.tex');
    typeInEditor(`${editorText()}% method\n`);
    expect(await main().findByText(/2 file chưa lưu/)).toBeTruthy();
    await user.click(saveButton());
    await waitFor(() => expect(rag().manuscript.currentRevisionNumber).toBe(19));
    const revision = currentSnapshot(rag()).revision;
    expect(revision.changes.map((change) => change.path).sort()).toEqual(['main.tex', 'sections/method.tex']);
    expect(revision.source).toBe('direct_edit');
    expect(serverText('main.tex')).toContain('% main');
    expect(await main().findByText(/đã lưu/)).toBeTruthy();
    expect(main().getByText('revision 19')).toBeTruthy();
  });

  it('tự gửi lại khi chỉ file khác đổi (H7, EC18)', async () => {
    const { user } = await openManuscript();
    typeInEditor(`${editorText()}% của tôi\n`);
    // System regenerates references.bib meanwhile: a newer revision, my file unchanged.
    serverEdit(testStore(), rag(), 'bibliography/references.bib', `${serverText('bibliography/references.bib')}\n`);
    await user.click(saveButton());
    await waitFor(() => expect(rag().manuscript.currentRevisionNumber).toBe(20));
    expect(serverText('main.tex')).toContain('% của tôi');
    expect(main().queryByRole('region', { name: 'Xung đột khi lưu' })).toBeNull();
    expect(main().queryByText('Chưa lưu được')).toBeNull();
  });

  it('xung đột khi file đã đổi (H7, UX-STATE-004, EC19)', async () => {
    const { user } = await openManuscript();
    const mine = `${editorText()}% bản của tôi\n`;
    typeInEditor(mine);
    serverEdit(testStore(), rag(), 'main.tex', `${serverText('main.tex')}% bản ở tab khác\n`);
    await user.click(saveButton());
    const box = await main().findByRole('region', { name: 'Xung đột khi lưu' });
    expect(within(box).getByText('main.tex đã đổi trên server')).toBeTruthy();
    // Researcher actions of the signed-in account show its own name (design.md §6).
    expect(within(box).getByText(/Đổi ở revision 19 \(Nguyễn Thị Minh Anh\)\./)).toBeTruthy();
    expect(rag().manuscript.currentRevisionNumber).toBe(19);
    expect(editorText()).toBe(mine);

    await user.click(within(box).getByRole('button', { name: 'Xem khác biệt' }));
    const diff = within(box).getByLabelText('Khác biệt giữa bản trên server và bản của bạn');
    expect(diff.textContent).toContain('− % bản ở tab khác');
    expect(diff.textContent).toContain('+ % bản của tôi');

    await user.click(within(box).getByRole('button', { name: 'Giữ bản của tôi' }));
    expect(main().queryByRole('region', { name: 'Xung đột khi lưu' })).toBeNull();
    await user.click(saveButton());
    await waitFor(() => expect(rag().manuscript.currentRevisionNumber).toBe(20));
    expect(serverText('main.tex')).toBe(mine);
  });

  it('dùng bản trên server khi xung đột (H7, EC19)', async () => {
    const { user } = await openManuscript();
    typeInEditor(`${editorText()}% bỏ đi\n`);
    const theirs = `${serverText('main.tex')}% của họ\n`;
    serverEdit(testStore(), rag(), 'main.tex', theirs);
    await user.click(saveButton());
    const box = await main().findByRole('region', { name: 'Xung đột khi lưu' });
    await user.click(within(box).getByRole('button', { name: 'Dùng bản trên server' }));
    await waitFor(() => expect(editorText()).toBe(theirs));
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('lưu lỗi giữ nội dung (DATA-IDEMP-001, UX-STATE-003, EC20)', async () => {
    const keys: string[] = [];
    mock.use({ overrides: { commitManuscriptChanges: ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key') ?? '');
      return { status: 503 } as never;
    } } });
    const { user } = await openManuscript();
    const mine = `${editorText()}% giữ lại\n`;
    typeInEditor(mine);
    await user.click(saveButton());
    expect(await main().findByText('Chưa lưu được')).toBeTruthy();
    expect(main().getAllByText(/503|service_unavailable|http_error/).length).toBeGreaterThan(0);
    expect(editorText()).toBe(mine);
    await user.click(main().getByRole('button', { name: 'Lưu lại' }));
    await waitFor(() => expect(keys.length).toBe(2));
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    expect(editorText()).toBe(mine);
  });

  it('đề nghị khôi phục nháp (UX-STATE-004-AC01, EC21)', async () => {
    const first = await openManuscript();
    const original = editorText();
    typeInEditor(`${original}% nháp chưa lưu\n`);
    await main().findByText(/1 file chưa lưu/);
    // Leave the screen (or lose the connection) and come back.
    first.unmount();
    const { user } = await openManuscript();
    const banner = await main().findByRole('region', { name: 'Thay đổi chưa lưu' });
    expect(within(banner).getByText('Có thay đổi chưa lưu từ lần trước')).toBeTruthy();
    expect(editorText()).toBe(original);
    await user.click(within(banner).getByRole('button', { name: 'Khôi phục' }));
    await waitFor(() => expect(editorText()).toContain('% nháp chưa lưu'));
    expect(main().queryByRole('region', { name: 'Thay đổi chưa lưu' })).toBeNull();

  });

  it('bỏ nháp giữ bản trên server (UX-STATE-004-AC01, EC21)', async () => {
    const first = await openManuscript();
    const original = editorText();
    typeInEditor(`${original}% nháp\n`);
    await main().findByText(/1 file chưa lưu/);
    first.unmount();
    const second = await openManuscript();
    const banner = await main().findByRole('region', { name: 'Thay đổi chưa lưu' });
    await second.user.click(within(banner).getByRole('button', { name: 'Bỏ nháp' }));
    expect(main().queryByRole('region', { name: 'Thay đổi chưa lưu' })).toBeNull();
    expect(editorText()).toBe(original);
    second.unmount();
    const reopened = await openManuscript();
    expect(main().queryByRole('region', { name: 'Thay đổi chưa lưu' })).toBeNull();
    reopened.unmount();
  });

  it('nháp trên bản cũ (H8, EC22)', async () => {
    const first = await openManuscript();
    typeInEditor(`${editorText()}% nháp cũ\n`);
    await main().findByText(/1 file chưa lưu/);
    first.unmount();
    serverEdit(testStore(), rag(), 'main.tex', `${serverText('main.tex')}% đổi sau đó\n`);
    const { user } = await openManuscript();
    const banner = await main().findByRole('region', { name: 'Thay đổi chưa lưu' });
    expect(within(banner).getByText(/file đã đổi trên server sau đó/)).toBeTruthy();
    await user.click(within(banner).getByRole('button', { name: 'Khôi phục' }));
    await waitFor(() => expect(editorText()).toContain('% nháp cũ'));
    await user.click(saveButton());
    // Saving a draft made on the older version goes through the conflict of EC19.
    expect(await main().findByRole('region', { name: 'Xung đột khi lưu' })).toBeTruthy();
    expect(rag().manuscript.currentRevisionNumber).toBe(19);
  });

  it('sự kiện revision (H19, EC24)', async () => {
    wireEvents(mock);
    const { user } = await openManuscript();
    await openFile(user, 'sections/method.tex');
    const mine = `${editorText()}% đang sửa method\n`;
    typeInEditor(mine);
    // Another tab saves main.tex and method.tex: one new revision.
    const main19 = `${serverText('main.tex')}% tab khác\n`;
    testStore();
    serverEdit(testStore(), rag(), 'main.tex', main19);
    expect(await main().findByText('revision 19')).toBeTruthy();
    // The file with unsaved changes keeps them; the clean one shows the new server text.
    expect(editorText()).toBe(mine);
    await openFile(user, 'main.tex');
    await waitFor(() => expect(editorText()).toBe(main19));
  });
});

describe('editor khi tải lại trang', () => {
  it('mở file theo đường dẫn trong URL (H11)', async () => {
    renderManuscript(`/projects/${RAG}/manuscript/sections/intro.tex`);
    await waitForFrame();
    await waitForFile('sections/intro.tex');
    expect(editorText()).toContain('\\section{Introduction}');
  });
});
