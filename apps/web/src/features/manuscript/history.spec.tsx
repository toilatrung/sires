// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00115 S07: revision history, comparing two revisions, restoring a file, provenance (H14). Names follow
// specs/acceptance.html and specs/scope.html.

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { feature } from '.';
import { demoFixtures } from '../../shell/mock';
import { agent, projects, researcher } from '../../shell/mock/fixtures/ids';
import { useMockServer } from '../../shell/mock/node';
import { CLAIMS, demoProposals, METHOD_R18, PRISMA_PNG_BASE64, proposalId, RAG, WRITING_TASK, WRITING_WORKFLOW } from './__mocks__/fixtures';
import { editorText, main, openManuscript, otherAreas, projectPath, typeInEditor } from './__mocks__/render';
import { activeFiles, commit, currentSnapshot, initProject, resetManuscriptStore, testStore } from './__mocks__/store';

const mock = useMockServer({ features: [feature] });
const ACCOUNT_NAME = demoFixtures.Account?.[0]?.profile.displayName ?? 'Researcher';

beforeEach(() => {
  resetManuscriptStore();
});

const rag = () => testStore().projects.get(RAG)!;
const edit = (path: string, content: string, projectId = RAG) =>
  commit(testStore(), testStore().projects.get(projectId)!, [{ path, operation: 'modify', content }], { createdBy: researcher, source: 'direct_edit' });

async function openHistory(path = projectPath(), file = 'main.tex') {
  mock.use({ overrides: otherAreas() });
  const view = await openManuscript(path, file);
  await view.user.click(main().getByRole('tab', { name: 'Lịch sử' }));
  await main().findByRole('list', { name: 'Lịch sử revision' });
  return view;
}

const historyList = () => main().getByRole('list', { name: 'Lịch sử revision' });
const rowOf = (n: number) => within(historyList()).getByRole('checkbox', { name: `Chọn r${n} để so sánh` }).closest('li') as HTMLElement;
const compareButton = () => main().getByRole('button', { name: /^So sánh/ });

describe('Lịch sử revision (S07)', () => {
  it('so sánh hai revision (UX-MS-006-AC01)', async () => {
    const { user } = await openHistory();
    expect(within(rowOf(18)).getByText(`· ${ACCOUNT_NAME} ·`, { exact: false })).toBeTruthy();
    expect(within(rowOf(18)).getByText('Sửa trực tiếp · method.tex')).toBeTruthy();
    expect(within(rowOf(17)).getByText('Proposal đã chấp nhận · T-2.1')).toBeTruthy();
    expect(within(rowOf(15)).getByText('Khởi tạo Default')).toBeTruthy();
    await user.click(within(historyList()).getByRole('checkbox', { name: 'Chọn r16 để so sánh' }));
    await user.click(within(historyList()).getByRole('checkbox', { name: 'Chọn r18 để so sánh' }));
    await user.click(main().getByRole('button', { name: 'So sánh r16 ↔ r18' }));
    const compare = await main().findByRole('region', { name: 'So sánh r16 ↔ r18' });
    // Each side names its actor and source.
    const sides = compare.querySelectorAll('.msh-side');
    expect(sides[0]!.textContent).toContain(`r16 · ${ACCOUNT_NAME} ·`);
    expect(sides[0]!.textContent).toContain('Sửa trực tiếp · main.tex');
    expect(sides[1]!.textContent).toContain(`r18 · ${ACCOUNT_NAME} ·`);
    expect(sides[1]!.textContent).toContain('Sửa trực tiếp · method.tex');
    const method = await within(compare).findByRole('region', { name: 'sections/method.tex' });
    const diff = within(method).getByLabelText('Khác biệt của sections/method.tex');
    expect(diff.textContent).toContain('− % Mô tả phương pháp ở đây.');
    expect(diff.textContent).toContain('+ We compare five frameworks that check citations against the cited source.');
    expect(within(method).getByText('Đã đổi')).toBeTruthy();
    // Restore is offered towards the older side only (the newer one is the current revision).
    expect(within(method).getByRole('button', { name: 'Khôi phục file này về r16' })).toBeTruthy();
    expect(within(method).queryByRole('button', { name: 'Khôi phục file này về r18' })).toBeNull();
  });

  it('revision mới sau khi lưu (MS-EDITOR-001-AC02)', async () => {
    mock.use({ overrides: otherAreas() });
    const { user } = await openManuscript();
    typeInEditor(`${editorText()}% sửa ở main\n`);
    await user.click(main().getByRole('button', { name: 'Lưu' }));
    await main().findByText('revision 19');
    await user.click(main().getByRole('tab', { name: 'Lịch sử' }));
    const list = await main().findByRole('list', { name: 'Lịch sử revision' });
    const first = within(list).getAllByRole('listitem')[0]!;
    expect(first.querySelector('.msh-row__line')!.textContent).toMatch(new RegExp(`^r19 · ${ACCOUNT_NAME} · \\d{2}:\\d{2}$`));
    expect(within(first).getByText('Sửa trực tiếp · main.tex')).toBeTruthy();
  });

  it('khôi phục file (MS-REVISION-001-AC01)', async () => {
    // A project at r8 whose main.tex at r3 differs from r8.
    const store = testStore();
    const pm = initProject(store, projects.learning, 'Default', 'pdflatex');
    for (let n = 2; n <= 8; n += 1) edit('main.tex', `\\documentclass{article}\n% bản r${n}\n`, projects.learning);
    const r3 = pm.revisions[2]!;
    const { user } = await openHistory(projectPath(projects.learning));
    await user.click(within(historyList()).getByRole('checkbox', { name: 'Chọn r3 để so sánh' }));
    await user.click(within(historyList()).getByRole('checkbox', { name: 'Chọn r8 để so sánh' }));
    await user.click(main().getByRole('button', { name: 'So sánh r3 ↔ r8' }));
    const file = await main().findByRole('region', { name: 'main.tex' });
    await user.click(within(file).getByRole('button', { name: 'Khôi phục file này về r3' }));
    expect(await main().findByText('Đã khôi phục main.tex về r3 trong revision r9. Các revision cũ vẫn còn.')).toBeTruthy();
    // commitManuscriptChanges sent modify with the text of r3: the current main.tex equals r3's.
    const now = currentSnapshot(pm);
    expect(now.revision.revisionNumber).toBe(9);
    expect(now.revision.changes).toEqual([expect.objectContaining({ path: 'main.tex', operation: 'modify' })]);
    const text = (snapshot: typeof now) => activeFiles(snapshot).find((row) => row.path === 'main.tex')!.content;
    expect(text(now)).toBe(text(r3));
    await waitFor(() => expect(within(historyList()).getAllByRole('listitem')[0]!.querySelector('.msh-row__line')!.textContent).toMatch(new RegExp(`^r9 · ${ACCOUNT_NAME} ·`)));
    for (let n = 4; n <= 8; n += 1) expect(rowOf(n)).toBeTruthy();
  });

  it('điều hướng provenance (MS-REVISION-001-AC02)', async () => {
    const { user } = await openHistory();
    await user.click(within(rowOf(17)).getByRole('button', { name: 'Xem r17' }));
    const detail = await main().findByRole('region', { name: 'Revision r17' });
    const task = await within(detail).findByRole('link', { name: 'Task T-2.1' });
    expect(task.getAttribute('href')).toBe(`/projects/${RAG}/tasks/${WRITING_TASK}`);
    const run = await within(detail).findByRole('link', { name: 'Agent Run · Writing Agent' });
    expect(run.getAttribute('href')).toBe(`/projects/${RAG}/activity/workflows/${WRITING_WORKFLOW}`);
    await waitFor(() => {
      const claims = within(detail).getAllByRole('link').filter((link) => link.getAttribute('href')?.includes('/evidence/claims/'));
      expect(claims.map((link) => link.getAttribute('href'))).toEqual(CLAIMS.map((claimId) => `/projects/${RAG}/evidence/claims/${claimId}`));
    });
    await user.click(within(detail).getByRole('link', { name: 'Task T-2.1' }));
    await waitFor(() => expect(window.location.pathname === `/projects/${RAG}/tasks/${WRITING_TASK}` || screen.queryByRole('region', { name: 'Revision r17' }) === null).toBe(true));
  });

  it('so sánh có file nhị phân (EC40)', async () => {
    const pm = rag();
    const revision = commit(testStore(), pm, [
      { path: 'figures/flow.png', operation: 'add', fileUploadId: 'e0000000-0000-4000-8000-000000000001' },
      { path: 'sections/method.tex', operation: 'delete' },
      { path: 'sections/related.tex', operation: 'add', content: '\\section{Related Work}\nRAG systems.\n' },
    ], { createdBy: researcher, source: 'direct_edit' });
    // The figure itself changed too (another upload in the same revision).
    const prisma = [...currentSnapshot(pm).files.values()].find((row) => row.path === 'figures/prisma.png')!;
    prisma.content = `${PRISMA_PNG_BASE64.slice(0, -4)}AAAA`;
    prisma.updatedInRevision = revision.revisionNumber;
    const { user } = await openHistory();
    await user.click(within(historyList()).getByRole('checkbox', { name: 'Chọn r18 để so sánh' }));
    await user.click(within(historyList()).getByRole('checkbox', { name: 'Chọn r19 để so sánh' }));
    await user.click(main().getByRole('button', { name: 'So sánh r18 ↔ r19' }));
    const compare = await main().findByRole('region', { name: 'So sánh r18 ↔ r19' });
    const figure = await within(compare).findByRole('region', { name: 'figures/prisma.png' });
    expect(within(figure).getByText('File nhị phân — đã đổi, không so sánh theo dòng.')).toBeTruthy();
    expect(within(figure).queryByLabelText(/^Khác biệt của/)).toBeNull();
    const added = within(compare).getByRole('region', { name: 'figures/flow.png' });
    expect(within(added).getByText('Thêm ở r19')).toBeTruthy();
    expect(within(added).getByText('File nhị phân — đã đổi, không so sánh theo dòng.')).toBeTruthy();
    const deleted = within(compare).getByRole('region', { name: 'sections/method.tex' });
    expect(within(deleted).getByText('Xóa ở r19')).toBeTruthy();
    const removedLines = within(deleted).getByLabelText('Khác biệt của sections/method.tex').querySelectorAll('[data-kind]');
    expect([...removedLines].every((line) => line.getAttribute('data-kind') === 'del')).toBe(true);
    expect(removedLines.length).toBe(METHOD_R18.split('\n').length);
    const related = within(compare).getByRole('region', { name: 'sections/related.tex' });
    const addedLines = [...within(related).getByLabelText('Khác biệt của sections/related.tex').querySelectorAll('[data-kind]')];
    expect(addedLines.every((line) => line.getAttribute('data-kind') === 'add')).toBe(true);
    expect(addedLines[0]!.textContent).toContain('+ \\section{Related Work}');
  });

  it('chọn đúng hai (EC41, EC55)', async () => {
    const { user } = await openHistory();
    expect(compareButton().hasAttribute('disabled')).toBe(true);
    expect(main().getByText('Chọn đúng hai revision để so sánh (đang chọn 0).')).toBeTruthy();
    // Keyboard only: focus a checkbox and press Space.
    const r18 = within(historyList()).getByRole('checkbox', { name: 'Chọn r18 để so sánh' });
    r18.focus();
    await user.keyboard(' ');
    expect((r18 as HTMLInputElement).checked).toBe(true);
    expect(compareButton().hasAttribute('disabled')).toBe(true);
    expect(main().getByText('Chọn đúng hai revision để so sánh (đang chọn 1).')).toBeTruthy();
    within(historyList()).getByRole('checkbox', { name: 'Chọn r16 để so sánh' }).focus();
    await user.keyboard(' ');
    // Older side first, whatever the order of selection.
    const ready = main().getByRole('button', { name: 'So sánh r16 ↔ r18' });
    expect(ready.hasAttribute('disabled')).toBe(false);
    expect(main().queryByText(/^Chọn đúng hai revision/)).toBeNull();
    await user.click(within(historyList()).getByRole('checkbox', { name: 'Chọn r15 để so sánh' }));
    expect(compareButton().hasAttribute('disabled')).toBe(true);
    expect(compareButton().textContent).toBe('So sánh');
    expect(main().getByText('Chọn đúng hai revision để so sánh (đang chọn 3).')).toBeTruthy();
    await user.click(within(historyList()).getByRole('checkbox', { name: 'Chọn r15 để so sánh' }));
    main().getByRole('button', { name: 'So sánh r16 ↔ r18' }).focus();
    await user.keyboard('{Enter}');
    expect(await main().findByRole('region', { name: 'So sánh r16 ↔ r18' })).toBeTruthy();
  });

  it('khôi phục file đã xóa (EC42)', async () => {
    const pm = rag();
    commit(testStore(), pm, [{ path: 'sections/method.tex', operation: 'delete' }], { createdBy: researcher, source: 'direct_edit' });
    const { user } = await openHistory();
    // Unsaved change on main.tex: restoring main.tex is off, with the reason.
    typeInEditor(`${editorText()}% chưa lưu\n`);
    await user.click(within(rowOf(17)).getByRole('button', { name: 'Xem r17' }));
    let detail = await main().findByRole('region', { name: 'Revision r17' });
    const buttons = await within(detail).findAllByRole('button', { name: 'Khôi phục file này về r17' });
    const forMain = buttons.find((button) => button.closest('li')?.textContent?.includes('main.tex'))!;
    expect(forMain.hasAttribute('disabled')).toBe(true);
    expect(within(forMain.closest('li')!).getByText('Lưu hoặc bỏ thay đổi của file này trước.')).toBeTruthy();
    await user.click(within(detail).getByRole('button', { name: 'Quay lại danh sách' }));
    // Binary file: off, with the reason (N6).
    await user.click(within(rowOf(15)).getByRole('button', { name: 'Xem r15' }));
    detail = await main().findByRole('region', { name: 'Revision r15' });
    const figure = (await within(detail).findByText('figures/prisma.png')).closest('li') as HTMLElement;
    await waitFor(() => expect(within(figure).getByRole('button', { name: 'Khôi phục file này về r15' }).hasAttribute('disabled')).toBe(true));
    expect(within(figure).getByText('Chưa khôi phục được file nhị phân; tải lên lại bản cần dùng.')).toBeTruthy();
    await user.click(within(detail).getByRole('button', { name: 'Quay lại danh sách' }));
    // Deleted since r18: restoring sends add.
    await user.click(within(rowOf(18)).getByRole('button', { name: 'Xem r18' }));
    detail = await main().findByRole('region', { name: 'Revision r18' });
    const method = (await within(detail).findByText('sections/method.tex')).closest('li') as HTMLElement;
    await user.click(await within(method).findByRole('button', { name: 'Khôi phục file này về r18' }));
    expect(await main().findByText('Đã khôi phục sections/method.tex về r18 trong revision r20. Các revision cũ vẫn còn.')).toBeTruthy();
    const now = currentSnapshot(pm);
    expect(now.revision.changes).toEqual([expect.objectContaining({ path: 'sections/method.tex', operation: 'add' })]);
    expect(activeFiles(now).find((row) => row.path === 'sections/method.tex')!.content).toBe(METHOD_R18);
  });

  it('tải thêm (EC43)', async () => {
    const store = testStore();
    const pm = rag();
    // r19 comes from a proposal without Task; then 24 direct edits up to r43.
    const accepted = { ...structuredClone(demoProposals()[3]!), id: proposalId(50) };
    delete accepted.taskId;
    delete accepted.provenance.taskId;
    pm.proposals.push(accepted);
    commit(store, pm, [{ path: 'sections/intro.tex', operation: 'modify', content: '\\section{Introduction}\nKhông có Task.\n' }], {
      createdBy: agent('writing', 70), source: 'change_proposal', changeProposalId: accepted.id,
    });
    for (let n = 20; n <= 43; n += 1) edit('main.tex', `% bản r${n}\n`);
    const { user } = await openHistory();
    expect(within(historyList()).getAllByRole('listitem')).toHaveLength(20);
    expect(within(historyList()).queryByRole('checkbox', { name: 'Chọn r19 để so sánh' })).toBeNull();
    await user.click(main().getByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => expect(within(historyList()).getAllByRole('listitem')).toHaveLength(29));
    expect(main().queryByRole('button', { name: 'Tải thêm' })).toBeNull();
    expect(within(rowOf(19)).getByText('Proposal đã chấp nhận')).toBeTruthy();
    await user.click(within(rowOf(19)).getByRole('button', { name: 'Xem r19' }));
    const detail = await main().findByRole('region', { name: 'Revision r19' });
    expect(await within(detail).findByRole('link', { name: 'Agent Run · Writing Agent' })).toBeTruthy();
    await waitFor(() => expect(within(detail).getAllByRole('link').filter((link) => link.getAttribute('href')?.includes('/evidence/claims/'))).toHaveLength(2));
    expect(within(detail).queryByRole('link', { name: /^Task / })).toBeNull();
  });
});
