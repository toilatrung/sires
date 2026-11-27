// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00098 manual import on Discover (S05): DOI, BibTeX, PDF — everything lands in Pending Approval.

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import { demoReferences, referenceId } from './__mocks__/data';
import { callsOf, useLibraryMock } from './test-utils';

const doiBox = () => screen.getByRole('textbox', { name: 'DOI (mỗi dòng một DOI)' }) as HTMLTextAreaElement;
const bibBox = () => screen.getByRole('textbox', { name: 'BibTeX' }) as HTMLTextAreaElement;
const manual = () => document.getElementById('nhap-thu-cong')!;
const results = () => within(manual()).getByRole('list', { name: 'Kết quả nhập' });
const submitDoi = () => within(manual()).getAllByRole('button', { name: 'Thêm vào luồng duyệt' })[0];
const submitBib = () => within(manual()).getAllByRole('button', { name: 'Thêm vào luồng duyệt' })[1];
const pdfInput = () => within(manual()).getByLabelText('PDF') as HTMLInputElement;
const pdf = (name: string, size?: number, type = 'application/pdf') => {
  const file = new File(['%PDF-1.7 demo'], name, { type });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('Nhập thủ công (S05)', () => {
  const { renderAt, store, scenario, sent } = useLibraryMock();

  async function open() {
    const view = renderAt('/discover');
    await screen.findByRole('heading', { name: 'Nhập thủ công' });
    return view;
  }

  it('ba DOI chờ duyệt', async () => {
    // LIB-IMPORT-002-AC01: 3 valid DOIs → 3 createReferenceManually, one DOI and one Idempotency-Key each; 3 Pending Approval.
    const { user } = await open();
    await user.type(doiBox(), '10.1234/alpha.2024{Enter}10.5555/beta-77{Enter}10.48550/arxiv.2401.00001');
    await user.click(submitDoi());
    await waitFor(() => expect(within(results()).getAllByRole('link', { name: 'Pending Approval' })).toHaveLength(3));
    const calls = callsOf('createReferenceManually');
    expect(calls.map((call) => call.body)).toEqual([{ doi: '10.1234/alpha.2024' }, { doi: '10.5555/beta-77' }, { doi: '10.48550/arxiv.2401.00001' }]);
    expect(new Set(calls.map((call) => call.headers?.['idempotency-key'])).size).toBe(3);
    const created = store.references().filter((ref) => ref.metadata.source === 'crossref');
    expect(created.map((ref) => ref.approvalStatus)).toEqual(['Pending Approval', 'Pending Approval', 'Pending Approval']);
    expect(doiBox().value).toBe('');
  });

  it('DOI sai mẫu', async () => {
    // EC22: prefixes are dropped; a wrong line is reported and kept, the others sent; more than 50 lines sends nothing.
    const { user } = await open();
    await user.type(doiBox(), 'https://doi.org/10.1234/alpha{Enter}doi:10.1234/beta{Enter}không phải doi');
    await user.click(submitDoi());
    expect(await screen.findByText('Dòng không đúng mẫu DOI, chưa gửi: không phải doi')).toBeTruthy();
    await waitFor(() => expect(callsOf('createReferenceManually')).toHaveLength(2));
    expect(callsOf('createReferenceManually').map((call) => call.body)).toEqual([{ doi: '10.1234/alpha' }, { doi: '10.1234/beta' }]);
    await waitFor(() => expect(doiBox().value).toBe('không phải doi'));

    await user.clear(doiBox());
    await user.click(doiBox());
    await user.paste(Array.from({ length: 51 }, (_, i) => `10.1234/item${i}`).join('\n'));
    await user.click(submitDoi());
    expect(await screen.findByText('Tối đa 50 dòng mỗi lần; chưa gửi.')).toBeTruthy();
    expect(callsOf('createReferenceManually')).toHaveLength(2);
  });

  it('DOI không phân giải', async () => {
    // EC23: an unresolvable DOI (422) → error line with reason and code; the line stays in the box to fix and retry.
    scenario({ unresolvableDois: ['10.1234/khong-co'] });
    const { user } = await open();
    await user.type(doiBox(), '10.1234/khong-co{Enter}10.1234/co-that');
    await user.click(submitDoi());
    expect(await within(manual()).findByText(/Dữ liệu không hợp lệ hoặc không phân giải được \(schema_invalid\)/)).toBeTruthy();
    expect(within(results()).getAllByRole('link', { name: 'Pending Approval' })).toHaveLength(1);
    await waitFor(() => expect(doiBox().value).toBe('10.1234/khong-co'));
  });

  it('BibTeX có entry lỗi', async () => {
    // EC24: 201 with errors → the parsed entry is Pending Approval, the broken one shows its reason; the text stays.
    const { user } = await open();
    await user.click(bibBox());
    await user.paste('@article{tot2024,\n  title = {Một bài tốt},\n  author = {Trần An and Lê Bình},\n  year = {2024}\n}\n@article{hong2024,\n  title = {Thiếu tác giả},\n  year = {2024}\n}');
    await user.click(submitBib());
    await waitFor(() => expect(within(results()).getAllByRole('listitem')).toHaveLength(2));
    expect(within(results()).getByText('Một bài tốt')).toBeTruthy();
    expect(within(results()).getByRole('link', { name: 'Pending Approval' })).toBeTruthy();
    expect(within(results()).getByText('Entry hong2024: thiếu title hoặc author. (validation_failed)')).toBeTruthy();
    expect(bibBox().value).toContain('hong2024');
  });

  it('BibTeX trùng DOI', async () => {
    // LIB-IMPORT-002-AC02, EC25: an entry with the DOI of Trusted R → marked duplicate with a link to R and the merge hint.
    const references = demoReferences();
    references[0].metadata.identifiers.doi = '10.5555/rag.2020';
    scenario({ references });
    const { user } = await open();
    await user.click(bibBox());
    await user.paste('@inproceedings{lewis2020again,\n  title = {Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks},\n  author = {Patrick Lewis and Ethan Perez},\n  year = {2020},\n  doi = {10.5555/rag.2020}\n}');
    await user.click(submitBib());
    const item = (await within(manual()).findByText('Trùng reference có sẵn', { exact: false })).closest('li')!;
    expect(within(item).getByRole('link', { name: 'reference có sẵn' }).getAttribute('href')).toBe(`/library/${referenceId(1)}`);
    expect(within(item).getByRole('link', { name: 'đề xuất gộp ở Trusted Library' }).getAttribute('href')).toBe('/library');
    expect(bibBox().value).toBe('');
  });

  it('PDF bị từ chối', async () => {
    // LIB-IMPORT-002-AC03, EC26: 51 MB and non-PDF are refused on the device (no request); a scanned PDF gets 422
    // pdf_without_text_layer with its reason; no Pending Approval reference is created.
    const before = store.references().length;
    const { user } = await open();
    await user.upload(pdfInput(), pdf('lon.pdf', 51 * 1024 * 1024));
    expect(await within(manual()).findByText('Tệp lớn hơn 50 MB; chưa gửi.')).toBeTruthy();
    expect(sent('POST', '/references/pdf-imports')).toHaveLength(0);
    await user.upload(pdfInput(), pdf('scan-only.pdf'));
    expect(await within(manual()).findByText('PDF chỉ có ảnh quét, không có lớp văn bản (pdf_without_text_layer)')).toBeTruthy();
    expect(sent('POST', '/references/pdf-imports')).toHaveLength(1);
    // The picker filters by accept; a file chosen with “All files” still reaches onChange (last: it replaces input.files).
    fireEvent.change(pdfInput(), { target: { files: [pdf('ghi-chu.txt', 100, 'text/plain')] } });
    expect(await within(manual()).findByText('Tệp không phải PDF; chưa gửi.')).toBeTruthy();
    expect(sent('POST', '/references/pdf-imports')).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 30));
    expect(store.references()).toHaveLength(before);
  });

  it('PDF hợp lệ gửi multipart', async () => {
    // S05: a valid PDF goes as multipart/form-data (boundary set by fetch) and later appears as Pending Approval.
    const before = store.references().length;
    const { user } = await open();
    await user.upload(pdfInput(), pdf('bai-bao.pdf'));
    expect(await within(manual()).findByText('Đã nhận bai-bao.pdf; reference sẽ ở luồng duyệt khi xử lý xong.')).toBeTruthy();
    const [call] = callsOf('importReferenceFromPdf');
    expect(call.body).toEqual({ name: 'bai-bao.pdf' });
    expect(call.headers?.['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(call.headers?.['idempotency-key']).toBeTruthy();
    await waitFor(() => expect(store.references()).toHaveLength(before + 1));
    expect(store.references().at(-1)?.approvalStatus).toBe('Pending Approval');
  });

  it('giữ nháp nhập thủ công', async () => {
    // EC27: DOI and BibTeX text survive leaving the page (shell draft store) and are cleared after a successful send.
    const first = await open();
    await first.user.type(doiBox(), '10.1234/nhap');
    await first.user.click(bibBox());
    await first.user.paste('@misc{nhap, title = {Nháp}}');
    first.close();
    const second = await open();
    expect(doiBox().value).toBe('10.1234/nhap');
    expect(bibBox().value).toBe('@misc{nhap, title = {Nháp}}');
    await second.user.click(submitDoi());
    await waitFor(() => expect(doiBox().value).toBe(''));
    second.close();
    await open();
    expect(doiBox().value).toBe('');
    expect(bibBox().value).toBe('@misc{nhap, title = {Nháp}}');
  });

  it('đổi ngôn ngữ giữ nội dung', async () => {
    // EC43: switching VI → EN while typing changes the labels and keeps the text.
    const { user } = await open();
    await user.type(doiBox(), '10.1234/giu-nguyen');
    await act(async () => { await i18next.changeLanguage('en'); });
    const box = await screen.findByRole('textbox', { name: 'DOI (one per line)' }) as HTMLTextAreaElement;
    expect(box.value).toBe('10.1234/giu-nguyen');
    expect(screen.getByRole('heading', { name: 'Manual import' })).toBeTruthy();
    expect(within(manual()).getAllByRole('button', { name: 'Add to review' })).toHaveLength(2);
  });
});
