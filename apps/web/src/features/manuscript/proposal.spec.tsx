// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00115 S06: Change Proposal boxes in the editor on the area's stateful mock (H11–H13). Names follow
// specs/acceptance.html and specs/scope.html.

import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { feature } from '.';
import { useMockServer } from '../../shell/mock/node';
import type { Schemas } from '../../shell/mock/types';
import { INTRO_R17, proposalId, RAG, revisionId, uid, WRITING_TASK } from './__mocks__/fixtures';
import { editorText, insertInEditor, openManuscript, otherAreas, projectPath, renderManuscript, stopEvents, typeInEditor, waitForFile, wireEvents } from './__mocks__/render';
import { emit, resetManuscriptStore, serverEdit, testStore } from './__mocks__/store';

const mock = useMockServer({ features: [feature] });

beforeEach(() => {
  resetManuscriptStore();
  mock.use({ overrides: otherAreas() });
});
afterEach(() => stopEvents());

const INTRO = projectPath(RAG, '/sections/intro.tex');
const METHOD = projectPath(RAG, '/sections/method.tex');
const rag = () => testStore().projects.get(RAG)!;
const proposalOf = (n: number) => rag().proposals.find((row) => row.id === proposalId(n))!;

/** Requests of one kind reaching the mock, with their Idempotency-Key. */
function track(method: string, pattern: RegExp) {
  const seen: { key: string | null; body: Promise<string> }[] = [];
  const listener = ({ request }: { request: Request }) => {
    if (request.method === method && pattern.test(new URL(request.url).pathname)) seen.push({ key: request.headers.get('Idempotency-Key'), body: request.clone().text() });
  };
  mock.server.events.on('request:start', listener);
  onTestFinished(() => {
    mock.server.events.removeListener('request:start', listener);
  });
  return seen;
}

const boxes = (status: string) => screen.queryAllByRole('region', { name: `Change Proposal · ${status}` });
async function box(status: string, text?: string): Promise<HTMLElement> {
  let found: HTMLElement | undefined;
  await waitFor(() => {
    found = boxes(status).find((element) => !text || element.textContent?.includes(text));
    expect(found).toBeTruthy();
  });
  return found!;
}
const describedBy = (element: HTMLElement) => document.getElementById(element.getAttribute('aria-describedby') ?? '')?.textContent ?? '';

function addProposal(n: number, path: string, hunks: Schemas['DiffHunk'][], extra: Partial<Schemas['ChangeProposal']> = {}): Schemas['ChangeProposal'] {
  const row: Schemas['ChangeProposal'] = {
    ...structuredClone(proposalOf(1)), id: proposalId(n), summary: `Proposal ${n}`, baseRevisionId: revisionId(18), status: 'Proposed',
    diff: [{ path, operation: 'modify', hunks }], createdAt: new Date().toISOString(), ...extra,
  };
  rag().proposals.push(row);
  return row;
}

describe('Change Proposal trong editor (S06)', () => {
  it('outdated hiện lý do, không chấp nhận (PID-00115-AC01, UX-MS-003-AC01, EC31)', async () => {
    await openManuscript(INTRO, 'sections/intro.tex');
    const outdated = await box('Outdated');
    await waitFor(() => expect(outdated.textContent).toContain('Hết hiệu lực: sections/intro.tex đã đổi từ revision 16 (gốc của proposal) sang 18'));
    expect(within(outdated).queryByRole('button', { name: 'Chấp nhận cả proposal' })).toBeNull();
    expect(within(outdated).queryByRole('button', { name: 'Từ chối' })).toBeNull();
    expect(within(outdated).getByRole('button', { name: 'Yêu cầu tạo lại' })).toBeTruthy();
    expect(within(outdated).getByText('Outdated')).toBeTruthy();
  });

  it('citation lỗi (UX-MS-002-AC01, EC30)', async () => {
    await openManuscript(METHOD, 'sections/method.tex');
    const failing = await box('Proposed', 'Citation lỗi');
    expect(within(failing).getByText('Citation lỗi: asai2024selfrg')).toBeTruthy();
    const accept = within(failing).getByRole('button', { name: 'Chấp nhận cả proposal' }) as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    expect(describedBy(accept)).toBe('Chưa chấp nhận được: citation lỗi (asai2024selfrg).');
    const marked = failing.querySelector('mark.ms-pdiff__bad');
    expect(marked?.textContent).toBe('asai2024selfrg');
    expect(marked?.closest('[data-kind]')?.getAttribute('data-kind')).toBe('add');
    expect(within(within(failing).getByRole('list', { name: 'Lỗi citation' })).getByText(/Không có Trusted Reference với key asai2024selfrg/)).toBeTruthy();
    // The proposal that passed the check is not blocked.
    const passing = await box('Proposed', 'Citation: 2/2 phân giải');
    expect((within(passing).getByRole('button', { name: 'Chấp nhận cả proposal' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('chưa có kết quả citation (EC30)', async () => {
    delete proposalOf(2).citationCheck;
    await openManuscript(METHOD, 'sections/method.tex');
    const pending = await box('Proposed', 'Citation: chưa có kết quả kiểm tra');
    const accept = within(pending).getByRole('button', { name: 'Chấp nhận cả proposal' }) as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    expect(describedBy(accept)).toBe('Chưa chấp nhận được: chưa có kết quả kiểm tra citation.');
  });

  it('yêu cầu tạo lại (UX-MS-003-AC01, EC38)', async () => {
    const conversation = uid('6d', 77);
    const sent: { conversationId: string; body: Schemas['MessageCreate'] | undefined; key: string | null }[] = [];
    let created = 0;
    let fail = true;
    mock.use({
      overrides: otherAreas({
        listConversations: () => ({ status: 200, body: { items: [] } }),
        createConversation: ({ generated }) => {
          created += 1;
          return { status: 201, body: { ...generated(201), id: conversation, scope: 'project', projectId: RAG } };
        },
        sendMessage: ({ params, body, request, generated }) => {
          sent.push({ conversationId: params.conversationId, body, key: request.headers.get('Idempotency-Key') });
          if (fail) {
            fail = false;
            return new Response(JSON.stringify({ type: 'about:blank', title: 'service_unavailable', status: 503, code: 'service_unavailable' }), { status: 503, headers: { 'Content-Type': 'application/problem+json' } });
          }
          return { status: 202, body: generated(202) };
        },
      }),
    });
    const { user } = await openManuscript(INTRO, 'sections/intro.tex');
    const outdated = await box('Outdated');
    await waitFor(() => expect(outdated.textContent).toContain('T-2.1'));
    await user.click(within(outdated).getByRole('button', { name: 'Yêu cầu tạo lại' }));
    const dialog = await screen.findByRole('dialog', { name: 'Yêu cầu tạo lại Change Proposal' });
    const field = within(dialog).getByLabelText('Chỉ dẫn') as HTMLTextAreaElement;
    expect(field.value).toContain('T-2.1');
    expect(field.value).toContain('revision 18');
    await user.clear(field);
    await user.type(field, 'Viết lại câu mở đầu theo revision 18.');
    await user.click(within(dialog).getByRole('button', { name: 'Gửi yêu cầu' }));
    // Error: the instruction stays, the box shows the code.
    expect(await within(dialog).findByText(/service_unavailable/)).toBeTruthy();
    expect((within(dialog).getByLabelText('Chỉ dẫn') as HTMLTextAreaElement).value).toBe('Viết lại câu mở đầu theo revision 18.');
    await user.click(within(dialog).getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await within(outdated).findByText(/Đã gửi yêu cầu tạo lại tới Orchestrator/)).toBeTruthy();
    expect(created).toBe(1);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ conversationId: conversation, body: { content: 'Viết lại câu mở đầu theo revision 18.', activeTaskId: WRITING_TASK } });
    // The retry is the same message: same Idempotency-Key, so the Orchestrator gets it once.
    expect(sent[1]!.key).toBe(sent[0]!.key);
  });

  it('chấp nhận khi revision đã đổi (MS-DIFF-001-AC01, EC32)', async () => {
    const { user } = await openManuscript(INTRO, 'sections/intro.tex');
    const before = editorText();
    // Another tab saved intro.tex after this screen loaded; the proposal has not been re-checked yet.
    serverEdit(testStore(), rag(), 'sections/intro.tex', `${INTRO_R17}% sửa ở tab khác\n`);
    proposalOf(1).status = 'Proposed';
    const accepts = track('POST', /\/accept$/);
    const proposed = await box('Proposed');
    await user.click(within(proposed).getByRole('button', { name: 'Chấp nhận cả proposal' }));
    const now = await box('Outdated', 'Bản thảo đã có revision mới hơn nên proposal đã hết hiệu lực');
    expect(within(now).queryByRole('button', { name: 'Chấp nhận cả proposal' })).toBeNull();
    expect(accepts).toHaveLength(1);
    expect(editorText()).toBe(before);
  });

  it('chỉ chấp nhận cả proposal (MS-DIFF-001-AC02)', async () => {
    proposalOf(1).status = 'Rejected';
    proposalOf(2).status = 'Rejected';
    addProposal(4, 'sections/intro.tex', [
      { oldStart: 4, oldLines: 1, newStart: 4, newLines: 1, lines: ['-Large language models are increasingly used to', '+Large language models are now widely used to'] },
      { oldStart: 7, oldLines: 1, newStart: 7, newLines: 1, lines: ['-survey of RAG systems \\citep{gao2023survy}.', '+survey of RAG systems \\citep{gao2023survey}.'] },
      { oldStart: 11, oldLines: 1, newStart: 11, newLines: 1, lines: ['-Prior work shows retrieval always helps.', '+Retrieval helps when sources are vetted \\citep{lewis2020rag}.'] },
    ], { citationCheck: { passed: true, unresolvedKeys: [], mismatches: [] } });
    const { user } = await openManuscript(INTRO, 'sections/intro.tex');
    const proposed = await box('Proposed', 'Proposal 4');
    expect(proposed.querySelectorAll('.ms-pdiff__hunk')).toHaveLength(3);
    expect(within(proposed).getAllByRole('button', { name: /Chấp nhận/ })).toHaveLength(1);
    expect(within(proposed).getAllByRole('button', { name: /Từ chối/ })).toHaveLength(1);
    const accepts = track('POST', /\/accept$/);
    await user.click(within(proposed).getByRole('button', { name: 'Chấp nhận cả proposal' }));
    await waitFor(() => expect(editorText()).toContain('Retrieval helps when sources are vetted'));
    expect(editorText()).toContain('Large language models are now widely used to');
    expect(editorText()).toContain('\\citep{gao2023survey}.\n');
    expect(accepts).toHaveLength(1);
    expect(await within(await box('Accepted', 'Proposal 4')).findByText('Đã chấp nhận cả proposal: revision 19.')).toBeTruthy();
  });

  it('nội dung file không đổi trước khi chấp nhận (MS-AIWRITE-001-AC01)', async () => {
    await openManuscript(INTRO, 'sections/intro.tex');
    const proposed = await box('Proposed');
    expect(proposed.textContent).toContain('Retrieval restricted to vetted sources improves factuality');
    expect(editorText()).toBe(INTRO_R17);
    expect(editorText()).not.toContain('Retrieval restricted');
  });

  it('file đang sửa chặn chấp nhận (EC23)', async () => {
    await openManuscript(INTRO, 'sections/intro.tex');
    const proposed = await box('Proposed');
    insertInEditor('% ghi chú\n');
    await within(proposed).findByText('Lưu thay đổi ở file này sẽ làm proposal thành Outdated.');
    const accept = within(proposed).getByRole('button', { name: 'Chấp nhận cả proposal' }) as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    expect(describedBy(accept)).toBe('Lưu hoặc bỏ thay đổi chưa lưu trước khi chấp nhận.');
    typeInEditor(INTRO_R17);
    await waitFor(() => expect(accept.disabled).toBe(false));
    expect(within(proposed).queryByText('Lưu thay đổi ở file này sẽ làm proposal thành Outdated.')).toBeNull();
  });

  it('đã xử lý ở nơi khác (EC33)', async () => {
    addProposal(4, 'sections/intro.tex', [{ oldStart: 9, oldLines: 1, newStart: 9, newLines: 1, lines: ['-However, unverified generation can introduce unsupported claims \\citep{doe2023hd}.', '+However, unverified generation can introduce unsupported claims.'] }], { citationCheck: { passed: true, unresolvedKeys: [], mismatches: [] } });
    const { user } = await openManuscript(INTRO, 'sections/intro.tex');
    const other = await box('Proposed', 'Proposal 4');
    const first = await box('Proposed', 'Citation: 2/2 phân giải');
    // Decided in another tab.
    proposalOf(4).status = 'Accepted';
    const accepts = track('POST', /\/accept$/);
    await user.click(within(other).getByRole('button', { name: 'Chấp nhận cả proposal' }));
    const processed = await box('Accepted', 'Proposal 4');
    expect(within(processed).getByText('Proposal đã được xử lý ở nơi khác. Màn đã tải lại trạng thái mới.')).toBeTruthy();
    // The citation check of the other one was re-run elsewhere and failed.
    proposalOf(1).citationCheck = { passed: false, unresolvedKeys: ['lewis2020rag'], mismatches: [] };
    await user.click(within(first).getByRole('button', { name: 'Chấp nhận cả proposal' }));
    const failed = await box('Proposed', 'Citation lỗi: lewis2020rag');
    expect(within(failed).getByText('Kiểm tra citation chưa đạt nên chưa chấp nhận. Không có thay đổi nào được áp dụng.')).toBeTruthy();
    expect((within(failed).getByRole('button', { name: 'Chấp nhận cả proposal' }) as HTMLButtonElement).disabled).toBe(true);
    expect(accepts).toHaveLength(2);
    expect(editorText()).toBe(INTRO_R17);
  });

  it('không gửi trùng (EC34)', async () => {
    const { user } = await openManuscript(INTRO, 'sections/intro.tex');
    const proposed = await box('Proposed');
    const accepts = track('POST', /\/accept$/);
    await user.dblClick(within(proposed).getByRole('button', { name: 'Chấp nhận cả proposal' }));
    await box('Accepted', 'Đã chấp nhận cả proposal');
    expect(accepts).toHaveLength(1);
    expect(accepts[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('proposal nhiều file (EC35)', async () => {
    proposalOf(2).status = 'Rejected';
    proposalOf(1).diff.push({ path: 'sections/related.tex', operation: 'add', hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: ['+\\section{Related Work}', '+Citation checkers compare claims with sources \\citep{gao2023survey}.'] }] });
    const { user } = await openManuscript(INTRO, 'sections/intro.tex');
    const proposed = await box('Proposed');
    const intro = within(proposed).getByRole('group', { name: 'Thay đổi ở sections/intro.tex' });
    expect(intro.textContent).toContain('Retrieval restricted to vetted sources');
    const method = within(proposed).getByRole('group', { name: 'Thay đổi ở sections/method.tex' });
    expect(method.textContent).not.toContain('Scores are averaged');
    await user.click(within(method).getByRole('button', { name: 'Xem diff' }));
    expect(method.textContent).toContain('Scores are averaged over three annotators');
    const added = within(proposed).getByRole('group', { name: 'Thay đổi ở sections/related.tex' });
    expect(within(added).getByText('file mới')).toBeTruthy();
    expect(within(added).queryByRole('button', { name: 'Mở file' })).toBeNull();
    await user.click(within(proposed).getByRole('button', { name: 'Chấp nhận cả proposal' }));
    await box('Accepted');
    const files = [...testStore().projects.get(RAG)!.revisions.at(-1)!.files.values()].filter((row) => row.status === 'Active');
    expect(files.find((row) => row.path === 'sections/method.tex')!.content).toContain('Scores are averaged over three annotators');
    expect(files.find((row) => row.path === 'sections/related.tex')!.content).toContain('\\section{Related Work}');
    await waitFor(() => expect(editorText()).toContain('Retrieval restricted to vetted sources'));
  });

  it('diff hiện dạng chữ (EC36)', async () => {
    const p1 = proposalOf(1);
    p1.summary = '<img src=x onerror="alert(1)">Tóm tắt';
    p1.diff[1]!.hunks![0]!.lines![1] = '+<script>alert(1)</script> \\citep{gao2023survey}';
    const p2 = proposalOf(2);
    p2.citationCheck!.mismatches![0]!.message = '<b>đậm</b> không khớp';
    await openManuscript(METHOD, 'sections/method.tex');
    const proposed = await box('Proposed', 'Tóm tắt');
    expect(proposed.textContent).toContain('<img src=x onerror="alert(1)">Tóm tắt');
    expect(proposed.textContent).toContain('<script>alert(1)</script>');
    const failing = await box('Proposed', 'Citation lỗi');
    expect(failing.textContent).toContain('<b>đậm</b> không khớp');
    for (const element of [proposed, failing]) expect(element.querySelector('img, script, b')).toBeNull();
  });

  it('deep link proposal (EC37)', async () => {
    const { router } = renderManuscript(projectPath(RAG, `?proposal=${proposalId(3)}`));
    await waitForFile('sections/intro.tex');
    const outdated = await box('Outdated');
    await waitFor(() => expect(outdated.textContent).toContain('Hết hiệu lực'));
    // Unknown proposal.
    await router.navigate(projectPath(RAG, `?proposal=${uid('e2', 404)}`));
    expect(await screen.findByRole('region', { name: 'Không tìm thấy proposal' })).toBeTruthy();
    // Already decided: its file opens, the box shows the state.
    await router.navigate(projectPath(RAG, `?proposal=${proposalId(9)}`));
    await waitForFile('main.tex');
    const accepted = await box('Accepted');
    expect(await within(accepted).findByText('Đã chấp nhận cả proposal: revision 17.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Không tìm thấy proposal' })).toBeNull();
  });

  it('sự kiện proposal (EC39)', async () => {
    wireEvents(mock);
    await openManuscript(INTRO, 'sections/intro.tex');
    await box('Proposed');
    expect(boxes('Proposed')).toHaveLength(1);
    const fresh = addProposal(5, 'sections/intro.tex', [{ oldStart: 2, oldLines: 1, newStart: 2, newLines: 1, lines: ['-\\label{sec:intro}', '+\\label{sec:introduction}'] }], { summary: 'Mới từ Writing Agent' });
    emit(RAG, 'change_proposal', fresh.id, undefined, 'Proposed');
    await box('Proposed', 'Mới từ Writing Agent');
    expect(boxes('Proposed')).toHaveLength(2);
    proposalOf(1).status = 'Rejected';
    emit(RAG, 'change_proposal', proposalId(1), 'Proposed', 'Rejected');
    await waitFor(() => expect(boxes('Proposed')).toHaveLength(1));
  });

  it('bàn phím (EC55)', async () => {
    const { user } = await openManuscript(INTRO, 'sections/intro.tex');
    const proposed = await box('Proposed');
    const reject = within(proposed).getByRole('button', { name: 'Từ chối' });
    reject.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Từ chối Change Proposal' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(reject);
    const accept = within(proposed).getByRole('button', { name: 'Chấp nhận cả proposal' });
    accept.focus();
    await user.keyboard('{Enter}');
    expect(await within(await box('Accepted')).findByText('Đã chấp nhận cả proposal: revision 19.')).toBeTruthy();
  });
});
