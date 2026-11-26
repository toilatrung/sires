// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00098 Trusted Library (S06) and batch approval (S07).

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Schemas } from '../../shell/mock';
import { demoReferences, papers, referenceId } from './__mocks__/data';
import { callsOf, problemResponse, useLibraryMock } from './test-utils';

type Reference = Schemas['Reference'];
const nonPending = () => demoReferences().filter((ref) => ref.approvalStatus !== 'Pending Approval');
const copyOf = (base: Reference, n: number, patch: Partial<Reference>): Reference => ({
  ...structuredClone(base), id: `4e000000-0000-4000-8000-${String(900 + n).padStart(12, '0')}`, bibtexKey: `ref${n}`, ...patch,
});
const rowOf = async (text: string) => (await screen.findByText(text)).closest('tr')!;
const pendingItem = async (title: string) => (await screen.findByRole('link', { name: title })).closest('li')!;

describe('Trusted Library (S06)', () => {
  const { renderAt, mock, store, scenario } = useLibraryMock();

  it('thư viện trống', async () => {
    // UX-STATE-002-AC01, EC28: nothing at all → reason and “Tìm tài liệu ở Discover” leading to /discover.
    scenario({ references: [], usage: {} });
    const { user, router } = renderAt('/library');
    const action = await screen.findByRole('link', { name: 'Tìm tài liệu ở Discover' });
    expect(screen.getByText('Trusted Library chưa có reference')).toBeTruthy();
    expect(screen.getByText(/Reference vào đây sau khi bạn duyệt/)).toBeTruthy();
    await user.click(action);
    expect(router.state.location.pathname).toBe('/discover');
  });

  it('thư viện trống còn mục chờ duyệt', async () => {
    // UX-STATE-002 (variant), EC28: no Trusted reference but pending ones → the reason points at the panel above.
    scenario({ references: demoReferences().filter((ref) => ref.approvalStatus === 'Pending Approval'), usage: {} });
    renderAt('/library');
    expect(await screen.findByText('Có 5 reference đang chờ bạn duyệt ở phần trên.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Tìm tài liệu ở Discover' })).toBeNull();
  });

  it('lọc rỗng có Xóa lọc', async () => {
    // EC28: filters with no match → its own reason and “Xóa lọc” back to the default filters.
    const { user } = renderAt('/library');
    await screen.findByText('lewis2020rag');
    await user.type(screen.getByRole('searchbox', { name: 'Tìm trong Trusted Library' }), 'zzz');
    expect(await screen.findByText('Không có reference khớp bộ lọc')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Xóa lọc' }));
    expect(await screen.findByText('lewis2020rag')).toBeTruthy();
  });

  it('hai trạng thái trên dòng', async () => {
    // UX-REF-002 (row part): approval and indexing are two chips; Failed and Unavailable carry their note.
    renderAt('/library');
    const liu = await rowOf('liu2024lost');
    expect(within(liu).getByText('Trusted')).toBeTruthy();
    expect(within(liu).getByText('Unavailable')).toBeTruthy();
    expect(within(liu).getByText('Citation được, evidence không')).toBeTruthy();
    const gao = await rowOf('gao2023survey');
    expect(within(gao).getByText('Failed')).toBeTruthy();
    expect(within(gao).getByText('PDF không có lớp văn bản (chỉ có ảnh quét).')).toBeTruthy();
    const lewis = await rowOf('lewis2020rag');
    expect(within(lewis).getByText('2 project')).toBeTruthy();
    expect(screen.queryByText('doe2023hd')).toBeNull(); // Revoked is not in the default filter
  });

  it('lọc theo trạng thái duyệt', async () => {
    // S06 filters: approval Revoked shows the revoked reference only.
    const { user } = renderAt('/library');
    await screen.findByText('lewis2020rag');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Duyệt' }), 'Revoked');
    expect(await screen.findByText('doe2023hd')).toBeTruthy();
    expect(screen.queryByText('lewis2020rag')).toBeNull();
  });

  it('nguồn discovery lỗi không ảnh hưởng', async () => {
    // DISC-SCHOLAR-002-AC02: the discovery operations fail with 503; Library and Reference still work and never call them.
    let discoveryCalls = 0;
    const fail = () => { discoveryCalls += 1; return new Response(null, { status: 503 }); };
    mock.use({ overrides: { listDiscoverySources: fail, startDiscoverySearch: fail, startAuthorSearch: fail, listDiscoveredResults: fail } });
    const { user } = renderAt('/library');
    await user.click(await screen.findByRole('link', { name: papers.lewis.title }));
    expect(await screen.findByRole('heading', { level: 1, name: papers.lewis.title })).toBeTruthy();
    expect(screen.getByText('Duyệt: Trusted')).toBeTruthy();
    expect(discoveryCalls).toBe(0);
  });

  it('đang tải', async () => {
    // EC45: skeleton rows and one role="status" line while the table loads.
    mock.use({ overrides: { listReferences: async () => { await new Promise((r) => setTimeout(r, 400)); return { status: 200, body: { items: [], nextCursor: null } }; } } });
    renderAt('/library');
    const status = await screen.findByText('Đang tải Trusted Library…');
    expect(status.getAttribute('role')).toBe('status');
  });

  it('lỗi tại phần', async () => {
    // EC29: the table fails with its code and “Thử lại”; the pending panel above still shows.
    let failTable = true;
    mock.use({ overrides: { listReferences: ({ request }) => {
      const pendingOnly = new URL(request.url).searchParams.getAll('approvalStatus').includes('Pending Approval');
      if (!pendingOnly && failTable) return problemResponse(500, 'internal_error');
      const rows = store.references().filter((ref) => (pendingOnly ? ref.approvalStatus === 'Pending Approval' : ref.approvalStatus === 'Trusted'));
      return { status: 200, body: { items: structuredClone(rows), nextCursor: null } };
    } } });
    const { user } = renderAt('/library');
    const alert = (await screen.findByText('Không tải được Trusted Library')).closest('[role="alert"]') as HTMLElement;
    expect(within(alert).getByText('internal_error')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '5 reference chờ duyệt' })).toBeTruthy();
    failTable = false;
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('lewis2020rag')).toBeTruthy();
  });

  it('tải thêm', async () => {
    // EC30: more than one page → count with “+” and “Tải thêm” with nextCursor.
    const many = Array.from({ length: 55 }, (_, n) => copyOf(demoReferences()[0], n, {}));
    scenario({ references: many, usage: {} });
    const { user } = renderAt('/library');
    expect(await screen.findByText('ref49')).toBeTruthy();
    expect(screen.queryByText('ref50')).toBeNull();
    expect(screen.getByText('50 reference+')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Tải thêm' }));
    expect(await screen.findByText('ref54')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).toBeNull();
  });

  it('cập nhật theo sự kiện', async () => {
    // EC31: an indexing change while the user watches reloads the row (SSE reference.indexing_status_changed).
    renderAt('/library');
    expect(within(await rowOf('asai2024selfrag')).getByText('Indexing')).toBeTruthy();
    store.reference(referenceId(5))!.indexingStatus = 'Indexed';
    mock.events.emit({ type: 'reference.indexing_status_changed', objectType: 'reference', objectId: referenceId(5), fromState: 'Indexing', toState: 'Indexed' });
    await waitFor(() => expect(within(screen.getByText('asai2024selfrag').closest('tr')!).getByText('Indexed')).toBeTruthy());
  });
});

describe('Duyệt theo lô (S07)', () => {
  const { renderAt, store, scenario } = useLibraryMock();

  it('sửa năm rồi duyệt', async () => {
    // LIB-APPROVAL-001-AC02: year 2023 → 2024 then “Lưu và duyệt”: one decision carrying editedMetadata.year.
    const { user } = renderAt('/library');
    const item = await pendingItem(papers.jiang.title);
    await user.click(within(item).getByRole('button', { name: 'Sửa metadata' }));
    const year = within(item).getByRole('textbox', { name: 'Năm' });
    await user.clear(year);
    await user.type(year, '2024');
    await user.click(within(item).getByRole('button', { name: 'Lưu và duyệt' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '4 reference chờ duyệt' })).toBeTruthy());
    const calls = callsOf('decideReferences');
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ decisions: [expect.objectContaining({ referenceId: referenceId(9), decision: 'approve', metadataVersion: 1, editedMetadata: expect.objectContaining({ year: 2024, title: papers.jiang.title }) })] });
    expect(store.reference(referenceId(9))).toMatchObject({ approvalStatus: 'Trusted', metadataVersion: 2, metadata: { year: 2024 } });
    expect(await screen.findByText('jiang2023active')).toBeTruthy(); // now a row of the Trusted table
  });

  it('duyệt lô 20', async () => {
    // LIB-APPROVAL-001-AC05: 20 pending without duplicate → one decideReferences with 20 approve decisions.
    const pendingBase = demoReferences().find((ref) => ref.id === referenceId(7))!;
    const twenty = Array.from({ length: 20 }, (_, n) => copyOf(pendingBase, n, { metadata: { ...pendingBase.metadata, title: `Pending reference ${n}` } }));
    scenario({ references: [...nonPending(), ...twenty], usage: {} });
    const { user } = renderAt('/library');
    await user.click(await screen.findByRole('button', { name: 'Duyệt 20 mục đã chọn' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: /reference chờ duyệt/ })).toBeNull());
    const calls = callsOf('decideReferences');
    expect(calls).toHaveLength(1);
    expect(calls[0].headers?.['idempotency-key']).toBeTruthy();
    const { decisions } = calls[0].body as { decisions: { referenceId: string; decision: string; metadataVersion: number }[] };
    expect(decisions).toHaveLength(20);
    expect(decisions.every((d) => d.decision === 'approve' && d.metadataVersion === 1)).toBe(true);
    expect(await screen.findByText('ref3')).toBeTruthy(); // now in the Trusted table
  });

  it('mục nghi trùng ngoài lô', async () => {
    // LIB-APPROVAL-001-AC06, EC32: the suspected duplicate has no checkbox, stays out of the batch, has its own three buttons.
    const { user } = renderAt('/library');
    const item = await pendingItem(papers.chen.title);
    expect(within(item).queryByRole('checkbox')).toBeNull();
    expect(within(item).getByText(/Có thể trùng:/)).toBeTruthy();
    expect(await within(item).findByRole('link', { name: papers.chenPreprint.title })).toBeTruthy();
    for (const name of ['Gộp', 'Giữ riêng và duyệt', 'Từ chối']) expect(within(item).getByRole('button', { name })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Duyệt 4 mục đã chọn' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '1 reference chờ duyệt' })).toBeTruthy());
    const ids = (callsOf('decideReferences')[0].body as { decisions: { referenceId: string }[] }).decisions.map((d) => d.referenceId);
    expect(ids).toHaveLength(4);
    expect(ids).not.toContain(referenceId(8));
    expect(screen.getByRole('link', { name: papers.chen.title })).toBeTruthy();
  });

  it('gộp mục nghi trùng', async () => {
    // EC32: “Gộp” merges into the existing reference; the item leaves the panel.
    const { user } = renderAt('/library');
    const item = await pendingItem(papers.chen.title);
    await user.click(within(item).getByRole('button', { name: 'Gộp' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: papers.chen.title })).toBeNull());
    expect(callsOf('mergeReference')[0].body).toEqual({ intoReferenceId: referenceId(12) });
  });

  it('giữ riêng và duyệt có lý do', async () => {
    // EC32: “Giữ riêng và duyệt” approves the duplicate alone with a reason.
    const { user } = renderAt('/library');
    const item = await pendingItem(papers.chen.title);
    await user.click(within(item).getByRole('button', { name: 'Giữ riêng và duyệt' }));
    await waitFor(() => expect(store.reference(referenceId(8))?.approvalStatus).toBe('Trusted'));
    const { decisions } = callsOf('decideReferences')[0].body as { decisions: { referenceId: string; reason?: string }[] };
    expect(decisions).toEqual([expect.objectContaining({ referenceId: referenceId(8), decision: 'approve', reason: 'Giữ riêng: không phải bản trùng' })]);
  });

  it('reference DOI vẫn chờ duyệt', async () => {
    // LIB-APPROVAL-001-AC07: a DOI import lands in the pending panel as Pending Approval, never in the Trusted table.
    scenario({ references: nonPending(), usage: {} });
    const { user, go } = renderAt('/discover');
    await user.type(await screen.findByRole('textbox', { name: 'DOI (mỗi dòng một DOI)' }), '10.1234/abc.2024');
    await user.click(screen.getAllByRole('button', { name: 'Thêm vào luồng duyệt' })[0]);
    expect(await screen.findByRole('link', { name: 'Pending Approval' })).toBeTruthy();
    await go('/library');
    const panel = (await screen.findByRole('heading', { name: '1 reference chờ duyệt' })).closest('section')!;
    expect(within(panel).getByRole('link', { name: 'Tài liệu DOI 10.1234/abc.2024' })).toBeTruthy();
    await screen.findByText('lewis2020rag');
    expect(within(screen.getByRole('table')).queryByText('Tài liệu DOI 10.1234/abc.2024')).toBeNull();
  });

  it('duyệt một phần lỗi', async () => {
    // EC33: an item skipped by the server (metadata changed since viewed) stays with its error; the others become Trusted.
    const { user } = renderAt('/library');
    await pendingItem(papers.huang.title);
    store.reference(referenceId(7))!.metadataVersion = 2; // edited elsewhere after the panel loaded
    await user.click(screen.getByRole('button', { name: 'Duyệt 4 mục đã chọn' }));
    const error = await screen.findByText('Metadata đã đổi sau khi bạn xem.');
    expect(within(error.closest('li')!).getByRole('link', { name: papers.huang.title })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('heading', { name: '2 reference chờ duyệt' })).toBeTruthy());
    expect(store.reference(referenceId(9))?.approvalStatus).toBe('Trusted');
    expect(store.reference(referenceId(7))?.approvalStatus).toBe('Pending Approval');
  });

  it('từ chối có hộp xác nhận', async () => {
    // S07: rejecting the selection asks first (consequence, optional reason), then sends reject decisions.
    const { user } = renderAt('/library');
    await pendingItem(papers.huang.title);
    await user.click(screen.getByRole('button', { name: 'Từ chối đã chọn' }));
    const dialog = screen.getByRole('dialog', { name: 'Từ chối 4 reference?' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Lý do (không bắt buộc)' }), 'Ngoài phạm vi');
    await user.click(within(dialog).getByRole('button', { name: 'Từ chối 4 mục' }));
    await waitFor(() => expect(store.reference(referenceId(7))?.approvalStatus).toBe('Rejected'));
    const { decisions } = callsOf('decideReferences')[0].body as { decisions: { decision: string; reason?: string }[] };
    expect(decisions.every((d) => d.decision === 'reject' && d.reason === 'Ngoài phạm vi')).toBe(true);
  });

  it('hủy dialog không đổi gì', async () => {
    // EC34: cancelling the dialog sends nothing and keeps the selection.
    const { user } = renderAt('/library');
    await pendingItem(papers.huang.title);
    await user.click(screen.getByRole('button', { name: 'Từ chối đã chọn' }));
    await user.click(screen.getByRole('button', { name: 'Giữ chờ duyệt' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(callsOf('decideReferences')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Duyệt 4 mục đã chọn' })).toBeTruthy();
  });

  it('bỏ chọn hết thì không duyệt được', async () => {
    // S07: with nothing selected the batch buttons are disabled and say why.
    const { user } = renderAt('/library');
    await pendingItem(papers.huang.title);
    for (const title of [papers.huang.title, papers.jiang.title, papers.es.title, papers.shi.title]) {
      await user.click(screen.getByRole('checkbox', { name: `Chọn: ${title}` }));
    }
    const approve = screen.getByRole('button', { name: 'Duyệt 0 mục đã chọn' }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(screen.getByText('Chưa chọn mục nào')).toBeTruthy();
  });
});
