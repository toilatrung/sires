// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00058 S02: Overview (UX-OVERVIEW-001…003; EC01–EC06).

import type { PublicApi } from '@sires/contracts';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFixtures, projectIds } from '../../shell/mock';
import { useMockServer } from '../../shell/mock/node';
import { waitForFrame } from '../../shell/test/render';
import { resetProjectChatMockState } from './__mocks__';
import { problem, renderProject } from './test-helpers';
import { feature } from '.';

type Schemas = PublicApi.components['schemas'];

const mock = useMockServer({ features: [feature] });
beforeEach(() => resetProjectChatMockState());

const P = projectIds.rag;
const PV = '2b000000-0000-4058-8000-000000000003';
const phase = (n: number) => `2c000000-0000-4058-8000-00000000000${n}`;

/** Baseline v3 with three Phases and 4/4, 2/5, 0/3 Tasks Completed (UX-OVERVIEW-001-AC01). */
function baselineWithPhases() {
  const statuses: Array<[number, Schemas['TaskStatus'][]]> = [
    [1, ['Completed', 'Completed', 'Completed', 'Completed']],
    [2, ['Completed', 'Completed', 'In Progress', 'Ready', 'Ready']],
    [3, ['Draft', 'Draft', 'Draft']],
  ];
  let n = 0;
  const tasks = statuses.flatMap(([p, list]) =>
    list.map((status) => {
      n += 1;
      return { id: `3a000000-0000-4058-8000-0000000000${String(n).padStart(2, '0')}`, stableKey: `T-${p}.${n}`, status, needsReview: false, currentDefinition: { phaseId: phase(p), title: `Task ${n}` } } as Schemas['Task'];
    }),
  );
  mock.use({
    overrides: {
      getPlan: () => ({ status: 200, body: { id: 'plan-1', projectId: P, baselineVersionId: PV, versions: [{ id: PV, versionNumber: 3, status: 'Approved' }] } as Schemas['ResearchPlan'] }),
      getPlanVersion: () => ({
        status: 200,
        body: { id: PV, versionNumber: 3, status: 'Approved', phases: [1, 2, 3].map((p) => ({ id: phase(p), order: p, name: `Phase ${p}` })) } as unknown as Schemas['PlanVersion'],
      }),
      listTasks: () => ({ status: 200, body: { items: tasks, nextCursor: null } }),
    },
  });
}

async function openOverview() {
  const view = renderProject(`/projects/${P}/overview`);
  await waitForFrame();
  await screen.findByRole('heading', { level: 1 });
  return view;
}

describe('Overview (S02)', () => {
  it('tiến độ theo Phase (UX-OVERVIEW-001-AC01, EC04)', async () => {
    baselineWithPhases();
    await openOverview();
    expect(await screen.findByText('4/4 Completed')).toBeTruthy();
    expect(screen.getByText('2/5 Completed')).toBeTruthy();
    expect(screen.getByText('0/3 Completed')).toBeTruthy();
    expect(screen.getByRole('img', { name: '2 trên 5 Task Completed' })).toBeTruthy();
  });

  it('chưa có Plan (UX-OVERVIEW-002-AC01, EC01)', async () => {
    mock.use({ overrides: { getPlan: () => ({ status: 200, body: { id: 'plan-1', projectId: P, baselineVersionId: null, versions: [] } as Schemas['ResearchPlan'] }) } });
    await openOverview();
    expect(await screen.findByText('Project chưa có Plan baseline')).toBeTruthy();
    expect(screen.getByText(/Làm rõ ngữ cảnh với Orchestrator/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở Project AI Chat' }).getAttribute('href')).toBe(`/projects/${P}/chat`);
    expect(screen.queryByText(/\d+\/\d+$/)).toBeNull();
  });

  it('archived chỉ đọc (UX-OVERVIEW-003-AC01, EC02)', async () => {
    const archived = { ...structuredClone(demoFixtures.ResearchProject!.find((p) => p.id === P)!), status: 'Archived' as const };
    mock.use({ overrides: { getProject: () => ({ status: 200, body: archived }) } });
    const { user, calls } = await openOverview();
    const edit = screen.getByRole('button', { name: 'Sửa' }) as HTMLButtonElement;
    expect(edit.disabled).toBe(true);
    expect(edit.title).toBe('Project đã lưu trữ — chỉ đọc');
    expect(screen.getByText('Project đã lưu trữ — chỉ đọc')).toBeTruthy();
    expect(screen.getByText('Archived — chỉ đọc.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Mở lại project' }));
    await waitFor(() => expect(calls('POST', `/projects/${P}/unarchive`)).toHaveLength(1));
  });

  it('banner khôi phục (EC03)', async () => {
    const steps = [1, 2, 3, 4, 5].map((order) => ({ id: `7b000000-0000-4058-8000-00000000000${order}`, order, status: order < 3 ? 'Succeeded' : order === 3 ? 'Waiting for User' : 'Pending', openPromptId: order === 3 ? 'p-1' : undefined }));
    const task = demoFixtures.Task!.find((x) => x.projectId === P)!;
    mock.use({
      overrides: {
        listWorkflows: () => ({ status: 200, body: { items: [{ id: 'wf-int', status: 'Interrupted', taskId: task.id, currentStepId: steps[2]!.id, steps } as unknown as Schemas['Workflow']], nextCursor: null } }),
      },
    });
    await openOverview();
    expect(await screen.findByText(`Workflow ${task.stableKey} bị gián đoạn`)).toBeTruthy();
    expect(screen.getByText(/dừng ở bước 3\/5 · 1 prompt đang chờ/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở Recovery decision' }).getAttribute('href')).toBe(`/projects/${P}/activity/workflows/wf-int`);
  });

  it('khối bản thảo (EC05)', async () => {
    mock.use({ overrides: { getManuscript: () => problem(404, 'not_found') } });
    const first = await openOverview();
    expect(await screen.findByText('Chưa khởi tạo')).toBeTruthy();
    first.unmountAll();
    mock.use({ overrides: { getManuscript: () => problem(503, 'service_unavailable') } });
    await openOverview();
    // Other failures show “—” and never block Overview.
    expect(await screen.findByText('Bản thảo')).toBeTruthy();
    expect(screen.queryByText('Chưa khởi tạo')).toBeNull();
  });

  it('sửa research context (EC06)', async () => {
    const { user, calls } = await openOverview();
    await user.click(await screen.findByRole('button', { name: 'Sửa' }));
    const questionBox = screen.getByLabelText('Câu hỏi nghiên cứu');
    await user.clear(questionBox);
    await user.click(screen.getByRole('button', { name: 'Lưu version mới' }));
    expect(screen.getByText('Nhập câu hỏi nghiên cứu.')).toBeTruthy();
    expect(calls('POST', `/projects/${P}/context-versions`)).toHaveLength(0);
    await user.type(questionBox, 'RAG có giảm claim không căn cứ không?');
    await user.click(screen.getByRole('button', { name: 'Lưu version mới' }));
    await waitFor(() => expect(calls('POST', `/projects/${P}/context-versions`)).toHaveLength(1));
    const post = calls('POST', `/projects/${P}/context-versions`)[0]!;
    expect(post.headers['Idempotency-Key']).toBeTruthy();
    expect(JSON.parse(post.body ?? '{}')).toMatchObject({ researchQuestion: 'RAG có giảm claim không căn cứ không?', basedOnVersionId: expect.any(String) });
    expect(await screen.findByText('RAG có giảm claim không căn cứ không?')).toBeTruthy();
  });

  it('sửa research context bị 409 (EC06)', async () => {
    mock.use({ overrides: { createContextVersion: () => problem(409, 'base_revision_mismatch') } });
    const { user, calls } = await openOverview();
    await user.click(await screen.findByRole('button', { name: 'Sửa' }));
    await user.click(screen.getByRole('button', { name: 'Lưu version mới' }));
    expect(await screen.findByText(/research context vừa có version mới/)).toBeTruthy();
    await waitFor(() => expect(calls('GET', `/projects/${P}/shared-context`).length).toBeGreaterThan(1));
  });
});
