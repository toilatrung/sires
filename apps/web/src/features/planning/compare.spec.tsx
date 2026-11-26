// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00082 S05: Plan Version compare and approval (diff, impact, assumptions before Approve, approve, reject with a
// drafted reason, withdraw into a new Draft) on the planning mock.

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Schemas } from '../../shell/mock';
import { PROJECT_ID, planningState, renderPlanning, textOf, usePlanningMock, V3, V4 } from './testing';

const comparePath = (versionId: string) => `/projects/${PROJECT_ID}/plan/versions/${versionId}`;

const assumption = (n: number, text: string): Schemas['ContextItem'] => ({
  id: `6a000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  accountId: '5b0e7c2a-4f1d-4c8e-9a6b-2d3f8e1a7c90',
  projectId: PROJECT_ID,
  createdAt: '2026-11-26T08:00:00Z',
  createdBy: { type: 'agent', agent: 'orchestrator' },
  rowVersion: 1,
  scope: 'project',
  kind: 'assumption',
  content: { text },
  sourceType: 'agent_run',
  sourceId: `6b000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  status: 'Active',
});

const ASSUMPTIONS = [assumption(1, 'Đánh giá thủ công 50 claim là đủ cỡ mẫu.'), assumption(2, 'Cấu hình hybrid dùng chung embedding model của tài khoản.')];

async function openCompare(versionId = V4) {
  const view = renderPlanning(comparePath(versionId));
  await screen.findByRole('heading', { level: 1, name: new RegExp(`Plan Version v${versionId === V4 ? 4 : 3}`) });
  return view;
}

describe('So sánh và duyệt Plan Version (PID-00082 S05)', () => {
  const mock = usePlanningMock();
  const withAssumptions = (items = ASSUMPTIONS) =>
    mock.use({ overrides: { getSharedContext: () => ({ status: 200, body: { activeContextItems: items } }) } });

  it('dependency thay đổi (UX-PLAN-001-AC01, EC24)', async () => {
    withAssumptions([]);
    const { unmountAll } = await openCompare();
    const table = await screen.findByRole('table');
    const row = within(table).getByText('T-2.5').closest('tr')!;
    expect(textOf(row.querySelector('td'))).toBe('Sửa');
    expect(textOf(row)).toContain('Dependency: T-2.3 → T-2.3, T-2.2');
    expect(textOf(row)).toContain('Thay đổi lớn · MC-05');
    const added = within(table).getByText('T-3.2').closest('tr')!;
    expect(textOf(added)).toContain('Thêm');
    expect(textOf(added)).toContain('Vẽ sơ đồ PRISMA cho chương 2');
    expect(textOf(added)).toContain('Available for agent · Diagram Agent');
    unmountAll();
  });

  it('giả định trước nút Duyệt (UX-PLAN-002-AC01, EC27)', async () => {
    withAssumptions();
    const { user, unmountAll } = await openCompare();
    expect(await screen.findByText('2 giả định còn mở — đọc trước khi duyệt')).toBeTruthy();
    expect(screen.getByText('Đánh giá thủ công 50 claim là đủ cỡ mẫu.')).toBeTruthy();
    const approve = screen.getByRole('button', { name: 'Duyệt v4' }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(screen.getByText('Đánh dấu “Tôi đã xem các giả định này” để duyệt.')).toBeTruthy();
    // The assumptions come before the button in reading order.
    const seen = screen.getByRole('checkbox', { name: 'Tôi đã xem các giả định này' });
    expect(seen.compareDocumentPosition(approve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(seen);
    expect(approve.disabled).toBe(false);
    // Reject only with a reason.
    const reject = screen.getByRole('button', { name: 'Từ chối — nhập lý do' }) as HTMLButtonElement;
    expect(reject.disabled).toBe(true);
    await user.type(screen.getByRole('textbox', { name: 'Lý do từ chối (bắt buộc)' }), 'Thiếu cỡ mẫu');
    expect((screen.getByRole('button', { name: 'Từ chối v4' }) as HTMLButtonElement).disabled).toBe(false);
    unmountAll();
  });

  it('tóm tắt thay đổi (EC25)', async () => {
    withAssumptions([]);
    const { unmountAll } = await openCompare();
    const counts = await screen.findByLabelText('Tóm tắt thay đổi');
    expect(textOf(counts)).toBe('+1 thêm−0 xóa~1 sửa');
    expect(textOf(screen.getByText(/^Đề xuất bởi Orchestrator/).closest('p'))).toContain('lý do: Mở rộng phạm vi sang giáo dục');
    const goals = screen.getByRole('heading', { name: 'Mục tiêu và phương pháp' }).parentElement!;
    expect(textOf(goals)).toContain('v3 · Mục tiêu');
    expect(textOf(goals)).toContain('v4 · Mục tiêu · Sửa');
    expect(textOf(goals)).toContain('Đánh giá mức độ RAG giảm trích dẫn sai trong tổng quan tài liệu y sinh và giáo dục.');
    expect(textOf(goals)).toContain('Thay đổi lớn · MC-01');
    unmountAll();
  });

  it('ảnh hưởng (EC26)', async () => {
    withAssumptions([]);
    const { unmountAll } = await openCompare();
    await waitFor(() => expect(textOf(document.querySelector('.planning-check-line'))).toBe(
      'Không có chu trình trong dependency graph của v4. Ảnh hưởng: T-2.5 cần chạy lại readiness sau khi duyệt.',
    ));
    unmountAll();
  });

  it('duyệt (EC28)', async () => {
    withAssumptions([]);
    let sent: { key: string | null; body: unknown } | undefined;
    mock.server.events.on('request:start', async ({ request }) => {
      if (request.url.endsWith('/approve')) sent = { key: request.headers.get('idempotency-key'), body: await request.clone().json() };
    });
    const { user, router, unmountAll } = await openCompare();
    expect(await screen.findByText('Duyệt sẽ đặt v4 làm baseline, v3 chuyển Superseded. Task đang chạy không bị dừng; 0 Task bị xóa chuyển Cancelled.')).toBeTruthy();

    // Changed meanwhile: 409, the screen reads it again.
    mock.use({ overrides: { approvePlanVersion: () => ({ status: 409, body: { type: 'x', title: 'x', status: 409, code: 'invalid_transition' } }) } });
    await user.click(await screen.findByRole('button', { name: 'Duyệt v4' }));
    expect(await screen.findByText('Plan Version đã đổi; đã đọc lại bản mới nhất.')).toBeTruthy();
    mock.server.resetHandlers();
    withAssumptions([]);

    await user.click(screen.getByRole('button', { name: 'Duyệt v4' }));
    await waitFor(() => expect(planningState().versions.find((v) => v.id === V4)?.status).toBe('Approved'));
    expect(planningState().versions.find((v) => v.id === V3)?.status).toBe('Superseded');
    expect(sent?.body).toEqual({ versionNumber: 4 });
    expect(sent?.key).toMatch(/^[0-9a-f-]{36}$/);
    // Back to the Plan, which opens on the new baseline.
    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${PROJECT_ID}/plan`));
    expect(await screen.findByRole('option', { name: 'v4 · Approved (baseline)', selected: true })).toBeTruthy();
    mock.server.events.removeAllListeners();
    unmountAll();
  });

  it('rút lại để sửa (EC29)', async () => {
    withAssumptions([]);
    const { user, router, unmountAll } = await openCompare();
    await user.click(await screen.findByRole('button', { name: 'Sửa thành bản Draft mới' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${PROJECT_ID}/plan`));
    const draft = planningState().versions.find((v) => v.versionNumber === 6)!;
    expect(draft.status).toBe('Draft');
    expect(router.state.location.search).toContain(`version=${draft.id}`);
    expect(await screen.findByRole('heading', { name: 'Dependency graph · Plan Version v6 (Draft, đang soạn)' })).toBeTruthy();
    const v4 = planningState().versions.find((v) => v.id === V4)!;
    expect(v4.status).toBe('Rejected');
    expect(v4.rejectionReason).toBe('Rút lại để sửa');
    unmountAll();
  });

  it('không Proposed chỉ đọc (EC30)', async () => {
    const { unmountAll } = await openCompare(V3);
    expect(await screen.findByText('v3 đang Approved — chỉ đọc, không có thao tác duyệt.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Duyệt/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Từ chối/ })).toBeNull();
    unmountAll();
  });

  it('nháp lý do từ chối (EC37)', async () => {
    withAssumptions([]);
    const first = await openCompare();
    const reject = (await screen.findByRole('button', { name: 'Từ chối — nhập lý do' })) as HTMLButtonElement;
    expect(reject.disabled).toBe(true);
    await first.user.type(screen.getByRole('textbox', { name: 'Lý do từ chối (bắt buộc)' }), 'Chưa đủ cỡ mẫu cho giáo dục.');
    first.unmountAll();

    const second = await openCompare();
    const field = (await screen.findByRole('textbox', { name: 'Lý do từ chối (bắt buộc)' })) as HTMLTextAreaElement;
    expect(field.value).toBe('Chưa đủ cỡ mẫu cho giáo dục.');
    await second.user.click(screen.getByRole('button', { name: 'Từ chối v4' }));
    await waitFor(() => expect(planningState().versions.find((v) => v.id === V4)?.status).toBe('Rejected'));
    expect(planningState().versions.find((v) => v.id === V4)?.rejectionReason).toBe('Chưa đủ cỡ mẫu cho giáo dục.');
    expect(await screen.findByText('Đã từ chối v4.')).toBeTruthy();
    second.unmountAll();
  });
});
