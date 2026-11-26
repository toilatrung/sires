// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Test harness of the research area: the real shell (renderShell) on the PID-00013 mock server, one store per test
// (createResearchStore), events through mock.events. getTask and getWorkflow belong to planning and monitoring
// (H12): they are overridden here, in tests only, from the shared fixtures and the store.

import { vi } from 'vitest';
import { mockFetch, useMockServer } from '../../../shell/mock/node';
import type { Overrides } from '../../../shell/mock';
import { renderShell, waitForFrame } from '../../../shell/test/render';
import type { FetchStub } from '../../../shell/test/stub';
import { feature } from '..';
import { createResearchMocks, createResearchStore, ids, PROJECT_ID, type ResearchStore, type ResearchStoreOptions } from '../__mocks__';

export { ids, PROJECT_ID };

/** Task keys of designs/notes.html for the shared planning Tasks the research rows point at. */
export const TASKS: Record<string, [key: string, title: string]> = {
  [ids.task.t1]: ['T-1.3', 'Danh sách phương pháp đo'],
  [ids.task.t2]: ['T-2.1', 'Định nghĩa hallucination'],
  [ids.task.t3]: ['T-2.3', 'So sánh phương pháp đo'],
  [ids.task.t4]: ['T-2.7', 'Ghi chú đọc 5 bài nền tảng'],
  [ids.task.t6]: ['T-3.5', 'Tạo sơ đồ pipeline'],
};

function testOnlyOverrides(store: ResearchStore): Overrides {
  return {
    getTask: ({ params, fixtures }) => {
      const row = fixtures.Task?.find((task) => task.id === params.taskId);
      const known = TASKS[params.taskId];
      if (!row || !known) return { status: 404 };
      return { status: 200, body: { ...row, stableKey: known[0], ...(row.currentDefinition ? { currentDefinition: { ...row.currentDefinition, title: known[1] } } : {}) } };
    },
    getWorkflow: ({ params }) => {
      const workflow = store.workflows.find((row) => row.id === params.workflowId);
      return workflow ? { status: 200, body: structuredClone(workflow) } : { status: 404 };
    },
  };
}

/** Mock server for one spec file; `store()` gives the test its own stateful store. */
export function useResearchMock() {
  const mock = useMockServer({ features: [feature] });
  return {
    mock,
    store(options: ResearchStoreOptions = {}, extra: Overrides = {}): ResearchStore {
      const store = createResearchStore({ workflowDelayMs: null, ...options, emit: (event) => mock.events.emit(event) });
      mock.use({ overrides: { ...createResearchMocks({ store }).overrides, ...testOnlyOverrides(store), ...extra } });
      return store;
    },
  };
}

/** The whole shell on the mock (no gateway): TopBar, rail, the research route. */
export async function renderResearch(path: string) {
  const view = renderShell({ path, stub: { fetch: mockFetch } as unknown as FetchStub });
  await waitForFrame();
  return view;
}

export const evidencePath = (query = '') => `/projects/${PROJECT_ID}/evidence${query}`;
export const claimPath = (claimId: string) => `/projects/${PROJECT_ID}/claims/${claimId}`;
export const evidenceItemPath = (evidenceId: string) => `/projects/${PROJECT_ID}/evidence/${evidenceId}`;
export const artifactPath = (artifactId?: string, query = '') => `/projects/${PROJECT_ID}/artifacts${artifactId ? `/${artifactId}` : ''}${query}`;

/** jsdom has no object URLs: previews become `blob:preview-n`; the blobs are kept for checks. */
export function stubObjectUrls() {
  const blobs: Blob[] = [];
  for (const name of ['createObjectURL', 'revokeObjectURL'] as const) {
    if (typeof URL[name] !== 'function') Object.defineProperty(URL, name, { value: () => '', configurable: true, writable: true });
  }
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob as Blob);
    return `blob:preview-${blobs.length}`;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  return blobs;
}

/** A problem+json reply with any status, for statuses an operation does not declare (5xx, network-like failures). */
export function problemResponse(status: number, code: string, detail?: string): Response {
  return new Response(JSON.stringify({ type: `https://sires.etroy.local/problems/${code}`, title: code, status, code, ...(detail ? { detail } : {}) }), {
    status, headers: { 'Content-Type': 'application/problem+json' },
  });
}

/** The overrides of the area bound to a store, to delegate to from a test override. */
export const storeOverrides = (store: ResearchStore) => createResearchMocks({ store }).overrides!;
