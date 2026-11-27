// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00059 S01, S02: Agent Activity Global and per project (PID-00059-AC01, UX-MONITOR-001-AC01, UX-MONITOR-005-AC01;
// EC01–EC07, EC37).

import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changeLanguage } from '../../shell';
import { id } from '../../shell/mock';
import { useMockServer } from '../../shell/mock/node';
import { resetMonitoringMockState } from './__mocks__';
import { P, at, openStream, page, problem, renderMonitoring, step, textOf, workflow, type Workflow } from './test-helpers';
import { feature } from '.';

const mock = useMockServer({ features: [feature] });
beforeEach(() => resetMonitoringMockState());
afterEach(async () => {
  vi.useRealTimers();
  await changeLanguage('vi');
});

/** listWorkflows over a fixed set: by status, newest first, paged by offset. */
function serve(all: () => Workflow[], size = 50) {
  return ({ query, request }: { query: Record<string, unknown>; request: Request }) => {
    // Repeated `status` values: read them from the URL (the runtime's `query` keeps the last one only).
    const wanted = new URL(request.url).searchParams.getAll('status');
    const items = all().filter((w) => (!wanted.length || wanted.includes(w.status)) && (!query.projectId || w.projectId === query.projectId));
    const start = Number(query.cursor ?? 0);
    const limit = Math.min(Number(query.limit ?? 50), size);
    return page(items.slice(start, start + limit), start + limit < items.length ? String(start + limit) : null);
  };
}
const rowsOf = () => within(screen.getByRole('table', { name: 'Danh sách workflow' })).getAllByRole('row').slice(1);
const rowOf = (n: number) => document.querySelector(`tr[data-workflow="${id('workflow', n)}"]`) as HTMLElement;
const endedListCalls = (calls: Awaited<ReturnType<typeof renderMonitoring>>['calls']) => calls('GET', '/workflows').filter((r) => r.query.getAll('status').includes('Succeeded'));

const five = (n: number, current: number, status: Workflow['status'] = 'Running') =>
  workflow(
    n,
    status,
    (['discovery', 'discovery', 'evidence_retrieval', 'orchestrator', 'synthesis'] as const).map((agent, i) =>
      step(n, i + 1, agent, i + 1 < current ? 'Succeeded' : i + 1 === current ? (status === 'Waiting for User' ? 'Waiting for User' : 'Running') : 'Pending', { description: `Mô tả bước ${i + 1}` }),
    ),
  );

describe('Agent Activity: danh sách (S02)', () => {
  it('đang chạy ở trên (UX-MONITOR-001-AC01, EC02)', async () => {
    const list = [
      workflow(61, 'Succeeded', [], { endedAt: at(50) }),
      five(62, 2),
      workflow(63, 'Failed', [], { endedAt: at(70) }),
      five(64, 3),
      workflow(65, 'Cancelled', [], { endedAt: at(60) }),
    ];
    mock.use({ overrides: { listWorkflows: serve(() => list) } });
    await renderMonitoring('/activity');
    await screen.findByRole('table', { name: 'Danh sách workflow' });
    const order = rowsOf().map((tr) => tr.getAttribute('data-workflow'));
    // Two running workflows first, then the ended ones by endedAt, newest first.
    expect(order.slice(0, 2).sort()).toEqual([id('workflow', 62), id('workflow', 64)].sort());
    expect(order.slice(2)).toEqual([id('workflow', 63), id('workflow', 65), id('workflow', 61)]);
    expect(textOf(rowOf(64))).toContain('3/5 Mô tả bước 3');
    expect(textOf(rowOf(64))).toContain('Evidence Retrieval Agent');
    expect(textOf(rowOf(62))).toContain('Discovery Agent');
    expect(screen.getByRole('button', { name: /Đang hoạt động · 2$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Đã kết thúc · 3$/ })).toBeTruthy();
  });

  it('tự cập nhật theo SSE (PID-00059-AC01, UX-MONITOR-005-AC01, EC04)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(at(90)));
    let wf52 = five(52, 3);
    const runId = wf52.steps![2]!.agentRunIds![0]!;
    mock.use({ overrides: { listWorkflows: serve(() => [wf52]), getWorkflow: ({ params }) => (params.workflowId === wf52.id ? { status: 200, body: wf52 } : problem(404, 'not_found')) } });
    const view = await renderMonitoring(`/projects/${P}/activity`);
    await screen.findByRole('table', { name: 'Danh sách workflow' });
    expect(within(rowOf(52)).getByText('Running')).toBeTruthy();
    const before = textOf(screen.getByTestId('updated-at'));
    const listed = endedListCalls(view.calls).length;
    await openStream(view.services, mock);

    // workflow.status_changed → getWorkflow → the row changes in place.
    vi.setSystemTime(new Date(at(95)));
    wf52 = { ...wf52, status: 'Waiting for User', steps: wf52.steps!.map((s, i) => (i === 2 ? { ...s, status: 'Waiting for User', openPromptId: id('prompt', 52) } : s)) };
    mock.events.emit({ type: 'workflow.status_changed', projectId: P, objectType: 'workflow', objectId: wf52.id, fromState: 'Running', toState: 'Waiting for User' });
    await waitFor(() => expect(within(rowOf(52)).getByText('Waiting for User')).toBeTruthy());
    expect(textOf(within(rowOf(52)).getByText('1 prompt'))).toBe('1 prompt');
    expect(textOf(screen.getByTestId('updated-at'))).not.toBe(before);
    expect(view.calls('GET', `/workflows/${wf52.id}`).length).toBeGreaterThan(0);

    // agent_run.status_changed: step 3 finished, step 4 runs — the step column follows (UX-MONITOR-005-AC01).
    wf52 = { ...wf52, status: 'Running', currentStepId: wf52.steps![3]!.id, steps: wf52.steps!.map((s, i) => (i === 2 ? { ...s, status: 'Succeeded', openPromptId: undefined } : i === 3 ? { ...s, status: 'Running' } : s)) };
    mock.events.emit({ type: 'agent_run.status_changed', projectId: P, objectType: 'agent_run', objectId: runId, fromState: 'Running', toState: 'Succeeded' });
    await waitFor(() => expect(textOf(rowOf(52))).toContain('4/5 Mô tả bước 4'));
    expect(within(rowOf(52)).getByText('Running')).toBeTruthy();
    // No page reload: the list itself was not read again.
    expect(endedListCalls(view.calls)).toHaveLength(listed);
    expect(view.calls('GET', /\/conversations|\/events\/delta/)).toHaveLength(0);
  });

  it('bước và prompt chờ (EC06)', async () => {
    const waiting = workflow(66, 'Waiting for User', [
      step(66, 1, 'synthesis', 'Waiting for User', { openPromptId: id('prompt', 66) }),
      step(66, 2, 'synthesis', 'Waiting for User', { openPromptId: id('prompt', 67) }),
    ]);
    mock.use({ overrides: { listWorkflows: serve(() => [waiting, workflow(67, 'Created', [])]) } });
    await renderMonitoring('/activity');
    await screen.findByRole('table', { name: 'Danh sách workflow' });
    expect(within(rowOf(66)).getByText('2 prompt')).toBeTruthy();
    expect(textOf(rowOf(66))).toContain('1/2 Bước 1 của wf 66');
    expect(textOf(rowOf(66))).toContain('Synthesis Agent');
    const created = rowOf(67).querySelectorAll('td');
    expect(textOf(created[3])).toBe('—');
    expect(textOf(created[5])).toBe('—');
  });

  it('workflow không thuộc project (Global)', async () => {
    const library = workflow(74, 'Running', [step(74, 1, 'reference_processing', 'Running')], { projectId: undefined, taskId: undefined });
    mock.use({ overrides: { listWorkflows: serve(() => [library]) } });
    await renderMonitoring('/activity');
    await screen.findByRole('table', { name: 'Danh sách workflow' });
    expect(within(rowOf(74)).getByText('Không thuộc project')).toBeTruthy();
    expect(within(rowOf(74)).queryByRole('link')).toBeNull();
    expect(within(rowOf(74)).getByRole('button', { name: 'Tạm dừng' })).toBeTruthy();
  });

  it('thời gian chạy (EC07)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(at(2)));
    const running = workflow(68, 'Running', [step(68, 1, 'discovery', 'Running')], { startedAt: new Date(Date.parse(at(2)) - 125_000).toISOString() });
    const ended = workflow(69, 'Succeeded', [], { startedAt: at(0), endedAt: at(30) });
    const created = workflow(70, 'Created', []);
    mock.use({ overrides: { listWorkflows: serve(() => [running, ended, created]) } });
    await renderMonitoring('/activity');
    await screen.findByRole('table', { name: 'Danh sách workflow' });
    expect(textOf(rowOf(68).querySelectorAll('td')[4])).toBe('02:05');
    expect(textOf(rowOf(69).querySelectorAll('td')[4])).toBe('30:00');
    expect(textOf(rowOf(70).querySelectorAll('td')[4])).toBe('—');
  });

  it('trống (EC01)', async () => {
    mock.use({ overrides: { listWorkflows: () => page([]) } });
    await renderMonitoring(`/projects/${P}/activity`);
    expect(await screen.findByText('Chưa có workflow nào')).toBeTruthy();
    expect(screen.getByText(/Agent Activity hiện workflow khi có Task chạy/)).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Danh sách workflow' })).toBeNull();
  });

  it('xem thêm (EC03)', async () => {
    const ended = [1, 2, 3, 4, 5, 6, 7].map((n) => workflow(80 + n, 'Succeeded', [], { endedAt: at(100 - n) }));
    mock.use({ overrides: { listWorkflows: serve(() => ended, 5) } });
    const { user, calls } = await renderMonitoring('/activity');
    await screen.findByRole('table', { name: 'Danh sách workflow' });
    // Counts are of the loaded items, “+” while a page remains; the default view shows 3 ended ones.
    expect(screen.getByRole('button', { name: /Đã kết thúc · 5\+$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tất cả · 5\+$/ })).toBeTruthy();
    expect(rowsOf()).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Xem thêm 2+ workflow đã kết thúc' }));
    expect(rowsOf()).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: 'Xem thêm workflow đã kết thúc' }));
    await waitFor(() => expect(rowsOf()).toHaveLength(7));
    expect(endedListCalls(calls).at(-1)!.query.get('cursor')).toBe('5');
    expect(screen.queryByRole('button', { name: /^Xem thêm/ })).toBeNull();
  });

  it('nối lại SSE (EC05)', async () => {
    const wf = five(71, 2);
    let reads = 0;
    mock.use({ overrides: { listWorkflows: serve(() => [wf]), getWorkflow: () => ((reads += 1), { status: 200, body: wf }) } });
    const view = await renderMonitoring('/activity');
    await screen.findByRole('table', { name: 'Danh sách workflow' });
    await openStream(view.services, mock);
    // The same event twice, out of order with an older one: each reads the workflow again, the row stays one.
    for (const toState of ['Running', 'Running', 'Created']) mock.events.emit({ type: 'workflow.status_changed', projectId: P, objectType: 'workflow', objectId: wf.id, toState });
    await waitFor(() => expect(reads).toBeGreaterThanOrEqual(3));
    expect(rowsOf()).toHaveLength(1);
    expect(within(rowOf(71)).getByText('Running')).toBeTruthy();
    // Connection lost, then back: the page is read again.
    const listed = endedListCalls(view.calls).length;
    mock.events.disconnect();
    await new Promise((r) => setTimeout(r, 100));
    mock.events.emit({ type: 'notification.created', objectType: 'notification', objectId: id('notification', 1) });
    await waitFor(() => expect(endedListCalls(view.calls).length).toBeGreaterThan(listed), { timeout: 4000 });
  });
});

describe('Agent Activity: khung (S01, EC37)', () => {
  it('đổi ngôn ngữ, đang tải, lỗi (EC37)', async () => {
    let release: () => void = () => undefined;
    let fail = true;
    const gate = new Promise<void>((r) => (release = r));
    mock.use({
      overrides: {
        listWorkflows: async ({ query, request }) => {
          await gate;
          if (fail) return problem(503, 'service_unavailable');
          return serve(() => [five(72, 2), workflow(73, 'Created', [])])({ query, request });
        },
      },
    });
    const { user } = await renderMonitoring('/activity');
    // Loading: the shell's skeleton with its status line.
    expect(await screen.findByText(/workflow/, { selector: '.sires-loading__status' })).toBeTruthy();
    release();
    // Error: what happened and “Thử lại” (UX-STATE-003).
    expect(await screen.findByText('Không tải được danh sách workflow')).toBeTruthy();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByRole('table', { name: 'Danh sách workflow' });
    // English: labels change, entity statuses stay English.
    await act(() => changeLanguage('en'));
    expect(await screen.findByRole('table', { name: 'Workflows' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Active · 2$/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Step · current agent' })).toBeTruthy();
    expect(within(rowOf(72)).getByText('Running')).toBeTruthy();
    expect(within(rowOf(72)).getByRole('button', { name: 'Pause' })).toBeTruthy();
  });
});

