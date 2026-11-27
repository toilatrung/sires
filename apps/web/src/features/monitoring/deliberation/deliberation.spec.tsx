// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00083: Deliberation tab (S01 tab and sessions, S02 rounds and entries, S03 synthesis and states, S04 labels,
// missing configuration and the Agent List helper), on this PID's deliberation mock and the mock of PID-00013.

import { act, render, screen, waitFor, within } from '@testing-library/react';
import i18next from 'i18next';
import { beforeEach, describe, expect, it } from 'vitest';
import { ACCOUNT_ID, id, type Schemas } from '../../../shell/mock';
import {
  closeRound,
  DECISION_PROMPT_ID,
  DELIBERATION_ID,
  deliberationState,
  entries,
  markSnapshotOutdated,
  OLDER_DELIBERATION_ID,
  PROJECT_ID,
  RECORD_VERSION_ID,
  retractEntry,
  scenarios,
  STEP_ID,
  WORKFLOW_ID,
} from '../__mocks__/deliberation';
import { deliberationAgentStates } from './model';
import { pointAnchor } from './Board';
import { deliberationMessages } from './messages';
import { DeliberationAgentNote } from './StepNotes';
import viArea from '../i18n/vi.json';
import enArea from '../i18n/en.json';
import { renderWorkflow, resetDeliberationMock, textOf, useDeliberationMock, waitForStream, workflow } from './testing';

type Detail = Schemas['DeliberationDetail'];
type Prompt = Schemas['InteractiveAgentPrompt'];

const round = (n: number) => screen.getByRole('region', { name: new RegExp(`^Vòng ${n} —`) });
const cellOf = (region: HTMLElement, party: string) => within(region).getByLabelText(party, { selector: '.dl-cell' });
/** Entry type lines of a region (“Phản biện · critique”). */
const typesIn = (el: HTMLElement) => [...el.querySelectorAll('.dl-entry__type')].map((n) => textOf(n));

function prompt(promptId: string, extra: Partial<Prompt>): Prompt {
  return {
    id: promptId,
    accountId: ACCOUNT_ID,
    projectId: PROJECT_ID,
    createdAt: '2026-11-27T10:24:00Z',
    createdBy: { type: 'agent', agent: 'orchestrator' },
    rowVersion: 1,
    workflowId: WORKFLOW_ID,
    stepId: STEP_ID,
    createdByAgentRunId: id('agentRun', 899),
    agent: 'orchestrator',
    type: 'choice',
    purpose: 'deliberation_decision',
    question: 'Chọn phương án cho bảng so sánh?',
    pendingAction: { objectType: 'deliberation', objectId: DELIBERATION_ID },
    choices: [
      { id: 'opt-o', label: 'Orchestrator — ba trục' },
      { id: 'opt-a', label: 'A — benchmark kèm cơ chế đo', recommended: true },
      { id: 'opt-b', label: 'B — theo cơ chế đo' },
    ],
    multiSelect: false,
    status: 'Open',
    ...extra,
  };
}

async function openTab(query = '', wf = workflow()) {
  const view = renderWorkflow(wf, query);
  await screen.findByRole('heading', { level: 2, name: /^Phiên thảo luận dl-/ });
  return view;
}

describe('Tab Thảo luận (PID-00083 S01)', () => {
  const mock = useDeliberationMock();

  it('không có phiên không có tab (EC01)', async () => {
    resetDeliberationMock();
    deliberationState().length = 0;
    const { unmountAll } = renderWorkflow(workflow());
    expect(await screen.findByTestId('tab-state')).toHaveProperty('textContent', 'hidden');
    expect(screen.queryByRole('tab', { name: 'Thảo luận' })).toBeNull();
    unmountAll();
  });

  it('chọn phiên (EC20)', async () => {
    const older = { ...scenarios.completed(), id: OLDER_DELIBERATION_ID, startedAt: '2026-11-26T08:00:00Z', problemType: 'plan_structure' as const };
    resetDeliberationMock(older, scenarios.round2());
    const { user, router, unmountAll } = await openTab();
    const picker = screen.getByRole('combobox', { name: 'Phiên' }) as HTMLSelectElement;
    const options = within(picker).getAllByRole('option').map((o) => o.textContent);
    expect(options[0]).toMatch(/^dl-\w{3} · methodology · Running/);
    expect(options[1]).toMatch(/^dl-\w{3} · plan_structure · Completed/);
    // Newest by default; the URL picks another one.
    expect(picker.value).toBe(DELIBERATION_ID);
    await user.selectOptions(picker, OLDER_DELIBERATION_ID);
    await waitFor(() => expect(router.state.location.search).toContain(`deliberation=${OLDER_DELIBERATION_ID}`));
    expect(await screen.findByText('Bản tổng hợp')).toBeTruthy();
    unmountAll();
  });

  it('đổi ngôn ngữ, đang tải, lỗi (EC23)', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    resetDeliberationMock(scenarios.round2());
    mock.use({
      overrides: {
        getDeliberation: async () => {
          await gate;
          return { status: 200, body: scenarios.round2() };
        },
      },
    });
    const first = renderWorkflow(workflow());
    expect(await screen.findByText('Đang tải phiên thảo luận…')).toBeTruthy();
    release();
    await screen.findByRole('heading', { level: 2, name: /^Phiên thảo luận/ });
    await waitFor(async () => {
      if (i18next.language !== 'en') await act(() => i18next.changeLanguage('en'));
      expect(screen.getByRole('heading', { level: 2, name: /^Deliberation session dl-/ })).toBeTruthy();
    });
    expect(screen.getByText('Running', { selector: '.dl-title .sires-chip' })).toBeTruthy();
    first.unmountAll();
    await act(() => i18next.changeLanguage('vi'));

    mock.server.resetHandlers();
    mock.use({ overrides: { getDeliberation: () => new Response(JSON.stringify({ type: 'x', title: 'x', status: 500, code: 'internal_error' }), { status: 500, headers: { 'content-type': 'application/problem+json' } }) } });
    const second = renderWorkflow(workflow());
    expect(await screen.findByText('Chưa tải được phiên thảo luận')).toBeTruthy();
    second.unmountAll();

    // Entry text is shown as text, never as HTML.
    mock.server.resetHandlers();
    const html = scenarios.round2();
    (html.entries[1]!.content as Schemas['PositionContent']).option = '<img src=x onerror=alert(1)>Ba trục';
    resetDeliberationMock(html);
    const third = await openTab();
    expect(await screen.findByText('<img src=x onerror=alert(1)>Ba trục')).toBeTruthy();
    expect(document.querySelector('.dl-board img')).toBeNull();
    third.unmountAll();
  });
});

describe('Vòng và entry (PID-00083 S02)', () => {
  const mock = useDeliberationMock();
  beforeEach(() => resetDeliberationMock());

  it('vòng 1 còn ẩn (PID-00083-AC01, EC02)', async () => {
    const { services, unmountAll } = await openTab();
    expect(screen.getByRole('heading', { name: 'Problem Brief' })).toBeTruthy();
    const r1 = round(1);
    expect(within(r1).getAllByText('Đang viết, mở khi vòng đóng')).toHaveLength(3);
    expect(within(r1).queryByText(/So sánh theo 3 trục/)).toBeNull();
    expect(document.querySelectorAll('.dl-entry')).toHaveLength(0);
    // Round 1 closes: the three positions appear, without reloading the page.
    await waitForStream(services, mock);
    act(() => closeRound(DELIBERATION_ID, [entries.posO(), entries.posA(), entries.posB()]));
    await waitFor(() => expect(within(round(1)).queryAllByText('Đang viết, mở khi vòng đóng')).toHaveLength(0));
    expect(within(round(1)).getByText('So sánh theo 3 trục: loại tác vụ, cách gán nhãn, khả năng tái lập')).toBeTruthy();
    expect(within(round(1)).getByText(/Ma trận theo benchmark công bố/)).toBeTruthy();
    expect(within(round(1)).getByText(/Phân loại theo cơ chế đo/)).toBeTruthy();
    unmountAll();
  });

  it('ba cột theo vòng (UX-MONITOR-006-AC01, EC04)', async () => {
    resetDeliberationMock(scenarios.completed());
    const { unmountAll } = await openTab();
    const head = document.querySelector('.dl-board__head')!;
    expect([...head.querySelectorAll('.dl-party__name')].map((n) => n.textContent)).toEqual(['Orchestrator', 'Analysis Agent A', 'Analysis Agent B']);
    expect(within(cellOf(round(1), 'Orchestrator')).getByText(/So sánh theo 3 trục/)).toBeTruthy();
    expect(within(cellOf(round(1), 'Analysis Agent B')).getByText(/Phân loại theo cơ chế đo/)).toBeTruthy();
    expect(typesIn(cellOf(round(2), 'Analysis Agent B'))).toEqual(['Phản biện · critique']);
    const synthesis = screen.getByRole('region', { name: 'Bản tổng hợp' });
    const disagreement = within(synthesis).getByText('Trục chính của bảng so sánh').closest('li')!;
    expect(textOf(disagreement)).toBe(
      'Trục chính của bảng so sánh — Orchestrator: ba trục tác vụ, gán nhãn, tái lập · Analysis Agent A: benchmark kèm trục cơ chế đo · Analysis Agent B: chỉ theo cơ chế đo',
    );
    unmountAll();
  });

  it('vòng 2 đang mở (EC03)', async () => {
    resetDeliberationMock(scenarios.round2());
    const { unmountAll } = await openTab();
    expect(within(round(1)).getAllByText(/^Độ tin cậy/)).toHaveLength(3);
    expect(within(round(2)).getAllByText('Đang viết, mở khi vòng đóng')).toHaveLength(3);
    expect(textOf(screen.getByRole('heading', { level: 2 }))).toContain('Vòng 2/3');
    unmountAll();
  });

  it('nối điểm bị phản biện (EC05)', async () => {
    resetDeliberationMock(scenarios.completed());
    const { user, unmountAll } = await openTab();
    const critique = cellOf(round(2), 'Orchestrator');
    expect(within(critique).getByText('Phản đối')).toBeTruthy();
    const link = within(critique).getByRole('link', { name: 'Tới điểm Analysis Agent A A2' });
    await user.click(link);
    const target = document.getElementById(pointAnchor(entries.posA().id, 'A2'))!;
    expect(document.activeElement).toBe(target);
    // The target counts its critiques and links back.
    expect(textOf(target)).toContain('1 phản biện: O·OC1');
    target.querySelector('a')!.focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(document.getElementById(pointAnchor(entries.critO().id, 'OC1')));
    unmountAll();
  });

  it('nhãn giả định và nguồn (EC06)', async () => {
    resetDeliberationMock(scenarios.round2());
    const { unmountAll } = await openTab();
    const a2 = document.getElementById(pointAnchor(entries.posA().id, 'A2'))!;
    expect(within(a2).getByText('Giả định')).toBeTruthy();
    expect(within(a2).queryByText('Nguồn:', { exact: false })).toBeNull();
    const o1 = document.getElementById(pointAnchor(entries.posO().id, 'O1'))!;
    const sources = o1.querySelector('.dl-sources')!;
    expect(textOf(sources)).toMatch(/^Nguồn: Evidence …0009, Evidence …0012$/);
    expect(within(sources as HTMLElement).getAllByRole('link')[0]!.getAttribute('href')).toBe(`/projects/${PROJECT_ID}/evidence?evidence=${id('evidence', 9)}`);
    unmountAll();
  });

  it('đổi lập trường (EC07)', async () => {
    resetDeliberationMock(scenarios.completed());
    const { unmountAll } = await openTab();
    const changed = within(cellOf(round(2), 'Analysis Agent A')).getByText('Ma trận benchmark kèm trục cơ chế đo').closest('.dl-entry')!;
    expect(within(changed as HTMLElement).getByText('Đổi lập trường')).toBeTruthy();
    expect(textOf(changed)).toContain('Lý do: B1 và E-14');
    const old = within(cellOf(round(1), 'Analysis Agent A')).getByText(/^Đã thay — Ma trận theo benchmark công bố/).closest('details')!;
    expect(old.open).toBe(false);
    unmountAll();
  });

  it('rút lại và cần xem lại (EC08)', async () => {
    const detail = scenarios.completed();
    const retraction: Schemas['DeliberationEntry'] = { ...entries.critB(), id: id('message', 399), type: 'retraction', content: { targetEntryId: entries.posB().id, reason: 'E-14 chỉ nói về một benchmark.' } };
    detail.entries = detail.entries.map((e) => (e.id === entries.posB().id ? { ...e, status: 'retracted' as const } : e.id === entries.critA().id ? { ...e, needsReview: true } : e));
    detail.entries.push(retraction);
    resetDeliberationMock(detail);
    const { unmountAll } = await openTab();
    const posB = within(cellOf(round(1), 'Analysis Agent B')).getByText(/Phân loại theo cơ chế đo/).closest('.dl-entry')!;
    expect(within(posB as HTMLElement).getByText('Đã rút lại')).toBeTruthy();
    expect(textOf(posB)).toContain('Lý do rút lại: E-14 chỉ nói về một benchmark.');
    const critA = within(cellOf(round(2), 'Analysis Agent A')).getByText('Bổ sung thông tin').closest('.dl-entry')!;
    expect(within(critA as HTMLElement).getByText('Cần xem lại')).toBeTruthy();
    unmountAll();
  });

  it('không có lập trường (EC09)', async () => {
    resetDeliberationMock(scenarios.failed());
    const { unmountAll } = await openTab();
    const cell = cellOf(round(1), 'Analysis Agent B');
    expect(within(cell).getByText('Không có lập trường')).toBeTruthy();
    // The party's Agent Run failed: error style, a note, the Agent Run route of the monitoring area (EC13).
    const failed = within(cell).getByRole('note');
    expect(failed.hasAttribute('data-failed')).toBe(true);
    expect(textOf(failed)).toContain('của bên này lỗi');
    expect(within(failed).getByRole('link', { name: /^Xem Agent Run / }).getAttribute('href')).toBe(`/projects/${PROJECT_ID}/activity/agent-runs/${id('agentRun', 812)}`);
    unmountAll();
  });

  it('ô đang viết có chấm chạy; trạng thái bên là chip; ô theo nhóm của bên (EC02, EC13)', async () => {
    resetDeliberationMock(scenarios.round2());
    const { unmountAll } = await openTab();
    const pending = within(round(2)).getAllByText('Đang viết, mở khi vòng đóng');
    expect(pending.every((el) => el.hasAttribute('data-running'))).toBe(true);
    const chips = [...document.querySelectorAll('.dl-board__head .dl-party__status')];
    expect(chips.map((c) => [c.className, c.getAttribute('data-tone'), c.hasAttribute('data-running'), textOf(c)])).toEqual([
      ['sires-chip dl-party__status', 'running', true, 'Đang chạy'],
      ['sires-chip dl-party__status', 'running', true, 'Đang chạy'],
      ['sires-chip dl-party__status', 'running', true, 'Đang chạy'],
    ]);
    expect(within(round(1)).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Orchestrator', 'Analysis Agent A', 'Analysis Agent B']);
    unmountAll();
  });

  it('entry của vòng đang mở trong dữ liệu không hiện, không được đếm (DEC-47)', async () => {
    const detail = scenarios.round2();
    // Round 2 is open; a critique of it in the data must not show, nor count on its target.
    detail.entries = [...detail.entries, entries.critO()];
    resetDeliberationMock(detail);
    const { unmountAll } = await openTab();
    expect(within(round(2)).getAllByText('Đang viết, mở khi vòng đóng')).toHaveLength(3);
    expect(typesIn(round(2))).toEqual([]);
    const target = document.getElementById(pointAnchor(entries.posA().id, 'A2'))!;
    expect(textOf(target)).not.toContain('phản biện');
    unmountAll();
  });

  it('vòng hẹp (EC10)', async () => {
    const detail = scenarios.completed();
    detail.rounds.splice(2, 0, { round: 3, kind: 'narrow', focus: 'Trục chính của bảng so sánh', closed: true, closedAt: '2026-11-27T10:20:00Z' });
    resetDeliberationMock(detail);
    const { unmountAll } = await openTab();
    expect(screen.getByRole('region', { name: /^Vòng 3 — vòng hẹp — Trục chính của bảng so sánh/ })).toBeTruthy();
    unmountAll();
  });

  it('vòng đóng theo SSE (EC19)', async () => {
    resetDeliberationMock(scenarios.round2());
    let reads = 0;
    mock.server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith(`/deliberations/${DELIBERATION_ID}`)) reads += 1;
    });
    const { services, unmountAll } = await openTab();
    await waitForStream(services, mock);
    act(() => closeRound(DELIBERATION_ID, [entries.critO(), entries.critA(), entries.critB()]));
    await waitFor(() => expect(typesIn(round(2)).filter((x) => x.startsWith('Phản biện'))).toHaveLength(3));
    const after = reads;
    // The same event again reads the same data: nothing changes.
    act(() => {
      mock.events.emit({ type: 'deliberation.round_closed', projectId: PROJECT_ID, objectType: 'deliberation', objectId: DELIBERATION_ID });
    });
    await waitFor(() => expect(reads).toBe(after + 1));
    expect(typesIn(round(2)).filter((x) => x.startsWith('Phản biện'))).toHaveLength(3);
    mock.server.events.removeAllListeners();
    unmountAll();
  });
});

describe('Tổng hợp và trạng thái (PID-00083 S03)', () => {
  const mock = useDeliberationMock();

  it('cảnh báo cùng model (EC11)', async () => {
    resetDeliberationMock(scenarios.round2());
    const { unmountAll } = await openTab();
    const note = screen.getAllByRole('note')[0]!;
    expect(textOf(note)).toBe('Hai Analysis Agent dùng cùng model. A và B cùng chạy gpt-5 trên “OpenAI cá nhân”, nên dễ sai giống nhau. Đổi trong Agent Models');
    expect(within(note).getByRole('link', { name: 'Đổi trong Agent Models' }).getAttribute('href')).toBe('/settings/agents');
    unmountAll();
  });

  it('snapshot lỗi thời (EC12)', async () => {
    const detail = scenarios.completed();
    detail.snapshotOutdated = true;
    detail.contextSnapshot = { ...detail.contextSnapshot, outdated: true, changedEntities: [{ type: 'reference', id: id('reference', 15), newVersion: 2 }] };
    resetDeliberationMock(detail);
    const { unmountAll } = await openTab();
    expect(screen.getByText('Context Snapshot lỗi thời.').closest('[role="note"]')!.textContent).toContain('reference lên v2');
    unmountAll();
  });

  it('phiên lỗi (EC13)', async () => {
    resetDeliberationMock(scenarios.failed());
    mock.use({
      overrides: {
        getPrompt: () => ({
          status: 200,
          body: prompt(DECISION_PROMPT_ID, {
            question: 'Phiên thảo luận dl-3c1 Failed: chỉ còn lập trường của Analysis Agent A. Tiếp tục bước 4 thế nào?',
            choices: [
              { id: 'rerun', label: 'Chạy lại phiên' },
              { id: 'continue', label: 'Tiếp tục không thảo luận' },
            ],
          }),
        }),
      },
    });
    const { unmountAll } = await openTab();
    expect(screen.getByText('Failed', { selector: '.sires-chip' })).toBeTruthy();
    expect(textOf(document.querySelectorAll('.dl-party__status')[2])).toBe('Lỗi');
    expect(await screen.findByText(/Tiếp tục bước 4 thế nào\?/)).toBeTruthy();
    expect(screen.getByText('Chạy lại phiên')).toBeTruthy();
    expect(screen.getByText('Cũng trả lời được trong Project AI Chat.')).toBeTruthy();
    unmountAll();
  });

  it('phiên hủy (EC14)', async () => {
    resetDeliberationMock(scenarios.cancelled());
    const { unmountAll } = await openTab();
    expect(screen.getByText(/^Phiên Cancelled trước khi tổng hợp: không có bản tổng hợp, Deliberation Record hay prompt chọn phương án/)).toBeTruthy();
    expect(within(round(1)).getAllByText(/^Độ tin cậy/)).toHaveLength(3);
    expect(screen.queryByRole('region', { name: 'Bản tổng hợp' })).toBeNull();
    unmountAll();
  });

  it('bạn đã chọn (EC15)', async () => {
    const detail = scenarios.completed();
    resetDeliberationMock(detail);
    let current = prompt(DECISION_PROMPT_ID, {});
    mock.use({
      overrides: {
        getPrompt: () => ({ status: 200, body: current }),
        answerPrompt: async ({ request }) => {
          const body = (await request.json()) as { choiceIds: string[] };
          current = { ...current, status: 'Answered', response: { ...body, respondedBy: { type: 'researcher', accountId: ACCOUNT_ID }, respondedAt: '2026-11-27T10:31:00Z' } };
          return { status: 200, body: current };
        },
      },
    });
    const { user, services, unmountAll } = await openTab();
    await screen.findByText('Chọn phương án cho bảng so sánh?');
    await user.click(screen.getByRole('radio', { name: /A — benchmark kèm cơ chế đo/ }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    const chosen = (await screen.findByText('Bạn đã chọn')).closest('.dl-chosen')!;
    const lines = [...chosen.querySelectorAll('p')].map((p) => textOf(p));
    expect(lines[0]).toBe('Bạn đã chọn');
    expect(lines[1]).toBe('A — benchmark kèm cơ chế đo');
    expect(lines[2]).toMatch(/^Bạn · \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    unmountAll();

    // Answered elsewhere (Chat): prompt.status_changed updates the tab at once.
    current = prompt(DECISION_PROMPT_ID, {});
    const again = await openTab();
    await screen.findByText('Chọn phương án cho bảng so sánh?');
    await waitForStream(again.services, mock);
    current = { ...current, status: 'Answered', response: { choiceIds: ['opt-o'], respondedBy: { type: 'researcher', accountId: ACCOUNT_ID }, respondedAt: '2026-11-27T10:40:00Z' } };
    act(() => {
      mock.events.emit({ type: 'prompt.status_changed', projectId: PROJECT_ID, objectType: 'interactive_agent_prompt', objectId: DECISION_PROMPT_ID, fromState: 'Open', toState: 'Answered' });
    });
    expect(await screen.findByText('Orchestrator — ba trục', { selector: '.dl-chosen p' })).toBeTruthy();
    again.unmountAll();
    void services;
  });

  it('prompt quyết định Expired, Cancelled: không ai chọn, không tính là đồng ý (EC15)', async () => {
    for (const status of ['Expired', 'Cancelled'] as const) {
      resetDeliberationMock(scenarios.completed());
      mock.use({ overrides: { getPrompt: () => ({ status: 200, body: prompt(DECISION_PROMPT_ID, { status, statusReason: 'Workflow đã dừng.' }) }) } });
      const view = await openTab();
      const decision = await screen.findByRole('region', { name: 'Quyết định sau thảo luận' });
      await waitFor(() => expect(textOf(decision)).toContain('Không được tính là đồng ý'));
      expect(textOf(decision)).toContain('Workflow đã dừng.');
      expect(within(decision).queryByText('Bạn đã chọn')).toBeNull();
      expect(decision.querySelector('.dl-chosen')).toBeNull();
      expect(within(decision).queryAllByRole('button')).toEqual([]);
      view.unmountAll();
      mock.server.resetHandlers();
    }
  });

  it('rút lại, snapshot lỗi thời qua SSE; objectId là mã entry (EC08, EC12)', async () => {
    resetDeliberationMock(scenarios.completed());
    const { services, unmountAll } = await openTab();
    await waitForStream(services, mock);
    act(() => retractEntry(DELIBERATION_ID, entries.posB().id, 'E-14 chỉ nói về một benchmark.'));
    const posB = () => within(cellOf(round(1), 'Analysis Agent B')).getByText(/Phân loại theo cơ chế đo/).closest('.dl-entry')!;
    await waitFor(() => expect(within(posB() as HTMLElement).getByText('Đã rút lại')).toBeTruthy());
    act(() => markSnapshotOutdated(DELIBERATION_ID, [{ type: 'reference', id: id('reference', 15), newVersion: 2 }]));
    expect((await screen.findByText('Context Snapshot lỗi thời.')).closest('[role="note"]')!.textContent).toContain('reference lên v2');
    // An event naming one of the session's entries also reads the session again.
    let reads = 0;
    mock.server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith(`/deliberations/${DELIBERATION_ID}`)) reads += 1;
    });
    act(() => mock.events.emit({ type: 'deliberation.entry_retracted', projectId: PROJECT_ID, objectType: 'deliberation_entry', objectId: entries.critA().id }));
    await waitFor(() => expect(reads).toBe(1));
    mock.server.events.removeAllListeners();
    unmountAll();
  });

  it('usage của phiên (EC16)', async () => {
    resetDeliberationMock(scenarios.failed());
    const { unmountAll } = await openTab();
    const usage = screen.getByRole('region', { name: 'Usage của phiên' });
    const rows = within(usage).getAllByRole('row').map((row) => [...row.children].map((c) => textOf(c)).join(' '));
    expect(rows[0]).toBe('Bên Agent Run Token in Token out Chi phí (ước tính)');
    expect(rows[3]).toMatch(/^Analysis Agent B 1 0 0 /);
    expect(rows[4]).toMatch(/^Tổng phiên 3 13[.\s ]?500 2[.\s ]?750 /);
    expect(textOf(usage)).toContain('1 Agent Run không có dữ liệu usage, tính 0.');
    unmountAll();
  });
});

describe('Nhãn, thiếu cấu hình, Agent List (PID-00083 S04)', () => {
  const mock = useDeliberationMock();

  it('thiếu cấu hình (EC17)', async () => {
    resetDeliberationMock();
    deliberationState().length = 0;
    const proposalId = id('prompt', 44);
    mock.use({
      overrides: {
        getPrompt: () => ({
          status: 200,
          body: prompt(proposalId, {
            purpose: 'deliberation_proposal',
            question: 'Mở phiên thảo luận cho vấn đề này?',
            choices: [
              { id: 'deliberate', label: 'Cấu hình lại rồi thảo luận' },
              { id: 'skip', label: 'Tiếp tục không thảo luận' },
            ],
            deliberationProposal: {
              problem: 'Chọn khung so sánh',
              problemType: 'methodology',
              reason: 'Analysis Agent B chưa có kết nối hợp lệ, nên chưa mở được phiên.',
              participants: [],
              estimatedAgentRuns: 7,
              maxRounds: 2,
              sameModelWarning: false,
            },
          }),
        }),
      },
    });
    const { unmountAll } = renderWorkflow(workflow(proposalId));
    expect(await screen.findByRole('heading', { name: 'Chưa mở phiên' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Thảo luận' })).toBeTruthy();
    expect(screen.getByText('Analysis Agent B chưa có kết nối hợp lệ, nên chưa mở được phiên.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở Settings → Agent Models' }).getAttribute('href')).toBe('/settings/agents');
    expect(screen.getByText('Cấu hình lại rồi thảo luận')).toBeTruthy();
    unmountAll();
  });

  it('nhãn qua và không qua thảo luận (EC18)', async () => {
    resetDeliberationMock(scenarios.completed());
    mock.use({ overrides: { getPrompt: () => ({ status: 200, body: prompt(DECISION_PROMPT_ID, { status: 'Answered', response: { choiceIds: ['opt-a'] } }) }) } });
    const first = await openTab();
    const label = document.querySelector('.dl-label[data-status="deliberated"]')!;
    expect(textOf(label)).toBe('Qua thảo luận · Deliberation Record');
    expect(within(label as HTMLElement).getByRole('link').getAttribute('href')).toBe(`/projects/${PROJECT_ID}/artifacts?version=${RECORD_VERSION_ID}`);
    first.unmountAll();

    // Skipped: an older session of the workflow and the proposal answered “skip”.
    const proposalId = id('prompt', 45);
    resetDeliberationMock({ ...scenarios.cancelled(), id: OLDER_DELIBERATION_ID });
    mock.use({
      overrides: {
        getPrompt: ({ params }) => ({
          status: 200,
          body: prompt(params.promptId, { purpose: 'deliberation_proposal', status: 'Answered', response: { choiceIds: ['skip'] }, choices: [{ id: 'deliberate', label: 'Thảo luận' }, { id: 'skip', label: 'Bỏ qua' }] }),
        }),
      },
    });
    const second = await openTab('', workflow(proposalId));
    expect(within(document.querySelector('.dl-tab') as HTMLElement).getByText('Không qua thảo luận')).toBeTruthy();
    second.unmountAll();
  });

  it('cạnh bước: Xem thảo luận và nhãn (S01, EC18)', async () => {
    resetDeliberationMock(scenarios.completed());
    mock.use({ overrides: { getPrompt: () => ({ status: 200, body: prompt(DECISION_PROMPT_ID, { status: 'Answered', response: { choiceIds: ['opt-a'] } }) }) } });
    const first = await openTab('', workflow(undefined, DELIBERATION_ID));
    const steps = screen.getByRole('list', { name: 'Các bước' });
    const step4 = within(steps).getAllByRole('listitem')[3]!;
    expect(within(step4).getByRole('link', { name: 'Xem thảo luận' }).getAttribute('href')).toBe(
      `/projects/${PROJECT_ID}/activity/workflows/${WORKFLOW_ID}?view=deliberation&deliberation=${DELIBERATION_ID}`,
    );
    expect(within(step4).getByText('Qua thảo luận')).toBeTruthy();
    expect(within(steps).getAllByRole('link')).toHaveLength(1);
    first.unmountAll();

    // Skipped: the step of the proposal answered “skip” carries “Không qua thảo luận”.
    const proposalId = id('prompt', 45);
    resetDeliberationMock({ ...scenarios.cancelled(), id: OLDER_DELIBERATION_ID });
    mock.use({
      overrides: {
        getPrompt: ({ params }) => ({
          status: 200,
          body: prompt(params.promptId, { purpose: 'deliberation_proposal', status: 'Answered', response: { choiceIds: ['skip'] }, choices: [{ id: 'deliberate', label: 'Thảo luận' }, { id: 'skip', label: 'Bỏ qua' }] }),
        }),
      },
    });
    const second = await openTab('', workflow(proposalId));
    const skippedStep = within(screen.getByRole('list', { name: 'Các bước' })).getAllByRole('listitem')[3]!;
    expect(within(skippedStep).getByText('Không qua thảo luận')).toBeTruthy();
    second.unmountAll();
  });

  it('danh sách phiên lỗi: tab hiện lỗi và Thử lại; đọc hết các trang (EC23)', async () => {
    resetDeliberationMock(scenarios.round2());
    mock.use({ overrides: { listDeliberations: () => new Response(JSON.stringify({ type: 'x', title: 'x', status: 500, code: 'internal_error' }), { status: 500, headers: { 'content-type': 'application/problem+json' } }) } });
    const first = renderWorkflow(workflow());
    expect(await screen.findByText('Chưa tải được phiên thảo luận')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Thảo luận' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Thử lại/ })).toBeTruthy();
    first.unmountAll();

    // Two pages: both sessions are in the picker; the page and the tab share one read.
    mock.server.resetHandlers();
    const older = { ...scenarios.completed(), id: OLDER_DELIBERATION_ID, startedAt: '2026-11-26T08:00:00Z' };
    resetDeliberationMock(older, scenarios.round2());
    const pages: string[] = [];
    mock.use({
      overrides: {
        listDeliberations: ({ query }) => {
          pages.push(String(query.cursor ?? 'first'));
          const [newest, oldest] = [scenarios.round2(), older];
          return query.cursor
            ? { status: 200, body: { items: [oldest], nextCursor: null } }
            : { status: 200, body: { items: [newest], nextCursor: 'page-2' } };
        },
      },
    });
    const second = await openTab();
    const picker = screen.getByRole('combobox', { name: 'Phiên' }) as HTMLSelectElement;
    expect(within(picker).getAllByRole('option')).toHaveLength(2);
    expect(pages).toEqual(['first', 'page-2']);
    second.unmountAll();
  });

  it('chuỗi của PID ở file riêng; file i18n của khu vực không chứa chuỗi của PID (S01)', () => {
    expect(Object.keys(deliberationMessages.vi).sort()).toEqual(Object.keys(deliberationMessages.en).sort());
    expect(Object.keys(deliberationMessages.vi).every((key) => key.startsWith('deliberation.'))).toBe(true);
    // The area's files belong to PID-00059 (merged with this PID): none of this PID's keys there, so no override.
    expect(Object.keys(viArea).filter((key) => key.startsWith('deliberation.'))).toEqual([]);
    expect(Object.keys(enArea).filter((key) => key.startsWith('deliberation.'))).toEqual([]);
    expect(viArea.title).toBe('Hoạt động');
    expect(enArea.title).toBe('Activity');
  });

  it('agent list trong phiên (EC21)', () => {
    const step = () => ({ current: 4, total: 5 });
    const running = deliberationAgentStates([scenarios.round2() as Detail], { stepOf: step });
    expect(running).toEqual({
      orchestrator: { state: 'running', deliberationId: DELIBERATION_ID, step: { current: 4, total: 5 }, round: 2 },
      'analysis:A': { state: 'running', deliberationId: DELIBERATION_ID, step: { current: 4, total: 5 }, round: 2 },
      'analysis:B': { state: 'running', deliberationId: DELIBERATION_ID, step: { current: 4, total: 5 }, round: 2 },
    });
    // Synthesis: only the Orchestrator still runs.
    const synthesis = scenarios.round2();
    synthesis.participants = synthesis.participants.map((p) => ({ ...p, status: p.agent === 'orchestrator' ? 'running' : 'idle' }));
    expect(Object.keys(deliberationAgentStates([synthesis], { stepOf: step }))).toEqual(['orchestrator']);
    // Failed with its decision prompt Open: B in error, the Orchestrator waits for you.
    const failed = deliberationAgentStates([scenarios.failed()], { stepOf: step, openDecisionPromptIds: new Set([DECISION_PROMPT_ID]) });
    expect(failed['analysis:B']?.state).toBe('error');
    expect(failed.orchestrator?.state).toBe('waiting');
    expect(failed['analysis:A']).toBeUndefined();
    expect(i18next.t('deliberation.agentNote', { ns: 'monitoring', current: 4, total: 5, round: 2 })).toBe('thảo luận bước 4/5 · Vòng 2');
    // The note of each state, as the Agent List shows it (AgentList.dc.html).
    const note = (state: Parameters<typeof DeliberationAgentNote>[0]['state']) => {
      const view = render(<DeliberationAgentNote state={state} />);
      const text = textOf(view.container);
      view.unmount();
      return text;
    };
    expect(note(running.orchestrator!)).toBe('thảo luận bước 4/5 · Vòng 2');
    expect(note(failed.orchestrator!)).toBe('bước 4/5 · chờ bạn chọn chạy lại phiên hoặc tiếp tục');
    expect(note(failed['analysis:B']!)).toBe('Vòng 1 · lỗi');
    expect(note({ ...running.orchestrator!, step: undefined })).toBe('thảo luận · Vòng 2');
  });
});
