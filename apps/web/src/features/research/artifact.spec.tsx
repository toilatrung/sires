// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00114 O4: Research Artifacts — list, detail, versions, provenance (S05) and accept / reject (S08).

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { id } from '../../shell/mock';
import type { Overrides } from '../../shell/mock';
import { artifactPath, ids, PROJECT_ID, renderResearch, storeOverrides, stubObjectUrls, useResearchMock } from './test/render';

const chip = (scope: HTMLElement, text: string) => within(scope).queryAllByText(text).find((node) => node.classList.contains('sires-chip'));
const title = (text: string) => screen.findByRole('heading', { level: 2, name: text });
/** Text in the detail header (the list rows repeat “type · v{n}”). */
const head = (text: RegExp) => within(document.querySelector('.research-detail__head') as HTMLElement).getByText(text);
const provenance = () => screen.getByRole('region', { name: 'Provenance' });
/** Value of a Provenance row (the dd after its dt). */
const row = (label: string) => within(provenance()).getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;
const versions = () => screen.getByRole('region', { name: 'Phiên bản' });
const problem = (status: number, code: 'invalid_transition' | 'action_not_allowed_in_state' | 'validation_failed', detail: string) =>
  ({ type: `https://sires.etroy.local/problems/${code}`, title: code, status, code, detail });

describe('Research Artifacts (S05)', () => {
  const research = useResearchMock();
  beforeEach(() => {
    stubObjectUrls();
  });

  it('Draft có provenance và thao tác nghiệm thu', async () => {
    const store = research.store();
    const { user } = await renderResearch(artifactPath(ids.artifact.pipeline));
    await title('Pipeline RAG trên Trusted Library');
    expect(head(/^diagram · v2/)).toBeTruthy();
    await waitFor(() => expect(within(row('Task')).getByRole('link').textContent).toBe('T-3.5 Tạo sơ đồ pipeline'));
    expect(within(row('Task')).getByRole('link').getAttribute('href')).toBe(`/projects/${PROJECT_ID}/tasks/${ids.task.t6}`);
    expect(row('Tạo bởi').textContent).toBe('Diagram Agent · ar-0102');
    expect(within(row('Tạo bởi')).getByRole('link', { name: 'ar-0102' }).getAttribute('href')).toBe(`/projects/${PROJECT_ID}/activity/workflows/${id('workflow', 102)}`);
    expect(row('Model').textContent).toBe('anthropic · claude-sonnet-5-5');
    expect(row('Đầu vào').textContent).toBe('Research context v4 · Artifact version v1');
    expect(within(provenance()).getByText('Chỉ version Accepted được dùng trong bản thảo và làm đầu vào Task khác.')).toBeTruthy();

    const accept = screen.getByRole('button', { name: 'Chấp nhận v2' });
    expect(accept.getAttribute('data-variant')).toBe('primary');
    expect(document.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeTruthy();
    expect(screen.getByText('v2 thành version Accepted, là đầu vào chính thức cho Task khác và bản thảo.')).toBeTruthy();
    await user.click(accept);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Chấp nhận v2' })).toBeNull());
    const calls = store.callsOf('acceptArtifactVersion');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.params.versionId).toBe(ids.version.pipelineV2);
    expect(calls[0]!.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(within(versions()).getByRole('link', { name: /^v2 · Accepted/ })).toBeTruthy();
    expect(screen.getByText(/^Accepted · Mermaid/)).toBeTruthy();
  });

  it('trống', async () => {
    research.store({ scenario: 'empty' });
    await renderResearch(artifactPath());
    expect(await screen.findByText('Chưa có artifact')).toBeTruthy();
    expect(screen.getByText('Artifact do agent tạo khi chạy Task.')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Research Artifacts' })).getByRole('link', { name: 'Plan and Tasks' }).getAttribute('href')).toBe(`/projects/${PROJECT_ID}/plan`);
  });

  it('version đang dùng', async () => {
    research.store();
    const { user } = await renderResearch(artifactPath());
    const list = await screen.findByRole('list', { name: 'Danh sách artifact' });
    const synthesis = within(list).getByRole('link', { name: /Định nghĩa hallucination/ });
    expect(within(synthesis).getByText('synthesis · v2')).toBeTruthy();
    expect(chip(synthesis, 'Draft')).toBeTruthy();
    expect(await within(synthesis).findByText('Đang dùng: v1 Accepted')).toBeTruthy();
    // The table's Accepted version is its latest: no “Đang dùng” line.
    expect(within(within(list).getByRole('link', { name: /Danh sách phương pháp đo/ })).queryByText(/Đang dùng/)).toBeNull();
    await user.click(synthesis);
    await title('Định nghĩa hallucination');
    expect(head(/^synthesis · v2/)).toBeTruthy();
    expect(screen.getByText('v1 đang Accepted chuyển Superseded.', { exact: false })).toBeTruthy();
  });

  it('provenance thiếu trường', async () => {
    const store = research.store();
    const { router } = await renderResearch(artifactPath(ids.artifact.note));
    await title('Ghi chú đọc 5 bài nền tảng');
    expect(row('Tạo bởi').textContent).toBe('Researcher');
    expect(row('Đầu vào').textContent).toBe('Không có đầu vào');
    expect(row('Model').textContent).toBe('—');
    expect(row('Nguồn').textContent).toBe('—');
    expect(row('Phê duyệt').textContent).toBe('Chưa có');

    await router.navigate(artifactPath(ids.artifact.report, `?version=${ids.version.reportV1}`));
    await title('Báo cáo kiểm chứng claim');
    await waitFor(() => expect(row('Tạo bởi').textContent).toBe('System · research'));

    // Diagram Agent without a workflow: the Agent Run code has no link; no Task → “—”.
    await router.navigate(artifactPath(ids.artifact.stateDiagram));
    await title('Sơ đồ trạng thái claim');
    expect(row('Tạo bởi').textContent).toBe('Diagram Agent · ar-0109');
    expect(within(row('Tạo bởi')).queryByRole('link')).toBeNull();
    expect(row('Task').textContent).toBe('—');

    // A Task that cannot be found reads “—”.
    store.versions.find((version) => version.id === ids.version.noteV1)!.provenance.taskId = id('task', 5);
    await router.navigate(artifactPath(ids.artifact.note));
    await title('Ghi chú đọc 5 bài nền tảng');
    await waitFor(() => expect(row('Task').textContent).toBe('—'));
  });

  it('nội dung HTML hiện dạng chữ', async () => {
    const store = research.store();
    store.versions.find((version) => version.id === ids.version.noteV1)!.content = '<script>window.siresHacked = true</script><b>đậm</b> <img src="x" onerror="window.siresHacked = true">';
    await renderResearch(artifactPath(ids.artifact.note));
    await title('Ghi chú đọc 5 bài nền tảng');
    const text = document.querySelector('.research-text')!;
    expect(text.textContent).toContain('<script>window.siresHacked = true</script><b>đậm</b>');
    expect(text.querySelector('script, b, img')).toBeNull();
    expect((window as { siresHacked?: boolean }).siresHacked).toBeUndefined();
  });

  it('nội dung theo format', async () => {
    const store = research.store();
    const { router } = await renderResearch(artifactPath(ids.artifact.table));
    await title('Danh sách phương pháp đo');
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Phương pháp', 'Loại', 'Cần văn bản nguồn']);
    expect(within(table).getByRole('cell', { name: 'Semantic entropy, có gom cụm' })).toBeTruthy();

    // A file: “Tải file”.
    Object.assign(store.versions.find((version) => version.id === ids.version.reportV2)!, { format: 'pdf', fileUrl: 'https://files.sires.example/report-v2.pdf' });
    await router.navigate(artifactPath(ids.artifact.report));
    await title('Báo cáo kiểm chứng claim');
    expect((await screen.findByRole('link', { name: 'Tải file' })).getAttribute('href')).toBe('https://files.sires.example/report-v2.pdf');

    // CSV that cannot be read: plain text.
    store.versions.find((version) => version.id === ids.version.tableV3)!.content = 'Phương pháp,Loại\n"FActScore,Factual precision\n';
    await router.navigate(artifactPath(ids.artifact.table, `?version=${ids.version.tableV3}`));
    await title('Danh sách phương pháp đo');
    await waitFor(() => expect(screen.queryByRole('table')).toBeNull());
    expect(document.querySelector('.research-text')?.textContent).toContain('"FActScore,Factual precision');
  });

  it('so sánh version', async () => {
    research.store();
    const { user, router } = await renderResearch(artifactPath(ids.artifact.pipeline));
    await title('Pipeline RAG trên Trusted Library');
    await user.selectOptions(screen.getByRole('combobox', { name: 'So sánh với' }), 'v1 · Rejected');
    expect(router.state.location.search).toBe(`?compare=${ids.version.pipelineV1}`);
    const current = await screen.findByRole('region', { name: 'v2 · Draft' });
    const other = screen.getByRole('region', { name: 'v1 · Rejected' });
    expect(within(current).getByLabelText('Nguồn Mermaid của v2').textContent).toContain('V[Verification]');
    expect(within(other).getByLabelText('Nguồn Mermaid của v1').textContent).not.toContain('Verification');
    // Only one version: no “So sánh với”.
    await router.navigate(artifactPath(ids.artifact.note));
    await title('Ghi chú đọc 5 bài nền tảng');
    expect(screen.queryByRole('combobox', { name: 'So sánh với' })).toBeNull();
  });

  it('không tìm thấy', async () => {
    research.store();
    await renderResearch(artifactPath('5c000000-0000-4000-8000-000000009999'));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Không tìm thấy')).toBeTruthy();
    expect(within(alert).getByText('Không có artifact này hoặc bạn không có quyền xem.')).toBeTruthy();
    expect(await screen.findByRole('list', { name: 'Danh sách artifact' })).toBeTruthy();
  });
});

describe('Nghiệm thu version (S08)', () => {
  const research = useResearchMock();
  beforeEach(() => {
    stubObjectUrls();
  });

  it('synthesis còn claim chưa quyết định', async () => {
    const store = research.store({}, {
      acceptArtifactVersion: () => ({ status: 409, body: problem(409, 'action_not_allowed_in_state', 'Còn 1 claim chưa quyết định.') }),
    });
    // v2 of “Định nghĩa hallucination” with three claims, one still Draft (SYN-HUMAN-REVIEW-001-AC03).
    store.versions.find((version) => version.id === ids.version.synthesisV2)!.claimIds = [ids.claim.definition, ids.claim.intrinsic, ids.claim.unsupported];
    delete store.claims.find((claim) => claim.id === ids.claim.rareEntities)!.artifactVersionId;
    const { user } = await renderResearch(artifactPath(ids.artifact.synthesis));
    await title('Định nghĩa hallucination');
    const accept = screen.getByRole('button', { name: 'Chấp nhận v2' }) as HTMLButtonElement;
    const reason = await screen.findByText('Còn 1 claim chưa quyết định:');
    expect(accept.disabled).toBe(true);
    const blocker = reason.closest('.research-reason') as HTMLElement;
    expect(accept.getAttribute('aria-describedby')).toBe(blocker.id);
    expect(within(blocker).getByRole('link', { name: 'RAG giảm một nửa hallucination ở mọi miền.' }).getAttribute('href'))
      .toBe(`/projects/${PROJECT_ID}/claims/${ids.claim.unsupported}`);
    expect(within(blocker).getAllByRole('link')).toHaveLength(1);

    // Decided in the UI, refused by the server: the reason shows in the error box.
    store.claims.find((claim) => claim.id === ids.claim.unsupported)!.approvalStatus = 'Accepted';
    research.mock.events.emit({ type: 'research.object_status_changed', projectId: PROJECT_ID, objectType: 'claim', objectId: ids.claim.unsupported, toState: 'Accepted' });
    await waitFor(() => expect(accept.disabled).toBe(false));
    await user.click(accept);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Chưa chấp nhận được v2')).toBeTruthy();
    expect(within(alert).getByText('Còn 1 claim chưa quyết định.')).toBeTruthy();
    expect(within(alert).getByText(/^action_not_allowed_in_state/)).toBeTruthy();
  });

  it('diagram lỗi không chấp nhận được', async () => {
    research.store({}, {
      acceptArtifactVersion: () => ({ status: 409, body: problem(409, 'action_not_allowed_in_state', 'Sơ đồ chưa qua kiểm tra cú pháp và render.') }),
    });
    const { user, router } = await renderResearch(artifactPath(ids.artifact.stateDiagram));
    await title('Sơ đồ trạng thái claim');
    const accept = screen.getByRole('button', { name: 'Chấp nhận v1' }) as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    expect(screen.getByText('Sơ đồ còn lỗi, không chấp nhận được')).toBeTruthy();
    // The server refuses with 409: the error box gives the reason.
    await router.navigate(artifactPath(ids.artifact.pipeline));
    await title('Pipeline RAG trên Trusted Library');
    await user.click(screen.getByRole('button', { name: 'Chấp nhận v2' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Sơ đồ chưa qua kiểm tra cú pháp và render.')).toBeTruthy();
    expect(within(alert).getByText(/^action_not_allowed_in_state/)).toBeTruthy();
  });

  it('chấp nhận bị từ chối', async () => {
    let refuseReject = false;
    const store = research.store({}, {
      rejectArtifactVersion: (request) => (refuseReject
        ? { status: 400, body: problem(400, 'validation_failed', 'Ghi chú quá dài.') }
        : storeOverrides(store).rejectArtifactVersion!(request)),
    } satisfies Overrides);
    const { user, router } = await renderResearch(artifactPath(ids.artifact.pipeline));
    await title('Pipeline RAG trên Trusted Library');
    const reads = store.callsOf('listArtifactVersions').length;
    store.versions.find((version) => version.id === ids.version.pipelineV2)!.status = 'Rejected'; // decided elsewhere
    await user.click(screen.getByRole('button', { name: 'Chấp nhận v2' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Chưa chấp nhận được v2')).toBeTruthy();
    expect(within(alert).getByText('Chỉ version Draft mới chấp nhận được.')).toBeTruthy();
    expect(within(alert).getByText(/^invalid_transition/)).toBeTruthy();
    expect(within(alert).getByText('Đã tải lại artifact và danh sách version.')).toBeTruthy();
    await waitFor(() => expect(store.callsOf('listArtifactVersions').length).toBeGreaterThan(reads));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Chấp nhận v2' })).toBeNull());
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(store.callsOf('acceptArtifactVersion')).toHaveLength(1);

    refuseReject = true;
    await router.navigate(artifactPath(ids.artifact.note));
    await title('Ghi chú đọc 5 bài nền tảng');
    await user.click(screen.getByRole('button', { name: 'Từ chối' }));
    const dialog = await screen.findByRole('dialog', { name: 'Từ chối v1?' });
    await user.click(within(dialog).getByRole('button', { name: 'Từ chối v1' }));
    const refused = await screen.findByRole('alert');
    expect(within(refused).getByText('Chưa từ chối được v1')).toBeTruthy();
    expect(within(refused).getByText(/^validation_failed/)).toBeTruthy();
  });

  it('version đã quyết định', async () => {
    research.store();
    const { router } = await renderResearch(artifactPath(ids.artifact.pipeline, `?version=${ids.version.pipelineV1}`));
    await title('Pipeline RAG trên Trusted Library');
    await screen.findByText('Rejected: “thiếu bước Verification”');
    expect(screen.queryByRole('button', { name: 'Chấp nhận v1' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Từ chối' })).toBeNull();
    expect(within(versions()).getByRole('link', { name: 'v1 · Rejected · “thiếu bước Verification”' })).toBeTruthy();
    for (const version of [ids.version.tableV3, ids.version.tableV1]) {
      await router.navigate(artifactPath(ids.artifact.table, `?version=${version}`));
      await title('Danh sách phương pháp đo');
      await waitFor(() => expect(head(version === ids.version.tableV3 ? /^table · v3/ : /^table · v1/)).toBeTruthy());
      expect(screen.queryByRole('button', { name: /^Chấp nhận v/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Từ chối' })).toBeNull();
    }
  });

  it('không gửi trùng', async () => {
    const store = research.store({}, {
      acceptArtifactVersion: async (request) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return storeOverrides(store).acceptArtifactVersion!(request);
      },
    } satisfies Overrides);
    const { user, router } = await renderResearch(artifactPath(ids.artifact.pipeline));
    await title('Pipeline RAG trên Trusted Library');
    const accept = screen.getByRole('button', { name: 'Chấp nhận v2' });
    await user.dblClick(accept);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Chấp nhận v2' })).toBeNull());
    expect(store.callsOf('acceptArtifactVersion')).toHaveLength(1);

    // Reject dialog by keyboard: focus in the note, Esc cancels and returns focus, Tab reaches the buttons.
    await router.navigate(artifactPath(ids.artifact.note));
    await title('Ghi chú đọc 5 bài nền tảng');
    const reject = screen.getByRole('button', { name: 'Từ chối' });
    await user.click(reject);
    let dialog = await screen.findByRole('dialog', { name: 'Từ chối v1?' });
    expect(within(dialog).getByText('v1 chuyển Rejected, không dùng làm đầu vào.')).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('textbox', { name: 'Ghi chú (tùy chọn)' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(reject);
    await user.click(reject);
    dialog = await screen.findByRole('dialog', { name: 'Từ chối v1?' });
    await user.keyboard('Chưa đủ bài nền tảng');
    await user.tab();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Giữ Draft' }));
    await user.tab();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Từ chối v1' }));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const calls = store.callsOf('rejectArtifactVersion');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({ note: 'Chưa đủ bài nền tảng' });
    expect(calls[0]!.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText('Rejected: “Chưa đủ bài nền tảng”')).toBeTruthy();
  });
});
