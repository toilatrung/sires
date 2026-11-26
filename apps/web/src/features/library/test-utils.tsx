// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Test helpers of the library area (PID-00098): the real shell on a memory router, every request answered by the
// web mock (PID-00013) with the library store (__mocks__/store.ts). Operations of other areas that library screens
// call (getWorkflow, cancelWorkflow, listPrompts, answerPrompt) are answered here from the same store, so a test sees
// one consistent world; in dev they come from the generated samples (see agent/execution/PID-00098/report.md).

import { act, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { afterEach, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ShellProvider } from '../../shell/hooks';
import type { Overrides, Schemas } from '../../shell/mock';
import { mockFetch, useMockServer } from '../../shell/mock/node';
import { createRoutes } from '../../shell/routes';
import { createShellServices } from '../../shell/services';
import { testBrowser } from '../../shell/test/render';
import { feature } from '.';
import { libraryStore, type LibraryScenario } from './__mocks__/store';

type Prompt = Schemas['InteractiveAgentPrompt'];

/** Background steps of the mock (search, import, indexing) finish after this many ms in tests. */
export const FAST = 5;

/** The two author profiles of DISC-AUTHOR-001-AC01 (H11: profile choice through a `choice` prompt, temporary). */
export const authorProfiles = [
  { id: 'A5023888391', label: 'Nguyễn Văn An — Trường Đại học Ví dụ, NLP (42 công bố)', consequence: 'Tìm công bố của hồ sơ này.' },
  { id: 'A5100492011', label: 'Nguyễn Văn An — Viện Ví dụ, Hóa học (17 công bố)', consequence: 'Tìm công bố của hồ sơ này.' },
];

function profilePrompt(workflowId: string): Prompt {
  return {
    id: `5a000000-0000-4000-8000-${workflowId.slice(-12)}`, accountId: libraryStore.workflow(workflowId)?.accountId ?? '',
    createdAt: new Date().toISOString(), createdBy: { type: 'agent', agent: 'discovery', agentRunId: '7c000000-0000-4000-8000-000000000099' },
    rowVersion: 1, workflowId, createdByAgentRunId: '7c000000-0000-4000-8000-000000000099', agent: 'discovery',
    type: 'choice', purpose: 'general', blocking: true, question: 'Có hai hồ sơ tác giả cùng tên. Bạn muốn tìm công bố của hồ sơ nào?',
    pendingAction: { objectType: 'workflow', objectId: workflowId },
    choices: authorProfiles, multiSelect: false, status: 'Open',
  } as Prompt;
}

/** Other areas' operations, answered from the library store. */
const otherAreas: Overrides = {
  getWorkflow: ({ params }) => {
    const row = libraryStore.workflow(params.workflowId);
    return row ? { status: 200, body: structuredClone(row) } : { status: 404 };
  },
  cancelWorkflow: ({ params, emit }) => {
    const row = libraryStore.workflow(params.workflowId);
    if (!row || (row.status !== 'Running' && row.status !== 'Waiting for User')) return { status: 409 };
    libraryStore.finishWorkflow(row.id, 'Cancelled', emit);
    return { status: 200, body: structuredClone(libraryStore.workflow(row.id)!) };
  },
  listPrompts: ({ query }) => {
    const row = query.workflowId ? libraryStore.workflow(query.workflowId) : undefined;
    return { status: 200, body: { items: row?.status === 'Waiting for User' ? [profilePrompt(row.id)] : [], nextCursor: null } };
  },
  answerPrompt: ({ params, body, request, emit }) => {
    libraryStore.calls.push({ operationId: 'answerPrompt', body, headers: Object.fromEntries(request.headers) });
    const workflowId = findWorkflowOfPrompt(params.promptId);
    if (!workflowId) return { status: 404 };
    const prompt = profilePrompt(workflowId);
    libraryStore.resumeAuthorSearch(workflowId, emit);
    return { status: 200, body: { ...prompt, status: 'Answered' } as Prompt };
  },
};

const workflowsAsked = new Set<string>();
const findWorkflowOfPrompt = (promptId: string) => [...workflowsAsked].find((id) => profilePrompt(id).id === promptId);

/**
 * mockFetch that also sends FormData. In Vitest 4.1 + jsdom 31 a FormData holding a Blob or File cannot reach fetch
 * (Vitest's compat layer throws “Cannot read properties of undefined (reading '_buffer')” even for a direct fetch), so
 * the test transport writes the multipart body itself; the screen still builds the FormData and the mock still parses
 * it with request.formData(). Browsers send FormData as is (verified on dev:mock).
 */
async function testFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!(init?.body instanceof FormData)) return mockFetch(input, init);
  const boundary = `----sires-test-${Math.random().toString(16).slice(2)}`;
  const parts: Buffer[] = [];
  for (const [name, value] of init.body.entries()) {
    if (typeof value === 'string') {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    } else {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${value.name}"\r\nContent-Type: ${value.type || 'application/octet-stream'}\r\n\r\n`));
      parts.push(Buffer.from(await value.arrayBuffer()));
      parts.push(Buffer.from('\r\n'));
    }
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const headers = new Headers(init.headers);
  headers.set('Content-Type', `multipart/form-data; boundary=${boundary}`);
  return mockFetch(input, { ...init, headers, body: Buffer.concat(parts) });
}

/** Mock server with the library mocks; the store is reset before each test (fast background steps). */
export function useLibraryMock() {
  const mock = useMockServer({ features: [feature] });
  const mounted: (() => void)[] = [];
  const requests: { method: string; path: string }[] = [];
  let listening = false;
  beforeEach(() => {
    libraryStore.reset({ delayMs: FAST });
    requests.length = 0;
    workflowsAsked.clear();
    mock.use({ overrides: {
      ...otherAreas,
      listPrompts: (request) => {
        if (request.query.workflowId) workflowsAsked.add(request.query.workflowId);
        return otherAreas.listPrompts!(request);
      },
    } });
    if (!listening) {
      mock.server.events.on('request:start', ({ request }) => {
        requests.push({ method: request.method, path: new URL(request.url).pathname.replace(/^\/api\/v1/, '') });
      });
      listening = true;
    }
  });
  afterEach(() => {
    while (mounted.length) mounted.pop()!();
  });

  /** Replaces the demo data of this test (keeps the fast background steps unless given). */
  const scenario = (next: LibraryScenario) => libraryStore.reset({ delayMs: FAST, ...next });

  const renderAt = (path: string) => {
    const services = createShellServices({ fetch: testFetch, browser: testBrowser(), i18n: i18next, sseRetryDelays: [10] });
    const router = createMemoryRouter(createRoutes(), { initialEntries: [path] });
    const detach = services.attachRouter(router as never);
    const user = userEvent.setup();
    const view = render(
      <ShellProvider services={services}>
        <RouterProvider router={router} />
      </ShellProvider>,
    );
    const cleanup = () => { services.events.close(); detach(); view.unmount(); };
    mounted.push(cleanup);
    const go = (to: string) => act(() => router.navigate(to));
    /** Leaves the page now (closes the event stream and unmounts), e.g. to come back with a fresh shell. */
    const close = () => {
      mounted.splice(mounted.indexOf(cleanup), 1);
      cleanup();
    };
    return { ...view, user, router, services, go, close };
  };

  /** Runs the waiting background steps (scenario `advance: 'manual'`). */
  const advance = () => act(async () => { libraryStore.advance(); });

  /** Requests the screens sent (method and path without /api/v1), every operation included. */
  const sent = (method: string, path: string | RegExp) =>
    requests.filter((r) => r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)));

  return { mock, store: libraryStore, scenario, renderAt, advance, sent };
}

/** Calls of one operation the library mock recorded (body and headers). */
export const callsOf = (operationId: string) => libraryStore.calls.filter((call) => call.operationId === operationId);

/** JSON problem response (for overrides that must fail with a code the operation does not declare). */
export const problemResponse = (status: number, code: string) => new Response(
  JSON.stringify({ type: `https://sires.etroy.local/problems/${code}`, title: code, status, code }),
  { status, headers: { 'Content-Type': 'application/problem+json' } },
);
