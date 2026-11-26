// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00115 S08: build, build log in two layers, PDF preview and export on the area's stateful mock (H15–H18).
// Names follow specs/acceptance.html and specs/scope.html.

import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { feature } from '.';
import { formatTime } from '../../shell';
import { researcher } from '../../shell/mock/fixtures/ids';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { RAG } from './__mocks__/fixtures';
import {
  completeBuilds, editorText, editorView, openManuscript, otherAreas, projectPath, renderManuscript, stopEvents, typeInEditor, waitForFile, wireEvents,
} from './__mocks__/render';
import { commit, currentSnapshot, finishBuilds, initProject, pdfOf, resetManuscriptStore, serverEdit, startBuild, testStore, type ProjectManuscript } from './__mocks__/store';
import type { Build } from './model';

// A short replay window, so a reconnect after a few events meets replay.unavailable (EC52).
const mock = useMockServer({ features: [feature], events: { retain: 2 } });

beforeAll(() => {
  // jsdom has no layout: CodeMirror measures text ranges when it scrolls to a line (Đi tới).
  const empty = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getClientRects ??= empty;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
});

beforeEach(() => {
  resetManuscriptStore();
  wireEvents(mock);
  mock.use({ overrides: otherAreas() });
});
afterEach(() => {
  stopEvents();
  vi.restoreAllMocks();
});

const rag = (): ProjectManuscript => testStore().projects.get(RAG)!;
const toolbar = () => screen.getByRole('toolbar', { name: 'Thanh công cụ bản thảo' });
const right = () => screen.getByRole('region', { name: /^(PDF|Build log|Lịch sử|History)$/ });
const buildButton = () => within(toolbar()).getByRole('button', { name: 'Build PDF' });
const build17 = () => rag().builds.find((build) => build.revisionNumber === 17)!;
const requested = (spy: { mock: { calls: unknown[][] } }, part: string) =>
  spy.mock.calls.map(([input]) => (input instanceof Request ? input.url : String(input))).filter((url) => url.includes(part));

/** Browser downloads without a browser: blob URLs and the link click are stubbed; returns the saved file names. */
function stubDownloads(): string[] {
  const downloads: string[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
  return downloads;
}

/** A finished build of the current revision (r18 in the demo), with its PDF and log, added without an event. */
function seedBuild(status: 'Succeeded' | 'Failed', issues: Build['issues'] = [], pm = rag()): Build {
  const snapshot = currentSnapshot(pm);
  const at = new Date().toISOString();
  const build: Build = {
    id: `9c000000-0000-4000-8000-0000000009${String(pm.builds.length).padStart(2, '0')}`, manuscriptId: pm.manuscript.id,
    revisionId: snapshot.revision.id, revisionNumber: snapshot.revision.revisionNumber, compiler: 'pdflatex', status,
    queuedAt: at, startedAt: at, endedAt: at, hasPdf: status === 'Succeeded', issues,
  };
  pm.builds.push(build);
  pm.logs.set(build.id, status === 'Succeeded' ? 'Output written on main.pdf (6 pages).\n' : '! LaTeX Error: something.\n');
  if (status === 'Succeeded') pm.pdfs.set(build.id, pdfOf(pm, snapshot));
  return build;
}

/** A new manuscript (Default) with `count` revisions; `pdfAt` builds that revision with success. */
function seedRevisions(count: number, pdfAt?: number): ProjectManuscript {
  resetManuscriptStore('not-initialized');
  const store = testStore();
  const pm = initProject(store, RAG, 'Default', 'pdflatex');
  for (let n = 2; n <= count; n += 1) {
    commit(store, pm, [{ path: 'sections/introduction.tex', operation: 'modify', content: `\\section{Introduction}\nDraft ${n}.\n` }], { createdBy: researcher, source: 'direct_edit' });
    if (n === pdfAt) {
      startBuild(store, pm, currentSnapshot(pm).revision);
      finishBuilds(store);
    }
  }
  return pm;
}

async function openPane(user: { click: (element: Element) => Promise<void> }, name: 'PDF' | 'Build log') {
  await user.click(within(toolbar()).getByRole('tab', { name }));
  return right();
}

describe('Build log (S08)', () => {
  it('tóm tắt trước, log gốc ở lớp sau (PID-00115-AC02, EC49)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    mock.use({ overrides: { getBuildLog: () => new Response(JSON.stringify({ type: 'x', title: 'internal_error', status: 500, code: 'internal_error' }), { status: 500, headers: { 'Content-Type': 'application/problem+json' } }) } });
    const { user } = await openManuscript();
    const pane = await openPane(user, 'Build log');
    const time = formatTime(build17().endedAt!);
    expect(within(pane).getByRole('heading', { name: `Build thất bại · ${time} · revision 17` })).toBeTruthy();
    expect(within(pane).getByText('Bản PDF trước (revision 16) vẫn được giữ.')).toBeTruthy();
    const issues = within(within(pane).getByRole('list', { name: '1 lỗi, 1 cảnh báo' })).getAllByRole('listitem');
    expect(issues).toHaveLength(2);
    expect(within(issues[0]!).getByText('main.tex')).toBeTruthy();
    expect(within(issues[0]!).getByText(/dòng 4/)).toBeTruthy();
    expect(within(issues[0]!).getByRole('button', { name: 'Đi tới main.tex:4' })).toBeTruthy();
    expect(within(issues[1]!).getByText('sections/intro.tex')).toBeTruthy();
    expect(within(issues[1]!).getByRole('button', { name: 'Đi tới intro.tex:7' })).toBeTruthy();
    // Layer 2 is not there, and not requested, until opened.
    expect(pane.querySelector('pre')).toBeNull();
    expect(requested(spy, '/log')).toHaveLength(0);

    const toggle = within(pane).getByRole('button', { name: /Log gốc \(pdfLaTeX\)/ });
    await user.click(toggle);
    // Loading the log failed: the error stays inside the frame, the summary stays (EC49).
    expect(await within(pane).findByText('Chưa tải được log gốc')).toBeTruthy();
    expect(within(pane).getByRole('heading', { name: `Build thất bại · ${time} · revision 17` })).toBeTruthy();
    expect(requested(spy, '/log')).toHaveLength(1);

    mock.server.resetHandlers();
    mock.use({ overrides: otherAreas() });
    await user.click(within(pane).getByRole('button', { name: 'Thử lại' }));
    const raw = await within(pane).findByLabelText('Log gốc của build');
    expect(raw.textContent).toContain("! LaTeX Error: File `booktabs.sty' not found.");
    expect(requested(spy, '/log')).toHaveLength(2);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('thiếu package tiếng Việt (UX-MS-004-AC01)', async () => {
    const { user } = await openManuscript();
    const pane = await openPane(user, 'Build log');
    const issue = within(pane).getByText('Thiếu package').closest('li')!;
    // The sentence is built from code and params.package, not from friendlyMessage (contract 27/11/2026).
    expect(within(issue).getByText(/^Package booktabs chưa được nạp/)).toBeTruthy();
    expect(build17().issues![0]!.friendlyMessage).toBeUndefined();
    await user.click(within(pane).getByRole('button', { name: /Log gốc/ }));
    expect((await within(pane).findByLabelText('Log gốc của build')).textContent).toContain('l.4 \\usepackage');
    await user.click(within(issue).getByRole('button', { name: 'Đi tới main.tex:4' }));
    await waitFor(() => {
      const view = editorView();
      expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(4);
    });
    expect(editorText().split('\n')[3]).toBe('\\usepackage{booktabs}');
  });

  it('file hình không tìm thấy (MS-BUILD-001-AC01)', async () => {
    seedBuild('Failed', [{ severity: 'error', file: 'main.tex', line: 9, code: 'missing_file', params: { path: 'figures/x.png' }, message: "! LaTeX Error: File `figures/x.png' not found.", friendlyMessage: 'Tải hình lên ở cây file.' }]);
    const { user } = await openManuscript(projectPath(RAG, '/sections/intro.tex'), 'sections/intro.tex');
    const pane = await openPane(user, 'Build log');
    const issue = within(pane).getByText('Không tìm thấy file').closest('li')!;
    expect(within(issue).getByText('main.tex')).toBeTruthy();
    expect(within(issue).getByText(/dòng 9/)).toBeTruthy();
    expect(within(issue).getByText('Không tìm thấy figures/x.png. Sửa đường dẫn hoặc thêm file vào bản thảo.')).toBeTruthy();
    expect(within(issue).getByText('Gợi ý: Tải hình lên ở cây file.')).toBeTruthy();
    await user.click(within(issue).getByRole('button', { name: 'Đi tới main.tex:9' }));
    await waitForFile('main.tex');
    await waitFor(() => {
      const view = editorView();
      expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(9);
    });
  });

  it('đổi ngôn ngữ, log gốc giữ nguyên (MS-BUILD-001-AC02)', async () => {
    const { user } = await openManuscript();
    const pane = await openPane(user, 'Build log');
    await user.click(within(pane).getByRole('button', { name: /Log gốc/ }));
    const before = (await within(pane).findByLabelText('Log gốc của build')).textContent;
    expect(within(pane).getByText('Citation không phân giải')).toBeTruthy();

    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'EN' }));
    const time = formatTime(build17().endedAt!);
    const paneEn = screen.getByRole('region', { name: 'Build log' });
    expect(await within(paneEn).findByRole('heading', { name: `Build failed · ${time} · revision 17` })).toBeTruthy();
    expect(within(paneEn).getByText('Missing package')).toBeTruthy();
    expect(within(paneEn).getByText('Unresolved citation')).toBeTruthy();
    expect(within(paneEn).getByRole('button', { name: 'Go to main.tex:4' })).toBeTruthy();
    // The raw log is the compiler's own text: unchanged in every language.
    expect(within(paneEn).getByLabelText('Raw build log').textContent).toBe(before);
  });

  it('code chưa dịch (EC47)', async () => {
    seedBuild('Failed', [
      { severity: 'error', code: 'shell_escape_denied', message: '! Package minted Error: You must invoke LaTeX with the -shell-escape flag.', friendlyMessage: 'Môi trường build không cho chạy lệnh ngoài; bỏ package minted.' },
      { severity: 'warning', code: 'font_shape_undefined', message: "LaTeX Font Warning: Font shape `T1/cmr/m/scit' undefined." },
    ]);
    const { user } = await openManuscript();
    const pane = await openPane(user, 'Build log');
    const error = within(pane).getByText('Lỗi build (shell_escape_denied)').closest('li')!;
    // Outside the catalog: the hint is the body, marked as a hint.
    expect(within(error).getByText('Gợi ý: Môi trường build không cho chạy lệnh ngoài; bỏ package minted.')).toBeTruthy();
    const warning = within(pane).getByText('Cảnh báo build (font_shape_undefined)').closest('li')!;
    expect(within(warning).getByText("LaTeX Font Warning: Font shape `T1/cmr/m/scit' undefined.")).toBeTruthy();
    // No file or line: no “Đi tới”.
    expect(within(pane).queryByRole('button', { name: /^Đi tới/ })).toBeNull();
  });

  it('danh mục 10 mã dựng câu từ params (UX-MS-004, EC47)', async () => {
    seedBuild('Failed', [
      { severity: 'error', code: 'unbalanced_braces', message: 'Runaway argument?' },
      { severity: 'error', code: 'undefined_control_sequence', params: { command: '\\toprule' }, message: '! Undefined control sequence.' },
      { severity: 'error', code: 'missing_file', params: { path: 'figures/pipeline.png' }, message: 'not found' },
      { severity: 'error', code: 'missing_package', params: { package: 'booktabs', command: '\\toprule' }, message: 'not found' },
      { severity: 'warning', code: 'undefined_citation', message: 'undefined' },
      { severity: 'error', code: 'shell_escape_disabled', params: { command: '\\inputminted' }, message: 'shell escape' },
      { severity: 'error', code: 'path_outside_manuscript', params: { path: '/etc/passwd' }, message: 'outside' },
      { severity: 'error', code: 'timeout', params: { limit: '120' }, message: 'timeout' },
      { severity: 'error', code: 'memory_limit', params: { limit: '2048', reason: 'tex_capacity' }, message: 'TeX capacity exceeded' },
      { severity: 'error', code: 'infrastructure_unavailable', message: 'no runner' },
    ]);
    const { user } = await openManuscript();
    const pane = await openPane(user, 'Build log');
    const text = (title: string) => within(pane).getByText(title).closest('li')!.textContent;
    expect(text('Thiếu hoặc thừa dấu ngoặc')).toContain('Có dấu { hoặc } thiếu hoặc thừa.');
    expect(text('Lệnh LaTeX không xác định')).toContain('Lệnh \\toprule chưa được định nghĩa.');
    expect(text('Không tìm thấy file')).toContain('Không tìm thấy figures/pipeline.png.');
    expect(text('Thiếu package')).toContain('\\toprule cần package booktabs');
    // Missing key in params: the general sentence of the code, no invented name.
    expect(text('Citation không phân giải')).toContain('Có key citation không có trong bibliography.');
    expect(text('Lệnh cần shell-escape')).toContain('\\inputminted cần shell-escape');
    expect(text('Đọc file ngoài bản thảo')).toContain('Build không đọc /etc/passwd');
    expect(text('Build quá thời gian')).toContain('Build dừng sau 120 giây.');
    expect(text('Build vượt giới hạn bộ nhớ')).toContain('TeX hết dung lượng bộ nhớ trong.');
    expect(text('Không cấp được môi trường build')).toContain('Thử Build PDF lại sau');
    expect(within(pane).queryByText(/^Lỗi build \(/)).toBeNull();
  });

  it('log và thông báo hiện dạng chữ (EC36)', async () => {
    seedBuild('Failed', [{ severity: 'error', code: 'missing_file', file: 'main.tex', line: 2, message: '<img src=x onerror="alert(1)">', friendlyMessage: '<script>alert(1)</script>' }]);
    rag().logs.set(rag().builds.at(-1)!.id, '<b>not bold</b>\n');
    const { user } = await openManuscript();
    const pane = await openPane(user, 'Build log');
    expect(within(pane).getByText('Gợi ý: <script>alert(1)</script>')).toBeTruthy();
    expect(pane.querySelector('script, img')).toBeNull();
    await user.click(within(pane).getByRole('button', { name: /Log gốc/ }));
    const raw = await within(pane).findByLabelText('Log gốc của build');
    expect(raw.textContent).toBe('<b>not bold</b>\n');
    expect(raw.querySelector('b')).toBeNull();
  });
});

describe('Build và PDF (S08)', () => {
  it('PDF ghi revision (MS-BUILD-001-AC03)', async () => {
    seedBuild('Succeeded');
    const { user } = await openManuscript();
    const pane = await openPane(user, 'PDF');
    expect(within(pane).getByRole('heading', { name: 'Xem trước PDF · revision 18' })).toBeTruthy();
    expect(await within(pane).findByText('Trang 1 / 6')).toBeTruthy();
    expect(within(toolbar()).getByText(/^Build OK · \d\d:\d\d$/)).toBeTruthy();
  });

  it('giữ PDF cũ khi build lỗi (EC48)', async () => {
    const view = await openManuscript();
    const pane = right();
    expect(within(pane).getByRole('heading', { name: 'Xem trước PDF · revision 16' })).toBeTruthy();
    expect(within(pane).getByText('Build revision 17 thất bại. Bản PDF dưới đây thuộc revision 16.')).toBeTruthy();
    expect(await within(pane).findByText('Trang 1 / 6')).toBeTruthy();
    await view.user.click(within(pane).getByRole('button', { name: 'Xem build log' }));
    expect(within(toolbar()).getByRole('tab', { name: 'Build log' }).getAttribute('aria-selected')).toBe('true');

    // Never built with success: “Chưa có PDF” with what to do.
    view.unmountAll();
    seedRevisions(1);
    renderManuscript();
    await waitForFrame();
    await waitForFile('main.tex');
    expect(within(right()).getByText('Chưa có PDF')).toBeTruthy();
    expect(within(right()).getByText(/Bấm Build PDF trên thanh công cụ/)).toBeTruthy();
    expect(within(toolbar()).getByText('Chưa build')).toBeTruthy();
  });

  it('đang build (EC46)', async () => {
    const { user } = await openManuscript();
    await user.click(buildButton());
    const chip = await within(toolbar()).findByText(/^Chờ build · \d\d:\d\d$/);
    expect(chip).toBeTruthy();
    const pane = right();
    expect(await within(pane).findByText('Đang build revision 18 · pdfLaTeX')).toBeTruthy();
    expect(within(pane).getByText(/System/)).toBeTruthy();
    expect(within(pane).getByText(/Rời trang được/)).toBeTruthy();
    // No cancel (N8); Build PDF waits while the current revision is being built.
    expect(screen.queryByRole('button', { name: /Hủy/ })).toBeNull();
    expect(buildButton()).toHaveProperty('disabled', true);
    expect(buildButton().getAttribute('title')).toBe('Revision hiện hành đang được build');

    finishBuilds(testStore(), false);
    expect(await within(toolbar()).findByText(/^Đang build · \d\d:\d\d$/)).toBeTruthy();
    completeBuilds();
    expect(await within(toolbar()).findByText(/^Build lỗi · \d\d:\d\d$/)).toBeTruthy();
    await waitFor(() => expect(within(right()).queryByText('Đang build revision 18 · pdfLaTeX')).toBeNull());
    expect(buildButton()).toHaveProperty('disabled', false);
  });

  it('build đã có (EC45)', async () => {
    seedBuild('Succeeded');
    const spy = vi.spyOn(globalThis, 'fetch');
    const { user } = await openManuscript();
    const before = rag().builds.length;
    await user.click(buildButton());
    await waitFor(() => expect(spy.mock.calls.some(([input, init]) => String(input instanceof Request ? input.url : input).endsWith('/manuscript/builds') && (init as RequestInit | undefined)?.method === 'POST')).toBe(true));
    expect(rag().builds.length).toBe(before);
    expect(within(right()).getByRole('heading', { name: 'Xem trước PDF · revision 18' })).toBeTruthy();
    expect(within(toolbar()).getByText(/^Build OK · /)).toBeTruthy();
  });

  it('sửa khi đang build (EC25)', async () => {
    const { user } = await openManuscript();
    await user.click(buildButton());
    await within(toolbar()).findByText(/^Chờ build · /);
    expect(buildButton()).toHaveProperty('disabled', true);
    typeInEditor(`${editorText()}% thêm ghi chú\n`);
    await user.click(within(toolbar()).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(rag().manuscript.currentRevisionNumber).toBe(19));
    expect(await within(toolbar()).findByText(/revision 19/)).toBeTruthy();
    // The chip still follows the running build of r18; Build PDF is on again for the newer revision.
    expect(within(toolbar()).getByText(/^Chờ build · /)).toBeTruthy();
    expect(buildButton()).toHaveProperty('disabled', false);
    expect(rag().builds.at(-1)!.revisionNumber).toBe(18);
  });

  it('lưu trước khi build (EC44)', async () => {
    const { user } = await openManuscript();
    typeInEditor(editorText().replace('\\usepackage{booktabs}', '\\usepackage{amsmath}'));
    await user.click(buildButton());
    await waitFor(() => expect(rag().builds.at(-1)!.revisionNumber).toBe(19));
    expect(rag().manuscript.currentRevisionNumber).toBe(19);
    completeBuilds();
    expect(await within(toolbar()).findByText(/^Build OK · /)).toBeTruthy();

    // Save fails: nothing is built.
    const builds = rag().builds.length;
    typeInEditor(`${editorText()}% lần hai\n`);
    mock.use({ overrides: { commitManuscriptChanges: () => new Response(JSON.stringify({ type: 'x', title: 'internal_error', status: 500, code: 'internal_error' }), { status: 500, headers: { 'Content-Type': 'application/problem+json' } }) } });
    await user.click(buildButton());
    expect(await screen.findByText('Chưa lưu được')).toBeTruthy();
    expect(rag().builds.length).toBe(builds);

    // Save meets a newer server version of the file: conflict, nothing is built.
    mock.server.resetHandlers();
    mock.use({ overrides: otherAreas() });
    stopEvents();
    serverEdit(testStore(), rag(), 'main.tex', `${currentSnapshot(rag()).files.values().next().value!.content}% tab khác\n`);
    await user.click(buildButton());
    expect(await screen.findByRole('region', { name: 'Xung đột khi lưu' })).toBeTruthy();
    expect(rag().builds.length).toBe(builds);
  });

  it('giữ vị trí khi build mới (EC50)', async () => {
    seedBuild('Succeeded');
    const { user } = await openManuscript();
    const pane = right();
    expect(await within(pane).findByText('Trang 1 / 6')).toBeTruthy();
    for (let i = 0; i < 3; i += 1) await user.click(within(pane).getByRole('button', { name: 'Trang sau' }));
    expect(within(pane).getByText('Trang 4 / 6')).toBeTruthy();

    typeInEditor(editorText().replace('\\usepackage{booktabs}', '\\usepackage{amsmath}'));
    await user.click(buildButton());
    await waitFor(() => expect(rag().builds.at(-1)!.revisionNumber).toBe(19));
    completeBuilds();
    expect(await within(right()).findByRole('heading', { name: 'Xem trước PDF · revision 19' })).toBeTruthy();
    await waitFor(() => expect(within(right()).getByText('Trang 4 / 6')).toBeTruthy());
  });

  it('tải lại khi cần tải lại (EC52)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await openManuscript();
    typeInEditor(`${editorText()}% chưa lưu\n`);
    expect(within(toolbar()).getByText(/^Build lỗi · /)).toBeTruthy();
    // A build finished while the stream was down; its events are older than the replay window.
    stopEvents();
    seedBuild('Succeeded');
    const event = { type: 'manuscript.object_status_changed', projectId: RAG, objectType: 'revision', objectId: rag().manuscript.currentRevisionId, toState: 'Created' } as const;
    const filesBefore = requested(spy, '/manuscript/files').length;
    mock.events.emit(event);
    await waitFor(() => expect(requested(spy, '/manuscript/files').length).toBeGreaterThan(filesBefore));
    expect(within(toolbar()).getByText(/^Build lỗi · /)).toBeTruthy();
    mock.events.disconnect();
    for (let i = 0; i < 3; i += 1) mock.events.emit(event);
    // The shell reconnects, the server cannot replay (replay.unavailable): the area reloads everything.
    expect(await within(toolbar()).findByText(/^Build OK · /)).toBeTruthy();
    expect(within(right()).getByRole('heading', { name: 'Xem trước PDF · revision 18' })).toBeTruthy();
    // Unsaved text survives the reload.
    expect(editorText()).toContain('% chưa lưu');
  });
});

describe('Export (S08)', () => {
  it('export PDF cũ (MS-EXPORT-001-AC02)', async () => {
    const pm = seedRevisions(8, 7);
    const r7 = pm.revisions[6]!.revision;
    const spy = vi.spyOn(globalThis, 'fetch');
    const downloads = stubDownloads();
    const { user } = renderManuscript();
    await waitForFrame();
    await waitForFile('main.tex');
    await user.click(within(toolbar()).getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: /^PDF/ }));
    const dialog = await screen.findByRole('dialog', { name: 'PDF chưa theo revision hiện hành' });
    expect(within(dialog).getByText('PDF thuộc revision 7; revision hiện hành là 8.')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Tải PDF revision 7' }));
    await waitFor(() => expect(requested(spy, `/export?format=pdf&revisionId=${r7.id}`)).toHaveLength(1));
    await waitFor(() => expect(downloads).toEqual(['manuscript-r7.pdf']));
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(within(toolbar()).getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: /^PDF/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Build revision 8' }));
    await waitFor(() => expect(pm.builds.at(-1)!.revisionNumber).toBe(8));
    expect(await within(right()).findByText('Đang build revision 8 · pdfLaTeX')).toBeTruthy();
  });

  it('export zip (EC51)', async () => {
    const downloads = stubDownloads();
    const view = await openManuscript();
    const exportButton = within(toolbar()).getByRole('button', { name: 'Export' });
    // Keyboard: the first item has focus, arrows move, Escape closes and returns focus.
    await view.user.click(exportButton);
    expect(document.activeElement?.textContent).toMatch(/^PDF/);
    await view.user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(exportButton);
    await view.user.click(exportButton);
    await view.user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toMatch(/^Mã nguồn \(zip\)/);
    // The zip downloads at once, no question.
    await view.user.keyboard('{Enter}');
    await waitFor(() => expect(downloads).toEqual(['manuscript-r18.zip']));
    expect(screen.queryByRole('dialog')).toBeNull();

    // No PDF yet: Export › PDF says so, the zip is still offered.
    view.unmountAll();
    seedRevisions(1);
    const again = renderManuscript();
    await waitForFrame();
    await waitForFile('main.tex');
    await again.user.click(within(toolbar()).getByRole('button', { name: 'Export' }));
    await again.user.click(screen.getByRole('menuitem', { name: /^PDF/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Chưa có PDF' });
    await again.user.click(within(dialog).getByRole('button', { name: 'Tải mã nguồn (zip)' }));
    await waitFor(() => expect(downloads).toEqual(['manuscript-r18.zip', 'manuscript-r1.zip']));
  });
});
