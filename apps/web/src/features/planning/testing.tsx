// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Test harness of the planning area: the real shell (routes, services, SSE) on a memory router, talking to the mock
// server of PID-00013 with this area's stateful mocks. Each test starts from the fixtures again.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { afterEach, beforeEach, expect } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ShellProvider } from '../../shell/hooks';
import { mockFetch, useMockServer, type MockServer } from '../../shell/mock/node';
import type { FeatureMocks, Schemas } from '../../shell/mock';
import { createRoutes } from '../../shell/routes';
import { createShellServices } from '../../shell/services';
import { testBrowser } from '../../shell/test/render';
import { feature } from './index';
import { resetPlanningMock, setPlanningEmitter } from './__mocks__/store';

export { PROJECT_ID, T, V2, V3, V4, V5 } from './__mocks__/fixtures';
export { planningState } from './__mocks__/store';

/** Mock server for one spec file: planning mocks on the shell's, fixtures reset before each test. */
export function usePlanningMock(options: { withoutPlan?: boolean } = {}): MockServer {
  const mock = useMockServer({ features: [feature] });
  beforeEach(() => {
    resetPlanningMock(options);
    setPlanningEmitter((event) => mock.events.emit(event));
  });
  afterEach(() => setPlanningEmitter(undefined));
  return mock;
}

/** Overrides of operations other areas own (listWorkflows, listArtifacts, getSharedContext…) for one test. */
export function useOthers(mock: MockServer, overrides: FeatureMocks['overrides']): void {
  mock.use({ overrides });
}

/**
 * mockFetch without the AbortSignal: jsdom's AbortSignal is not the one Node's fetch accepts, so the SSE request of
 * the shell would fail and retry forever. The mock closes the stream itself after each test.
 */
const fetchInJsdom = (input: string, init?: RequestInit) => {
  const rest: RequestInit = { ...init };
  delete rest.signal;
  return mockFetch(input, rest);
};

export function renderPlanning(path: string) {
  const services = createShellServices({ fetch: fetchInJsdom, browser: testBrowser(), i18n: i18next, sseRetryDelays: [10] });
  const router = createMemoryRouter(createRoutes(), { initialEntries: [path] });
  const detach = services.attachRouter(router as never);
  const user = userEvent.setup();
  const view = render(
    <ShellProvider services={services}>
      <RouterProvider router={router} />
    </ShellProvider>,
  );
  return {
    ...view,
    services,
    router,
    user,
    unmountAll() {
      services.events.close();
      detach();
      view.unmount();
    },
  };
}

const OTHER_PROJECT = '00000000-0000-4000-8000-0000000000ff';

/**
 * Wait for the SSE connection, so events emitted by the mock reach the screen. Under jsdom the intercepted fetch of
 * GET /events resolves only once the stream has a first record, so an event of another project primes it.
 */
export async function waitForStream(services: { events: { status: string } }, mock: MockServer): Promise<void> {
  await waitFor(() => {
    if (services.events.status !== 'open') {
      mock.events.emit({ type: 'task.status_changed', projectId: OTHER_PROJECT, objectType: 'task', objectId: OTHER_PROJECT, toState: 'Draft' });
    }
    expect(services.events.status).toBe('open');
  });
}

export const emptyPage = { status: 200 as const, body: { items: [], nextCursor: null } };

export function workflow(n: number, taskId: string, status: Schemas['WorkflowStatus'], startedAt: string, endedAt?: string): Schemas['Workflow'] {
  return {
    id: `9f000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    accountId: '5b0e7c2a-4f1d-4c8e-9a6b-2d3f8e1a7c90',
    projectId: '',
    createdAt: startedAt,
    createdBy: { type: 'researcher' },
    rowVersion: 1,
    idempotencyKey: `wf-${n}`,
    type: 'task_execution',
    taskId,
    triggeredBy: { type: 'researcher' },
    status,
    startedAt,
    endedAt,
  };
}

export function artifact(n: number, taskId: string, title: string, createdAt: string, version: { versionNumber: number; status: Schemas['ArtifactVersionStatus'] }, accepted = false): Schemas['Artifact'] {
  const versionId = `8e000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  return {
    id: `7c000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    accountId: '5b0e7c2a-4f1d-4c8e-9a6b-2d3f8e1a7c90',
    createdAt,
    createdBy: { type: 'agent', agent: 'synthesis' },
    rowVersion: 1,
    type: 'synthesis',
    title,
    taskId,
    currentAcceptedVersionId: accepted ? versionId : null,
    latestVersion: { id: versionId, versionNumber: version.versionNumber, status: version.status, createdAt },
  };
}

/** Text of an element without extra spaces, for matching sentences built from several nodes. */
export const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

export { screen };
