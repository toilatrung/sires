// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00115 S05: citations in the editor on the mock of PID-00013 (H10) — suggestions from the bibliography and the
// project's Trusted References, a new entry when choosing a reference without one, marks and tooltips of unresolved
// and revoked keys. Names follow specs/acceptance.html and specs/scope.html.

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { feature } from '.';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { RAG } from './__mocks__/fixtures';
import { cursorAt, editorText, editorView, insertInEditor, main, otherAreas, projectPath, renderManuscript, waitForFile } from './__mocks__/render';
import { resetManuscriptStore, testStore } from './__mocks__/store';

const mock = useMockServer({ features: [feature] });

beforeEach(() => {
  resetManuscriptStore();
  localStorage.clear();
  mock.use({ overrides: otherAreas() });
});

const rag = () => testStore().projects.get(RAG)!;

async function openIntro() {
  const view = renderManuscript(projectPath(RAG, '/sections/intro.tex'));
  await waitForFrame();
  await waitForFile('sections/intro.tex');
  // Marks appear once the bibliography is loaded.
  await waitFor(() => expect(document.querySelector('[data-cite="unresolved"]')).toBeTruthy());
  return view;
}

const suggestions = () => screen.findByRole('listbox', { name: 'Gợi ý citation' });
const tooltip = () => screen.findByRole('tooltip');

describe('citation trong editor (S05)', () => {
  it('gợi ý smith2020 (UX-MS-001-AC01, EC28)', async () => {
    let added = 0;
    const { user } = await openIntro();
    mock.events.reset();
    insertInEditor('\n\\cite{smi');
    const list = await suggestions();
    const option = within(list).getByRole('option', { name: /smith2020/ });
    expect(option.textContent).toContain('Measuring Citation Accuracy in Generated Reviews');
    const before = rag().bibliography.length;
    await user.click(option);
    await waitFor(() => expect(editorText()).toContain('\\cite{smith2020'));
    added = rag().bibliography.length - before;
    expect(added).toBe(1);
    expect(rag().bibliography.at(-1)!.bibtexKey).toBe('smith2020');
    // System regenerated references.bib in a new revision; my save goes through EC18 and succeeds.
    expect(rag().manuscript.currentRevisionNumber).toBe(19);
    await user.click(main().getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(rag().manuscript.currentRevisionNumber).toBe(20));
    expect(main().queryByRole('region', { name: 'Xung đột khi lưu' })).toBeNull();
  });

  it('chọn reference chưa có entry gọi addBibliographyEntry một lần (EC28)', async () => {
    const calls: string[] = [];
    mock.use({ overrides: otherAreas({ addBibliographyEntry: ({ body }) => {
      calls.push(body?.referenceId ?? '');
      const entry = { id: 'e3000000-0000-4000-8000-000000000044', manuscriptId: rag().manuscript.id, bibtexKey: 'smith2020', referenceId: body!.referenceId, referenceApprovalStatus: 'Trusted' as const, bibtex: '@article{smith2020}', generatedFromMetadataVersion: 1 };
      return { status: 201, body: entry };
    } }) });
    const { user } = await openIntro();
    insertInEditor('\n\\citep{smi');
    await user.click(within(await suggestions()).getByRole('option', { name: /smith2020/ }));
    await waitFor(() => expect(editorText()).toContain('\\citep{smith2020'));
    expect(calls.length).toBe(1);
  });

  it('reference không trusted (EC28)', async () => {
    mock.use({ overrides: otherAreas({ addBibliographyEntry: () => ({ status: 422, body: { type: 'about:blank', title: 'reference_not_trusted', status: 422, code: 'reference_not_trusted' } }) }) });
    const { user } = await openIntro();
    insertInEditor('\n\\cite{smi');
    await user.click(within(await suggestions()).getByRole('option', { name: /smith2020/ }));
    expect(await main().findByText('Chưa thêm được tài liệu vào bibliography')).toBeTruthy();
    expect(main().getByText('Reference này chưa là Trusted Reference của project.')).toBeTruthy();
    expect(editorText()).toContain('\\cite{smi');
    expect(editorText()).not.toContain('smith2020');
  });

  it('key không phân giải (UX-MS-005-AC01, EC26)', async () => {
    await openIntro();
    const mark = document.querySelector('[data-key="gao2023survy"]');
    expect(mark?.getAttribute('data-cite')).toBe('unresolved');
    expect(mark?.className).toContain('ms-cite--unresolved');
    // Resolved keys are not marked.
    expect(document.querySelector('[data-key="lewis2020rag"]')?.getAttribute('data-cite')).toBe('ok');
    cursorAt('gao2023survy', 3);
    const tip = await tooltip();
    expect(within(tip).getByText('Citation không phân giải: gao2023survy')).toBeTruthy();
    expect(tip.textContent).toContain('Không có Trusted Reference với key này trong project.');
    expect(tip.textContent).toContain('Gợi ý: gao2023survey');
  });

  it('rê chuột vào key hiện tooltip (UX-MS-005-AC01)', async () => {
    const { user } = await openIntro();
    await user.hover(document.querySelector('[data-key="gao2023survy"]')!);
    expect(within(await tooltip()).getByText('Citation không phân giải: gao2023survy')).toBeTruthy();
  });

  it('reference bị thu hồi (MS-BIB-001-AC03, EC27)', async () => {
    await openIntro();
    const mark = document.querySelector('[data-key="doe2023hd"]');
    expect(mark?.getAttribute('data-cite')).toBe('revoked');
    cursorAt('doe2023hd', 2);
    const tip = await tooltip();
    expect(within(tip).getByText('Reference đã bị thu hồi: doe2023hd')).toBeTruthy();
    expect(tip.textContent).toContain('Revoked');
    // Not suggested.
    insertInEditor('\n\\cite{doe');
    expect(await screen.findByText('Không có key khớp “doe”')).toBeTruthy();
    expect(screen.queryByRole('option', { name: /doe2023hd/ })).toBeNull();
  });

  it('gợi ý trống (design.md §4, EC29)', async () => {
    mock.use({ overrides: otherAreas({
      listProjectReferences: () => ({ status: 200, body: { items: [] } }),
      listBibliography: () => ({ status: 200, body: { items: [] } }),
    }) });
    renderManuscript(projectPath(RAG, '/sections/intro.tex'));
    await waitForFrame();
    await waitForFile('sections/intro.tex');
    insertInEditor('\n\\cite{');
    expect(await screen.findByText('Project chưa có Trusted Reference nào')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Mở References and Evidence' });
    expect(link.getAttribute('href')).toBe(`/projects/${RAG}/evidence`);
  });

  it('gợi ý dùng được bằng bàn phím (EC55)', async () => {
    const { user } = await openIntro();
    insertInEditor('\n\\cite{');
    const list = await suggestions();
    const options = within(list).getAllByRole('option');
    expect(options.length).toBeGreaterThanOrEqual(3);
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');
    editorView().focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(within(list).getAllByRole('option')[1]!.getAttribute('aria-selected')).toBe('true'));
    const chosen = within(list).getAllByRole('option')[1]!.textContent!;
    await user.keyboard('{Enter}');
    const key = ['lewis2020rag', 'gao2023survey', 'smith2020'].find((candidate) => chosen.startsWith(candidate))!;
    await waitFor(() => expect(editorText()).toContain(`\\cite{${key}`));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox', { name: 'Gợi ý citation' })).toBeNull();
  });
});
