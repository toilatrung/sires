// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00098 Discover: search (S02), review and batch import (S03), author search (S04).
// Background steps run on `advance()` so an event never reaches the screen before the 202 does.

import { screen, waitFor, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Schemas } from '../../shell/mock';
import { account } from '../../shell/mock/fixtures/settings';
import { demoReferences, demoResults, demoSources, papers, referenceId, resultId, workflowId } from './__mocks__/data';
import type { LibraryScenario } from './__mocks__/store';
import { authorProfiles, callsOf, problemResponse, useLibraryMock } from './test-utils';

type User = ReturnType<typeof userEvent.setup>;
type Result = Schemas['DiscoveredResult'];
type ResultsFn = NonNullable<LibraryScenario['results']>;

const omit = <T extends object, K extends keyof T>(value: T, ...keys: K[]) =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key as K))) as Omit<T, K>;
const withoutDuplicate = (row: Result): Result => omit(row, 'duplicateOfReferenceId');
/** n results without duplicates, titled “Kết quả 1…n”, ids resultId(21…). */
const fresh = (n: number): ResultsFn => (workflowId, query, source) => {
  const base = withoutDuplicate(demoResults(workflowId, query, source)[1]);
  return Array.from({ length: n }, (_, i) => ({ ...structuredClone(base), id: resultId(21 + i), metadata: { ...base.metadata, title: `Kết quả ${i + 1}` } }));
};
const resultRow = (title: string) => screen.getByText(title, { selector: 'strong' }).closest('li')!;
const resultsList = () => document.querySelector<HTMLElement>('.library-results__list')!;
const rowsWithStatus = (status: string) => document.querySelectorAll(`.library-result[data-status="${status}"]`).length;

describe('Discover', () => {
  const { renderAt, mock, store, scenario, advance, sent } = useLibraryMock();
  const setup = (next: LibraryScenario = {}) => scenario({ advance: 'manual', ...next });

  /** Types the query (or author) and starts the search; returns once the long operation shows. */
  async function startSearch(user: User, text: string, tab?: 'Tác giả' | 'Tiêu đề' | 'Từ khóa') {
    if (tab) await user.click(await screen.findByRole('tab', { name: tab }));
    else await screen.findByText(/Nguồn: OpenAlex\./);
    await user.type(screen.getByRole('textbox', { name: tab === 'Tác giả' ? 'Tên tác giả' : 'Truy vấn' }), text);
    await user.click(screen.getByRole('button', { name: 'Tìm' }));
    await screen.findByText(`Đang tìm: ${text}`);
  }
  async function searchAndShow(user: User, text: string, tab?: 'Tác giả') {
    await startSearch(user, text, tab);
    await advance();
    return screen.findByRole('heading', { name: /kết quả\+? · Discovery Agent/ });
  }

  describe('Tìm (S02)', () => {
    it('nguồn yêu cầu xác minh', async () => {
      // DISC-SCHOLAR-001-AC02, EC04: the search workflow fails (lastError) → error box with the code and manual import; no
      // other startDiscoverySearch until “Tìm lại”.
      setup({ search: { kind: 'failed', code: 'auth_failed', message: 'Nguồn yêu cầu xác minh người dùng.' } });
      const { user } = renderAt('/discover');
      await startSearch(user, 'retrieval augmented generation');
      await advance();
      const alert = (await screen.findByText('Nguồn trả lỗi hoặc yêu cầu xác minh')).closest('[role="alert"]') as HTMLElement;
      expect(within(alert).getByText('auth_failed')).toBeTruthy();
      expect(within(alert).getByRole('link', { name: 'Nhập thủ công' }).getAttribute('href')).toBe('#nhap-thu-cong');
      await new Promise((r) => setTimeout(r, 60));
      expect(callsOf('startDiscoverySearch')).toHaveLength(1);
      await user.click(within(alert).getByRole('button', { name: 'Tìm lại' }));
      await waitFor(() => expect(callsOf('startDiscoverySearch')).toHaveLength(2));
    });

    it('nguồn giới hạn truy cập', async () => {
      // INT-SCHOLAR-002-AC01, EC04: lastError.code rate_limited → “Nguồn tạm giới hạn truy cập” with the code, nothing resent.
      setup({ search: { kind: 'failed', code: 'rate_limited', message: 'Quá nhiều yêu cầu tới nguồn.' } });
      const { user } = renderAt('/discover');
      await startSearch(user, 'hallucination');
      await advance();
      const alert = (await screen.findByText('Nguồn tạm giới hạn truy cập')).closest('[role="alert"]') as HTMLElement;
      expect(within(alert).getByText('rate_limited')).toBeTruthy();
      await new Promise((r) => setTimeout(r, 60));
      expect(callsOf('startDiscoverySearch')).toHaveLength(1);
    });

    it('truy vấn rỗng', async () => {
      // EC01: empty query → message on the field, no request.
      setup();
      const { user } = renderAt('/discover');
      await screen.findByText(/Nguồn: OpenAlex\./);
      await user.click(screen.getByRole('button', { name: 'Tìm' }));
      expect(screen.getByText('Nhập truy vấn trước khi tìm. Chưa tìm.')).toBeTruthy();
      expect(callsOf('startDiscoverySearch')).toHaveLength(0);
    });

    it('khoảng năm sai', async () => {
      // EC02: “Từ năm” after “Đến năm” → message, no request; a valid range goes into filters.
      setup();
      const { user } = renderAt('/discover');
      await screen.findByText(/Nguồn: OpenAlex\./);
      await user.type(screen.getByRole('textbox', { name: 'Truy vấn' }), 'rag');
      await user.type(screen.getByRole('textbox', { name: 'Từ năm' }), '2025');
      await user.type(screen.getByRole('textbox', { name: 'Đến năm' }), '2020');
      await user.click(screen.getByRole('button', { name: 'Tìm' }));
      expect(screen.getByText('“Từ năm” phải nhỏ hơn hoặc bằng “Đến năm”.')).toBeTruthy();
      expect(callsOf('startDiscoverySearch')).toHaveLength(0);
      await user.clear(screen.getByRole('textbox', { name: 'Từ năm' }));
      await user.type(screen.getByRole('textbox', { name: 'Từ năm' }), '2019');
      await user.click(screen.getByRole('button', { name: 'Tìm' }));
      await waitFor(() => expect(callsOf('startDiscoverySearch')).toHaveLength(1));
      expect(callsOf('startDiscoverySearch')[0].body).toEqual({ query: 'rag', source: 'openalex', maxResults: 20, filters: { yearFrom: 2019, yearTo: 2020 } });
    });

    it('nguồn không phản hồi', async () => {
      // EC03: the start itself fails with 503 → “Nguồn không phản hồi” with the code and manual import.
      setup({ search: { kind: 'unavailable' } });
      const { user } = renderAt('/discover');
      await screen.findByText(/Nguồn: OpenAlex\./);
      await user.type(screen.getByRole('textbox', { name: 'Truy vấn' }), 'rag');
      await user.click(screen.getByRole('button', { name: 'Tìm' }));
      const alert = (await screen.findByText('Nguồn không phản hồi')).closest('[role="alert"]') as HTMLElement;
      expect(within(alert).getByRole('link', { name: 'Nhập thủ công' })).toBeTruthy();
      // Retrying the same search after a 5xx keeps its Idempotency-Key (DATA-IDEMP-001); another query gets a new one.
      await user.click(within(alert).getByRole('button', { name: 'Tìm lại' }));
      await waitFor(() => expect(callsOf('startDiscoverySearch')).toHaveLength(2));
      const [first, again] = callsOf('startDiscoverySearch').map((call) => call.headers?.['idempotency-key']);
      expect(first).toBeTruthy();
      expect(again).toBe(first);
      await user.type(screen.getByRole('textbox', { name: 'Truy vấn' }), ' survey');
      await user.click(screen.getByRole('button', { name: 'Tìm' }));
      await waitFor(() => expect(callsOf('startDiscoverySearch')).toHaveLength(3));
      expect(callsOf('startDiscoverySearch')[2].headers?.['idempotency-key']).not.toBe(first);
    });

    it('hủy tìm', async () => {
      // EC07: “Hủy tìm” cancels the workflow; the query stays on the form.
      setup();
      const { user } = renderAt('/discover');
      await startSearch(user, 'self-rag');
      await user.click(screen.getByRole('button', { name: 'Hủy tìm' }));
      expect(await screen.findByText('Đã hủy lần tìm. Truy vấn vẫn giữ trên form.')).toBeTruthy();
      expect((screen.getByRole('textbox', { name: 'Truy vấn' }) as HTMLInputElement).value).toBe('self-rag');
      expect(store.workflow(workflowId(101))?.status).toBe('Cancelled');
    });

    it('hủy tìm khi đã xong', async () => {
      // EC07: the search finished before the cancel arrived (409) → the screen reads the workflow and shows its results.
      setup();
      const { user } = renderAt('/discover');
      await startSearch(user, 'self-rag');
      store.completeSearch(workflowId(101), 'self-rag', 'openalex', () => undefined); // finished, event not yet delivered
      await user.click(screen.getByRole('button', { name: 'Hủy tìm' }));
      expect(await screen.findByRole('heading', { name: /^5 kết quả/ })).toBeTruthy();
      expect(screen.queryByText('Đã hủy lần tìm. Truy vấn vẫn giữ trên form.')).toBeNull();
    });

    it('không có Google Scholar', async () => {
      // EC06: Google Scholar unavailable → no Scholar button on an empty result, no “Công bố của tôi”.
      setup({ search: { kind: 'empty' }, sources: demoSources.map((source) => (source.source === 'google_scholar' ? { ...source, available: false } : source)) });
      const { user } = renderAt('/discover');
      await startSearch(user, 'rag');
      await advance();
      expect(await screen.findByText('Không có kết quả')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Tìm trên Google Scholar' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Công bố của tôi' })).toBeNull();
    });

    it('không có Google Scholar khi danh sách nguồn lỗi', async () => {
      // EC06: listDiscoverySources fails → the source line says so and the search still runs on the default source.
      setup();
      mock.use({ overrides: { listDiscoverySources: () => new Response(null, { status: 503 }) } });
      const { user } = renderAt('/discover');
      expect(await screen.findByText(/Không đọc được danh sách nguồn; tìm bằng nguồn mặc định\./)).toBeTruthy();
      await user.type(screen.getByRole('textbox', { name: 'Truy vấn' }), 'rag');
      await user.click(screen.getByRole('button', { name: 'Tìm' }));
      await waitFor(() => expect(callsOf('startDiscoverySearch')).toHaveLength(1));
      expect(callsOf('startDiscoverySearch')[0].body).toMatchObject({ source: 'openalex' });
    });

    it('khôi phục lần tìm', async () => {
      // EC08: /discover?search=<workflowId> of a finished search shows its results again.
      setup();
      const workflow = store.startWorkflow('discovery', 'restore-key');
      store.completeSearch(workflow.id, 'rag', 'openalex', () => undefined);
      renderAt(`/discover?search=${workflow.id}`);
      expect(await screen.findByRole('heading', { name: /^5 kết quả/ })).toBeTruthy();
    });

    it('khôi phục lần tìm không có', async () => {
      // EC08: an unknown or foreign search id → “Không tìm thấy lần tìm”.
      setup();
      renderAt('/discover?search=7e000000-0000-4000-8000-000000009999');
      expect(await screen.findByText('Không tìm thấy lần tìm')).toBeTruthy();
    });

    it('không có kết quả gợi ý Google Scholar', async () => {
      // EC05: an empty OpenAlex result → reason, manual import and “Tìm trên Google Scholar” (same query, source changed).
      setup({ search: { kind: 'empty' } });
      const { user } = renderAt('/discover');
      await startSearch(user, 'rag tiếng Việt');
      await advance();
      expect(await screen.findByText('Không có kết quả')).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Tìm trên Google Scholar' }));
      await waitFor(() => expect(callsOf('startDiscoverySearch')).toHaveLength(2));
      expect(callsOf('startDiscoverySearch')[1].body).toMatchObject({ query: 'rag tiếng Việt', source: 'google_scholar' });
    });
  });

  describe('Xem và chọn kết quả (S03)', () => {
    it('đang tải kết quả', async () => {
      // EC45: between the search finishing and its results arriving → skeleton rows with one role="status" line.
      setup();
      mock.use({ overrides: { listDiscoveredResults: async ({ query }) => {
        await new Promise((r) => setTimeout(r, 400));
        return { status: 200, body: { items: structuredClone(store.results().filter((row) => row.searchWorkflowId === query.workflowId)), nextCursor: null } };
      } } });
      const { user } = renderAt('/discover');
      await startSearch(user, 'rag');
      await advance();
      const status = await screen.findByText('Đang tải kết quả…');
      expect(status.getAttribute('role')).toBe('status');
      expect(await screen.findByRole('heading', { name: /^5 kết quả/ })).toBeTruthy();
    });

    it('reference trùng không đọc được', async () => {
      // EC11: the duplicate's reference cannot be read (404) → generic “Trùng một reference đã có”, checkbox still disabled.
      setup({ results: (w, q, s) => demoResults(w, q, s).map((row) => (row.id === resultId(1) ? { ...row, duplicateOfReferenceId: referenceId(77) } : row)) });
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'rag');
      const row = resultRow(papers.lewis.title);
      expect(await within(row).findByText('Trùng một reference đã có')).toBeTruthy();
      expect(within(row).queryByRole('link', { name: 'Trùng một reference đã có' })).toBeNull();
      expect((within(row).getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
      expect(screen.getByRole('heading', { name: /^5 kết quả/ })).toBeTruthy();
    });

    it('thiếu metadata', async () => {
      // EC12: missing year/venue show “thiếu năm” and “—”; without an author the row stays listed but is not eligible.
      const sparse: ResultsFn = (w, q, s) => fresh(3)(w, q, s).map((row, i) => {
        const metadata = omit(row.metadata, 'year', 'venue');
        return i === 0 ? { ...row, metadata } : i === 1 ? { ...row, metadata: { ...row.metadata, authors: [] } } : row;
      });
      setup({ results: sparse });
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'rag');
      expect(resultRow('Kết quả 1').textContent).toContain('thiếu năm · —');
      expect(resultRow('Kết quả 2').textContent).toContain('thiếu tác giả');
      await user.click(screen.getByRole('button', { name: 'Chọn tất cả trên trang' }));
      await screen.findByText('Đã chọn · 2');
      expect((screen.getByRole('checkbox', { name: 'Chọn: Kết quả 2' }) as HTMLInputElement).checked).toBe(false);
    });

    it('nội dung HTML hiện dạng chữ', async () => {
      // EC13: markup in a title or snippet is shown as text and never runs.
      const markup = '<img src=x onerror="window.__xss=1">Bài <b>đậm</b>';
      setup({ results: (w, q, s) => fresh(1)(w, q, s).map((row) => ({ ...row, metadata: { ...row.metadata, title: markup, abstractOrSnippet: '<script>window.__xss=2</script>' } })) });
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'rag');
      expect(screen.getByText(markup)).toBeTruthy();
      expect(screen.getByText('<script>window.__xss=2</script>')).toBeTruthy();
      expect(resultsList().querySelector('img, b, script')).toBeNull();
      expect((window as { __xss?: number }).__xss).toBeUndefined();
    });

    it('bản ghi nguồn không phải http', async () => {
      // EC14: a sourceUrl that is not http(s) gets no link.
      setup({ results: (w, q, s) => fresh(1)(w, q, s).map((row) => ({ ...row, sourceUrl: 'javascript:alert(1)' })) });
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'rag');
      expect(within(resultRow('Kết quả 1')).queryByRole('link', { name: 'Bản ghi nguồn' })).toBeNull();
    });

    it('giới hạn lô 50', async () => {
      // EC16: nothing selected → send disabled with “Chưa chọn kết quả”; 51 selected → “Mỗi lô tối đa 50 mục”.
      setup({ results: (w, q, s) => fresh(60)(w, q, s).map((row, i) => (i < 51 ? { ...row, status: 'Selected' as const } : row)) });
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'rag');
      expect(screen.getByRole('heading', { name: /^50 kết quả\+/ })).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Tải thêm' }));
      await screen.findByText('Đã chọn · 51');
      const send = screen.getByRole('button', { name: 'Gửi 51 kết quả vào luồng duyệt' }) as HTMLButtonElement;
      expect(send.disabled).toBe(true);
      expect(screen.getByText('Mỗi lô tối đa 50 mục')).toBeTruthy();
      await user.click(screen.getByRole('checkbox', { name: 'Chọn: Kết quả 51' }));
      await screen.findByText('Đã chọn · 50');
      expect((screen.getByRole('button', { name: 'Gửi 50 kết quả vào luồng duyệt' }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('giới hạn lô 50 khi chưa chọn', async () => {
      // EC16: nothing selected → send disabled with its reason.
      setup({ results: fresh(3) });
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'rag');
      expect((screen.getByRole('button', { name: 'Gửi 0 kết quả vào luồng duyệt' }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText('Chưa chọn kết quả')).toBeTruthy();
    });

    it('kết quả không giống Trusted', async () => {
      // PID-00098-AC01, EC09: 5 results, 1 duplicate of Trusted R → 4 dashed “Chưa duyệt” labels; no Trusted chip, indexing chip,
      // BibTeX key or solid style on a result; the duplicate says “Đã có trong Trusted Library”, links R, checkbox disabled.
      setup({ results: (w, q, s) => demoResults(w, q, s).map((row) => (row.id === resultId(5) ? withoutDuplicate(row) : row)) });
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'retrieval augmented generation');
      const list = resultsList();
      const labels = within(list).getAllByText('Chưa duyệt — không dùng làm nguồn');
      expect(labels).toHaveLength(4);
      expect(labels.every((label) => label.classList.contains('library-tag') && label.getAttribute('data-tone') === 'proposed')).toBe(true);
      expect(list.querySelector('.sires-chip')).toBeNull();
      expect(list.querySelector('.sires-id')).toBeNull();
      for (const ref of demoReferences()) expect(within(list).queryByText(ref.bibtexKey)).toBeNull();
      const lewis = resultRow(papers.lewis.title);
      const link = await within(lewis).findByRole('link', { name: 'Đã có trong Trusted Library' });
      expect(link.getAttribute('href')).toBe(`/library/${referenceId(1)}`);
      expect((within(lewis).getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
      for (const title of [papers.huang.title, papers.chen.title, papers.jiang.title, papers.asai.title]) {
        expect(resultRow(title).querySelector('[data-tone="confirmed"]')).toBeNull();
      }
    });

    it('nhãn đã có và chưa duyệt', async () => {
      // UX-REF-001-AC01, DISC-SCHOLAR-001-AC04: results already Trusted say so and link to /library/<id>; the others are unreviewed.
      setup();
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'rag');
      const lewis = await within(resultRow(papers.lewis.title)).findByRole('link', { name: 'Đã có trong Trusted Library' });
      const asai = await within(resultRow(papers.asai.title)).findByRole('link', { name: 'Đã có trong Trusted Library' });
      expect(lewis.getAttribute('href')).toBe(`/library/${referenceId(1)}`);
      expect(asai.getAttribute('href')).toBe(`/library/${referenceId(5)}`);
      for (const title of [papers.huang.title, papers.chen.title, papers.jiang.title]) {
        expect(within(resultRow(title)).getByText('Chưa duyệt — không dùng làm nguồn')).toBeTruthy();
      }
    });

    it('metadata và bản ghi nguồn', async () => {
      // DISC-SCHOLAR-001-AC01, EC14: title, authors, year, venue, snippet, citation count, source and “Bản ghi nguồn” to sourceUrl.
      setup();
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'rag');
      const row = resultRow(papers.lewis.title);
      expect(row.textContent).toContain('P. Lewis, E. Perez, A. Piktus · 2020 · NeurIPS');
      expect(within(row).getByText(papers.lewis.abstract)).toBeTruthy();
      expect(within(row).getByText(/^5\D?210 trích dẫn$/)).toBeTruthy();
      expect(row.textContent).toContain('OpenAlex');
      const record = within(row).getByRole('link', { name: 'Bản ghi nguồn' });
      expect(record.getAttribute('href')).toBe('https://arxiv.org/abs/2005.11401');
      expect(record.getAttribute('rel')).toContain('noopener');
    });

    it('đã từ chối trước đây', async () => {
      // LIB-APPROVAL-001-AC04, EC10: a result matching a Rejected reference says “Đã từ chối trước đây” with a link.
      const rejected = { ...structuredClone(demoReferences()[6]), id: referenceId(13), approvalStatus: 'Rejected' as const };
      setup({
        references: [...demoReferences(), rejected],
        results: (w, q, s) => demoResults(w, q, s).map((row) => (row.id === resultId(2) ? { ...row, duplicateOfReferenceId: referenceId(13) } : row)),
      });
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'hallucination survey');
      const link = await within(resultRow(papers.huang.title)).findByRole('link', { name: 'Đã từ chối trước đây' });
      expect(link.getAttribute('href')).toBe(`/library/${referenceId(13)}`);
    });

    it('chọn 3 loại 2', async () => {
      // DISC-REVIEW-001-AC01: 10 New; select 3 and reject 2 → 3 PATCH Selected, 2 PATCH Rejected; 3 Selected, 2 Rejected, 5 New.
      setup({ results: fresh(10) });
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'rag');
      for (const n of [1, 2, 3]) await user.click(screen.getByRole('checkbox', { name: `Chọn: Kết quả ${n}` }));
      for (const n of [4, 5]) await user.click(within(resultRow(`Kết quả ${n}`)).getByRole('button', { name: 'Loại' }));
      await waitFor(() => expect(callsOf('setDiscoveredResultStatus')).toHaveLength(5));
      const statuses = callsOf('setDiscoveredResultStatus').map((call) => (call.body as { status: string }).status);
      expect(statuses.filter((s) => s === 'Selected')).toHaveLength(3);
      expect(statuses.filter((s) => s === 'Rejected')).toHaveLength(2);
      expect([rowsWithStatus('Selected'), rowsWithStatus('Rejected'), rowsWithStatus('New')]).toEqual([3, 2, 5]);
      expect(screen.getByText('Đã chọn · 3')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Gửi 3 kết quả vào luồng duyệt' })).toBeTruthy();
    });

    it('chọn lỗi trả lại trạng thái', async () => {
      // EC15: the status change fails → the row returns to its previous state with the reason and code.
      setup({ results: fresh(2) });
      mock.use({ overrides: { setDiscoveredResultStatus: () => problemResponse(409, 'invalid_transition') } });
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'rag');
      const box = screen.getByRole('checkbox', { name: 'Chọn: Kết quả 1' }) as HTMLInputElement;
      await user.click(box);
      expect(await within(resultRow('Kết quả 1')).findByText('Không đổi được lựa chọn (invalid_transition)')).toBeTruthy();
      expect(box.checked).toBe(false);
      expect(screen.getByText('Đã chọn · 0')).toBeTruthy();
    });

    it('tóm tắt lô có mục lỗi', async () => {
      // LIB-IMPORT-001-AC01, EC17: batch of 5, one not created → 4 “Đã tạo reference · Pending Approval”, 1 “Lỗi” with the reason,
      // and “Thử lại các mục lỗi” resending only that one.
      setup({ results: fresh(5), importFailures: [resultId(23)] });
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'rag');
      await user.click(screen.getByRole('button', { name: 'Chọn tất cả trên trang' }));
      await screen.findByText('Đã chọn · 5');
      await user.click(screen.getByRole('button', { name: 'Gửi 5 kết quả vào luồng duyệt' }));
      await screen.findByText('Đang nhập 5 kết quả');
      await advance();
      expect(await screen.findByText('Đã tạo 4 · trùng 0 · lỗi 1')).toBeTruthy();
      expect(screen.getAllByRole('link', { name: 'Đã tạo reference · Pending Approval' })).toHaveLength(4);
      expect(screen.getByText('Lỗi: Không chuẩn hóa được metadata của 1 mục.')).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Thử lại các mục lỗi' }));
      await waitFor(() => expect(callsOf('importDiscoveredResults')).toHaveLength(2));
      expect(callsOf('importDiscoveredResults')[1].body).toEqual({ discoveredResultIds: [resultId(23)] });
      expect(callsOf('importDiscoveredResults')[1].headers?.['idempotency-key']).not.toBe(callsOf('importDiscoveredResults')[0].headers?.['idempotency-key']);
    });

    it('mục trùng trong lô', async () => {
      // LIB-IMPORT-001-AC03, EC17: an item found to duplicate a Trusted reference during the batch → “Trùng lặp”, link to the
      // existing reference and the merge suggestion; no new reference for it.
      setup({ results: fresh(3) });
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'rag');
      await user.click(screen.getByRole('button', { name: 'Chọn tất cả trên trang' }));
      await screen.findByText('Đã chọn · 3');
      await user.click(screen.getByRole('button', { name: 'Gửi 3 kết quả vào luồng duyệt' }));
      await screen.findByText('Đang nhập 3 kết quả');
      store.result(resultId(22))!.duplicateOfReferenceId = referenceId(1); // the server finds the duplicate while importing
      await advance();
      expect(await screen.findByText('Đã tạo 2 · trùng 1 · lỗi 0')).toBeTruthy();
      const item = screen.getAllByText('Kết quả 2').map((el) => el.closest('li')!).find((li) => li.closest('.library-summary'))!;
      expect(within(item).getByText(/Trùng lặp/)).toBeTruthy();
      expect(within(item).getByText(/đề xuất gộp ở Trusted Library/)).toBeTruthy();
      expect(within(item).getByRole('link', { name: 'reference có sẵn' }).getAttribute('href')).toBe(`/library/${referenceId(1)}`);
      expect(store.references().filter((ref) => ref.discoveredResultId === resultId(22))).toHaveLength(0);
    });

    it('lô bị gián đoạn', async () => {
      // EC18: the batch workflow ends Interrupted → alert, nothing resent, recovery in Pending Actions.
      setup({ results: fresh(2), importInterrupted: true });
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'rag');
      await user.click(screen.getByRole('button', { name: 'Chọn tất cả trên trang' }));
      await screen.findByText('Đã chọn · 2');
      await user.click(screen.getByRole('button', { name: 'Gửi 2 kết quả vào luồng duyệt' }));
      await screen.findByText('Đang nhập 2 kết quả');
      await advance();
      expect(await screen.findByText('Lô bị gián đoạn (Interrupted)')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Recovery decision' }).getAttribute('href')).toBe('/pending-actions');
      expect(callsOf('importDiscoveredResults')).toHaveLength(1);
    });
  });

  describe('Tìm theo tác giả (S04)', () => {
    it('danh sách có thể không đầy đủ', async () => {
      // INT-SCHOLAR-004-AC01, DISC-AUTHOR-001-AC02: author results carry “Danh sách có thể không đầy đủ”.
      setup();
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'Patrick Lewis', 'Tác giả');
      expect(screen.getByText('Danh sách có thể không đầy đủ.')).toBeTruthy();
      expect(callsOf('startAuthorSearch')[0].body).toEqual({ author: 'Patrick Lewis', source: 'openalex' });
    });

    it('tác giả không có dữ liệu', async () => {
      // EC21: the source has nothing for this author → message and the hint to search by keywords or title.
      setup({ search: { kind: 'empty' } });
      const { user } = renderAt('/discover');
      await startSearch(user, 'Không Ai Cả', 'Tác giả');
      await advance();
      expect(await screen.findByText('Nguồn không có dữ liệu tác giả này')).toBeTruthy();
      expect(screen.getByText('Thử tìm theo từ khóa hoặc tiêu đề công bố.')).toBeTruthy();
    });

    it('hai hồ sơ cùng tên', async () => {
      // DISC-AUTHOR-001-AC01, EC19 (H11, temporary pending PO): two profiles with one name → choice prompt with both, none chosen,
      // no listDiscoveredResults before the answer; the answer resumes the search.
      setup({ authorPrompt: true });
      const { user } = renderAt('/discover');
      await startSearch(user, 'Nguyễn Văn An', 'Tác giả');
      await advance();
      expect(await screen.findByText('Có hai hồ sơ tác giả cùng tên. Bạn muốn tìm công bố của hồ sơ nào?')).toBeTruthy();
      const options = screen.getAllByRole('radio') as HTMLInputElement[];
      expect(options).toHaveLength(2);
      expect(options.some((option) => option.checked)).toBe(false);
      for (const profile of authorProfiles) expect(screen.getByText(profile.label)).toBeTruthy();
      expect(sent('GET', '/discovered-results')).toHaveLength(0);
      await user.click(options[0]);
      await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
      await waitFor(() => expect(callsOf('answerPrompt')).toHaveLength(1));
      expect(JSON.stringify(callsOf('answerPrompt')[0].body)).toContain(authorProfiles[0].id);
      await advance();
      expect(await screen.findByRole('heading', { name: /kết quả · Discovery Agent/ })).toBeTruthy();
      expect(screen.getByText('Danh sách có thể không đầy đủ.')).toBeTruthy();
    });

    it('chọn tất cả đủ điều kiện', async () => {
      // DISC-AUTHOR-001-AC03: 8 publications, 2 already in the library, 1 without author → 5 selected, import sends exactly
      // those 5, the summary says Pending Approval, nothing Trusted.
      const eight: ResultsFn = (w, q, s) => {
        const base = demoResults(w, q, s); // lewis (dup), huang, chen, jiang, asai (dup)
        const extra = fresh(3)(w, q, s);
        extra[2] = { ...extra[2], metadata: { ...extra[2].metadata, authors: [] } };
        return [...base, ...extra];
      };
      setup({ results: eight });
      const { user } = renderAt('/discover');
      await searchAndShow(user, 'Lewis', 'Tác giả');
      expect(screen.getByRole('heading', { name: /^8 kết quả/ })).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Chọn tất cả kết quả đủ điều kiện' }));
      await screen.findByText('Đã chọn · 5');
      await user.click(screen.getByRole('button', { name: 'Gửi 5 kết quả vào luồng duyệt' }));
      await screen.findByText('Đang nhập 5 kết quả');
      const expected = [resultId(2), resultId(3), resultId(4), resultId(21), resultId(22)];
      expect((callsOf('importDiscoveredResults')[0].body as { discoveredResultIds: string[] }).discoveredResultIds.sort()).toEqual(expected.sort());
      await advance();
      expect(await screen.findByText('Đã tạo 5 · trùng 0 · lỗi 0')).toBeTruthy();
      expect(screen.getAllByRole('link', { name: 'Đã tạo reference · Pending Approval' })).toHaveLength(5);
      const created = store.references().filter((ref) => ref.discoveredResultId);
      expect(created).toHaveLength(5);
      expect(created.every((ref) => ref.approvalStatus === 'Pending Approval')).toBe(true);
    });

    it('công bố của tôi', async () => {
      // DISC-AUTHOR-001-AC04: saved profile URL + google_scholar with author search → startAuthorSearch with that URL and
      // source google_scholar, no profile step, results New with the incomplete note.
      setup({ authorPrompt: true });
      const { user } = renderAt('/discover');
      await user.click(await screen.findByRole('button', { name: 'Công bố của tôi' }));
      await screen.findByText('Đang tìm: Công bố của tôi');
      expect(callsOf('startAuthorSearch')[0].body).toEqual({ author: account.profile.googleScholarProfileUrl, source: 'google_scholar' });
      await advance();
      expect(await screen.findByRole('heading', { name: /kết quả · Discovery Agent · Google Scholar/ })).toBeTruthy();
      expect(screen.getByText('Danh sách có thể không đầy đủ.')).toBeTruthy();
      expect(sent('GET', '/prompts')).toHaveLength(0);
      expect(rowsWithStatus('New')).toBe(5);
    });

    it('ẩn công bố của tôi khi chưa lưu URL', async () => {
      // DISC-AUTHOR-001-AC04 (second half), EC20: without googleScholarProfileUrl the shortcut is not shown.
      setup();
      const profile = omit(account.profile, 'googleScholarProfileUrl');
      mock.use({ overrides: { getMe: () => ({ status: 200, body: { ...structuredClone(account), profile } }) } });
      renderAt('/discover');
      expect(await screen.findByRole('tab', { name: 'Tác giả' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Công bố của tôi' })).toBeNull();
    });

    it('ẩn tìm theo tác giả', async () => {
      // DISC-ADAPTER-001-AC01, EC20: no available source supports author search → no “Tác giả” tab, no “Công bố của tôi”.
      setup({ sources: demoSources.map((source) => ({ ...source, supportsAuthorSearch: false })) });
      renderAt('/discover');
      await screen.findByText(/Nguồn: OpenAlex\./);
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Query', 'Tiêu đề', 'Từ khóa']);
      expect(screen.queryByRole('tab', { name: 'Tác giả' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Công bố của tôi' })).toBeNull();
    });
  });
});
