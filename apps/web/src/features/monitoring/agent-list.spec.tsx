// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00059 S05: Agent List (design.md §3, §4; EC30–EC32) and the deliberation note of PID-00083 on its rows.

import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { changeLanguage } from '../../shell';
import { ACCOUNT_ID, id } from '../../shell/mock';
import { useMockServer } from '../../shell/mock/node';
import { resetMonitoringMockState } from './__mocks__';
import { resetDeliberationMock, scenarios } from './__mocks__/deliberation';
import { P, page, renderMonitoring, step, textOf, workflow, type Workflow } from './test-helpers';
import { feature } from '.';

const mock = useMockServer({ features: [feature] });
beforeEach(() => {
  resetMonitoringMockState();
  resetDeliberationMock(scenarios.round1());
});
afterEach(async () => {
  await changeLanguage('vi');
});

const meta = (n: number) => ({ accountId: ACCOUNT_ID, createdAt: '2026-11-01T00:00:00Z', createdBy: { type: 'researcher' as const }, rowVersion: 1, id: id('connection', n) });
const connection = (n: number, name: string, testStatus: 'Valid' | 'Invalid', code?: string) =>
  ({ ...meta(n), name, provider: 'openai', baseUrl: 'https://api.example/v1', keyHint: 'abcd', testStatus, ...(code ? { lastError: { code, message: 'x' } } : {}) }) as never;
const assignment = (n: number, agent: string, connectionN: number) => ({ ...meta(n), id: id('connection', 500 + n), agent, providerConnectionId: id('connection', connectionN), model: 'gpt-4.1-mini' }) as never;

/** The project's active workflows, each with its current step (EC30). */
function scene(): Workflow[] {
  const at = (n: number, status: Workflow['status'], agent: Parameters<typeof step>[2], stepStatus: Parameters<typeof step>[3], extra: Parameters<typeof step>[4] = {}) => {
    const wf = workflow(n, status, [step(n, 1, 'discovery', 'Succeeded'), step(n, 2, agent, stepStatus, extra)]);
    return { ...wf, currentStepId: wf.steps![1]!.id };
  };
  return [
    at(120, 'Waiting for User', 'synthesis', 'Waiting for User', { openPromptId: id('prompt', 120) }),
    at(121, 'Running', 'synthesis', 'Running'),
    at(122, 'Running', 'evidence_retrieval', 'Running'),
    at(123, 'Interrupted', 'discovery', 'Failed'),
    at(124, 'Running', 'discovery', 'Running'),
    at(125, 'Running', 'writing', 'Failed'),
  ];
}
function serve(workflows: Workflow[], connections: never[] = [connection(1, 'OpenAI cá nhân', 'Valid')], assignments: never[] = [assignment(1, 'default', 1)], deliberations = false) {
  mock.use({
    overrides: {
      listWorkflows: ({ request }) => page(workflows.filter((w) => new URL(request.url).searchParams.getAll('status').includes(w.status))),
      listProviderConnections: () => page(connections),
      listAgentModelAssignments: () => page(assignments),
      ...(deliberations ? {} : { listDeliberations: () => page([]) }),
    },
  });
}
const list = async () => {
  const view = await renderMonitoring(`/projects/${P}/activity`);
  const region = await screen.findByRole('region', { name: 'Agents' });
  await within(region).findByRole('list');
  return { ...view, region };
};
const row = (key: string) => document.querySelector(`li[data-agent="${key}"]`) as HTMLElement;

describe('Agent List (S05)', () => {
  it('trạng thái theo việc khẩn nhất (EC30)', async () => {
    serve(scene());
    const { region } = await list();
    const rows = within(region).getAllByRole('listitem');
    expect(rows.map((li) => li.getAttribute('data-agent'))).toEqual([
      'orchestrator', 'discovery', 'reference_processing', 'evidence_retrieval', 'synthesis', 'writing', 'verification', 'diagram', 'analysis:A', 'analysis:B',
    ]);
    // Needs you beats Running (synthesis), Interrupted beats Running (discovery).
    expect(within(row('synthesis')).getByText('Chờ bạn')).toBeTruthy();
    expect(within(row('discovery')).getByText('Gián đoạn')).toBeTruthy();
    expect(within(row('evidence_retrieval')).getByText('Đang chạy')).toBeTruthy();
    expect(within(row('writing')).getByText('Lỗi')).toBeTruthy();
    for (const key of ['orchestrator', 'reference_processing', 'verification', 'diagram', 'analysis:A', 'analysis:B']) expect(within(row(key)).getByText('Đang rảnh')).toBeTruthy();
    expect(within(region).getByText('1 đang chạy, 1 chờ bạn, 1 lỗi, 1 gián đoạn, 6 đang rảnh')).toBeTruthy();
    // A row that is not idle links to its Task and says the step.
    const link = within(row('synthesis')).getByRole('link');
    expect(link.getAttribute('href')).toBe(`/projects/${P}/activity/workflows/${id('workflow', 120)}`);
    expect(textOf(row('synthesis'))).toContain('· bước 2/2');
    expect(within(row('diagram')).queryByRole('link')).toBeNull();
  });

  it('kết nối Invalid (EC31)', async () => {
    serve([], [connection(1, 'OpenAI cá nhân', 'Valid'), connection(3, 'Google AI cá nhân', 'Invalid', 'auth_failed')], [assignment(1, 'default', 1), assignment(2, 'verification', 3)]);
    await list();
    expect(within(row('verification')).getByText('Lỗi')).toBeTruthy();
    expect(textOf(row('verification'))).toContain('Kết nối Google AI cá nhân bị từ chối (auth_failed).');
    expect(within(row('verification')).getByRole('link', { name: 'Provider Connections' }).getAttribute('href')).toBe('/settings/providers');
    expect(within(row('discovery')).getByText('Đang rảnh')).toBeTruthy();
  });

  it('nhãn theo ngôn ngữ (EC32)', async () => {
    serve(scene());
    await list();
    await act(() => changeLanguage('en'));
    await waitFor(() => expect(within(row('synthesis')).getByText('Needs you')).toBeTruthy());
    expect(within(row('evidence_retrieval')).getByText('Running')).toBeTruthy();
    expect(within(row('discovery')).getByText('Interrupted')).toBeTruthy();
    expect(within(row('writing')).getByText('Error')).toBeTruthy();
    expect(within(row('diagram')).getByText('Idle')).toBeTruthy();
    expect(screen.getByText('1 running, 1 needs you, 1 error, 1 interrupted, 6 idle')).toBeTruthy();
  });

  it('trạng thái thảo luận của PID-00083 (YC1)', async () => {
    // wf-52d of the area mock runs the deliberation session dl-3c1 at step 4/5, round 1.
    resetMonitoringMockState();
    mock.use({ overrides: { listProviderConnections: () => page([connection(1, 'OpenAI cá nhân', 'Valid')]), listAgentModelAssignments: () => page([assignment(1, 'default', 1)]) } });
    await list();
    for (const key of ['orchestrator', 'analysis:A', 'analysis:B']) {
      await waitFor(() => expect(within(row(key)).getByText('Đang chạy')).toBeTruthy());
      expect(textOf(row(key))).toContain('thảo luận bước 4/5 · Vòng 1');
    }
  });
});
