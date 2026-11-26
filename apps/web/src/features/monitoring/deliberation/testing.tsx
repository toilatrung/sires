// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Test harness of the Deliberation tab: the real shell frame on a memory router, a stand-in workflow page that shows
// the tab the way PID-00059 will (useDeliberationTab + DeliberationTab), and the mock server of PID-00013 with this
// PID's deliberation mocks. Operations of PID-00059, PID-00058 (getPrompt, answerPrompt) are overridden per test.

import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { beforeEach, afterEach, expect } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { Feature } from '../../../shell/feature';
import { ShellProvider } from '../../../shell/hooks';
import { ACCOUNT_ID, id, type Schemas } from '../../../shell/mock';
import { mockFetch, useMockServer, type MockServer } from '../../../shell/mock/node';
import { createRoutes } from '../../../shell/routes';
import { createShellServices } from '../../../shell/services';
import { testBrowser } from '../../../shell/test/render';
import { neutralFeatures } from '../../../shell/test/features';
import { deliberationMocks, PROJECT_ID, resetDeliberationMock, setDeliberationEmitter, STEP_ID, WORKFLOW_ID } from '../__mocks__/deliberation';
import { DeliberationTab, useDeliberationTab } from './DeliberationTab';

const fetchInJsdom = (input: string, init?: RequestInit) => {
  const rest: RequestInit = { ...init };
  delete rest.signal;
  return mockFetch(input, rest);
};

export function useDeliberationMock(): MockServer {
  const mock = useMockServer({ sources: [{ name: 'monitoring-deliberation', mocks: deliberationMocks }] });
  beforeEach(() => setDeliberationEmitter((event) => mock.events.emit(event)));
  afterEach(() => setDeliberationEmitter(undefined));
  return mock;
}

export function workflow(openPromptId?: string): Schemas['Workflow'] {
  return {
    id: WORKFLOW_ID,
    accountId: ACCOUNT_ID,
    projectId: PROJECT_ID,
    createdAt: '2026-11-27T09:37:00Z',
    createdBy: { type: 'researcher', accountId: ACCOUNT_ID },
    rowVersion: 1,
    idempotencyKey: 'wf-52d',
    type: 'task_execution',
    taskId: id('task', 3),
    triggeredBy: { type: 'researcher', accountId: ACCOUNT_ID },
    status: 'Running',
    steps: [1, 2, 3, 4, 5].map((n) => ({
      id: n === 4 ? STEP_ID : id('step', 520 + n),
      order: n,
      description: `Bước ${n}`,
      status: n < 4 ? ('Succeeded' as const) : n === 4 ? ('Running' as const) : ('Pending' as const),
      attemptCount: 1,
      ...(n === 4 && openPromptId ? { openPromptId } : {}),
    })),
  };
}

/** Stand-in of PID-00059's workflow page: the tab is listed only when useDeliberationTab says so. */
function WorkflowPage({ wf }: { wf: Schemas['Workflow'] }) {
  const tab = useDeliberationTab(PROJECT_ID, wf);
  return (
    <section>
      <h1>Workflow wf-52d</h1>
      <div role="tablist" aria-label="Chế độ xem">
        <button type="button" role="tab" aria-selected={false}>
          Danh sách bước
        </button>
        {tab.visible && (
          <button type="button" role="tab" aria-selected>
            Thảo luận
          </button>
        )}
      </div>
      {!tab.loading && <p data-testid="tab-state">{tab.visible ? 'visible' : 'hidden'}</p>}
      {tab.visible && <DeliberationTab projectId={PROJECT_ID} workflow={wf} />}
    </section>
  );
}

export function renderWorkflow(wf: Schemas['Workflow'] = workflow(), query = '') {
  const services = createShellServices({ fetch: fetchInJsdom, browser: testBrowser(), i18n: i18next, sseRetryDelays: [10] });
  const page: Feature = {
    id: 'deliberation-test',
    routes: [{ path: 'projects/:projectId/activity/workflows/:workflowId', element: <WorkflowPage wf={wf} /> }],
    messages: { vi: {}, en: {} },
  };
  const router = createMemoryRouter(createRoutes([page, ...neutralFeatures]), { initialEntries: [`/projects/${PROJECT_ID}/activity/workflows/${WORKFLOW_ID}?view=deliberation${query}`] });
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

/** Under jsdom the intercepted GET /events resolves only once the stream has a first record: prime it. */
export async function waitForStream(services: { events: { status: string } }, mock: MockServer): Promise<void> {
  await waitFor(() => {
    if (services.events.status !== 'open') {
      mock.events.emit({ type: 'task.status_changed', projectId: OTHER_PROJECT, objectType: 'task', objectId: OTHER_PROJECT, toState: 'Draft' });
    }
    expect(services.events.status).toBe('open');
  });
}

export const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

export { resetDeliberationMock };
