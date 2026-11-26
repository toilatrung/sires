// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Test helpers of the monitoring area: the real shell on the PID-00013 mock, every request recorded so a test can check
// what was sent (and what was not); builders of workflows and Agent Runs; opening the event stream under jsdom.

import type { PublicApi } from '@sires/contracts';
import { waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import { ACCOUNT_ID, id, projectIds } from '../../shell/mock';
import { MOCK_ORIGIN, mockFetch, type MockServer } from '../../shell/mock/node';
import { renderShell, waitForFrame } from '../../shell/test/render';
import type { FetchStub } from '../../shell/test/stub';

type Schemas = PublicApi.components['schemas'];
export type Workflow = Schemas['Workflow'];
export type Step = Schemas['WorkflowStep'];
export type AgentRun = Schemas['AgentRun'];

export const P = projectIds.rag;

export interface SentRequest {
  method: string;
  /** Path under /api/v1, e.g. `/workflows`. */
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body?: string;
}

export async function renderMonitoring(path: string) {
  const sent: SentRequest[] = [];
  const fetch = (input: string, init: RequestInit = {}) => {
    const url = new URL(input, MOCK_ORIGIN);
    sent.push({
      method: (init.method ?? 'GET').toUpperCase(),
      path: url.pathname.replace(/^\/api\/v1/, ''),
      query: url.searchParams,
      headers: { ...((init.headers ?? {}) as Record<string, string>) },
      body: typeof init.body === 'string' ? init.body : undefined,
    });
    return mockFetch(input, init);
  };
  const view = renderShell({ path, stub: { fetch } as unknown as FetchStub });
  await waitForFrame();
  const calls = (method: string, p: string | RegExp) => sent.filter((r) => r.method === method && (typeof p === 'string' ? r.path === p : p.test(r.path)));
  /** Requests that write (every method but GET): opening a screen sends none (EC13). */
  const writes = () => sent.filter((r) => r.method !== 'GET');
  return { ...view, sent, calls, writes };
}

const OTHER_PROJECT = '00000000-0000-4000-8000-0000000000ff';

/** Under jsdom the intercepted GET /events resolves once the stream has a first record: prime it with an event of
 * another project until the client reports the stream open. */
export async function openStream(services: { events: { status: string } }, mock: MockServer): Promise<void> {
  await waitFor(() => {
    if (services.events.status !== 'open') {
      mock.events.emit({ type: 'task.status_changed', projectId: OTHER_PROJECT, objectType: 'task', objectId: OTHER_PROJECT, toState: 'Draft' });
    }
    expect(services.events.status).toBe('open');
  });
}

/** Problem Details answer for one-off overrides in `mock.use` (a Response keeps its body for any status). */
export function problem(status: number, code: string, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ type: `https://sires.example/problems/${code}`, title: code, status, code, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

const T0 = Date.UTC(2026, 10, 27, 9, 37, 0);
/** Fixed times of the reference screens (09:37 on 27/11/2026) plus minutes. */
export const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

export function step(workflow: number, order: number, agent: Schemas['AgentName'], status: Schemas['StepStatus'], extra: Partial<Step> = {}): Step {
  return {
    id: id('step', workflow * 10 + order),
    order,
    description: `Bước ${order} của wf ${workflow}`,
    assignedAgent: agent,
    status,
    attemptCount: status === 'Pending' ? 0 : 1,
    agentRunIds: status === 'Pending' ? [] : [id('agentRun', workflow * 10 + order)],
    ...extra,
  };
}

export function workflow(n: number, status: Workflow['status'], steps: Step[] = [], extra: Partial<Workflow> = {}): Workflow {
  return {
    id: id('workflow', n),
    accountId: ACCOUNT_ID,
    projectId: P,
    createdAt: at(0),
    createdBy: { type: 'researcher', accountId: ACCOUNT_ID },
    rowVersion: 1,
    idempotencyKey: `wf-test-${n}`,
    type: 'task_execution',
    taskId: id('task', 3),
    triggeredBy: { type: 'researcher', accountId: ACCOUNT_ID },
    status,
    steps,
    ...(status === 'Created' ? {} : { startedAt: at(0) }),
    ...(['Succeeded', 'Failed', 'Cancelled'].includes(status) ? { endedAt: at(30) } : {}),
    ...(steps.find((s) => s.status !== 'Succeeded' && s.status !== 'Pending') ? { currentStepId: steps.find((s) => s.status !== 'Succeeded' && s.status !== 'Pending')!.id } : {}),
    ...extra,
  };
}

export function agentRun(n: number, workflowN: number, order: number, agent: Schemas['AgentName'], status: AgentRun['status'], extra: Partial<AgentRun> = {}): AgentRun {
  return {
    id: id('agentRun', n),
    accountId: ACCOUNT_ID,
    projectId: P,
    createdAt: at(order * 3),
    createdBy: { type: 'agent', agent },
    rowVersion: 1,
    workflowId: id('workflow', workflowN),
    stepId: id('step', workflowN * 10 + order),
    agent,
    instance: null,
    providerConnectionId: id('connection', 1),
    provider: 'openai',
    model: 'gpt-4.1-mini',
    adapterVersion: '2026.11',
    inputSummary: `Đầu vào của bước ${order}`,
    contextManifest: { entities: [], evidenceIds: [] },
    structuredOutput: {},
    usage: { noData: false, inputTokens: 1000, outputTokens: 100, calls: 1 },
    status,
    attempts: 1,
    startedAt: at(order * 3),
    ...(status === 'Running' || status === 'Pending' ? {} : { endedAt: at(order * 3 + 2) }),
    discarded: false,
    hasDebugTranscript: false,
    ...extra,
  };
}

export const page = <T,>(items: T[], nextCursor: string | null = null) => ({ status: 200 as const, body: { items, nextCursor } });

/** Text of an element with whitespace folded. */
export const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
