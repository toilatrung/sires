// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00059 S02, S03: workflow detail, controls and the Recovery decision (PID-00059-AC02, UX-MONITOR-002-AC01,
// UX-MONITOR-004-AC01; EC08–EC20).

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { id } from '../../shell/mock';
import { useMockServer } from '../../shell/mock/node';
import { WF_52D, resetMonitoringMockState } from './__mocks__';
import { resetDeliberationMock, scenarios } from './__mocks__/deliberation';
import { P, agentRun, openStream, page, problem, renderMonitoring, step, textOf, workflow, type AgentRun, type Workflow } from './test-helpers';
import { feature } from '.';

const mock = useMockServer({ features: [feature] });
beforeEach(() => {
  resetMonitoringMockState();
  resetDeliberationMock(scenarios.round1());
});

/** getWorkflow, listAgentRuns of one test workflow (other workflows: the area's mock). */
function serve(wf: () => Workflow, runs: () => AgentRun[] = () => [], extra: Parameters<typeof mock.use>[0]['overrides'] = {}) {
  mock.use({
    overrides: {
      getWorkflow: ({ params }) => (params.workflowId === wf().id ? { status: 200, body: wf() } : problem(404, 'not_found')),
      listAgentRuns: ({ params }) => page(params.workflowId === wf().id ? runs() : []),
      ...extra,
    },
  });
}
const open = async (wf: Workflow, query = '') => {
  const view = await renderMonitoring(`/projects/${P}/activity/workflows/${wf.id}${query}`);
  await screen.findByRole('heading', { level: 1 });
  return view;
};
const header = () => screen.getByRole('heading', { level: 1 }).closest('header') as HTMLElement;
const commandButtons = (scope: HTMLElement) => within(scope).queryAllByRole('button', { name: /^(Tạm dừng|Tiếp tục|Hủy)$/ }).map((b) => b.textContent);
const bodyOf = (r: { body?: string } | undefined) => JSON.parse(r?.body ?? '{}');

/** wf 90 at step 3 of 3 (Discovery, Discovery, Evidence Retrieval) with the Agent Runs of its steps. */
function three(status: Workflow['status'], third: Workflow['steps'] extends (infer S)[] | undefined ? Partial<S> : never = {}) {
  const refs = { a: { type: 'reference', id: id('reference', 91) }, b: { type: 'reference', id: id('reference', 92) }, c: { type: 'evidence', id: id('reference', 93) } };
  const wf = workflow(90, status, [
    step(90, 1, 'discovery', 'Succeeded', { description: 'Tìm tài liệu trên Google Scholar', inputRefs: [{ type: 'research_context_version', id: id('context', 1), version: 4 }], outputRefs: [refs.a] }),
    step(90, 2, 'discovery', 'Succeeded', { description: 'Lọc theo phạm vi năm xuất bản', inputRefs: [{ type: 'search_batch', id: id('reference', 99) }], outputRefs: [refs.b] }),
    step(90, 3, 'evidence_retrieval', status === 'Interrupted' ? 'Failed' : 'Running', { description: 'Truy xuất evidence cho từng phương pháp đo', inputRefs: [refs.b], outputRefs: [], ...third }),
  ]);
  const runs = [agentRun(901, 90, 1, 'discovery', 'Succeeded', { outputRefs: [refs.a] }), agentRun(902, 90, 2, 'discovery', 'Succeeded', { outputRefs: [refs.b] }), agentRun(903, 90, 3, 'evidence_retrieval', status === 'Interrupted' ? 'Failed' : 'Running')];
  wf.steps = wf.steps!.map((s, i) => ({ ...s, agentRunIds: [runs[i]!.id] }));
  return { wf, runs, refs };
}

describe('Workflow: Recovery decision (S03)', () => {
  const interrupted = (checkpoint: Workflow['lastCheckpoint']) => {
    const { wf, runs } = three('Interrupted');
    return { wf: { ...wf, currentStepId: wf.steps![2]!.id, lastCheckpointId: checkpoint?.id ?? null, lastCheckpoint: checkpoint }, runs };
  };
  const good = (wf: Workflow): Workflow['lastCheckpoint'] => ({ id: id('audit', 900), stepId: wf.steps![1]!.id, sequence: 2, consistent: true, at: wf.startedAt!, savedOutputRefs: [{ type: 'reference', id: id('reference', 91) }, { type: 'reference', id: id('reference', 92) }] });

  it('recovery decision (PID-00059-AC02, EC12)', async () => {
    const base = three('Interrupted').wf;
    const { wf, runs } = interrupted(good(base));
    serve(() => wf, () => runs, { decideWorkflowRecovery: () => ({ status: 200, body: { ...wf, status: 'Running', rowVersion: 2 } }) });
    const { user, calls } = await open(wf);
    const block = screen.getByRole('region', { name: 'Recovery decision' });
    expect(textOf(block)).toContain('Workflow dừng ngoài ý muốn ở bước 3 (Evidence Retrieval Agent)');
    expect(textOf(block)).toContain('Checkpoint gần nhất: sau bước 2');
    expect(textOf(block)).toContain('2 đầu ra đã lưu');
    const radios = within(block).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.value)).toEqual(['continue', 'rerun_step', 'cancel']);
    expect(radios.some((r) => r.checked)).toBe(false);
    const confirm = within(block).getByRole('button', { name: 'Xác nhận' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    // No Pause, Resume on an Interrupted workflow.
    expect(commandButtons(document.body)).toEqual([]);

    await user.click(within(block).getByRole('radio', { name: /Chạy lại bước/ }));
    const select = within(block).getByRole('combobox', { name: 'Bước chạy lại' }) as HTMLSelectElement;
    expect(select.value).toBe(wf.steps![2]!.id);
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    await waitFor(() => expect(calls('POST', `/workflows/${wf.id}/recovery-decision`)).toHaveLength(1));
    const sent = calls('POST', `/workflows/${wf.id}/recovery-decision`)[0]!;
    expect(bodyOf(sent)).toEqual({ decision: 'rerun_step', stepId: wf.steps![2]!.id });
    expect(sent.headers['Idempotency-Key']).toBeTruthy();
  });

  it('không gửi trước khi quyết định (EC13)', async () => {
    const base = three('Interrupted').wf;
    const { wf, runs } = interrupted(good(base));
    serve(() => wf, () => runs);
    const { user, calls } = await open(wf);
    await user.click(screen.getByRole('radio', { name: /Hủy/ }));
    await user.click(screen.getByRole('radio', { name: /Tiếp tục từ checkpoint/ }));
    // Opening the page and choosing send nothing; only “Xác nhận” does.
    expect(calls('POST', /^\/workflows\//)).toHaveLength(0);
    expect(calls('PUT', /^\/workflows\//)).toHaveLength(0);
  });

  it('không có checkpoint (EC14)', async () => {
    for (const checkpoint of [null, { ...good(three('Interrupted').wf)!, consistent: false }]) {
      const { wf, runs } = interrupted(checkpoint);
      serve(() => wf, () => runs);
      const view = await open(wf);
      const block = screen.getByRole('region', { name: 'Recovery decision' });
      expect(textOf(block)).toContain('Chưa có checkpoint nhất quán.');
      expect((within(block).getByRole('radio', { name: /Tiếp tục từ checkpoint/ }) as HTMLInputElement).disabled).toBe(true);
      expect(textOf(block)).toContain('Không dùng được: chưa có checkpoint nhất quán.');
      expect((within(block).getByRole('radio', { name: /Chạy lại bước/ }) as HTMLInputElement).disabled).toBe(false);
      expect((within(block).getByRole('radio', { name: /^Hủy/ }) as HTMLInputElement).disabled).toBe(false);
      view.unmountAll();
    }
  });
});

describe('Workflow: điều khiển (S02, S03)', () => {
  it('nút theo trạng thái (UX-MONITOR-004-AC01, EC08)', async () => {
    const cases: Array<[Workflow['status'], string[]]> = [
      ['Succeeded', []],
      ['Running', ['Tạm dừng', 'Hủy']],
      ['Waiting for User', ['Tạm dừng', 'Hủy']],
      ['Paused', ['Tiếp tục', 'Hủy']],
      ['Created', []],
      ['Failed', []],
      ['Cancelled', []],
    ];
    for (const [status, expected] of cases) {
      const wf = workflow(91, status, [step(91, 1, 'discovery', status === 'Succeeded' ? 'Succeeded' : 'Pending')]);
      serve(() => wf);
      const view = await open(wf);
      expect([status, commandButtons(header())]).toEqual([status, expected]);
      view.unmountAll();
    }
    // The same rule on the rows of the list; Interrupted links to its Recovery decision.
    const list = (['Succeeded', 'Running', 'Paused', 'Interrupted', 'Created'] as const).map((s, i) => workflow(92 + i, s, [step(92 + i, 1, 'discovery', s === 'Succeeded' ? 'Succeeded' : 'Pending')]));
    mock.use({ overrides: { listWorkflows: ({ request }) => page(list.filter((w) => new URL(request.url).searchParams.getAll('status').includes(w.status))) } });
    await renderMonitoring(`/projects/${P}/activity`);
    await screen.findByRole('table', { name: 'Danh sách workflow' });
    const row = (n: number) => document.querySelector(`tr[data-workflow="${id('workflow', n)}"]`) as HTMLElement;
    expect(commandButtons(row(92))).toEqual([]);
    expect(commandButtons(row(93))).toEqual(['Tạm dừng', 'Hủy']);
    expect(commandButtons(row(94))).toEqual(['Tiếp tục', 'Hủy']);
    expect(commandButtons(row(95))).toEqual([]);
    expect(within(row(95)).getByRole('link', { name: 'Mở Recovery decision' }).getAttribute('href')).toBe(`/projects/${P}/activity/workflows/${id('workflow', 95)}`);
    expect(commandButtons(row(96))).toEqual([]);
    for (const n of [92, 93, 94, 95, 96]) expect(within(row(n)).getByRole('link', { name: /^Xem chi tiết/ })).toBeTruthy();
  });

  it('hủy cần xác nhận (EC09)', async () => {
    const wf = workflow(97, 'Running', [step(97, 1, 'synthesis', 'Succeeded'), step(97, 2, 'synthesis', 'Waiting for User', { openPromptId: id('prompt', 97) })], { status: 'Waiting for User' });
    serve(() => wf, () => [], { cancelWorkflow: () => ({ status: 200, body: { ...wf, status: 'Cancelled', endedAt: new Date().toISOString() } }) });
    const { user, calls } = await open(wf);
    await user.click(within(header()).getByRole('button', { name: 'Hủy' }));
    const dialog = await screen.findByRole('dialog', { name: /^Hủy workflow wf-/ });
    expect(textOf(dialog)).toMatch(/về Ready hoặc Blocked theo readiness/);
    expect(textOf(dialog)).toContain('Đầu ra đã lưu được giữ ở dạng Draft.');
    expect(textOf(dialog)).toContain('1 prompt đang Open chuyển Cancelled.');
    // “Giữ workflow” keeps it and sends nothing.
    await user.click(within(dialog).getByRole('button', { name: 'Giữ workflow' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls('POST', `/workflows/${wf.id}/cancel`)).toHaveLength(0);
    await user.click(within(header()).getByRole('button', { name: 'Hủy' }));
    const again = await screen.findByRole('dialog');
    await user.type(within(again).getByRole('textbox', { name: 'Lý do (không bắt buộc)' }), 'Đổi phạm vi');
    await user.click(within(again).getByRole('button', { name: 'Hủy workflow' }));
    await waitFor(() => expect(calls('POST', `/workflows/${wf.id}/cancel`)).toHaveLength(1));
    const sent = calls('POST', `/workflows/${wf.id}/cancel`)[0]!;
    expect(bodyOf(sent)).toEqual({ reason: 'Đổi phạm vi' });
    expect(sent.headers['Idempotency-Key']).toBeTruthy();
  });

  it('409 invalid_transition (EC10)', async () => {
    let current = workflow(98, 'Running', [step(98, 1, 'discovery', 'Running')]);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    serve(() => current, () => [], {
      pauseWorkflow: async () => {
        await gate;
        // Paused meanwhile from another tab: this command is not valid any more.
        current = { ...current, status: 'Paused', rowVersion: 2 };
        return problem(409, 'invalid_transition', { currentState: 'Paused' });
      },
    });
    const { user, calls } = await open(current);
    const pause = within(header()).getByRole('button', { name: 'Tạm dừng' }) as HTMLButtonElement;
    await user.click(pause);
    // Sending: the button is off, a second click sends nothing more.
    await waitFor(() => expect(pause.disabled).toBe(true));
    await user.click(pause);
    release();
    expect(await screen.findByText(/hiện ở Paused/)).toBeTruthy();
    expect(calls('POST', `/workflows/${current.id}/pause`)).toHaveLength(1);
    expect(commandButtons(header())).toEqual(['Tiếp tục', 'Hủy']);
    expect(within(header()).getByText('Paused')).toBeTruthy();
  });

  it('409 invalid_transition chạy cả trên dòng danh sách (EC10)', async () => {
    let current = workflow(99, 'Running', [step(99, 1, 'discovery', 'Running')]);
    mock.use({
      overrides: {
        listWorkflows: ({ request }) => page(new URL(request.url).searchParams.getAll('status').includes(current.status) ? [current] : []),
        getWorkflow: () => ({ status: 200, body: current }),
        pauseWorkflow: () => {
          current = { ...current, status: 'Cancelled', endedAt: new Date().toISOString() };
          return problem(409, 'invalid_transition', { currentState: 'Cancelled' });
        },
      },
    });
    const { user } = await renderMonitoring('/activity');
    await screen.findByRole('table', { name: 'Danh sách workflow' });
    const row = () => document.querySelector(`tr[data-workflow="${current.id}"]`) as HTMLElement;
    await user.click(within(row()).getByRole('button', { name: 'Tạm dừng' }));
    await waitFor(() => expect(within(row()).getByText('Cancelled')).toBeTruthy());
    expect(commandButtons(row())).toEqual([]);
  });

  it('tạm dừng từ Waiting for User (EC11)', async () => {
    // Shared demo workflow 2: Waiting for User at step 2 with an Open blocking prompt.
    const workflowId = id('workflow', 2);
    const { user, calls } = await renderMonitoring(`/projects/${P}/activity/workflows/${workflowId}`);
    await screen.findByRole('heading', { level: 1 });
    expect(within(header()).getByText('Waiting for User')).toBeTruthy();
    await user.click(within(header()).getByRole('button', { name: 'Tạm dừng' }));
    await waitFor(() => expect(within(header()).getByText('Paused')).toBeTruthy());
    await user.click(within(header()).getByRole('button', { name: 'Tiếp tục' }));
    // The prompt that blocks is still Open: back to Waiting for User, not Running (DEC-53).
    await waitFor(() => expect(within(header()).getByText('Waiting for User')).toBeTruthy());
    expect(calls('POST', `/workflows/${workflowId}/pause`)).toHaveLength(1);
    expect(calls('POST', `/workflows/${workflowId}/resume`)).toHaveLength(1);
  });

  it('kết thúc chỉ xem (EC15)', async () => {
    const cancelled = workflow(100, 'Cancelled', [step(100, 1, 'discovery', 'Succeeded')], { endedAt: '2026-11-27T10:12:00Z' });
    serve(() => cancelled, () => [], {
      listProjectAuditEvents: () =>
        page([{ id: id('audit', 100), accountId: cancelled.accountId, projectId: P, actor: { type: 'researcher' }, action: 'workflow.cancelled', objectType: 'workflow', objectId: cancelled.id, toState: 'Cancelled', at: '2026-11-27T10:12:00Z' }]),
    });
    let view = await open(cancelled);
    const banner = await screen.findByText(/^Workflow Cancelled lúc/);
    expect(textOf(banner)).toMatch(/· (Researcher|\S.+)$/);
    expect(textOf(banner.closest('[role="status"]'))).toContain('đầu ra đã lưu giữ ở dạng Draft');
    expect(commandButtons(document.body)).toEqual([]);
    view.unmountAll();

    const failedRun = id('agentRun', 1010);
    const failed = workflow(101, 'Failed', [step(101, 1, 'evidence_retrieval', 'Failed')], { lastError: { code: 'auth_failed', message: 'raw provider text', agentRunId: failedRun } });
    serve(() => failed);
    view = await open(failed);
    const status = (await screen.findByText(/^Workflow Failed lúc/)).closest('[role="status"]') as HTMLElement;
    expect(textOf(status)).toContain('Provider từ chối key (mã auth_failed)');
    expect(textOf(status)).not.toContain('raw provider text');
    expect(within(status).getByRole('link', { name: /^Agent Run ar-/ }).getAttribute('href')).toContain(`agentRun=${failedRun}`);
    expect(commandButtons(document.body)).toEqual([]);
    view.unmountAll();
  });
});

describe('Workflow: chế độ xem (S03)', () => {
  it('dòng thời gian giao việc và handoff (UX-MONITOR-002-AC01, EC16)', async () => {
    const { wf, runs } = three('Running');
    serve(() => wf, () => runs);
    await open(wf);
    const timeline = screen.getByRole('list', { name: 'Dòng thời gian' });
    const entries = within(timeline).getAllByRole('listitem').map(textOf);
    const assigns = entries.filter((e) => /Orchestrator giao bước \d/.test(e));
    expect(assigns).toHaveLength(3);
    expect(assigns[0]).toContain('cho Discovery Agent');
    expect(assigns[2]).toContain('cho Evidence Retrieval Agent');
    const handoff = entries.find((e) => e.includes('handoff từ bước 2 (Discovery Agent) sang bước 3 (Evidence Retrieval Agent)'));
    expect(handoff).toBeTruthy();
    // Step 1's output is not step 2's input: no handoff between them.
    expect(entries.some((e) => e.includes('handoff từ bước 1'))).toBe(false);
    // In time order: the handoff comes right before step 3 is assigned.
    expect(entries.indexOf(handoff!)).toBe(entries.indexOf(assigns[2]!) - 1);
    expect(entries.some((e) => e.includes('hoàn tất bước 1'))).toBe(true);
  });

  it('danh sách bước (EC17)', async () => {
    const { wf, runs, refs } = three('Running');
    serve(() => wf, () => runs);
    await open(wf, '?view=steps');
    const table = screen.getByRole('table', { name: 'Danh sách bước' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(textOf(rows[0])).toContain('1/3 Tìm tài liệu trên Google Scholar');
    expect(within(rows[0]!).getByText('Discovery Agent')).toBeTruthy();
    expect(within(rows[0]!).getByText('Succeeded')).toBeTruthy();
    // Outputs and inputs link to the entity; a type without a route is text.
    expect(within(rows[0]!).getByRole('link', { name: /^Reference re-/ }).getAttribute('href')).toBe(`/library/${refs.a.id}`);
    expect(within(rows[1]!).queryByRole('link', { name: /search_batch/ })).toBeNull();
    expect(textOf(rows[1])).toContain('search_batch');
    expect(within(rows[2]!).getByRole('link', { name: /^Reference re-/ }).getAttribute('href')).toBe(`/library/${refs.b.id}`);
    // The Agent Run of a step under its name opens the Agent Run panel.
    const runLink = within(rows[2]!).getByRole('link', { name: /^Agent Run ar-/ });
    expect(runLink.getAttribute('href')).toBe(`/projects/${P}/activity/workflows/${wf.id}?view=steps&agentRun=${runs[2]!.id}`);
  });

  it('prompt trong chi tiết (EC18)', async () => {
    const workflowId = id('workflow', 2);
    const view = await renderMonitoring(`/projects/${P}/activity/workflows/${workflowId}`);
    expect(await screen.findByText('Bảng so sánh nên dùng tiêu chí nào làm cột chính?')).toBeTruthy();
    expect(screen.getByText(/Cũng trả lời được trong/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Project AI Chat' }).getAttribute('href')).toBe(`/projects/${P}/chat`);
    await openStream(view.services, mock);
    const reads = view.calls('GET', `/prompts/${id('prompt', 1)}`).length;
    mock.events.emit({ type: 'prompt.status_changed', projectId: P, objectType: 'prompt', objectId: id('prompt', 1), fromState: 'Open', toState: 'Answered' });
    await waitFor(() => expect(view.calls('GET', `/prompts/${id('prompt', 1)}`).length).toBeGreaterThan(reads));
  });

  it('bước thảo luận (EC19)', async () => {
    // wf-52d of the area mock: step 4 is the deliberation step of PID-00083 (session dl-3c1 running).
    const { user } = await renderMonitoring(`/projects/${P}/activity/workflows/${WF_52D}?view=steps`);
    const table = await screen.findByRole('table', { name: 'Danh sách bước' });
    const row4 = within(table).getAllByRole('row')[4]!;
    expect(textOf(row4)).toContain('4/5 Chọn khung so sánh (có thể mở thảo luận)');
    expect(within(row4).getByText('Orchestrator')).toBeTruthy();
    expect(within(row4).getByText('Running')).toBeTruthy();
    // The “Thảo luận” tab of PID-00083 is wired in (YC1): it opens the session of the step.
    const tab = await screen.findByRole('link', { name: 'Thảo luận' });
    await user.click(tab);
    expect(await screen.findByText('Problem Brief')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Thảo luận' }).getAttribute('aria-current')).toBe('page');
  });

  it('đang chạy (EC20)', async () => {
    const { wf, runs } = three('Running');
    serve(() => wf, () => runs);
    await open(wf, '?view=steps');
    expect(screen.getByText('2/3 bước xong')).toBeTruthy();
    const bar = screen.getByRole('img', { name: 'Tiến độ: 2 trên 3 bước xong' });
    const fill = bar.querySelector('[data-progress]') as HTMLElement;
    expect(fill.style.width).toMatch(/^66\.6/);
    const current = document.querySelector('tr[aria-current="step"]') as HTMLElement;
    expect(textOf(current)).toContain('3/3');
    // The running dot is the chip's data-running (reduced motion: the shell's motion.css keeps it still).
    expect(within(current).getByText('Running').hasAttribute('data-running')).toBe(true);
    expect(textOf(current)).toMatch(/đang chạy \d{2}:\d{2}/);
    expect(screen.getByLabelText('Thời gian chạy')).toBeTruthy();
  });
});
