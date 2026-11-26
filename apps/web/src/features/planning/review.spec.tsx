// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00082 S06: Task review (outputs and their versions, criteria ticked in the browser, accept, return with a
// reason, cancel, redirect when not In Review) on the planning mock; artifact operations (research) are overridden.

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MockServer } from '../../shell/mock/node';
import type { Schemas } from '../../shell/mock';
import { artifact, emptyPage, PROJECT_ID, planningState, renderPlanning, T, textOf, usePlanningMock } from './testing';

const reviewPath = (taskId: string) => `/projects/${PROJECT_ID}/tasks/${taskId}`;
const t21 = () => planningState().tasks.find((t) => t.id === T['2.1'])!;

/** Outputs of T-2.1: synthesis v2 (Draft unless accepted) and table v1 Accepted; accept/reject change them. */
function outputs(mock: MockServer, synthesisAccepted: boolean) {
  const items: Schemas['Artifact'][] = [
    artifact(1, T['2.1'], 'Định nghĩa hallucination', '2026-11-25T08:00:00Z', { versionNumber: 2, status: synthesisAccepted ? 'Accepted' : 'Draft' }, synthesisAccepted),
    { ...artifact(2, T['2.1'], 'Bảng thuật ngữ', '2026-11-25T08:05:00Z', { versionNumber: 1, status: 'Accepted' }, true), type: 'table' },
  ];
  const decisions: string[] = [];
  const versionOf = (artifactId: string, versionId: string): Schemas['ArtifactVersion'] => {
    const a = items.find((i) => i.id === artifactId)!;
    return {
      id: versionId,
      accountId: a.accountId,
      createdAt: a.createdAt,
      createdBy: a.createdBy,
      rowVersion: 1,
      artifactId,
      versionNumber: a.latestVersion!.versionNumber!,
      format: 'markdown',
      content: a.type === 'synthesis' ? 'Hallucination được định nghĩa là nội dung không trung thành với nguồn.' : '| Thuật ngữ | Định nghĩa |',
      contentHash: 'h',
      status: a.latestVersion!.status!,
      provenance: { createdBy: a.createdBy, inputs: [] },
    };
  };
  mock.use({
    overrides: {
      listWorkflows: () => emptyPage,
      listArtifacts: () => ({ status: 200, body: { items, nextCursor: null } }),
      getArtifactVersion: ({ params }) => ({ status: 200, body: versionOf(params.artifactId, params.versionId) }),
      acceptArtifactVersion: ({ params }) => {
        const a = items.find((i) => i.id === params.artifactId)!;
        a.currentAcceptedVersionId = params.versionId;
        a.latestVersion = { ...a.latestVersion, status: 'Accepted' };
        decisions.push(`accept ${a.title}`);
        return { status: 200, body: versionOf(params.artifactId, params.versionId) };
      },
      rejectArtifactVersion: ({ params }) => {
        const a = items.find((i) => i.id === params.artifactId)!;
        a.latestVersion = { ...a.latestVersion, status: 'Rejected' };
        decisions.push(`reject ${a.title}`);
        return { status: 200, body: versionOf(params.artifactId, params.versionId) };
      },
    },
  });
  return { items, decisions };
}

async function openReview(taskId = T['2.1']) {
  const view = renderPlanning(reviewPath(taskId));
  await screen.findByRole('heading', { level: 1, name: /Tổng hợp định nghĩa khái niệm/ });
  return view;
}

describe('Nghiệm thu Task (PID-00082 S06)', () => {
  const mock = usePlanningMock();

  it('criterion chưa đánh dấu (UX-TASK-006-AC01, EC31)', async () => {
    outputs(mock, true);
    let body: unknown;
    mock.server.events.on('request:start', async ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/reviews')) body = await request.clone().json();
    });
    const { user, router, unmountAll } = await openReview();
    const accept = screen.getByRole('button', { name: 'Nghiệm thu' }) as HTMLButtonElement;
    expect(await screen.findByRole('heading', { name: 'Acceptance criteria · 0/3 đã đánh dấu' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Cần đánh dấu đủ 3 criterion.')).toBeTruthy());
    expect(accept.disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Mỗi khái niệm có ít nhất hai định nghĩa từ nguồn khác nhau.' }));
    await user.click(screen.getByRole('checkbox', { name: 'Mọi định nghĩa có trích dẫn tới Trusted Reference.' }));
    expect(screen.getByRole('heading', { name: 'Acceptance criteria · 2/3 đã đánh dấu' })).toBeTruthy();
    expect(accept.disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Ghi rõ định nghĩa được chọn và lý do.' }));
    expect(accept.disabled).toBe(false);
    await user.click(accept);
    await waitFor(() => expect(t21().status).toBe('Completed'));
    expect(body).toEqual({ outcome: 'accepted', criteriaResults: [{ criterionId: 'AC1', met: true }, { criterionId: 'AC2', met: true }, { criterionId: 'AC3', met: true }] });
    // Not In Review any more: back to the Plan panel.
    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${PROJECT_ID}/plan`));
    mock.server.events.removeAllListeners();
    unmountAll();
  });

  it('đầu ra Accepted (EC32)', async () => {
    const { decisions } = outputs(mock, false);
    const { user, unmountAll } = await openReview();
    const synthesis = (await screen.findByRole('heading', { name: /“Định nghĩa hallucination” v2/ })).closest('article')!;
    expect(within(synthesis).getByText('Draft')).toBeTruthy();
    expect(await within(synthesis).findByText(/Hallucination được định nghĩa là nội dung/)).toBeTruthy();
    expect(within(synthesis).getByRole('link', { name: 'Mở artifact' }).getAttribute('href')).toBe(`/projects/${PROJECT_ID}/artifacts/7c000000-0000-4000-8000-000000000001`);
    expect(within(synthesis).getByRole('link', { name: 'Mở evidence' })).toBeTruthy();
    expect(within(synthesis).getByRole('link', { name: 'So sánh v1 ↔ v2' })).toBeTruthy();
    const required = screen.getByRole('heading', { name: 'Đầu ra bắt buộc' }).parentElement!;
    expect(textOf(required)).toContain('synthesis: v2 Draft — chưa có version Accepted');
    expect(textOf(required)).toContain('table: v1 Accepted — đã có version Accepted');
    for (const box of screen.getAllByRole('checkbox')) await user.click(box);
    expect((screen.getByRole('button', { name: 'Nghiệm thu' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Cần chấp nhận một version cho mỗi đầu ra bắt buộc.')).toBeTruthy();
    await user.click(within(synthesis).getByRole('button', { name: 'Chấp nhận version này' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Nghiệm thu' }) as HTMLButtonElement).disabled).toBe(false));
    expect(decisions).toEqual(['accept Định nghĩa hallucination']);
    expect(textOf(required)).toContain('synthesis: v2 Accepted — đã có version Accepted');
    unmountAll();
  });

  it('trả lại và hủy (EC33)', async () => {
    outputs(mock, false);
    let body: unknown;
    mock.server.events.on('request:start', async ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/reviews')) body = await request.clone().json();
    });
    const first = await openReview();
    const returnButton = screen.getByRole('button', { name: 'Trả lại' }) as HTMLButtonElement;
    expect(returnButton.disabled).toBe(true);
    const reasons = within(screen.getByRole('combobox', { name: 'Lý do' })).getAllByRole('option').map((o) => o.textContent);
    expect(reasons).toEqual(['Chọn lý do', 'Thiếu đầu vào', 'Chất lượng chưa đạt', 'Phạm vi đã đổi', 'Cách làm chưa đúng', 'Lỗi provider', 'Dependency đã đổi', 'Lý do khác']);
    await first.user.selectOptions(screen.getByRole('combobox', { name: 'Lý do' }), 'quality_insufficient');
    expect(returnButton.disabled).toBe(true);
    await first.user.type(screen.getByRole('textbox', { name: 'Phản hồi (bắt buộc)' }), 'Thiếu định nghĩa từ nguồn tiếng Việt.');
    await first.user.click(returnButton);
    await waitFor(() => expect(t21().status).toBe('In Progress'));
    expect(body).toMatchObject({ outcome: 'returned', reasonCode: 'quality_insufficient', feedback: 'Thiếu định nghĩa từ nguồn tiếng Việt.' });
    mock.server.events.removeAllListeners();
    first.unmountAll();

    // Cancel T-2.7 (In Review, manual) after a confirmation with a reason.
    const t27 = planningState().tasks.find((t) => t.id === T['2.7'])!;
    const second = renderPlanning(reviewPath(t27.id));
    await screen.findByRole('heading', { level: 1, name: /Ghi chú đọc 5 bài nền tảng/ });
    await second.user.click(screen.getByRole('button', { name: 'Hủy Task' }));
    const dialog = screen.getByRole('dialog', { name: 'Hủy T-2.7?' });
    expect(textOf(dialog)).toContain('Task chuyển Cancelled và không chạy nữa.');
    await second.user.type(within(dialog).getByRole('textbox', { name: 'Lý do' }), 'Không cần nữa');
    await second.user.click(within(dialog).getByRole('button', { name: 'Hủy Task' }));
    await waitFor(() => expect(t27.status).toBe('Cancelled'));
    second.unmountAll();
  });

  it('không In Review chuyển về Plan (EC34)', async () => {
    mock.use({ overrides: { listWorkflows: () => emptyPage, listArtifacts: () => emptyPage } });
    const { router, unmountAll } = renderPlanning(reviewPath(T['2.2']));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${PROJECT_ID}/plan`));
    expect(router.state.location.search).toBe(`?task=${T['2.2']}`);
    expect(await screen.findByRole('complementary', { name: 'Chi tiết Task' })).toBeTruthy();
    unmountAll();
  });
});
