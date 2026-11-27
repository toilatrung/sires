// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00114 O3: tab Claims (S02) and the claim inspector with the claim review (S04) on the research mock (S01).

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Overrides } from '../../shell/mock';
import { claimPath, evidencePath, ids, PROJECT_ID, renderResearch, storeOverrides, useResearchMock } from './test/render';

const panel = () => screen.getByRole('complementary', { name: 'Evidence Inspector' });
const chip = (scope: HTMLElement, text: string) => within(scope).queryAllByText(text).find((node) => node.classList.contains('sires-chip'));
const claimsList = () => screen.findByRole('list', { name: 'Claim' });
const row = (list: HTMLElement, statement: RegExp) => within(list).getByRole('link', { name: statement });
const problem = (status: number, code: 'validation_failed' | 'invalid_transition', detail: string) =>
  ({ type: `https://sires.etroy.local/problems/${code}`, title: code, status, code, detail });

describe('tab Claims (S02)', () => {
  const research = useResearchMock();

  it('tải thêm', async () => {
    const store = research.store({ extraRows: 25 });
    const { user } = await renderResearch(evidencePath());
    const list = await claimsList();
    expect(screen.getByRole('tab', { name: 'Claims · 20+' })).toBeTruthy();
    expect(within(list).getAllByRole('link')).toHaveLength(20);
    await user.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Claims · 34' })).toBeTruthy());
    expect(within(list).getAllByRole('link')).toHaveLength(34);
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).toBeNull();
    expect(store.callsOf('listClaims').at(-1)?.query).toMatchObject({ limit: '20', cursor: '20' });
  });

  it('lọc theo Active task', async () => {
    let activeTaskId: string | undefined = ids.task.t2;
    const store = research.store({}, {
      getProject: ({ params, fixtures }) => {
        const project = fixtures.ResearchProject?.find((row) => row.id === params.projectId);
        return project ? { status: 200, body: { ...project, activeTaskId } } : { status: 404 };
      },
    });
    const { user } = await renderResearch(evidencePath());
    await claimsList();
    const box = await screen.findByRole('checkbox', { name: 'Chỉ liên quan T-2.1' });
    expect((box as HTMLInputElement).checked).toBe(false);
    expect(store.callsOf('listClaims').every((call) => !call.query.taskId)).toBe(true);
    await user.click(box);
    await waitFor(() => expect(store.callsOf('listClaims').at(-1)?.query.taskId).toBe(ids.task.t2));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Claims · 4' })).toBeTruthy());

    // The Active task changes while the screen is open: the label follows and the filter reloads.
    activeTaskId = ids.task.t3;
    research.mock.events.emit({ type: 'project.lifecycle_changed', projectId: PROJECT_ID, objectType: 'project', objectId: PROJECT_ID, toState: 'Active' });
    expect(await screen.findByRole('checkbox', { name: 'Chỉ liên quan T-2.3' })).toBeTruthy();
    await waitFor(() => expect(store.callsOf('listClaims').at(-1)?.query.taskId).toBe(ids.task.t3));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Claims · 3' })).toBeTruthy());

    // No Active task: no box, no taskId.
    activeTaskId = undefined;
    research.mock.events.emit({ type: 'project.lifecycle_changed', projectId: PROJECT_ID, objectType: 'project', objectId: PROJECT_ID, toState: 'Active' });
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: /Chỉ liên quan/ })).toBeNull());
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Claims · 9' })).toBeTruthy());
    expect(store.callsOf('listClaims').at(-1)?.query.taskId).toBeUndefined();
  });

  it('needs review', async () => {
    research.store();
    const { user } = await renderResearch(evidencePath());
    const list = await claimsList();
    const entropy = row(list, /^Bộ phát hiện hallucination dựa trên entropy/);
    expect(chip(entropy, 'needs review')?.getAttribute('data-tone')).toBe('warning-flag');
    // No reason next to the flag this round (EC23).
    expect(within(entropy).queryByText(/thu hồi|evidence_stale/)).toBeNull();
    await user.click(entropy);
    await waitFor(() => expect(chip(panel(), 'needs review')).toBeTruthy());
  });
});

describe('Inspector của claim và duyệt claim (S04)', () => {
  const research = useResearchMock();

  it('Unsupported giữ nhãn ở danh sách, Inspector và sau khi chấp nhận', async () => {
    const store = research.store();
    const { user } = await renderResearch(evidencePath());
    const list = await claimsList();
    const unsupported = row(list, /^RAG giảm một nửa hallucination ở mọi miền\./);
    expect(chip(unsupported, 'Unsupported')?.getAttribute('data-tone')).toBe('warning-flag');
    expect(within(unsupported).getByText(/^0 evidence/)).toBeTruthy();
    await user.click(unsupported);
    await within(panel()).findByText('RAG giảm một nửa hallucination ở mọi miền.', { selector: 'p' });
    expect(chip(panel(), 'Unsupported')?.getAttribute('data-tone')).toBe('warning-flag');
    expect(chip(panel(), 'Draft')).toBeTruthy();

    await user.click(within(panel()).getByRole('button', { name: 'Chấp nhận claim' }));
    const dialog = await screen.findByRole('dialog', { name: 'Chấp nhận claim Unsupported?' });
    expect(within(dialog).getByText('Claim giữ nhãn Unsupported ở mọi nơi dùng (bản tổng hợp, bản thảo).')).toBeTruthy();
    expect(within(dialog).getByText('0 evidence hỗ trợ và 0 evidence phản bác.')).toBeTruthy();
    expect(store.callsOf('acceptClaim')).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Chấp nhận claim' }));
    await waitFor(() => expect(chip(panel(), 'Accepted')).toBeTruthy());
    const calls = store.callsOf('acceptClaim');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({ rowVersion: 2 });
    expect(calls[0]!.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    // Accepted sits next to Unsupported; the support label never changes.
    expect(chip(panel(), 'Unsupported')?.getAttribute('data-tone')).toBe('warning-flag');
    await waitFor(() => expect(chip(row(list, /^RAG giảm một nửa/), 'Accepted')).toBeTruthy());
    expect(chip(row(list, /^RAG giảm một nửa/), 'Unsupported')).toBeTruthy();
  });

  it('Not Assessed không chấp nhận được', async () => {
    research.store({}, {
      // The server still refuses with 400 (SYN-HUMAN-REVIEW-001-AC01): its reason is shown.
      acceptClaim: () => ({ status: 400, body: problem(400, 'validation_failed', 'Claim chưa được kiểm chứng (Not Assessed).') }),
    });
    const { user, router } = await renderResearch(claimPath(ids.claim.notAssessed));
    const accept = await within(panel()).findByRole('button', { name: 'Chấp nhận claim' });
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    const reason = within(panel()).getByText('Cần kiểm chứng trước');
    expect(accept.getAttribute('aria-describedby')).toBe(reason.id);
    expect((within(panel()).getByRole('button', { name: 'Kiểm chứng' }) as HTMLButtonElement).disabled).toBe(false);

    await router.navigate(claimPath(ids.claim.longContext));
    await within(panel()).findByText('Ngữ cảnh dài làm mô hình bỏ sót thông tin ở giữa.', { selector: 'p' });
    await user.click(within(panel()).getByRole('button', { name: 'Chấp nhận claim' }));
    const alert = await within(panel()).findByRole('alert');
    expect(within(alert).getByText('Chưa chấp nhận được claim')).toBeTruthy();
    expect(within(alert).getByText('Claim chưa được kiểm chứng (Not Assessed).')).toBeTruthy();
    expect(within(alert).getByText(/^validation_failed/)).toBeTruthy();
  });

  it('Conflicting hiện hai phía', async () => {
    const store = research.store();
    await renderResearch(claimPath(ids.claim.conflicting));
    expect(await within(panel()).findByText('Claim Conflicting — hiển thị cả evidence hỗ trợ và phản bác.')).toBeTruthy();
    expect(within(panel()).getByRole('region', { name: 'Hỗ trợ (2)' })).toBeTruthy();
    expect(within(panel()).getByRole('region', { name: 'Phản bác (1)' })).toBeTruthy();
    expect(within(panel()).getByRole('region', { name: 'Ngữ cảnh (1)' })).toBeTruthy();

    // No contradicting evidence left: the group still shows, with “Không có”.
    const claim = store.claims.find((row) => row.id === ids.claim.conflicting)!;
    claim.evidenceLinks = claim.evidenceLinks!.filter((link) => link.relation !== 'contradicts');
    research.mock.events.emit({ type: 'research.object_status_changed', projectId: PROJECT_ID, objectType: 'claim', objectId: claim.id, toState: 'Draft' });
    const empty = await within(panel()).findByRole('region', { name: 'Phản bác (0)' });
    expect(within(empty).getByText('Không có')).toBeTruthy();
  });

  it('link tới evidence Stale', async () => {
    research.store();
    const { router } = await renderResearch(claimPath(ids.claim.entropy));
    const supports = await within(panel()).findByRole('region', { name: 'Hỗ trợ (1)' });
    const stale = await within(supports).findByRole('article', { name: 'Evidence của Doe et al. 2023' });
    expect(chip(stale, 'Stale')).toBeTruthy();
    expect(within(stale).getByText('Không tính khi đánh giá mức hỗ trợ.')).toBeTruthy();
    // Excluded evidence of a link: kept for traceability, not counted (CLAIM-MAPPING-001).
    await router.navigate(claimPath(ids.claim.conflicting));
    const context = await within(panel()).findByRole('region', { name: 'Ngữ cảnh (1)' });
    const excluded = await within(context).findByRole('article', { name: 'Evidence của Lewis et al. 2020' });
    expect(chip(excluded, 'Excluded')).toBeTruthy();
    expect(within(excluded).getByText('Không tính khi đánh giá mức hỗ trợ.')).toBeTruthy();
  });

  it('409 tải lại claim', async () => {
    const store = research.store();
    const { user } = await renderResearch(claimPath(ids.claim.longContext));
    const accept = await within(panel()).findByRole('button', { name: 'Chấp nhận claim' });
    const claim = store.claims.find((row) => row.id === ids.claim.longContext)!;
    claim.rowVersion += 1; // changed elsewhere after it was opened
    const reads = store.callsOf('getClaim').length;
    await user.click(accept);
    const alert = await within(panel()).findByRole('alert');
    expect(within(alert).getByText('Chưa chấp nhận được claim')).toBeTruthy();
    expect(within(alert).getByText('Claim đã đổi phiên bản sau khi bạn mở.')).toBeTruthy();
    expect(within(alert).getByText(/^invalid_transition/)).toBeTruthy();
    expect(within(alert).getByText('Đã tải lại claim; xem trạng thái mới trước khi thao tác tiếp.')).toBeTruthy();
    await waitFor(() => expect(store.callsOf('getClaim').length).toBeGreaterThan(reads));
    expect(store.callsOf('acceptClaim')).toHaveLength(1);

    // Decided elsewhere: reject is refused, the new state shows, no resend.
    claim.approvalStatus = 'Accepted';
    await user.click(within(panel()).getByRole('button', { name: 'Từ chối' }));
    const dialog = await screen.findByRole('dialog', { name: 'Từ chối claim?' });
    await user.click(within(dialog).getByRole('button', { name: 'Từ chối claim' }));
    expect(await within(panel()).findByText('Chưa từ chối được claim')).toBeTruthy();
    await waitFor(() => expect(chip(panel(), 'Accepted')).toBeTruthy());
    expect(within(panel()).queryByRole('button', { name: 'Từ chối' })).toBeNull();
    expect(store.callsOf('rejectClaim')).toHaveLength(1);
  });

  it('sửa phát biểu', async () => {
    const store = research.store();
    const { user, router } = await renderResearch(claimPath(ids.claim.definition));
    await user.click(await within(panel()).findByRole('button', { name: 'Sửa phát biểu' }));
    const field = within(panel()).getByRole('textbox', { name: 'Phát biểu' }) as HTMLTextAreaElement;
    expect(field.value).toBe('Hallucination là nội dung không trung thành với nguồn hoặc không có căn cứ.');
    expect(within(panel()).getByText('Lưu xong, claim về Draft và mức hỗ trợ về Not Assessed cho tới khi kiểm chứng lại.')).toBeTruthy();
    await user.clear(field);
    await user.click(within(panel()).getByRole('button', { name: 'Lưu phát biểu' }));
    expect(within(panel()).getByText('Phát biểu không được để trống. Chưa lưu.')).toBeTruthy();
    expect(store.callsOf('updateClaimStatement')).toHaveLength(0);
    await user.type(field, 'Hallucination là nội dung không có căn cứ trong nguồn.');
    await user.click(within(panel()).getByRole('button', { name: 'Lưu phát biểu' }));
    await waitFor(() => expect(within(panel()).getByText('Hallucination là nội dung không có căn cứ trong nguồn.', { selector: 'p' })).toBeTruthy());
    const call = store.callsOf('updateClaimStatement')[0]!;
    expect(call.headers['If-Match']).toBe('"2"');
    expect(call.headers['Content-Type']).toBe('application/merge-patch+json');
    expect(call.body).toEqual({ statement: 'Hallucination là nội dung không có căn cứ trong nguồn.' });
    expect(chip(panel(), 'Draft')).toBeTruthy();
    expect(chip(panel(), 'Not Assessed')).toBeTruthy();

    // 412: changed elsewhere → reload, the text being typed stays.
    await router.navigate(claimPath(ids.claim.longContext));
    await within(panel()).findByText('Ngữ cảnh dài làm mô hình bỏ sót thông tin ở giữa.', { selector: 'p' });
    await user.click(within(panel()).getByRole('button', { name: 'Sửa phát biểu' }));
    const other = within(panel()).getByRole('textbox', { name: 'Phát biểu' }) as HTMLTextAreaElement;
    await user.clear(other);
    await user.type(other, 'Ngữ cảnh dài làm mô hình bỏ sót thông tin nằm ở giữa.');
    store.claims.find((row) => row.id === ids.claim.longContext)!.rowVersion += 1;
    await user.click(within(panel()).getByRole('button', { name: 'Lưu phát biểu' }));
    const alert = await within(panel()).findByRole('alert');
    expect(within(alert).getByText('Claim đã đổi ở nơi khác')).toBeTruthy();
    expect(within(alert).getByText(/^precondition_failed/)).toBeTruthy();
    expect((within(panel()).getByRole('textbox', { name: 'Phát biểu' }) as HTMLTextAreaElement).value).toBe('Ngữ cảnh dài làm mô hình bỏ sót thông tin nằm ở giữa.');
  });

  it('kiểm chứng chạy lâu', async () => {
    const store = research.store();
    const { user, router } = await renderResearch(claimPath(ids.claim.longContext));
    // 409: a verification of this claim is already running.
    store.workflows.push({
      id: '7a000000-0000-4000-8000-000000000999', accountId: store.claims[0]!.accountId, projectId: PROJECT_ID, createdAt: new Date().toISOString(),
      createdBy: { type: 'researcher' }, rowVersion: 1, idempotencyKey: 'earlier-request', type: 'verification', triggeredBy: { type: 'researcher' },
      status: 'Running', subject: { type: 'claim', id: ids.claim.longContext },
    });
    await user.click(await within(panel()).findByRole('button', { name: 'Kiểm chứng' }));
    const refused = await within(panel()).findByRole('alert');
    expect(within(refused).getByText('Claim đang có một lần kiểm chứng')).toBeTruthy();
    expect(within(refused).getByText(/^active_workflow_exists/)).toBeTruthy();

    await router.navigate(claimPath(ids.claim.notAssessed));
    await within(panel()).findByText('Self-RAG giảm số trích dẫn không có căn cứ so với RAG thông thường.', { selector: 'p' });
    await user.click(within(panel()).getByRole('button', { name: 'Kiểm chứng' }));
    const card = await within(panel()).findByText('Verification Agent đang đánh giá mức hỗ trợ');
    expect(card).toBeTruthy();
    expect(within(panel()).getByText('Rời trang được; kết quả báo qua notification.')).toBeTruthy();
    const workflow = store.workflows.find((row) => row.subject?.id === ids.claim.notAssessed)!;
    expect(within(panel()).getByRole('link', { name: 'Xem workflow' }).getAttribute('href')).toBe(`/projects/${PROJECT_ID}/activity/workflows/${workflow.id}`);
    expect((within(panel()).getByRole('button', { name: 'Kiểm chứng' }) as HTMLButtonElement).disabled).toBe(true);
    expect(store.callsOf('verifyClaim').at(-1)?.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    store.finishWorkflows();
    await waitFor(() => expect(within(panel()).queryByText('Verification Agent đang đánh giá mức hỗ trợ')).toBeNull());
    await waitFor(() => expect(chip(panel(), 'Partially Supported')).toBeTruthy());

    // Failed: the support status stays, “Kiểm chứng lại”.
    store.options.verification = 'fails';
    await user.click(within(panel()).getByRole('button', { name: 'Kiểm chứng' }));
    await within(panel()).findByText('Verification Agent đang đánh giá mức hỗ trợ');
    store.finishWorkflows();
    const failed = await within(panel()).findByText('Kiểm chứng kết thúc ở Failed; mức hỗ trợ giữ nguyên.');
    expect(within(failed.closest('[role="alert"]') as HTMLElement).getByText('provider_unavailable')).toBeTruthy();
    expect(within(panel()).getByRole('button', { name: 'Kiểm chứng lại' })).toBeTruthy();
    expect(chip(panel(), 'Partially Supported')).toBeTruthy();
  });

  it('liên kết evidence', async () => {
    const store = research.store();
    const { user } = await renderResearch(claimPath(ids.claim.conflicting));
    await user.click(await within(panel()).findByRole('button', { name: 'Liên kết evidence' }));
    const dialog = await screen.findByRole('dialog', { name: 'Liên kết evidence' });
    const confirm = within(dialog).getByRole('button', { name: 'Liên kết' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(within(dialog).getByText('Chọn evidence và quan hệ')).toBeTruthy();
    const evidence = await within(dialog).findByRole('radio', { name: /SelfCheckGPT phát hiện câu không có căn cứ/ });
    expect(within(dialog).getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    await user.click(evidence);
    expect(confirm.disabled).toBe(true);
    // Relation by keyboard (nothing preselected): focus the option and press Space.
    within(dialog).getByRole('radio', { name: 'contradicts' }).focus();
    await user.keyboard(' ');
    expect((within(dialog).getByRole('radio', { name: 'contradicts' }) as HTMLInputElement).checked).toBe(true);
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(store.callsOf('linkEvidenceToClaim')[0]!.body).toEqual({ evidenceId: ids.evidence.manakulUnused, relation: 'contradicts' });
    expect(await within(panel()).findByRole('region', { name: 'Phản bác (2)' })).toBeTruthy();

    // Filter by reference; 422 when the evidence is no longer Active.
    await user.click(within(panel()).getByRole('button', { name: 'Liên kết evidence' }));
    const second = await screen.findByRole('dialog', { name: 'Liên kết evidence' });
    await user.selectOptions(within(second).getByRole('combobox', { name: 'Reference' }), 'Min et al. 2023');
    await waitFor(() => expect(store.callsOf('listEvidence').at(-1)?.query).toMatchObject({ status: 'Active', referenceId: ids.reference.min }));
    await user.click(await within(second).findByRole('radio', { name: /factual precision theo từng mệnh đề/ }));
    await user.click(within(second).getByRole('radio', { name: 'supports' }));
    store.evidence.find((row) => row.id === ids.evidence.minUnused)!.status = 'Stale';
    await user.click(within(second).getByRole('button', { name: 'Liên kết' }));
    const alert = await within(second).findByRole('alert');
    expect(within(alert).getByText('Chưa liên kết được evidence')).toBeTruthy();
    expect(within(alert).getByText(/^reference_not_trusted/)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Liên kết evidence' })).toBeTruthy();
  });

  it('đổi quan hệ', async () => {
    let failNextLink = false;
    const store = research.store({}, {
      linkEvidenceToClaim: (request) => {
        if (failNextLink) {
          failNextLink = false;
          return { status: 409, body: problem(409, 'invalid_transition', 'Claim đổi ở nơi khác.') };
        }
        return storeOverrides(store).linkEvidenceToClaim!(request);
      },
    } satisfies Overrides);
    const { user } = await renderResearch(claimPath(ids.claim.conflicting));
    const supports = await within(panel()).findByRole('region', { name: 'Hỗ trợ (2)' });
    const lewis = await within(supports).findByRole('article', { name: 'Evidence của Lewis et al. 2020' });
    await user.click(within(lewis).getByRole('button', { name: 'Đổi quan hệ' }));
    expect(within(lewis).queryByRole('radio', { name: 'supports' })).toBeNull();
    await user.click(within(lewis).getByRole('radio', { name: 'context' }));
    await user.click(within(lewis).getByRole('button', { name: 'Đổi' }));
    expect(await within(panel()).findByRole('region', { name: 'Ngữ cảnh (2)' })).toBeTruthy();
    expect(within(panel()).getByRole('region', { name: 'Hỗ trợ (1)' })).toBeTruthy();
    expect(store.callsOf('unlinkEvidenceFromClaim')[0]!.params.evidenceId).toBe(ids.evidence.lewisP7);
    expect(store.callsOf('linkEvidenceToClaim').at(-1)?.body).toEqual({ evidenceId: ids.evidence.lewisP7, relation: 'context' });

    // The second request fails: report it and keep “Liên kết lại”.
    failNextLink = true;
    const karpukhin = await within(within(panel()).getByRole('region', { name: 'Hỗ trợ (1)' })).findByRole('article', { name: 'Evidence của Karpukhin et al. 2020' });
    await user.click(within(karpukhin).getByRole('button', { name: 'Đổi quan hệ' }));
    await user.click(within(karpukhin).getByRole('radio', { name: 'contradicts' }));
    await user.click(within(karpukhin).getByRole('button', { name: 'Đổi' }));
    const alert = await within(panel()).findByText('Đã bỏ liên kết cũ nhưng chưa liên kết lại được với quan hệ contradicts');
    const box = alert.closest('[role="alert"]') as HTMLElement;
    expect(within(box).getByText(/^invalid_transition/)).toBeTruthy();
    await user.click(within(box).getByRole('button', { name: 'Liên kết lại' }));
    expect(await within(panel()).findByRole('region', { name: 'Phản bác (2)' })).toBeTruthy();
    await waitFor(() => expect(within(panel()).queryByText(/chưa liên kết lại được/)).toBeNull());
  });

  it('chấp nhận hàng loạt', async () => {
    const store = research.store();
    const { user } = await renderResearch(evidencePath());
    const list = await claimsList();
    await user.click(screen.getByRole('button', { name: 'Chấp nhận các claim Supported (2)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Chấp nhận 2 claim Supported?' });
    expect(within(dialog).getByText('Ngữ cảnh dài làm mô hình bỏ sót thông tin ở giữa.')).toBeTruthy();
    expect(within(dialog).getByText('Bộ phát hiện hallucination dựa trên entropy đạt độ chính xác cao.')).toBeTruthy();
    store.claims.find((row) => row.id === ids.claim.entropy)!.rowVersion += 1; // changed elsewhere
    await user.click(within(dialog).getByRole('button', { name: 'Chấp nhận 2 claim' }));
    expect(await within(dialog).findByText('Đã chấp nhận 1/2 claim.')).toBeTruthy();
    expect(within(dialog).getByRole('status').textContent).toBe('Đã gửi 2/2');
    const failed = within(dialog).getByRole('alert');
    expect(within(failed).getByText('1 claim chưa chấp nhận được')).toBeTruthy();
    expect(within(failed).getByText(/Bộ phát hiện hallucination dựa trên entropy/)).toBeTruthy();
    expect(within(failed).getByText('invalid_transition')).toBeTruthy();
    const keys = store.callsOf('acceptClaim').map((call) => call.headers['Idempotency-Key']);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(chip(row(list, /^Ngữ cảnh dài làm mô hình/), 'Accepted')).toBeTruthy());
    expect(await screen.findByRole('button', { name: 'Chấp nhận các claim Supported (1)' })).toBeTruthy();

    // Nothing eligible among the loaded claims: disabled with its reason.
    store.claims.find((row) => row.id === ids.claim.entropy)!.approvalStatus = 'Accepted';
    research.mock.events.emit({ type: 'research.object_status_changed', projectId: PROJECT_ID, objectType: 'claim', objectId: ids.claim.entropy, toState: 'Accepted' });
    const none = await screen.findByRole('button', { name: 'Chấp nhận các claim Supported (0)' });
    expect((none as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Không có claim Draft mức Supported trong danh sách đã tải.')).toBeTruthy();
  });

  it('claim đã quyết định', async () => {
    const store = research.store();
    const { router } = await renderResearch(claimPath(ids.claim.accepted));
    await within(panel()).findByText('Truy xuất dày đặc vượt BM25 trên các tập hỏi đáp mở.', { selector: 'p' });
    for (const name of ['Chấp nhận claim', 'Từ chối', 'Kiểm chứng', 'Liên kết evidence']) expect(within(panel()).queryByRole('button', { name })).toBeNull();
    expect(within(panel()).getByRole('button', { name: 'Sửa phát biểu' })).toBeTruthy();
    await within(panel()).findByRole('article', { name: 'Evidence của Karpukhin et al. 2020' });
    expect(within(panel()).queryByRole('button', { name: 'Bỏ liên kết' })).toBeNull();

    store.claims.find((row) => row.id === ids.claim.longContext)!.approvalStatus = 'Rejected';
    await router.navigate(claimPath(ids.claim.longContext));
    expect(await within(panel()).findByText('Claim đã Rejected; chỉ đọc.')).toBeTruthy();
    expect(within(panel()).queryByRole('button', { name: 'Sửa phát biểu' })).toBeNull();
    expect(within(panel()).queryByRole('button', { name: 'Chấp nhận claim' })).toBeNull();
  });

  it('không gửi trùng', async () => {
    const keys: Record<string, (string | null)[]> = {};
    let offline = false;
    const store = research.store({}, {
      acceptClaim: async (request) => {
        (keys[request.params.claimId] ??= []).push(request.request.headers.get('Idempotency-Key'));
        if (offline) {
          offline = false;
          return Response.error();
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
        return storeOverrides(store).acceptClaim!(request);
      },
    } satisfies Overrides);
    const { user, router } = await renderResearch(claimPath(ids.claim.longContext));
    // Double click while the first request is on its way: one request, the button is disabled meanwhile.
    const accept = await within(panel()).findByRole('button', { name: 'Chấp nhận claim' });
    await user.dblClick(accept);
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(chip(panel(), 'Accepted')).toBeTruthy());
    expect(keys[ids.claim.longContext]).toHaveLength(1);

    // Sent again after a network error: the same Idempotency-Key (DATA-IDEMP-001).
    await router.navigate(claimPath(ids.claim.entropy));
    await within(panel()).findByText('Bộ phát hiện hallucination dựa trên entropy đạt độ chính xác cao.', { selector: 'p' });
    offline = true;
    await user.click(within(panel()).getByRole('button', { name: 'Chấp nhận claim' }));
    const alert = await within(panel()).findByRole('alert');
    expect(within(alert).getByText(/^network_error/)).toBeTruthy();
    await user.click(within(panel()).getByRole('button', { name: 'Chấp nhận claim' }));
    await waitFor(() => expect(chip(panel(), 'Accepted')).toBeTruthy());
    const sent = keys[ids.claim.entropy]!;
    expect(sent).toHaveLength(2);
    expect(sent[1]).toBe(sent[0]);
    expect(store.callsOf('acceptClaim')).toHaveLength(2);
  });
});
