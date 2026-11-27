// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Starts the mock in the dev server (PID-00013 S02). main.tsx imports this module only when
// `import.meta.env.DEV` and the mock flag are set, so production builds drop it (EC07). The service worker
// script is served by the msw Vite plugin in dev only; nothing is copied to public/.

import { setupWorker } from 'msw/browser';
import type { Feature } from '../feature';
import type { EventInput, EventStreamMock } from './events';
import { id, projectIds } from './fixtures';
import { createMocks, loadFeatureMocks } from './index';

const DEMO_INTERVAL_MS = 20_000;

// A short loop of realistic events so Agent Activity, Pending Actions and Notifications move during a demo.
const demoEvents: EventInput[] = [
  { type: 'agent_run.status_changed', projectId: projectIds.rag, objectType: 'agent_run', objectId: id('agentRun', 2), fromState: 'Running', toState: 'Succeeded' },
  { type: 'workflow.status_changed', projectId: projectIds.rag, objectType: 'workflow', objectId: id('workflow', 1), fromState: 'Running', toState: 'Running' },
  { type: 'notification.created', projectId: projectIds.rag, objectType: 'notification', objectId: id('notification', 1) },
  { type: 'pending_action.changed', projectId: projectIds.rag, objectType: 'pending_action', objectId: id('pendingAction', 2), toState: 'Open' },
  { type: 'reference.indexing_status_changed', objectType: 'reference', objectId: id('reference', 4), fromState: 'Indexing', toState: 'Indexed' },
];

function playDemo(events: EventStreamMock) {
  let next = 0;
  return setInterval(() => {
    events.emit(demoEvents[next % demoEvents.length]!);
    next += 1;
  }, DEMO_INTERVAL_MS);
}

export async function startMockWorker(features: readonly Feature[]): Promise<EventStreamMock> {
  const { handlers, events } = createMocks(await loadFeatureMocks(features));
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledFrame: 'bypass', serviceWorker: { url: '/mockServiceWorker.js' } });
  playDemo(events);
  // Lets a developer push an event from the console: siresMock.events.emit({ type: 'notification.created', … }).
  (globalThis as { siresMock?: unknown }).siresMock = { events, worker };
  console.info(`[SIRes mock] ${handlers.length} handlers; data from shell/mock/fixtures and features/*/__mocks__.`);
  return events;
}
