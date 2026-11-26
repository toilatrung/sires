// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00114 O5: References and Evidence (S02) and Evidence Inspector (S03) on the research mock (S01).

import { screen, waitFor, within } from '@testing-library/react';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { createMocks, loadFeatureMocks } from '../../shell/mock';
import { loadSpec } from '../../shell/mock/generator/openapi.mjs';
import { features } from '../../shell/features';
import { createResearchStore } from './__mocks__';
import { formatWhen } from './labels';
import { claimPath, evidenceItemPath, evidencePath, ids, problemResponse, PROJECT_ID, renderResearch, useResearchMock } from './test/render';

const panel = () => screen.getByRole('complementary', { name: 'Evidence Inspector' });
const chip = (scope: HTMLElement, text: string) => within(scope).queryAllByText(text).find((node) => node.classList.contains('sires-chip'));

describe('mock của khu vực research (S01)', () => {
  it('24 operation ghép với shell và mọi khu vực không trùng (EC10 của PID-00013)', async () => {
    const sources = await loadFeatureMocks(features);
    expect(() => createMocks(sources)).not.toThrow();
    const research = sources.find((source) => source.name === 'research')!;
    expect(Object.keys(research.mocks.overrides ?? {}).sort()).toHaveLength(24);
    expect(Object.keys(research.mocks.overrides ?? {})).not.toEqual(expect.arrayContaining(['getTask', 'getWorkflow', 'getReferenceDocument']));
  });

  it('dữ liệu mẫu hợp lệ theo schema của OpenAPI công khai', () => {
    const doc = loadSpec();
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    ajv.addSchema({ ...doc, $id: 'openapi' });
    const store = createResearchStore({ extraRows: 2 });
    const tables: Array<[string, unknown[]]> = [
      ['ProjectReferenceSelection', store.references], ['EvidenceInContext', store.evidence], ['Claim', store.claims],
      ['Artifact', store.artifacts], ['ArtifactVersion', store.versions], ['DiagramType', store.diagramTypes],
    ];
    for (const [schema, rows] of tables) {
      const validate = ajv.compile({ $ref: `openapi#/components/schemas/${schema}` });
      for (const row of rows) expect(validate(row) ? [] : validate.errors, schema).toEqual([]);
    }
  });
});

describe('References and Evidence (S02)', () => {
  const research = useResearchMock();

  it('ba tab trống', async () => {
    research.store({ scenario: 'empty' });
    const { user } = await renderResearch(evidencePath());
    expect(await screen.findByText('Chưa có claim')).toBeTruthy();
    expect(screen.getByText('Claim được tạo khi chạy Task tổng hợp.')).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: /^References/ }));
    expect(await screen.findByText('Project chưa có reference nào')).toBeTruthy();
    const region = screen.getByRole('tabpanel');
    expect(within(region).getByRole('link', { name: 'Thêm từ Trusted Library' }).getAttribute('href')).toBe('/library');
    await user.click(screen.getByRole('tab', { name: /^Evidence/ }));
    expect(await screen.findByText('Chưa có evidence')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Evidence · 0' })).toBeTruthy();
  });

  it('hai trạng thái của reference', async () => {
    research.store();
    await renderResearch(evidencePath('?tab=references'));
    const list = await screen.findByRole('list', { name: 'Reference của project' });
    const row = (title: RegExp) => within(list).getByRole('link', { name: title }).closest('li')!;
    const liu = row(/^Lost in the Middle/);
    expect(chip(liu, 'Trusted')?.getAttribute('data-tone')).toBe('confirmed');
    expect(chip(liu, 'Unavailable')?.getAttribute('data-tone')).toBe('error');
    expect(within(liu).getByText('Dùng được cho citation, không dùng được cho evidence.')).toBeTruthy();
    const doe = row(/^Hallucination detection preprint/);
    expect(chip(doe, 'Revoked')?.getAttribute('data-tone')).toBe('warning');
    expect(chip(doe, 'Indexed')?.getAttribute('data-tone')).toBe('confirmed');
    const gao = row(/^Retrieval-Augmented Generation for Large Language Models/);
    expect(chip(gao, 'Indexing')?.hasAttribute('data-running')).toBe(true);
    expect(within(row(/^A Survey on Hallucination/)).getByText('Failed')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'References · 14' })).toBeTruthy();
  });

  it('bỏ reference khỏi project', async () => {
    const store = research.store();
    const { user } = await renderResearch(evidencePath('?tab=references'));
    const list = await screen.findByRole('list', { name: 'Reference của project' });
    const lewis = within(list).getByRole('link', { name: /^Retrieval-Augmented Generation for Knowledge/ }).closest('li')!;
    await user.click(within(lewis).getByRole('button', { name: 'Bỏ khỏi project' }));
    const dialog = await screen.findByRole('dialog', { name: 'Bỏ Lewis et al. 2020 khỏi project?' });
    // Lewis et al. 2020 has two evidence in the project (page 7 Active, page 9 Excluded).
    expect(await within(dialog).findByText(/^2 evidence của reference này trong project giữ nguyên/)).toBeTruthy();
    expect(within(dialog).getByText('Task cần reference này bị chặn (RC-05) khi readiness được tính lại.')).toBeTruthy();
    expect(store.callsOf('listEvidence').at(-1)?.query.referenceId).toBe(ids.reference.lewis);
    const evidenceLoads = store.callsOf('listEvidence').length;
    await user.click(within(dialog).getByRole('button', { name: 'Bỏ khỏi project' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(store.callsOf('removeReferenceFromProject')).toHaveLength(1);
    await waitFor(() => expect(within(list).queryByRole('link', { name: /^Retrieval-Augmented Generation for Knowledge/ })).toBeNull());
    expect(screen.getByRole('tab', { name: 'References · 13' })).toBeTruthy();
    expect(store.callsOf('listEvidence').length).toBeGreaterThan(evidenceLoads);

    // 409: removed elsewhere meanwhile → error with its code inside the dialog.
    const shi = within(list).getByRole('link', { name: /^Large Language Models Can Be Easily Distracted/ }).closest('li')!;
    await user.click(within(shi).getByRole('button', { name: 'Bỏ khỏi project' }));
    const second = await screen.findByRole('dialog', { name: 'Bỏ Shi et al. 2023 khỏi project?' });
    await within(second).findByText(/evidence của reference này trong project giữ nguyên/);
    store.references.find((row) => row.referenceId === ids.reference.shi)!.status = 'Removed';
    await user.click(within(second).getByRole('button', { name: 'Bỏ khỏi project' }));
    const alert = await within(second).findByRole('alert');
    expect(within(alert).getByText('Chưa bỏ được reference khỏi project')).toBeTruthy();
    expect(within(alert).getByText('invalid_transition')).toBeTruthy();
    await user.click(within(second).getByRole('button', { name: 'Giữ reference' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lỗi tại vùng', async () => {
    research.store({}, { listClaims: () => problemResponse(503, 'service_unavailable') });
    const { user } = await renderResearch(evidencePath());
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Không tải được danh sách claim')).toBeTruthy();
    expect(within(alert).getByText(/^service_unavailable/)).toBeTruthy();
    expect(within(alert).getByRole('button', { name: 'Thử lại' })).toBeTruthy();
    // The other tabs and the panel still work.
    await user.click(screen.getByRole('tab', { name: /^Evidence/ }));
    const list = await screen.findByRole('list', { name: 'Evidence' });
    expect(within(list).getAllByRole('link').length).toBeGreaterThan(5);
    expect(within(panel()).getByText('Chọn một claim hoặc evidence để xem trong Evidence Inspector.')).toBeTruthy();
  });

  it('lỗi tại vùng của panel', async () => {
    research.store({}, { getClaim: () => problemResponse(503, 'service_unavailable') });
    await renderResearch(claimPath(ids.claim.conflicting));
    const alert = await within(panel()).findByRole('alert');
    expect(within(alert).getByText(/^service_unavailable/)).toBeTruthy();
    expect(within(alert).getByRole('button', { name: 'Thử lại' })).toBeTruthy();
    expect(await screen.findByRole('list', { name: 'Claim' })).toBeTruthy();
  });

  it('không tìm thấy', async () => {
    research.store();
    const { router } = await renderResearch(claimPath('5b000000-0000-4000-8000-000000009999'));
    const alert = await within(panel()).findByRole('alert');
    expect(within(alert).getByText('Không tìm thấy')).toBeTruthy();
    expect(within(alert).getByText('Không có claim này hoặc bạn không có quyền xem.')).toBeTruthy();
    expect(await screen.findByRole('list', { name: 'Claim' })).toBeTruthy();
    await router.navigate(evidenceItemPath('5a000000-0000-4000-8000-000000009999'));
    expect(await within(panel()).findByText('Không có evidence này hoặc bạn không có quyền xem.')).toBeTruthy();
    expect(await screen.findByRole('list', { name: 'Evidence' })).toBeTruthy();
  });

  it('tải lại khi có sự kiện', async () => {
    const store = research.store();
    await renderResearch(claimPath(ids.claim.unsupported));
    const list = await screen.findByRole('list', { name: 'Claim' });
    await within(panel()).findByText('RAG giảm một nửa hallucination ở mọi miền.', { selector: 'p' });
    await waitFor(() => expect(research.mock.events.connections).toBeGreaterThan(0));
    const count = (operationId: string) => store.callsOf(operationId).length;
    const before = { claims: count('listClaims'), claim: count('getClaim'), references: count('listProjectReferences'), evidence: count('listEvidence') };

    // The claim changed elsewhere: list and panel read it again with GET; nothing comes from the payload.
    store.claims.find((claim) => claim.id === ids.claim.unsupported)!.approvalStatus = 'Rejected';
    research.mock.events.emit({ type: 'research.object_status_changed', projectId: PROJECT_ID, objectType: 'claim', objectId: ids.claim.unsupported, toState: 'Accepted' });
    await waitFor(() => expect(count('listClaims')).toBeGreaterThan(before.claims));
    await waitFor(() => expect(count('getClaim')).toBeGreaterThan(before.claim));
    await waitFor(() => expect(chip(panel(), 'Rejected')).toBeTruthy());
    expect(chip(panel(), 'Accepted')).toBeUndefined();
    expect(within(list).getAllByText('Rejected').length).toBeGreaterThan(0);

    // Reference events: References tab and the Stale evidence.
    research.mock.events.emit({ type: 'reference.status_changed', objectType: 'reference', objectId: ids.reference.doe, toState: 'Revoked' });
    await waitFor(() => expect(count('listProjectReferences')).toBeGreaterThan(before.references));
    await waitFor(() => expect(count('listEvidence')).toBeGreaterThan(before.evidence));

    // “Cần tải lại” (replay.unavailable on reconnect): everything shown is read again.
    const again = { claims: count('listClaims'), claim: count('getClaim'), references: count('listProjectReferences'), evidence: count('listEvidence') };
    research.mock.events.reset();
    await waitFor(() => expect(count('listClaims')).toBeGreaterThan(again.claims));
    await waitFor(() => expect(count('getClaim')).toBeGreaterThan(again.claim));
    await waitFor(() => expect(count('listProjectReferences')).toBeGreaterThan(again.references));
    await waitFor(() => expect(count('listEvidence')).toBeGreaterThan(again.evidence));
  });

  it('đổi ngôn ngữ', async () => {
    research.store();
    const { user, router } = await renderResearch(evidencePath());
    const list = await screen.findByRole('list', { name: 'Claim' });
    expect(screen.getByRole('link', { name: 'Thêm từ Trusted Library' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(await screen.findByRole('link', { name: 'Add from Trusted Library' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Support status' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Disagreement between sources (Conflicting)' })).toBeTruthy();
    // Status names, tab names and research content stay as they are (UX-I18N-003).
    expect(screen.getByRole('tab', { name: 'Claims · 9' })).toBeTruthy();
    expect(chip(list, 'Conflicting')).toBeTruthy();
    expect(within(list).getByText('Truy xuất giới hạn trong nguồn đã duyệt làm tăng độ chính xác của câu trả lời.')).toBeTruthy();
    expect(within(list).getByText(/2 supporting · 1 contradicting/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'VI' }));
    expect(await within(list).findByText(/2 hỗ trợ · 1 phản bác/)).toBeTruthy();

    // Times through the shell's formatters: “HH:mm” today, dd/mm/yyyy HH:mm on another day, same in both languages.
    expect(formatWhen(new Date().toISOString())).toMatch(/^\d{2}:\d{2}$/);
    expect(formatWhen(new Date(Date.now() - 3 * 86_400_000).toISOString())).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    await router.navigate(claimPath(ids.claim.conflicting));
    expect(await within(panel()).findByText(/^Kiểm chứng gần nhất \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} · Conflicting/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(await within(panel()).findByText(/^Last verified \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} · Conflicting/)).toBeTruthy();
    expect(within(panel()).getByRole('button', { name: 'Accept claim' })).toBeTruthy();
  });
});

describe('Evidence Inspector (S03)', () => {
  const research = useResearchMock();

  it('trang 7 trong văn cảnh', async () => {
    research.store();
    await renderResearch(evidenceItemPath(ids.evidence.lewisP7));
    const card = await within(panel()).findByRole('article', { name: 'Evidence của Lewis et al. 2020' });
    const mark = card.querySelector('blockquote mark')!;
    expect(mark.textContent).toBe('[đoạn trích hỗ trợ: mô hình có truy xuất cho câu trả lời đúng sự thật hơn mô hình chỉ dùng tham số]');
    const quote = card.querySelector('blockquote')!;
    expect(quote.textContent!.indexOf('[câu đứng trước')).toBe(0);
    expect(quote.textContent!.indexOf(mark.textContent!)).toBeGreaterThan(0);
    expect(quote.textContent!.trim().endsWith('[câu đứng sau: kết quả trên các tập hỏi đáp mở]')).toBe(true);
    expect(within(card).getByText(/^trang 7 · đoạn 3 · chunk/)).toBeTruthy();
    const using = within(panel()).getByRole('region', { name: 'Claim đang dùng (2)' });
    const items = await within(using).findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByRole('link', { name: 'Truy xuất giới hạn trong nguồn đã duyệt làm tăng độ chính xác của câu trả lời.' })).toBeTruthy();
    expect(chip(items[0]!, 'Conflicting')).toBeTruthy();
    expect(chip(items[1]!, 'Supported')).toBeTruthy();
  });

  it('metadata và ngữ cảnh', async () => {
    research.store();
    const { user, router } = await renderResearch(claimPath(ids.claim.conflicting));
    const supports = await within(panel()).findByRole('region', { name: 'Hỗ trợ (2)' });
    const lewis = await within(supports).findByRole('article', { name: 'Evidence của Lewis et al. 2020' });
    await user.click(within(lewis).getByRole('link', { name: 'Mở evidence' }));
    expect(router.state.location.pathname).toBe(evidenceItemPath(ids.evidence.lewisP7));
    const card = await within(panel()).findByRole('article', { name: 'Evidence của Lewis et al. 2020' });
    expect(within(card).getByRole('link', { name: 'Lewis et al. 2020 — Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks' }).getAttribute('href'))
      .toBe(`/library/${ids.reference.lewis}`);
    expect(within(card).getByText('Patrick Lewis, Ethan Perez, Aleksandra Piktus')).toBeTruthy();
    expect(within(card).getByText(/^NeurIPS 2020/)).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'DOI 10.5555/sires.2020.101' }).getAttribute('href')).toBe('https://doi.org/10.5555/sires.2020.101');
    expect(card.querySelector('mark')?.textContent).toContain('đoạn trích hỗ trợ');
    expect(card.querySelector('blockquote')?.textContent).toContain('[câu đứng trước');
    expect(within(card).getByText(/trang 7/)).toBeTruthy();
    expect(within(panel()).getByText('Evidence trong ngữ cảnh nguồn — đoạn trích lấy từ tài liệu đã index, không sinh lại.')).toBeTruthy();
  });

  it('loại evidence', async () => {
    const store = research.store();
    const { user, router } = await renderResearch(evidenceItemPath(ids.evidence.lewisP7));
    await within(panel()).findByRole('region', { name: 'Claim đang dùng (2)' });
    await user.click(within(panel()).getByRole('button', { name: 'Loại evidence (Excluded)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Loại evidence này?' });
    expect(within(dialog).getByText('2 claim đang dùng được đánh dấu needs review và được tính lại mức hỗ trợ ở lần kiểm chứng sau.')).toBeTruthy();
    // Focus starts in the reason field; the safe option is named.
    expect(document.activeElement).toBe(within(dialog).getByRole('textbox', { name: 'Lý do (tùy chọn)' }));
    await user.keyboard('Đoạn này nói về tập khác');
    await user.click(within(dialog).getByRole('button', { name: 'Loại evidence' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(store.callsOf('excludeEvidence')).toHaveLength(1);
    expect(store.callsOf('excludeEvidence')[0]!.body).toEqual({ reason: 'Đoạn này nói về tập khác' });
    const card = within(panel()).getByRole('article', { name: 'Evidence của Lewis et al. 2020' });
    await waitFor(() => expect(chip(card, 'Excluded')).toBeTruthy());
    expect(within(panel()).getByText('Lý do loại: Đoạn này nói về tập khác')).toBeTruthy();
    const using = within(panel()).getByRole('region', { name: 'Claim đang dùng (2)' });
    await waitFor(() => expect(within(using).getAllByText('needs review').filter((node) => node.classList.contains('sires-chip'))).toHaveLength(2));
    expect(within(panel()).getByRole('button', { name: 'Khôi phục' })).toBeTruthy();

    // 409: changed elsewhere → reload, report, never resend.
    await router.navigate(evidenceItemPath(ids.evidence.maynez));
    await within(panel()).findByRole('region', { name: 'Claim đang dùng (3)' });
    await user.click(within(panel()).getByRole('button', { name: 'Loại evidence (Excluded)' }));
    const second = await screen.findByRole('dialog', { name: 'Loại evidence này?' });
    store.evidence.find((row) => row.id === ids.evidence.maynez)!.status = 'Excluded';
    await user.click(within(second).getByRole('button', { name: 'Loại evidence' }));
    const alert = await within(panel()).findByRole('alert');
    expect(within(alert).getByText('Evidence đã đổi ở nơi khác hoặc không đổi được')).toBeTruthy();
    expect(within(alert).getByText(/^invalid_transition/)).toBeTruthy();
    expect(within(alert).getByText('Đã tải lại evidence; xem trạng thái mới trước khi thao tác tiếp.')).toBeTruthy();
    expect(store.callsOf('excludeEvidence')).toHaveLength(2);
    expect(await within(panel()).findByRole('button', { name: 'Khôi phục' })).toBeTruthy();
  });

  it('vị trí thiếu đoạn', async () => {
    research.store();
    await renderResearch(evidenceItemPath(ids.evidence.karpukhinP3));
    const card = await within(panel()).findByRole('article', { name: 'Evidence của Karpukhin et al. 2020' });
    const line = within(card).getByText(/^trang 3/);
    expect(line.textContent).toMatch(/^trang 3 · chunk [0-9a-f]{6}$/);
    expect(line.textContent).not.toContain('đoạn');
  });

  it('thiếu đoạn liền kề', async () => {
    research.store();
    await renderResearch(evidenceItemPath(ids.evidence.jiNoBefore));
    const card = await within(panel()).findByRole('article', { name: 'Evidence của Ji et al. 2023' });
    const quote = card.querySelector('blockquote')!;
    expect(quote.firstChild).toBe(quote.querySelector('mark'));
    expect(quote.textContent).toContain('[câu đứng sau: phân loại intrinsic và extrinsic]');
  });

  it('Stale không loại, không liên kết', async () => {
    const store = research.store();
    const { user, router } = await renderResearch(evidenceItemPath(ids.evidence.doeStale));
    const card = await within(panel()).findByRole('article', { name: 'Evidence của Doe et al. 2023' });
    expect(chip(card, 'Stale')?.getAttribute('data-tone')).toBe('warning-flag');
    expect(within(card).getByRole('note').textContent).toBe(
      'Stale — Reference đã bị thu hồi khỏi Trusted Library. Evidence này không được tính khi đánh giá mức hỗ trợ; không loại và không liên kết mới được.');
    expect(within(panel()).queryByRole('button', { name: 'Loại evidence (Excluded)' })).toBeNull();
    expect(within(panel()).queryByRole('button', { name: 'Khôi phục' })).toBeNull();

    // The link dialog of a claim lists Active evidence only.
    await router.navigate(claimPath(ids.claim.conflicting));
    await user.click(await within(panel()).findByRole('button', { name: 'Liên kết evidence' }));
    const dialog = await screen.findByRole('dialog', { name: 'Liên kết evidence' });
    await within(dialog).findAllByRole('radio', { name: /Lewis et al. 2020/ });
    expect(store.callsOf('listEvidence').at(-1)?.query.status).toBe('Active');
    expect(within(dialog).queryByText(/bộ phát hiện dựa trên entropy/)).toBeNull();
    expect(within(dialog).queryByText(/không còn phù hợp với câu hỏi nghiên cứu/)).toBeNull();
  });

  it('khôi phục evidence', async () => {
    const store = research.store();
    const { user } = await renderResearch(evidenceItemPath(ids.evidence.lewisExcluded));
    const card = await within(panel()).findByRole('article', { name: 'Evidence của Lewis et al. 2020' });
    expect(chip(card, 'Excluded')?.getAttribute('data-tone')).toBe('neutral');
    expect(within(panel()).queryByRole('button', { name: 'Loại evidence (Excluded)' })).toBeNull();
    await user.click(within(panel()).getByRole('button', { name: 'Khôi phục' }));
    await waitFor(() => expect(chip(within(panel()).getByRole('article'), 'Active')).toBeTruthy());
    expect(store.callsOf('restoreEvidence')).toHaveLength(1);
    expect(within(panel()).queryByRole('button', { name: 'Khôi phục' })).toBeNull();
    expect(within(panel()).getByRole('button', { name: 'Loại evidence (Excluded)' })).toBeTruthy();
  });

  it('liên kết PDF tại trang', async () => {
    research.store();
    const { router } = await renderResearch(evidenceItemPath(ids.evidence.lewisP7));
    const pdf = await within(panel()).findByRole('link', { name: 'Mở PDF tại trang 7' });
    expect(pdf.getAttribute('href')).toBe(`/api/v1/references/${ids.reference.lewis}/document#page=7`);
    expect(pdf.getAttribute('target')).toBe('_blank');
    expect(pdf.getAttribute('rel')).toContain('noopener');
    // Liu et al. 2024 has no document (indexing Unavailable): no PDF link.
    await router.navigate(evidenceItemPath(ids.evidence.liu));
    await within(panel()).findByRole('article', { name: 'Evidence của Liu et al. 2024' });
    expect(within(panel()).queryByRole('link', { name: /Mở PDF/ })).toBeNull();
  });

  it('chưa claim nào dùng', async () => {
    research.store();
    await renderResearch(evidenceItemPath(ids.evidence.manakulUnused));
    const using = await within(panel()).findByRole('region', { name: 'Claim đang dùng (0)' });
    expect(within(using).getByText('Chưa claim nào dùng evidence này.')).toBeTruthy();
  });
});
