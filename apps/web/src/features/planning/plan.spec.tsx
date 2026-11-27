// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00082 S01–S03: Plan screen (version, content, board, filters), dependency graph, cycle and Draft actions,
// on the planning mock (stateful store, events through the mock /events stream).

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import { id } from '../../shell/mock';
import { PROJECT_ID, planningState, renderPlanning, T, textOf, usePlanningMock, V2, V4, V5, waitForStream } from './testing';

const planPath = (query = '') => `/projects/${PROJECT_ID}/plan${query}`;
const card = (key: string) => screen.getByRole('link', { name: new RegExp(`^${key.replace('.', '\\.')} `) });
const cardKeys = () =>
  screen
    .queryAllByRole('link')
    .filter((a) => a.classList.contains('planning-card'))
    .map((a) => a.querySelector('.sires-id')?.textContent);

async function openPlan(query = '') {
  const view = renderPlanning(planPath(query));
  await screen.findByRole('heading', { level: 1, name: 'Plan and Tasks' });
  await waitFor(() => expect(cardKeys().length + screen.queryAllByRole('link').filter((a) => a.classList.contains('planning-node')).length).toBeGreaterThan(0));
  return view;
}

describe('Plan (PID-00082 S02)', () => {
  const mock = usePlanningMock();

  it('lọc label (UX-TASK-001-AC01, EC05)', async () => {
    const { user, unmountAll } = await openPlan();
    expect(cardKeys()).toContain('T-2.2');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Execution label' }), 'Manual editor requirement');
    await waitFor(() => expect(cardKeys().sort()).toEqual(['T-2.4', 'T-2.7']));
    // Still grouped by status, with the count of each group.
    const ready = screen.getByRole('region', { name: /^Ready/ });
    const review = screen.getByRole('region', { name: /^In Review/ });
    expect(textOf(ready.querySelector('h2'))).toBe('Ready 1');
    expect(within(ready).getByRole('link', { name: /^T-2\.4 / })).toBeTruthy();
    expect(textOf(review.querySelector('h2'))).toBe('In Review 1');
    expect(within(review).getByRole('link', { name: /^T-2\.7 / })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /^Blocked/ })).toBeNull();
    // The baseline board asks the server with the filter (listTasks executionLabel).
    await user.selectOptions(screen.getByRole('combobox', { name: 'Execution label' }), 'Available for agent');
    await waitFor(() => expect(cardKeys()).not.toContain('T-2.4'));
    expect(cardKeys()).toContain('T-2.5');
    unmountAll();
  });

  it('label có biểu tượng và chữ (UX-LABEL-001-AC01, EC08)', async () => {
    const { container, unmountAll } = await openPlan();
    // Seen in grayscale: the two labels still differ by icon and words, never by colour alone.
    container.style.filter = 'grayscale(1)';
    const icons = ['T-2.4', 'T-2.5'].map((key) => card(key).querySelector('.sires-exec-label svg')?.innerHTML);
    expect(icons[0]).not.toBe(icons[1]);
    for (const key of ['T-2.4', 'T-2.5']) {
      const label = card(key).querySelector('.sires-exec-label');
      expect(label?.querySelector('svg')).toBeTruthy();
      expect(textOf(label)).toBe(key === 'T-2.4' ? 'Manual editor requirement' : 'Available for agent');
    }
    unmountAll();
  });

  it('nhãn thảo luận (PLAN-GENERATE-001-AC02, EC04)', async () => {
    const { user, unmountAll } = await openPlan();
    expect(textOf(document.querySelector('.planning-delib'))).toBe('Qua thảo luận · Deliberation Record');
    expect(screen.getByRole('link', { name: 'Deliberation Record' }).getAttribute('href')).toContain('/artifacts?version=');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Plan Version' }), V4);
    expect(await screen.findByText('Không qua thảo luận')).toBeTruthy();
    // No provenance (a Draft the Researcher made): no label at all.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Plan Version' }), V5);
    await screen.findByText(/có chu trình phụ thuộc/);
    expect(document.querySelector('.planning-delib')).toBeNull();
    unmountAll();
  });

  it('Plan chưa có version nào (EC01)', async () => {
    mock.use({ overrides: { getPlan: () => ({ status: 200, body: { id: 'p', projectId: PROJECT_ID, baselineVersionId: null, openVersionId: null, versions: [] } }) } });
    const { unmountAll } = renderPlanning(planPath());
    expect(await screen.findByText('Project chưa có Plan')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yêu cầu Orchestrator đề xuất Plan' })).toBeTruthy();
    unmountAll();
  });

  it('chưa có baseline (EC02)', async () => {
    mock.use({
      overrides: {
        getPlan: () => ({ status: 200, body: { id: 'p', projectId: PROJECT_ID, baselineVersionId: null, openVersionId: V4, versions: [{ id: V4, versionNumber: 4, status: 'Proposed' }] } }),
      },
    });
    const { unmountAll } = await openPlan();
    expect(screen.getByText('Chưa duyệt — chưa có baseline')).toBeTruthy();
    expect((screen.getByRole('combobox', { name: 'Plan Version' }) as HTMLSelectElement).value).toBe(V4);
    expect(screen.getByText(/v4 đang chờ bạn duyệt/)).toBeTruthy();
    unmountAll();
  });

  it('version chỉ đọc (EC03)', async () => {
    planningState().versions.find((v) => v.id === V2)!.rejectionReason = undefined;
    const { user, unmountAll } = await openPlan();
    const select = screen.getByRole('combobox', { name: 'Plan Version' });
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'v5 · Draft (đang soạn)',
      'v4 · Proposed',
      'v3 · Approved (baseline)',
      'v2 · Superseded',
    ]);
    await user.selectOptions(select, V2);
    expect(await screen.findByText('v2 đang Superseded — chỉ đọc.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Trình duyệt' })).toBeNull();
    // Rejected shows the reason.
    const v4 = planningState().versions.find((v) => v.id === V4)!;
    v4.status = 'Rejected';
    v4.rejectionReason = 'Chưa đủ cỡ mẫu.';
    await user.selectOptions(select, V4);
    expect(await screen.findByText(/Lý do từ chối: Chưa đủ cỡ mẫu\./)).toBeTruthy();
    unmountAll();
  });

  it('lọc Phase và agent (EC06)', async () => {
    const { user, unmountAll } = await openPlan();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Phase' }), 'Phase 1 · Xác định câu hỏi');
    await waitFor(() => expect(cardKeys().sort()).toEqual(['T-1.1', 'T-1.2']));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Phase' }), '');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Agent' }), 'Synthesis Agent');
    await waitFor(() => expect(cardKeys().sort()).toEqual(['T-1.2', 'T-2.1', 'T-2.3', 'T-2.5']));
    unmountAll();
  });

  it('không kéo thả đổi trạng thái (EC07)', async () => {
    const writes: string[] = [];
    mock.server.events.on('request:start', ({ request }) => {
      if (request.method !== 'GET') writes.push(`${request.method} ${new URL(request.url).pathname}`);
    });
    const { unmountAll } = await openPlan();
    const source = card('T-2.4');
    const target = screen.getByRole('region', { name: /^Completed/ });
    expect(source.getAttribute('draggable')).toBe('false');
    fireEvent.dragStart(source);
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(writes.filter((w) => w.includes('/tasks'))).toEqual([]);
    expect(within(screen.getByRole('region', { name: /^Ready/ })).getByRole('link', { name: /^T-2\.4 / })).toBeTruthy();
    mock.server.events.removeAllListeners();
    unmountAll();
  });

  it('các view khớp sau sự kiện (EC36)', async () => {
    const { user, services, unmountAll } = await openPlan(`?task=${T['2.4']}`);
    const panel = await screen.findByRole('complementary', { name: 'Chi tiết Task' });
    expect(await within(panel).findByText('Ready')).toBeTruthy();
    await waitForStream(services, mock);
    const task = planningState().tasks.find((t) => t.id === T['2.4'])!;
    task.status = 'In Progress';
    mock.events.emit({ type: 'task.status_changed', projectId: PROJECT_ID, objectType: 'task', objectId: task.id, fromState: 'Ready', toState: 'In Progress' });
    await waitFor(() => expect(within(screen.getByRole('region', { name: /^In Progress/ })).getByRole('link', { name: /^T-2\.4 / })).toBeTruthy());
    // The open panel follows the same event.
    await waitFor(() => expect(within(panel).getByText('In Progress')).toBeTruthy());
    // Tabs: arrow keys move to the other view.
    const boardTab = screen.getByRole('tab', { name: 'Board' });
    boardTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Dependency graph' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Dependency graph' }));
    const node = await screen.findByRole('link', { name: /^T-2\.4 .*, In Progress, Phase 2$/ });
    expect(node).toBeTruthy();
    unmountAll();
  });
});

describe('Chưa có Plan (PID-00082 S02, EC01)', () => {
  const mock = usePlanningMock({ withoutPlan: true });

  it('chưa có Plan (EC01)', async () => {
    let sent = 0;
    mock.server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/plan/proposals')) sent += 1;
    });
    const { user, unmountAll } = renderPlanning(planPath());
    expect(await screen.findByText('Project chưa có Plan')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở Project AI Chat' }).getAttribute('href')).toBe(`/projects/${PROJECT_ID}/chat`);
    await user.click(screen.getByRole('button', { name: 'Yêu cầu Orchestrator đề xuất Plan' }));
    await waitFor(() => expect(sent).toBe(1));
    // The mock now has a Plan: the screen reads it again.
    expect(await screen.findByRole('combobox', { name: 'Plan Version' })).toBeTruthy();
    mock.server.events.removeAllListeners();
    unmountAll();
  });

  it('đang đề xuất: thẻ thao tác dài theo Workflow của 202 (EC01, design.md §2.4.1)', async () => {
    const workflowId = id('workflow', 90);
    mock.use({
      overrides: {
        // The Orchestrator is still working: 202 with its Workflow, no Plan yet.
        requestPlanProposal: ({ params }) => ({
          status: 202,
          body: {
            id: workflowId,
            accountId: planningState().tasks[0]!.accountId,
            projectId: params.projectId,
            createdAt: new Date(Date.now() - 65_000).toISOString(),
            createdBy: { type: 'researcher' },
            rowVersion: 1,
            idempotencyKey: 'k',
            type: 'plan_proposal',
            triggeredBy: { type: 'researcher' },
            status: 'Running',
            startedAt: new Date(Date.now() - 65_000).toISOString(),
            steps: [],
          },
        }),
      },
    });
    const { user, unmountAll } = renderPlanning(planPath());
    await user.click(await screen.findByRole('button', { name: 'Yêu cầu Orchestrator đề xuất Plan' }));
    const status = await screen.findByRole('status');
    expect(textOf(status)).toContain('Orchestrator đang đề xuất Plan từ Research Context');
    expect(textOf(status)).toMatch(/Orchestrator · đã chạy \d/);
    expect(screen.getByText('Rời trang được; kết quả báo qua notification.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem workflow' }).getAttribute('href')).toBe(`/projects/${PROJECT_ID}/activity/workflows/${workflowId}`);
    expect(screen.queryByRole('button', { name: 'Yêu cầu Orchestrator đề xuất Plan' })).toBeNull();
    unmountAll();
  });
});

describe('Đọc hết các trang (PID-00082, EC05)', () => {
  const mock = usePlanningMock();

  it('listTasks nhiều trang: đủ thẻ và số mỗi nhóm', async () => {
    const all = planningState().tasks;
    const half = Math.ceil(all.length / 2);
    const cursors: (string | null)[] = [];
    mock.use({
      overrides: {
        listTasks: ({ query }) => {
          cursors.push((query.cursor as string | undefined) ?? null);
          return query.cursor
            ? { status: 200, body: { items: all.slice(half), nextCursor: null } }
            : { status: 200, body: { items: all.slice(0, half), nextCursor: 'page-2' } };
        },
      },
    });
    const { unmountAll } = await openPlan();
    await waitFor(() => expect(cursors).toEqual([null, 'page-2']));
    // A Task of the second page is on the board.
    const last = all[all.length - 1]!;
    const key = last.currentDefinition?.stableKey ?? '';
    await waitFor(() => expect(cardKeys()).toContain(key));
    unmountAll();
  });
});

describe('Đồ thị phụ thuộc và Draft (PID-00082 S03)', () => {
  const mock = usePlanningMock();

  it('Draft kèm panel Task: chỉ Trình duyệt tô màu (design.md §1.5)', async () => {
    const { unmountAll } = await openPlan(`?version=${V5}&view=graph&task=${T['2.5']}`);
    await screen.findByRole('button', { name: 'Trình duyệt' });
    await screen.findByRole('button', { name: 'Thực thi' });
    expect([...document.querySelectorAll('[data-variant="primary"]')].map((b) => textOf(b))).toEqual(['Trình duyệt']);
    expect(screen.getByRole('button', { name: 'Thực thi' }).getAttribute('data-variant')).toBe('outline');
    unmountAll();
  });

  it('chu trình chặn trình duyệt (PID-00082-AC02, EC10)', async () => {
    const submits: string[] = [];
    mock.server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/submit')) submits.push(request.url);
    });
    const { user, unmountAll } = await openPlan(`?version=${V5}&view=graph`);
    const alert = await screen.findByText('Plan Draft v5 có chu trình phụ thuộc: T-2.3 → T-2.5 → T-3.1 → T-2.3');
    const banner = alert.closest('[role="alert"]')!;
    expect(textOf(banner)).toContain('Dependency T-3.1 → T-2.3 vừa thêm khiến 3 Task chờ lẫn nhau');
    expect(textOf(banner)).toContain('dependency_cycle');
    const submit = screen.getByRole('button', { name: 'Trình duyệt' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByText('Chưa trình duyệt được: Draft còn chu trình phụ thuộc.')).toBeTruthy();
    const cycleEdges = document.querySelectorAll('path[data-edge="cycle"]:not(marker path)');
    expect(cycleEdges.length).toBe(3);
    expect(screen.getByRole('region', { name: 'Sơ đồ phụ thuộc, cuộn ngang khi hẹp' }).getAttribute('tabindex')).toBe('0');
    await user.click(submit);
    expect(submits).toEqual([]);
    mock.server.events.removeAllListeners();
    unmountAll();
  });

  it('đồ thị Task bị chặn (UX-TASK-002-AC01, EC09)', async () => {
    const { user, unmountAll } = await openPlan('?view=graph');
    expect(screen.getByRole('heading', { name: /Dependency graph · Plan Version v3 \(Approved\)/ })).toBeTruthy();
    const blocked = screen.getByRole('heading', { name: 'Task bị chặn' }).parentElement!;
    const row = within(blocked).getByRole('link', { name: 'T-2.5' }).closest('li')!;
    expect(textOf(row)).toBe('T-2.5 Ma trận so sánh phương pháp — chờ T-2.3');
    // T-2.3 → T-2.5 is blocking (T-2.3 not Completed); T-1.1 → T-1.2 is satisfied.
    expect(document.querySelector(`path[data-from="${T['2.3']}"][data-to="${T['2.5']}"]`)?.getAttribute('data-edge')).toBe('blocking');
    expect(document.querySelector(`path[data-from="${T['1.1']}"][data-to="${T['1.2']}"]`)?.getAttribute('data-edge')).toBe('satisfied');
    // T-2.6 is blocked by another check (RC-08) and has no dependency.
    expect(textOf(within(blocked).getByRole('link', { name: 'T-2.6' }).closest('li'))).toContain('chặn vì kiểm tra readiness khác');
    await user.click(within(row).getByRole('link', { name: 'T-2.3' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'So sánh phương pháp đo' })).toBeTruthy();
    unmountAll();
  });

  it('bỏ dependency (EC11)', async () => {
    const { user, unmountAll } = await openPlan(`?version=${V5}&view=graph`);
    // A Draft changed elsewhere: 412, the screen reads it again and says so.
    mock.use({ overrides: { updatePlanVersionDraft: () => ({ status: 412, body: { type: 'x', title: 'x', status: 412, code: 'precondition_failed' } }) } });
    await user.click(await screen.findByRole('button', { name: 'Bỏ dependency T-3.1 → T-2.3' }));
    expect(await screen.findByText(/Draft đã đổi ở nơi khác; đã đọc lại bản mới nhất/)).toBeTruthy();
    mock.server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Bỏ dependency T-3.1 → T-2.3' }));
    await waitFor(() => expect(screen.queryByText(/có chu trình phụ thuộc/)).toBeNull());
    const v5 = planningState().versions.find((v) => v.id === V5)!;
    expect(v5.tasks?.find((d) => d.taskId === T['2.3'])?.dependsOn).toEqual([T['2.2']]);
    expect((screen.getByRole('button', { name: 'Trình duyệt' }) as HTMLButtonElement).disabled).toBe(false);
    unmountAll();
  });

  it('trình duyệt Draft (EC12)', async () => {
    const v5 = planningState().versions.find((v) => v.id === V5)!;
    v5.tasks = v5.tasks!.map((d) => (d.taskId === T['2.3'] ? { ...d, dependsOn: [T['2.2']] } : d));
    const { user, unmountAll } = await openPlan(`?version=${V5}`);
    // 422: the screen names the Task and the field.
    mock.use({
      overrides: {
        submitPlanVersion: () => ({
          status: 422,
          body: { type: 'x', title: 'x', status: 422, code: 'validation_failed', detail: 'Task T-3.1 thiếu đầu ra.', errors: [{ field: 'tasks/T-3.1/expectedOutputs', code: 'required', message: 'Cần ít nhất một đầu ra' }] },
        }),
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Trình duyệt' }));
    const error = await screen.findByText('Chưa trình duyệt được Draft');
    expect(textOf(error.closest('[role="alert"]'))).toContain('tasks/T-3.1/expectedOutputs Cần ít nhất một đầu ra');
    mock.server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Trình duyệt' }));
    await waitFor(() => expect(v5.status).toBe('Proposed'));
    expect(await screen.findByText(/v5 đang chờ bạn duyệt/)).toBeTruthy();
    unmountAll();
  });

  it('đổi ngôn ngữ, đang tải, lỗi (EC39)', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mock.use({
      overrides: {
        getPlanVersion: async ({ params }) => {
          await gate;
          const version = planningState().versions.find((v) => v.id === params.planVersionId)!;
          return { status: 200, body: version };
        },
      },
    });
    const first = renderPlanning(planPath());
    expect(await screen.findByText('Đang tải Plan Version…')).toBeTruthy();
    release();
    expect(await screen.findByRole('link', { name: /^T-2\.5 / })).toBeTruthy();
    await act(() => i18next.changeLanguage('en'));
    expect(screen.getByRole('tab', { name: 'Dependency graph' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Execution label' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'All labels' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Compare versions' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: /^Blocked/ })).getAllByText('Available for agent').length).toBeGreaterThan(0);
    first.unmountAll();
    await act(() => i18next.changeLanguage('vi'));

    mock.server.resetHandlers();
    mock.use({ overrides: { getPlan: () => new Response(JSON.stringify({ type: 'x', title: 'x', status: 500, code: 'internal_error' }), { status: 500, headers: { 'content-type': 'application/problem+json' } }) } });
    const second = renderPlanning(planPath());
    expect(await screen.findByText('Chưa tải được Plan')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Thử lại/ })).toBeTruthy();
    second.unmountAll();

    // Titles are shown as text, never as HTML.
    mock.server.resetHandlers();
    const baseline = planningState().versions.find((v) => v.status === 'Approved')!;
    baseline.tasks!.find((d) => d.taskId === T['2.4'])!.title = '<b>Phỏng vấn</b> chuyên gia';
    const third = renderPlanning(planPath());
    const titled = await screen.findByText('<b>Phỏng vấn</b> chuyên gia');
    expect(titled.querySelector('b')).toBeNull();
    third.unmountAll();
  });
});
