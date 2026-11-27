// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00114 O6: diagram versions (S06) — preview and source of the same version, check status from
// ArtifactVersion.validation, source editor saved as a new version, request to the Diagram Agent.

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Overrides } from '../../shell/mock';
import { artifactPath, ids, PROJECT_ID, problemResponse, renderResearch, storeOverrides, stubObjectUrls, useResearchMock } from './test/render';

const title = (text: string) => screen.findByRole('heading', { level: 2, name: text });
const figure = () => document.querySelector('figure.research-figure') as HTMLElement;
const source = () => within(document.querySelector('.research-editor') as HTMLElement).getByRole('textbox') as HTMLTextAreaElement;
const versionsList = () => screen.getByRole('region', { name: 'Phiên bản' });

describe('Sơ đồ (S06)', () => {
  const research = useResearchMock();
  let blobs: Blob[];
  beforeEach(() => {
    blobs = stubObjectUrls();
  });

  it('nguồn và preview cùng version', async () => {
    const store = research.store();
    const { user } = await renderResearch(artifactPath(ids.artifact.pipeline));
    await title('Pipeline RAG trên Trusted Library');
    const preview = await within(figure()).findByRole('img', { name: 'Preview sơ đồ v2' });
    expect(preview.getAttribute('src')).toMatch(/^blob:preview-/);
    const call = store.callsOf('getDiagramPreview').at(-1)!;
    expect(call.params.versionId).toBe(ids.version.pipelineV2);
    expect(call.query.format).toBe('svg');
    expect(blobs.at(-1)?.type).toBe('image/svg+xml');
    // The SVG is an image from a blob, never markup in the page (EC29).
    expect(figure().querySelector('svg')).toBeNull();
    expect(within(figure()).getByLabelText('Nguồn Mermaid của v2').textContent).toContain('C --> G[Generator] --> V[Verification]');
    expect(within(figure()).getByText('Draft · Mermaid · cú pháp hợp lệ')).toBeTruthy();

    await user.click(within(versionsList()).getByRole('link', { name: /^v1 · Rejected/ }));
    expect(await within(figure()).findByRole('img', { name: 'Preview sơ đồ v1' })).toBeTruthy();
    expect(store.callsOf('getDiagramPreview').at(-1)?.params.versionId).toBe(ids.version.pipelineV1);
    expect(within(figure()).getByLabelText('Nguồn Mermaid của v1').textContent).not.toContain('Verification');
  });

  it('lưu nguồn thành version mới', async () => {
    let conflict = false;
    const store = research.store({}, {
      createArtifactVersion: (request) => (conflict
        ? { status: 409, body: { type: 'https://sires.etroy.local/problems/base_revision_mismatch', title: 'base_revision_mismatch', status: 409, code: 'base_revision_mismatch', detail: 'Version gốc không thuộc artifact này.' } }
        : storeOverrides(store).createArtifactVersion!(request)),
    } satisfies Overrides);
    const v2 = store.versions.find((version) => version.id === ids.version.pipelineV2)!.content;
    const { user, router } = await renderResearch(artifactPath(ids.artifact.pipeline));
    await title('Pipeline RAG trên Trusted Library');
    await user.click(screen.getByRole('button', { name: 'Sửa nguồn' }));
    expect(screen.getByRole('textbox', { name: 'Nguồn Mermaid (dựa trên v2)' })).toBe(source());
    expect(source().value).toBe(v2);
    await user.type(source(), '\n  V --> Done');
    await user.click(screen.getByRole('button', { name: 'Lưu thành version mới' }));
    await waitFor(() => expect(router.state.location.search).toMatch(/^\?version=/));
    const call = store.callsOf('createArtifactVersion')[0]!;
    expect(call.body).toEqual({ basedOnVersionId: ids.version.pipelineV2, content: `${v2}\n  V --> Done` });
    expect(call.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(await within(versionsList()).findByRole('link', { name: /^v3 · Draft/ })).toBeTruthy();
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Provenance' })).getByText('Researcher')).toBeTruthy());
    expect(store.versions.find((version) => version.id === ids.version.pipelineV2)!.content).toBe(v2);
    expect(screen.queryByRole('textbox', { name: /^Nguồn Mermaid/ })).toBeNull();

    // A source with errors still saves, with the warning; that version cannot be accepted (EC35).
    await user.click(screen.getByRole('button', { name: 'Sửa nguồn' }));
    await user.type(source(), '\n  A -> B');
    await user.click(screen.getByRole('button', { name: 'Kiểm tra' }));
    expect(await screen.findByText('Nguồn còn lỗi vẫn lưu được; version này chưa chấp nhận được.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Lưu thành version mới' }));
    expect(await within(versionsList()).findByRole('link', { name: /^v4 · Draft/ })).toBeTruthy();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Chấp nhận v4' }) as HTMLButtonElement).disabled).toBe(true));
    expect(within(figure()).getByText('Lỗi cú pháp')).toBeTruthy();

    // 409: the versions reload, the editor keeps its content.
    conflict = true;
    await user.click(screen.getByRole('button', { name: 'Sửa nguồn' }));
    await user.type(source(), '\n  %% thử lại');
    const reads = store.callsOf('listArtifactVersions').length;
    const typed = source().value;
    await user.click(screen.getByRole('button', { name: 'Lưu thành version mới' }));
    const alert = await screen.findByText('Chưa lưu được version mới');
    const box = alert.closest('[role="alert"]') as HTMLElement;
    expect(within(box).getByText(/^base_revision_mismatch/)).toBeTruthy();
    expect(within(box).getByText('Đã tải lại danh sách version; nội dung editor vẫn giữ.')).toBeTruthy();
    await waitFor(() => expect(store.callsOf('listArtifactVersions').length).toBeGreaterThan(reads));
    expect(source().value).toBe(typed);
  });

  it('lỗi cú pháp', async () => {
    const store = research.store();
    const { user } = await renderResearch(artifactPath(ids.artifact.stateDiagram));
    await title('Sơ đồ trạng thái claim');
    const alert = within(figure()).getByRole('alert');
    expect(within(alert).getByText('Lỗi cú pháp')).toBeTruthy();
    expect(within(alert).getByText('dòng 3: Mũi tên “->” không hợp lệ; stateDiagram-v2 dùng “-->”.')).toBeTruthy();
    expect(within(figure()).getByText('Draft · Mermaid · lỗi cú pháp')).toBeTruthy();
    // No preview as if valid.
    expect(within(figure()).queryByRole('img')).toBeNull();
    expect(store.callsOf('getDiagramPreview')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Sửa nguồn' }));
    await user.click(screen.getByRole('button', { name: 'Kiểm tra' }));
    const result = await within(document.querySelector('.research-editor__result') as HTMLElement).findByRole('alert');
    expect(within(result).getByText('dòng 3: Mũi tên “->” không hợp lệ; Mermaid dùng “-->”.')).toBeTruthy();
    expect(store.callsOf('validateDiagramSource')[0]!.body).toEqual({ source: store.versions.find((version) => version.id === ids.version.stateV1)!.content });
  });

  it('preview lỗi', async () => {
    research.store({}, { getDiagramPreview: () => ({ status: 404 }) });
    await renderResearch(artifactPath(ids.artifact.pipeline));
    await title('Pipeline RAG trên Trusted Library');
    expect(await within(figure()).findByText('Chưa render được preview')).toBeTruthy();
    expect(within(figure()).getByLabelText('Nguồn Mermaid của v2').textContent).toContain('flowchart LR');
  });

  it('chưa kiểm tra được', async () => {
    let validatorDown = true;
    const store = research.store({}, {
      validateDiagramSource: (request) => {
        if (validatorDown) {
          validatorDown = false;
          return problemResponse(503, 'service_unavailable');
        }
        return storeOverrides(store).validateDiagramSource!(request);
      },
    } satisfies Overrides);
    delete store.versions.find((version) => version.id === ids.version.pipelineV2)!.validation;
    const { user } = await renderResearch(artifactPath(ids.artifact.pipeline));
    await title('Pipeline RAG trên Trusted Library');
    expect(within(figure()).getByText('Draft · Mermaid · chưa kiểm tra được cú pháp')).toBeTruthy();
    expect(within(figure()).getByText('Chưa kiểm tra được cú pháp của version này; version chưa chấp nhận được.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Chấp nhận v2' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Sơ đồ còn lỗi, không chấp nhận được')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Sửa nguồn' }));
    await user.click(screen.getByRole('button', { name: 'Kiểm tra' }));
    const result = document.querySelector('.research-editor__result') as HTMLElement;
    const alert = await within(result).findByRole('alert');
    expect(within(alert).getByText('Chưa kiểm tra được cú pháp')).toBeTruthy();
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await within(result).findByText('cú pháp hợp lệ')).toBeTruthy();
    expect(within(result).getByRole('img', { name: 'Preview của nguồn đang sửa' }).getAttribute('src')).toMatch(/^blob:preview-/);
  });

  it('yêu cầu Diagram Agent sửa', async () => {
    let typesDown = false;
    let conflict = false;
    const store = research.store({}, {
      listDiagramTypes: (request) => (typesDown ? problemResponse(503, 'service_unavailable') : storeOverrides(store).listDiagramTypes!(request)),
      requestDiagram: (request) => (conflict
        ? { status: 409, body: { type: 'https://sires.etroy.local/problems/active_workflow_exists', title: 'active_workflow_exists', status: 409, code: 'active_workflow_exists' } }
        : storeOverrides(store).requestDiagram!(request)),
    } satisfies Overrides);
    const { user, router } = await renderResearch(artifactPath(ids.artifact.pipeline));
    await title('Pipeline RAG trên Trusted Library');
    await user.click(screen.getByRole('button', { name: 'Yêu cầu Diagram Agent sửa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Yêu cầu Diagram Agent sửa' });
    await user.click(within(dialog).getByRole('button', { name: 'Gửi yêu cầu' }));
    expect(within(dialog).getByText('Nhập chỉ dẫn cho Diagram Agent. Chưa gửi.')).toBeTruthy();
    expect(store.callsOf('requestDiagram')).toHaveLength(0);
    const type = await within(dialog).findByRole('combobox', { name: 'Loại sơ đồ' }) as HTMLSelectElement;
    expect([...type.options].map((option) => option.textContent)).toEqual(['Giữ loại hiện tại', 'Sequence', 'Component', 'Activity', 'State', 'Workflow']);
    expect(type.value).toBe('');
    await user.type(within(dialog).getByRole('textbox', { name: 'Chỉ dẫn (bắt buộc)' }), 'Thêm bước Verification trước khi trả lời');
    await user.click(within(dialog).getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const call = store.callsOf('requestDiagram')[0]!;
    // The current type is kept: no diagramType sent.
    expect(call.body).toEqual({ description: 'Thêm bước Verification trước khi trả lời', revisesArtifactId: ids.artifact.pipeline, taskId: ids.task.t6 });
    expect(call.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText('Diagram Agent đang sửa sơ đồ')).toBeTruthy();

    // listDiagramTypes fails: no type field, the request still goes; 409 shows in the dialog.
    typesDown = true;
    conflict = true;
    await router.navigate(artifactPath(ids.artifact.stateDiagram));
    await title('Sơ đồ trạng thái claim');
    await user.click(screen.getByRole('button', { name: 'Yêu cầu Diagram Agent sửa' }));
    const second = await screen.findByRole('dialog', { name: 'Yêu cầu Diagram Agent sửa' });
    await user.type(within(second).getByRole('textbox', { name: 'Chỉ dẫn (bắt buộc)' }), 'Sửa mũi tên ở dòng 3');
    // listDiagramTypes answered 503 meanwhile: the type field stays hidden.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(within(second).queryByRole('combobox', { name: 'Loại sơ đồ' })).toBeNull();
    await user.click(within(second).getByRole('button', { name: 'Gửi yêu cầu' }));
    const alert = await within(second).findByRole('alert');
    expect(within(alert).getByText('Sơ đồ này đang có một yêu cầu sửa')).toBeTruthy();
    expect(within(alert).getByText(/^active_workflow_exists/)).toBeTruthy();
  });

  it('workflow sửa sơ đồ', async () => {
    const store = research.store();
    const { user } = await renderResearch(artifactPath(ids.artifact.pipeline));
    await title('Pipeline RAG trên Trusted Library');
    const ask = async (text: string) => {
      await user.click(screen.getByRole('button', { name: 'Yêu cầu Diagram Agent sửa' }));
      const dialog = await screen.findByRole('dialog', { name: 'Yêu cầu Diagram Agent sửa' });
      await user.type(within(dialog).getByRole('textbox', { name: 'Chỉ dẫn (bắt buộc)' }), text);
      await user.click(within(dialog).getByRole('button', { name: 'Gửi yêu cầu' }));
      await screen.findByText('Diagram Agent đang sửa sơ đồ');
    };
    await ask('Thêm bước Verification');
    const workflow = store.workflows.at(-1)!;
    expect(screen.getByRole('link', { name: 'Xem workflow' }).getAttribute('href')).toBe(`/projects/${PROJECT_ID}/activity/workflows/${workflow.id}`);
    expect(screen.getByText('Rời trang được; kết quả báo qua notification.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Yêu cầu Diagram Agent sửa' }) as HTMLButtonElement).disabled).toBe(true);
    store.finishWorkflows();
    await waitFor(() => expect(screen.queryByText('Diagram Agent đang sửa sơ đồ')).toBeNull());
    expect(await within(versionsList()).findByRole('link', { name: /^v3 · Draft/ })).toBeTruthy();
    // The latest version shows by default: the new Draft of the Diagram Agent.
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Provenance' })).getByText(/^Diagram Agent/)).toBeTruthy());

    store.options.diagramRevision = 'fails';
    await ask('Đổi sang sơ đồ activity');
    store.finishWorkflows();
    const failed = await screen.findByText('Diagram Agent chưa sửa được sơ đồ (workflow Failed); version hiện có giữ nguyên.');
    expect(within(failed.closest('[role="alert"]') as HTMLElement).getByText('provider_unavailable')).toBeTruthy();
  });

  it('nháp nguồn sơ đồ', async () => {
    research.store();
    const path = artifactPath(ids.artifact.pipeline);
    const first = await renderResearch(path);
    await title('Pipeline RAG trên Trusted Library');
    await first.user.click(screen.getByRole('button', { name: 'Sửa nguồn' }));
    await first.user.type(source(), '\n  %% nháp chưa lưu');
    // The session ends (the shell flushes drafts) and the same account comes back to the same route.
    first.services.drafts.flushAll();
    first.unmountAll();
    const second = await renderResearch(path);
    await title('Pipeline RAG trên Trusted Library');
    expect(source().value.endsWith('\n  %% nháp chưa lưu')).toBe(true);
    await second.user.click(screen.getByRole('button', { name: 'Lưu thành version mới' }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: /^Nguồn Mermaid/ })).toBeNull());
    // Sent: the draft is gone.
    second.unmountAll();
    await renderResearch(path);
    await title('Pipeline RAG trên Trusted Library');
    expect(screen.queryByRole('textbox', { name: /^Nguồn Mermaid/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sửa nguồn' })).toBeTruthy();
  });
});
