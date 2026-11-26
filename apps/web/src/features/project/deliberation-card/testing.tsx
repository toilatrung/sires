// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Test harness of the deliberation card: the real shell frame (session, SSE) on a memory router with the card on a
// test route, talking to the mock server of PID-00013. Operations of other areas (getPrompt, answerPrompt,
// listProviderConnections, getWorkflow) are overridden per test.

import { act, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { expect } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { Feature } from '../../../shell/feature';
import { ShellProvider } from '../../../shell/hooks';
import type { InteractiveAgentPrompt } from '../../../shell';
import type { MockServer } from '../../../shell/mock/node';
import { mockFetch } from '../../../shell/mock/node';
import { createRoutes } from '../../../shell/routes';
import { createShellServices } from '../../../shell/services';
import { testBrowser } from '../../../shell/test/render';
import { neutralFeatures } from '../../../shell/test/features';
import { connections, PROJECT_ID, workflow } from '../__mocks__/deliberation-card';
import { DeliberationCard } from './DeliberationCard';

/**
 * mockFetch without the AbortSignal: jsdom's AbortSignal is not the one Node's fetch accepts, so the shell's SSE
 * request would fail and retry forever. The mock closes the stream itself after each test.
 */
const fetchInJsdom = (input: string, init?: RequestInit) => {
  const rest: RequestInit = { ...init };
  delete rest.signal;
  return mockFetch(input, rest);
};

/** Connection names and the workflow of the proposal, owned by other areas. */
export function useCardContext(mock: MockServer): void {
  mock.use({
    overrides: {
      listProviderConnections: () => ({ status: 200, body: { items: connections(), nextCursor: null } }),
      getWorkflow: () => ({ status: 200, body: workflow() }),
    },
  });
}

/**
 * The card as the Chat of PID-00058 mounts it: the Chat holds a copy of the prompt and passes `onChange`. `setPrompt`
 * re-renders the card with another copy (the Chat re-rendering with its old one, say); `changes` lists every prompt
 * the card handed back.
 */
export function renderCard(prompt: InteractiveAgentPrompt) {
  const services = createShellServices({ fetch: fetchInJsdom, browser: testBrowser(), i18n: i18next, sseRetryDelays: [10] });
  const changes: InteractiveAgentPrompt[] = [];
  let setHeld: (next: InteractiveAgentPrompt) => void = () => undefined;
  function ChatStandIn() {
    const [held, set] = useState(prompt);
    setHeld = set;
    return <DeliberationCard prompt={held} projectId={PROJECT_ID} onChange={(next) => changes.push(next)} />;
  }
  const cardFeature: Feature = {
    id: 'deliberation-card-test',
    routes: [{ path: 'projects/:projectId/chat', element: <ChatStandIn /> }],
    messages: { vi: {}, en: {} },
  };
  const router = createMemoryRouter(createRoutes([cardFeature, ...neutralFeatures]), { initialEntries: [`/projects/${PROJECT_ID}/chat`] });
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
    changes,
    setPrompt: (next: InteractiveAgentPrompt) => act(() => setHeld(next)),
    unmountAll() {
      services.events.close();
      detach();
      view.unmount();
    },
  };
}

const OTHER_PROJECT = '00000000-0000-4000-8000-0000000000ff';

/**
 * Wait for the SSE connection. Under jsdom the intercepted fetch of GET /events resolves only once the stream has a
 * first record, so an event of another project primes it.
 */
export async function waitForStream(services: { events: { status: string } }, mock: MockServer): Promise<void> {
  await waitFor(() => {
    if (services.events.status !== 'open') {
      mock.events.emit({ type: 'task.status_changed', projectId: OTHER_PROJECT, objectType: 'task', objectId: OTHER_PROJECT, toState: 'Draft' });
    }
    expect(services.events.status).toBe('open');
  });
}

export const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
