// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00098 Reference page (S08) and its actions (S09).

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { account } from '../../shell/mock/fixtures/settings';
import { demoReferences, demoUsage, papers, projects, referenceId } from './__mocks__/data';
import { callsOf, useLibraryMock } from './test-utils';

const card = (title: string | RegExp) => screen.getByRole('heading', { name: title }).closest('section')!;
const dt = (scope: HTMLElement, term: string) => within(scope).getByText(term, { selector: 'dt' }).nextElementSibling as HTMLElement;
const pdf = (name: string) => new File(['%PDF-1.7 demo'], name, { type: 'application/pdf' });

describe('Trang Reference (S08)', () => {
  const { renderAt, store, scenario, mock } = useLibraryMock();
  const openRef = async (n: number) => {
    const view = renderAt(`/library/${referenceId(n)}`);
    await screen.findByRole('heading', { level: 1 });
    return view;
  };

  it('indexing lỗi có thử lại', async () => {
    // PID-00098-AC02, EC40: Trusted + Failed (pdf_without_text_layer) → alert with reason and code; “Thử lại indexing” calls
    // retryReferenceIndexing once and the chip becomes Queued; “Tải PDF khác” opens the file chooser.
    const { user } = await openRef(3);
    const alert = screen.getByText('Indexing lỗi', { selector: 'strong' }).closest('[role="alert"]') as HTMLElement;
    expect(within(alert).getByText(/PDF không có lớp văn bản \(chỉ có ảnh quét\)\./)).toBeTruthy();
    expect(within(alert).getByText('pdf_without_text_layer')).toBeTruthy();
    const chooser = vi.spyOn(screen.getByTestId('reference-pdf-input'), 'click');
    await user.click(within(alert).getByRole('button', { name: 'Tải PDF khác' }));
    expect(chooser).toHaveBeenCalledTimes(1);
    await user.click(within(alert).getByRole('button', { name: 'Thử lại indexing' }));
    expect(await screen.findByText('index: Queued')).toBeTruthy();
    expect(callsOf('retryReferenceIndexing')).toHaveLength(1);
    expect(screen.queryByText('Indexing lỗi', { selector: 'strong' })).toBeNull();
  });

  it('indexing lỗi có thử lại khi đã đổi', async () => {
    // EC40: the status changed meanwhile (409) → the reason is shown and the page reads the reference again.
    const { user } = await openRef(3);
    store.reference(referenceId(3))!.indexingStatus = 'Indexing'; // another tab already retried
    await user.click(screen.getByRole('button', { name: 'Thử lại indexing' }));
    expect(await screen.findByText(/Trạng thái đã đổi; đã đọc lại \(invalid_transition\)/)).toBeTruthy();
    expect(await screen.findByText('index: Indexing')).toBeTruthy();
  });

  it('hai trạng thái và Unavailable', async () => {
    // UX-REF-002-AC01: two separate chips “Duyệt: Trusted” and “index: Unavailable” and the citation/evidence sentence.
    await openRef(4);
    const approval = screen.getByText('Duyệt: Trusted');
    const index = screen.getByText('index: Unavailable');
    expect(approval).not.toBe(index);
    expect(approval.classList.contains('sires-chip') && index.classList.contains('sires-chip')).toBe(true);
    expect(screen.getByText('Dùng được cho citation, không dùng được cho evidence.')).toBeTruthy();
  });

  it('provenance', async () => {
    // UX-REF-003-AC01: discovered via OpenAlex, approved, used in 2 projects → origin, approver, time and approved version;
    // both projects listed.
    await openRef(1);
    const provenance = card('Provenance');
    expect(dt(provenance, 'Nguồn gốc').textContent).toBe('Phát hiện ở Discover qua OpenAlex');
    expect(dt(provenance, 'Người duyệt').textContent).toBe(account.profile.displayName);
    expect(dt(provenance, 'Thời điểm duyệt').textContent).toMatch(/\d/);
    expect(dt(provenance, 'Metadata đã duyệt').textContent).toBe('phiên bản 1');
    const usage = card('Project đang dùng');
    for (const project of [projects.rag, projects.learning]) expect(within(usage).getByRole('link', { name: project.name })).toBeTruthy();
  });

  it('project đang dùng', async () => {
    // LIB-LIBRARY-001-AC02: getReferenceUsage returns A and B → both, with their evidence and citation counts.
    await openRef(1);
    const usage = card('Project đang dùng');
    const rag = within(usage).getByRole('link', { name: projects.rag.name }).closest('li')!;
    const learning = within(usage).getByRole('link', { name: projects.learning.name }).closest('li')!;
    expect(rag.textContent).toContain('6 evidence · 3 citation');
    expect(learning.textContent).toContain('2 evidence · 1 citation');
    expect(within(rag).getByRole('link').getAttribute('href')).toBe(`/projects/${projects.rag.id}/evidence`);
  });

  it('Unavailable vẫn có key', async () => {
    // LIB-CONTENT-001-AC01: Trusted without content (Unavailable, no document) → index chip, BibTeX key in Metadata,
    // “Tải PDF lên”.
    await openRef(4);
    expect(screen.getByText('index: Unavailable')).toBeTruthy();
    expect(dt(card(/^Metadata · phiên bản/), 'BibTeX key').textContent).toBe('liu2024lost');
    const doc = card('Source Document');
    expect(within(doc).getByText('Chưa có tài liệu. Reference vẫn dùng được cho citation.')).toBeTruthy();
    expect(within(doc).getByRole('button', { name: 'Tải PDF lên' })).toBeTruthy();
  });

  it('tải PDF lên rồi Indexed', async () => {
    // LIB-CONTENT-001-AC02: upload a valid PDF → uploadReferenceDocument once, chip Queued; the
    // reference.indexing_status_changed event (Indexed) reloads the page: “index: Indexed” with the chunk count.
    scenario({ delayMs: 150 });
    await openRef(4);
    fireEvent.change(screen.getByTestId('reference-pdf-input'), { target: { files: [pdf('liu2024lost.pdf')] } });
    expect(await screen.findByText('index: Queued')).toBeTruthy();
    expect(callsOf('uploadReferenceDocument')).toEqual([expect.objectContaining({ body: { name: 'liu2024lost.pdf' } })]);
    expect(await screen.findByText(/^index: Indexed/)).toBeTruthy();
    expect(dt(card('Source Document'), 'Số đoạn đã index').textContent).toBe('87');
    expect(screen.getByText('Dùng được cho citation và evidence.')).toBeTruthy();
  });

  it('không tìm thấy', async () => {
    // EC41: unknown or foreign id → the shell's “Không tìm thấy”, nothing about whether it exists.
    renderAt(`/library/${referenceId(404)}`);
    expect(await screen.findByText('Không tìm thấy trang')).toBeTruthy();
    expect(screen.queryByText('Không tải được reference')).toBeNull();
  });

  it('reference đã gộp', async () => {
    // EC42: merged reference → banner “đã được gộp vào” with a link to the target; actions hidden.
    const references = demoReferences();
    references[1].mergedIntoId = referenceId(1);
    scenario({ references });
    await openRef(2);
    const banner = screen.getByText(/Reference này đã được gộp vào/).closest('[role="status"]') as HTMLElement;
    expect(within(banner).getByRole('link', { name: 'reference đích' }).getAttribute('href')).toBe(`/library/${referenceId(1)}`);
    for (const name of ['Sửa metadata', 'Thêm vào project', 'Thu hồi', 'Gộp']) expect(screen.queryByRole('button', { name })).toBeNull();
  });

  it('cập nhật khi shell báo tải lại', async () => {
    // EC31 (page part): a status change event for this reference reloads the page.
    await openRef(5);
    expect(screen.getByText('index: Indexing')).toBeTruthy();
    store.reference(referenceId(5))!.indexingStatus = 'Indexed';
    mock.events.emit({ type: 'reference.indexing_status_changed', objectType: 'reference', objectId: referenceId(5), fromState: 'Indexing', toState: 'Indexed' });
    expect(await screen.findByText(/^index: Indexed/)).toBeTruthy();
  });
});

describe('Thao tác trên Reference (S09)', () => {
  const { renderAt, store, scenario, mock } = useLibraryMock();
  const openRef = async (n: number) => {
    const view = renderAt(`/library/${referenceId(n)}`);
    await screen.findByRole('heading', { level: 1 });
    return view;
  };

  it('thêm vào project không duyệt lại', async () => {
    // LIB-LIBRARY-001-AC01: R Trusted, used in A → “Thêm vào project”, choose B → selectReferencesForProject for B with R;
    // no approval step.
    const { user } = await openRef(2);
    await user.click(screen.getByRole('button', { name: 'Thêm vào project' }));
    const dialog = screen.getByRole('dialog', { name: 'Thêm vào project' });
    expect(within(dialog).getByText('Reference đã Trusted được dùng ngay trong project, không cần duyệt lại.')).toBeTruthy();
    await user.click(await within(dialog).findByRole('radio', { name: projects.learning.name }));
    await user.click(within(dialog).getByRole('button', { name: 'Thêm vào project' }));
    expect(await screen.findByText('Đã thêm vào project.')).toBeTruthy();
    const [call] = callsOf('selectReferencesForProject');
    expect(call.body).toEqual({ referenceIds: [referenceId(2)] });
    expect(store.selections(projects.learning.id).map((row) => row.referenceId)).toEqual([referenceId(2)]);
    expect(callsOf('decideReferences')).toHaveLength(0);
    expect(within(card('Project đang dùng')).getByRole('link', { name: projects.learning.name })).toBeTruthy();
  });

  it('thêm vào project các trường hợp', async () => {
    // EC37: a project already using R is disabled with “đã có”; with no Active project → empty with a link.
    const { user } = await openRef(2);
    await user.click(screen.getByRole('button', { name: 'Thêm vào project' }));
    const dialog = screen.getByRole('dialog', { name: 'Thêm vào project' });
    await within(dialog).findByRole('radio', { name: projects.learning.name });
    const used = dialog.querySelector<HTMLInputElement>(`input[value="${projects.rag.id}"]`)!;
    expect(used.disabled).toBe(true);
    expect(used.closest('label')!.textContent).toBe(`${projects.rag.name} · đã có`);
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    mock.use({ overrides: { listProjects: () => ({ status: 200, body: { items: [], nextCursor: null } }) } });
    await user.click(screen.getByRole('button', { name: 'Thêm vào project' }));
    const empty = screen.getByRole('dialog', { name: 'Thêm vào project' });
    expect(await within(empty).findByText(/Chưa có project đang hoạt động\./)).toBeTruthy();
    expect(within(empty).getByRole('link', { name: 'Research Projects' }).getAttribute('href')).toBe('/projects');
  });

  it('reference chờ duyệt không thêm vào project', async () => {
    // LIB-PROJECT-001-AC02: Pending Approval → no “Thêm vào project”; a 422 reference_not_trusted shows reason and code.
    const pending = await openRef(7);
    expect(screen.getByText('Duyệt: Pending Approval')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thêm vào project' })).toBeNull();
    pending.close();
    const { user } = await openRef(2);
    await user.click(screen.getByRole('button', { name: 'Thêm vào project' }));
    const dialog = screen.getByRole('dialog', { name: 'Thêm vào project' });
    await user.click(await within(dialog).findByRole('radio', { name: projects.learning.name }));
    store.reference(referenceId(2))!.approvalStatus = 'Revoked'; // revoked in another tab meanwhile
    await user.click(within(dialog).getByRole('button', { name: 'Thêm vào project' }));
    expect(await within(dialog).findByText('Chỉ Trusted Reference được thêm vào project (reference_not_trusted)')).toBeTruthy();
  });

  it('thu hồi nêu ảnh hưởng hai project', async () => {
    // LIB-LIFECYCLE-001-AC01, EC38, EC34: 4 evidence in two projects → the dialog states 2 projects and 4 Stale before the
    // confirm button; the reason is required; “Giữ Trusted” sends nothing; confirming calls revokeReference once with the
    // reason, the chip turns Revoked and the impact summary shows.
    const usage = demoUsage();
    usage[referenceId(1)] = [
      { projectId: projects.rag.id, name: projects.rag.name, evidenceCount: 3, citationCount: 2 },
      { projectId: projects.learning.id, name: projects.learning.name, evidenceCount: 1, citationCount: 1 },
    ];
    scenario({ usage });
    const { user } = await openRef(1);
    await user.click(screen.getByRole('button', { name: 'Thu hồi' }));
    let dialog = screen.getByRole('dialog', { name: 'Thu hồi reference khỏi Trusted Library?' });
    await user.click(within(dialog).getByRole('button', { name: 'Giữ Trusted' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(callsOf('revokeReference')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Thu hồi' }));
    dialog = screen.getByRole('dialog', { name: 'Thu hồi reference khỏi Trusted Library?' });
    const consequence = within(dialog).getByText('2 project đang dùng; 4 evidence sẽ chuyển Stale và citation tới reference này sẽ báo lỗi.');
    const confirm = within(dialog).getByRole('button', { name: 'Thu hồi' });
    expect(consequence.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(confirm);
    expect(within(dialog).getByText('Cần nhập lý do thu hồi')).toBeTruthy();
    expect(callsOf('revokeReference')).toHaveLength(0);
    await user.type(within(dialog).getByRole('textbox', { name: 'Lý do (bắt buộc)' }), 'Bài đã bị rút');
    await user.click(confirm);
    expect(await screen.findByText('Duyệt: Revoked')).toBeTruthy();
    expect(callsOf('revokeReference').map((call) => call.body)).toEqual([{ reason: 'Bài đã bị rút' }]);
    expect(screen.getByText('Đã thu hồi. Ảnh hưởng: 2 project, 4 evidence chuyển Stale.')).toBeTruthy();
  });

  it('sửa tiêu đề giữ key', async () => {
    // LIB-METADATA-001-AC02: Trusted, key K, version 2 → edit the title: updateReferenceMetadata sends If-Match and the full
    // metadata with the new title, never bibtexKey; the page shows “phiên bản 3” and K unchanged.
    const references = demoReferences();
    Object.assign(references[1], { rowVersion: 2, metadataVersion: 2 });
    scenario({ references });
    const { user } = await openRef(2);
    expect(screen.getByRole('heading', { name: 'Metadata · phiên bản 2' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Sửa metadata' }));
    const title = screen.getByRole('textbox', { name: 'Tiêu đề' });
    await user.clear(title);
    await user.type(title, 'Dense Passage Retrieval (bản sửa)');
    await user.click(screen.getByRole('button', { name: 'Lưu metadata' }));
    expect(await screen.findByRole('heading', { name: 'Metadata · phiên bản 3' })).toBeTruthy();
    const [call] = callsOf('updateReferenceMetadata');
    expect(call.headers?.['if-match']).toBe('"2"');
    expect(call.headers?.['content-type']).toBe('application/merge-patch+json');
    expect(Object.keys(call.body as object)).toEqual(['metadata']);
    expect(call.body).toEqual({ metadata: expect.objectContaining({ title: 'Dense Passage Retrieval (bản sửa)', identifiers: references[1].metadata.identifiers, authors: references[1].metadata.authors, year: 2020 }) });
    expect(dt(card('Metadata · phiên bản 3'), 'BibTeX key').textContent).toBe('karpukhin2020dpr');
    expect(screen.getByRole('heading', { level: 1, name: 'Dense Passage Retrieval (bản sửa)' })).toBeTruthy();
  });

  it('sửa xung đột phiên bản', async () => {
    // EC35: changed elsewhere (412) → says so, reads the reference again, keeps what the user typed.
    const { user } = await openRef(2);
    await user.click(screen.getByRole('button', { name: 'Sửa metadata' }));
    const title = screen.getByRole('textbox', { name: 'Tiêu đề' });
    await user.clear(title);
    await user.type(title, 'Tiêu đề đang sửa');
    const row = store.reference(referenceId(2))!;
    row.rowVersion += 1; // saved from another tab
    row.metadata = { ...row.metadata, venue: 'EMNLP 2020' };
    await user.click(screen.getByRole('button', { name: 'Lưu metadata' }));
    expect(await screen.findByText('Reference đã đổi ở nơi khác. Đã đọc lại; nội dung bạn nhập vẫn giữ để sửa lại.')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Tiêu đề' }) as HTMLInputElement).value).toBe('Tiêu đề đang sửa');
    await waitFor(() => expect(dt(card(/^Metadata · phiên bản/), 'Nơi công bố').textContent).toBe('EMNLP 2020'));
    await user.click(screen.getByRole('button', { name: 'Lưu metadata' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Tiêu đề đang sửa' })).toBeTruthy();
    expect(callsOf('updateReferenceMetadata')[1].headers?.['if-match']).toBe(`"${row.rowVersion - 1}"`);
  });

  it('giữ nháp nhập thủ công khi sửa metadata', async () => {
    // EC27 (metadata part): the text being typed survives leaving the page (session expiry, sign-in again) and the form
    // reopens with it; “Hủy” clears the draft.
    const first = await openRef(2);
    await first.user.click(screen.getByRole('button', { name: 'Sửa metadata' }));
    const title = screen.getByRole('textbox', { name: 'Tiêu đề' });
    await first.user.clear(title);
    await first.user.type(title, 'Tiêu đề chưa lưu');
    first.close();
    const second = await openRef(2);
    expect((screen.getByRole('textbox', { name: 'Tiêu đề' }) as HTMLInputElement).value).toBe('Tiêu đề chưa lưu');
    await second.user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('textbox', { name: 'Tiêu đề' })).toBeNull();
    second.close();
    await openRef(2);
    expect(screen.queryByRole('textbox', { name: 'Tiêu đề' })).toBeNull();
    expect(callsOf('updateReferenceMetadata')).toHaveLength(0);
  });

  it('Revoked chỉ đọc', async () => {
    // EC36: Revoked → no edit, add or revoke; only “Duyệt lại” (and “Xóa” when unused); reinstating makes it Trusted.
    const { user } = await openRef(6);
    expect(screen.getByText('Duyệt: Revoked')).toBeTruthy();
    expect(screen.getByText('Đã thu hồi — không dùng cho citation hay evidence mới.')).toBeTruthy();
    for (const name of ['Sửa metadata', 'Thêm vào project', 'Thu hồi', 'Xóa', 'Tải PDF lên', 'Thay PDF']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(dt(card('Provenance'), 'Lý do thu hồi').textContent).toBe('Bài đã bị rút (retracted).');
    // H17 (QC G3): “Duyệt lại” asks first, with an optional reason.
    await user.click(screen.getByRole('button', { name: 'Duyệt lại' }));
    const dialog = screen.getByRole('dialog', { name: 'Duyệt lại reference?' });
    await user.click(within(dialog).getByRole('button', { name: 'Giữ nguyên' }));
    expect(callsOf('reinstateReference')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Duyệt lại' }));
    const again = screen.getByRole('dialog', { name: 'Duyệt lại reference?' });
    await user.type(within(again).getByRole('textbox', { name: 'Lý do (không bắt buộc)' }), 'Bản đính chính đã ra');
    await user.click(within(again).getByRole('button', { name: 'Duyệt lại' }));
    expect(await screen.findByText('Duyệt: Trusted')).toBeTruthy();
    expect(callsOf('reinstateReference').map((call) => call.body)).toEqual([{ reason: 'Bản đính chính đã ra' }]);
  });

  it('sửa metadata đủ trường', async () => {
    // H17 P12 (QC G12): authors as a list (add, reorder, remove), publication type, identifiers, abstract; fields the form
    // does not show (source, retrievedAt, sourceId) are kept.
    const { user } = await openRef(2);
    await user.click(screen.getByRole('button', { name: 'Sửa metadata' }));
    await user.click(screen.getByRole('button', { name: 'Thêm tác giả' }));
    await user.type(screen.getByRole('textbox', { name: 'Tác giả 4' }), 'W. Yih');
    await user.click(screen.getByRole('button', { name: 'Đưa tác giả 4 lên' }));
    await user.click(screen.getByRole('button', { name: 'Bỏ tác giả 1' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Loại tài liệu' }), 'article');
    await user.type(screen.getByRole('textbox', { name: 'DOI' }), '10.18653/v1/2020.emnlp-main.550');
    await user.type(screen.getByRole('textbox', { name: 'Mô tả' }), 'Dense retrieval.');
    await user.click(screen.getByRole('button', { name: 'Lưu metadata' }));
    await screen.findByRole('heading', { name: /^Metadata · phiên bản 2/ });
    const { metadata } = callsOf('updateReferenceMetadata')[0].body as { metadata: Record<string, unknown> & { identifiers: Record<string, string> } };
    expect(metadata.authors).toEqual([{ name: 'B. Oğuz' }, { name: 'W. Yih' }, { name: 'S. Min' }]);
    expect(metadata.publicationType).toBe('article');
    expect(metadata.abstractOrSnippet).toBe('Dense retrieval.');
    expect(metadata.identifiers).toMatchObject({ doi: '10.18653/v1/2020.emnlp-main.550', arxivId: '2004.04906', sourceId: 'W4390000002' });
    expect(metadata).toMatchObject({ source: 'openalex', year: 2020, venue: 'EMNLP' });
  });

  it('thay PDF hỏi trước', async () => {
    // H16 (QC G3): with a document, “Thay PDF” says the reference is indexed again before the file chooser opens.
    const { user } = await openRef(2);
    const chooser = vi.spyOn(screen.getByTestId('reference-pdf-input'), 'click');
    await user.click(screen.getByRole('button', { name: 'Thay PDF' }));
    const dialog = screen.getByRole('dialog', { name: 'Thay PDF?' });
    expect(within(dialog).getByText(/karpukhin2020dpr\.pdf.*index lại/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Giữ tệp hiện tại' }));
    expect(chooser).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Thay PDF' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Thay PDF?' })).getByRole('button', { name: 'Chọn tệp PDF' }));
    expect(chooser).toHaveBeenCalledTimes(1);
  });

  it('xóa bị từ chối khi đang dùng', async () => {
    // EC39: used → no “Xóa”; unused when opened but used by the time of the click (409) → where it is used, suggest revoke.
    const used = await openRef(1);
    expect(screen.queryByRole('button', { name: 'Xóa' })).toBeNull();
    used.close();
    const { user } = await openRef(5);
    await user.click(screen.getByRole('button', { name: 'Xóa' }));
    const dialog = screen.getByRole('dialog', { name: 'Xóa reference?' });
    store.addUsage(referenceId(5), { projectId: projects.rag.id, name: projects.rag.name, evidenceCount: 0, citationCount: 1 });
    await user.click(within(dialog).getByRole('button', { name: 'Xóa' }));
    expect(await screen.findByText(/Không xóa được: reference đang được dùng ở project\..*Thu hồi thay vì xóa\./)).toBeTruthy();
    expect(store.reference(referenceId(5))).toBeTruthy();
    expect(await within(card('Project đang dùng')).findByRole('link', { name: projects.rag.name })).toBeTruthy();
  });

  it('xóa khi không dùng', async () => {
    // S09, H17 (QC G4): an unused Trusted reference can be deleted after the confirmation; cancelling sends nothing
    // (EC34); deleted → back to /library with the notice, not the shell's “Không tìm thấy trang”.
    const { user, router } = await openRef(5);
    await user.click(screen.getByRole('button', { name: 'Xóa' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Xóa reference?' })).getByRole('button', { name: 'Giữ reference' }));
    expect(callsOf('deleteReference')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Xóa' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Xóa reference?' })).getByRole('button', { name: 'Xóa' }));
    expect(await screen.findByText('Đã xóa reference.')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/library');
    expect(screen.queryByText('Không tìm thấy trang')).toBeNull();
    expect(store.reference(referenceId(5))).toBeUndefined();
    expect(callsOf('deleteReference')).toHaveLength(1);
  });

  it('gộp từ trang reference mở reference đích', async () => {
    // H17 (QC G4): merged → the page of the reference that stays.
    const { user, router } = await openRef(2);
    await user.click(screen.getByRole('button', { name: 'Gộp' }));
    const dialog = screen.getByRole('dialog', { name: 'Gộp vào reference khác' });
    await user.click(await within(dialog).findByRole('radio', { name: /lewis2020rag/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Gộp' }));
    expect(await screen.findByRole('heading', { level: 1, name: papers.lewis.title })).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/library/${referenceId(1)}`);
    expect(callsOf('mergeReference')[0].body).toEqual({ intoReferenceId: referenceId(1) });
  });

  it('duyệt từ trang Reference', async () => {
    // S09: a Pending Approval reference can be approved from its page; it becomes Trusted.
    const { user } = await openRef(9);
    expect(screen.getByText('Chưa duyệt — không dùng làm nguồn cho citation hay evidence.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Duyệt' }));
    expect(await screen.findByText('Duyệt: Trusted')).toBeTruthy();
    expect(callsOf('decideReferences')[0].body).toEqual({ decisions: [{ referenceId: referenceId(9), decision: 'approve', metadataVersion: 1 }] });
  });
});
