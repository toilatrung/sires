// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00059 S04: Agent Run panel, debug, usage, Agent Run route (UX-MONITOR-003-AC01, AC02, NFR-USAGE-002-AC01 for the
// workflow, NFR-USAGE-003-AC01, NFR-USAGE-004-AC01; EC21–EC29).

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { id } from '../../shell/mock';
import { useMockServer } from '../../shell/mock/node';
import { resetMonitoringMockState } from './__mocks__';
import { P, agentRun, page, problem, renderMonitoring, step, textOf, workflow, type AgentRun, type Workflow } from './test-helpers';
import { feature } from '.';

const mock = useMockServer({ features: [feature] });
beforeEach(() => resetMonitoringMockState());

/** The sample key of NFR-SECRETS-001-AC01, built at run time so no key-shaped literal sits in the source. */
const SAMPLE_KEY = ['sk', 'test', 'KNOWN'].join('-');
const CONNECTION = id('connection', 7);
const vn = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

function serve(wf: Workflow, runs: AgentRun[], extra: Parameters<typeof mock.use>[0]['overrides'] = {}) {
  mock.use({
    overrides: {
      getWorkflow: ({ params }) => (params.workflowId === wf.id ? { status: 200, body: wf } : problem(404, 'not_found')),
      listAgentRuns: () => page(runs),
      getAgentRun: ({ params }) => {
        const run = runs.find((r) => r.id === params.agentRunId);
        return run ? { status: 200, body: run } : problem(404, 'not_found');
      },
      // A connection row as a careless backend might send it: the panel shows its name only.
      listProviderConnections: () =>
        page([{ id: CONNECTION, accountId: wf.accountId, createdAt: wf.createdAt, createdBy: { type: 'researcher' }, rowVersion: 1, name: 'OpenAI cá nhân', provider: 'openai', baseUrl: 'https://api.openai.example/v1', keyHint: 'NOWN', testStatus: 'Valid', apiKey: SAMPLE_KEY } as never]),
      ...extra,
    },
  });
}
const one = (run: Partial<AgentRun> = {}) => {
  const wf = workflow(110, 'Running', [step(110, 1, 'discovery', 'Succeeded'), step(110, 2, 'evidence_retrieval', 'Running')]);
  const runs = [agentRun(1101, 110, 1, 'discovery', 'Succeeded', { providerConnectionId: CONNECTION, ...run })];
  return { wf: { ...wf, steps: wf.steps!.map((s, i) => (i === 0 ? { ...s, agentRunIds: [runs[0]!.id] } : { ...s, agentRunIds: [] })) }, runs };
};
const openRun = async (wf: Workflow, runId: string) => {
  const view = await renderMonitoring(`/projects/${P}/activity/workflows/${wf.id}?view=steps&agentRun=${runId}`);
  const panel = (await screen.findByRole('heading', { level: 2, name: /ar-/ })).closest('section') as HTMLElement;
  return { ...view, panel };
};
const fact = (panel: HTMLElement, label: string) => within(panel).getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;

describe('Agent Run: chi tiết (S04)', () => {
  it('provider và model, không có key (UX-MONITOR-003-AC01, EC22)', async () => {
    const { wf, runs } = one({
      inputSummary: 'Tìm tài liệu về phương pháp đo hallucination',
      contextManifest: { entities: [{ type: 'reference', id: id('reference', 5), version: 2 }], evidenceIds: [], truncated: [{ layer: 'library', reason: 'vượt ngân sách context' }] },
      toolCalls: [{ name: 'search_scholar', argumentsSummary: 'hallucination 2019–2026', resultSummary: '18 kết quả' }],
      outputRefs: [{ type: 'reference', id: id('reference', 6) }],
      structuredOutput: { items: 18, source: 'Google Scholar' },
      attempts: 2,
    });
    serve(wf, runs);
    const { panel } = await openRun(wf, runs[0]!.id);
    expect(within(panel).getByText('Discovery Agent')).toBeTruthy();
    expect(textOf(fact(panel, 'Provider Connection'))).toBe('OpenAI cá nhân');
    expect(textOf(fact(panel, 'Model thực tế'))).toContain('gpt-4.1-mini');
    expect(textOf(fact(panel, 'Context đầu vào'))).toContain('Tìm tài liệu về phương pháp đo hallucination');
    expect(within(fact(panel, 'Context đầu vào')).getByRole('link', { name: /Reference re-.* · v2/ })).toBeTruthy();
    expect(textOf(fact(panel, 'Context đầu vào'))).toContain('Đã cắt lớp library');
    expect(textOf(fact(panel, 'Công cụ đã gọi'))).toContain('search_scholar');
    expect(textOf(fact(panel, 'Đầu ra'))).toContain('source');
    expect(textOf(fact(panel, 'Thời gian · thử'))).toContain('2 lần thử');
    expect(within(panel).getByText('Không hiển thị suy luận nội bộ của model và không hiển thị API key.')).toBeTruthy();
    // No key value and no key field anywhere on the page.
    await waitFor(() => expect(document.body.textContent).not.toContain(SAMPLE_KEY));
    expect(document.body.textContent).not.toContain('NOWN');
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByLabelText(/key/i)).toBeNull();
  });

  it('Analysis Agent theo instance (EC22)', async () => {
    const { wf, runs } = one({ agent: 'analysis', instance: 'B' });
    serve(wf, runs);
    const { panel } = await openRun(wf, runs[0]!.id);
    expect(within(panel).getByText('Analysis Agent B')).toBeTruthy();
  });

  it('debug (UX-MONITOR-003-AC02, EC23)', async () => {
    // Debug off: the manifest and structured output are there, a line says no transcript is kept.
    let setup = one({ hasDebugTranscript: false, structuredOutput: { items: 18 }, contextManifest: { entities: [{ type: 'reference', id: id('reference', 5) }] } });
    serve(setup.wf, setup.runs);
    let view = await openRun(setup.wf, setup.runs[0]!.id);
    expect(within(view.panel).getByText('Không lưu toàn văn (chế độ debug tắt).')).toBeTruthy();
    expect(within(fact(view.panel, 'Context đầu vào')).getByRole('link', { name: /^Reference re-/ })).toBeTruthy();
    expect(textOf(fact(view.panel, 'Đầu ra'))).toContain('items');
    expect(view.calls('GET', /debug-transcript/)).toHaveLength(0);
    view.unmountAll();

    // Debug on: collapsed with the deletion date; opening it reads the transcript.
    setup = one({ hasDebugTranscript: true, startedAt: '2026-11-27T09:37:00Z' });
    serve(setup.wf, setup.runs, {
      getAgentRunDebugTranscript: () => ({ status: 200, body: { agentRunId: setup.runs[0]!.id, capturedAt: '2026-11-27T09:37:00Z', expiresAt: '2026-12-27T09:37:00Z', request: { messages: [{ role: 'user', content: 'Tìm tài liệu' }] }, response: { content: 'Đã tìm 18 tài liệu' } } }),
    });
    view = await openRun(setup.wf, setup.runs[0]!.id);
    const summary = within(view.panel).getByText(/^Toàn văn prompt\/phản hồi \(debug\) · tự xóa 27\/12\/2026$/);
    expect(view.calls('GET', /debug-transcript/)).toHaveLength(0);
    await view.user.click(summary);
    expect(await within(view.panel).findByText(/Đã tìm 18 tài liệu/)).toBeTruthy();
    expect(view.calls('GET', `/agent-runs/${setup.runs[0]!.id}/debug-transcript`)).toHaveLength(1);
    view.unmountAll();

    // Expired: 404 says so.
    setup = one({ hasDebugTranscript: true });
    serve(setup.wf, setup.runs, { getAgentRunDebugTranscript: () => problem(404, 'not_found') });
    view = await openRun(setup.wf, setup.runs[0]!.id);
    await view.user.click(within(view.panel).getByText(/^Toàn văn prompt\/phản hồi \(debug\)/));
    expect(await within(view.panel).findByText('Toàn văn đã hết hạn hoặc không còn.')).toBeTruthy();
  });

  it('đang chạy, discarded (EC24)', async () => {
    const { wf, runs } = one({ status: 'Running', endedAt: undefined, inputSummary: '', contextManifest: {}, structuredOutput: {}, toolCalls: [], usage: { noData: true, inputTokens: null, outputTokens: null, calls: 0 } });
    serve(wf, runs);
    let view = await openRun(wf, runs[0]!.id);
    for (const label of ['Context đầu vào', 'Công cụ đã gọi', 'Đầu ra']) expect(textOf(fact(view.panel, label))).toBe('Đang chạy');
    expect(textOf(fact(view.panel, 'Thời gian · thử'))).toContain('Đang chạy');
    view.unmountAll();

    const late = one({ discarded: true });
    serve(late.wf, late.runs);
    view = await openRun(late.wf, late.runs[0]!.id);
    expect(within(view.panel).getByText('Kết quả đến muộn — đã bỏ')).toBeTruthy();
  });

  it('usage không có dữ liệu (EC25)', async () => {
    let setup = one({ usage: { noData: true, inputTokens: null, outputTokens: null, calls: 2 } });
    serve(setup.wf, setup.runs);
    let view = await openRun(setup.wf, setup.runs[0]!.id);
    expect(textOf(fact(view.panel, 'Usage'))).toBe('không có dữ liệu');
    view.unmountAll();
    setup = one({ usage: { noData: false, inputTokens: 1200, outputTokens: null, calls: 1 } });
    serve(setup.wf, setup.runs);
    view = await openRun(setup.wf, setup.runs[0]!.id);
    expect(textOf(fact(view.panel, 'Usage'))).toBe(`${vn(1200)} token in · — token out · 1 lời gọi`);
  });

  it('tổng usage khớp (NFR-USAGE-002-AC01, EC26)', async () => {
    const wf = workflow(111, 'Running', Array.from({ length: 10 }, (_, i) => step(111, i + 1, 'discovery', i < 9 ? 'Succeeded' : 'Running')));
    const runs = Array.from({ length: 10 }, (_, i) =>
      agentRun(1110 + i, 111, i + 1, 'discovery', i < 9 ? 'Succeeded' : 'Running', { usage: { noData: false, inputTokens: 1000 * (i + 1) + 37, outputTokens: 100 * (i + 1) + 3, calls: (i % 3) + 1 }, discarded: i === 4 }),
    );
    serve(wf, runs);
    await renderMonitoring(`/projects/${P}/activity/workflows/${wf.id}`);
    const line = await screen.findByTestId('workflow-usage');
    const input = runs.reduce((s, r) => s + (r.usage.inputTokens ?? 0), 0);
    const output = runs.reduce((s, r) => s + (r.usage.outputTokens ?? 0), 0);
    const calls = runs.reduce((s, r) => s + r.usage.calls, 0);
    // Exact sums of the 10 runs, the discarded one included (difference 0).
    expect(textOf(line)).toBe(`Usage của workflow (10 Agent Run): ${vn(input)} token in · ${vn(output)} token out · ${vn(calls)} lời gọi`);
  });

  it('chi phí ước tính (NFR-USAGE-003-AC01, EC27)', async () => {
    let setup = one({ usage: { noData: false, inputTokens: 14200, outputTokens: 2050, calls: 2 } });
    serve(setup.wf, setup.runs);
    let view = await openRun(setup.wf, setup.runs[0]!.id);
    expect(textOf(fact(view.panel, 'Usage'))).not.toMatch(/chi phí/);
    expect(textOf(screen.getByTestId('workflow-usage'))).not.toMatch(/chi phí/);
    view.unmountAll();
    setup = one({ usage: { noData: false, inputTokens: 14200, outputTokens: 2050, calls: 2, extra: { cost: 0.042, currency: 'USD' } } });
    serve(setup.wf, setup.runs);
    view = await openRun(setup.wf, setup.runs[0]!.id);
    expect(textOf(fact(view.panel, 'Usage'))).toContain('chi phí 0,042 USD (ước tính)');
    expect(textOf(screen.getByTestId('workflow-usage'))).toContain('chi phí 0,042 USD (ước tính)');
  });

  it('không cảnh báo ngân sách (NFR-USAGE-004-AC01, EC28)', async () => {
    const { wf, runs } = one({ usage: { noData: false, inputTokens: 9_800_000, outputTokens: 1_200_000, calls: 420, extra: { cost: 61.5, currency: 'USD' } } });
    serve(wf, runs);
    const { panel } = await openRun(wf, runs[0]!.id);
    expect(textOf(fact(panel, 'Usage'))).toContain(vn(9_800_000));
    expect(document.body.textContent).not.toMatch(/ngân sách|giới hạn|budget|vượt mức/i);
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(screen.getAllByRole('button').some((b) => /dừng|chặn/i.test(b.textContent ?? '') && !/Tạm dừng/.test(b.textContent ?? ''))).toBe(false);
  });

  it('không có Agent Run (EC21)', async () => {
    const created = workflow(112, 'Created', [step(112, 1, 'writing', 'Pending')]);
    serve(created, []);
    let view = await renderMonitoring(`/projects/${P}/activity/workflows/${created.id}`);
    expect(await screen.findByText('Chưa có Agent Run')).toBeTruthy();
    expect(screen.getByText('Workflow chưa chạy bước nào.')).toBeTruthy();
    view.unmountAll();
    const waiting = workflow(113, 'Waiting for User', [step(113, 1, 'synthesis', 'Waiting for User', { agentRunIds: [] })]);
    serve(waiting, []);
    view = await renderMonitoring(`/projects/${P}/activity/workflows/${waiting.id}`);
    expect(await screen.findByText('Bước đang chờ bạn trả lời trước khi agent chạy.')).toBeTruthy();
  });

  it('route Agent Run (EC29)', async () => {
    const { wf, runs } = one();
    serve(wf, runs);
    let view = await renderMonitoring(`/projects/${P}/activity/agent-runs/${runs[0]!.id}`);
    await waitFor(() => expect(view.router.state.location.pathname).toBe(`/projects/${P}/activity/workflows/${wf.id}`));
    expect(view.router.state.location.search).toBe(`?view=steps&agentRun=${runs[0]!.id}`);
    expect(await screen.findByRole('heading', { level: 2, name: /Discovery Agent/ })).toBeTruthy();
    view.unmountAll();

    view = await renderMonitoring(`/projects/${P}/activity/agent-runs/${id('agentRun', 9999)}`);
    expect(await screen.findByText('Không tìm thấy trang')).toBeTruthy();
  });
});
