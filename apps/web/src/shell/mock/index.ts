// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Public API of the web mock (PID-00013). Import it only from dev or test code: features/<area>/__mocks__/,
// *.spec.ts, shell/mock/browser.ts. The production bundle never loads this module (README.md, build.spec.ts).

import type { HttpHandler } from 'msw';
import type { Feature } from '../feature';
import { createEventStream, type EventStreamMock, type EventStreamOptions } from './events';
import { demoFixtures } from './fixtures';
import { composeHandlers, type MockSource } from './runtime';
import { shellMocks } from './session';
import type { FeatureMocks } from './types';

export { createEventStream, formatRecord, REPLAY_UNAVAILABLE } from './events';
export type { EventInput, EventStreamMock, EventStreamOptions } from './events';
export { ACCOUNT_ID, demoFixtures, id, projectIds } from './fixtures';
export { basePath, claims, composeHandlers, defineMocks, mergeFixtures, MOCK_HEADER } from './runtime';
export type { MockSource } from './runtime';
export { CSRF_TOKEN, shellMocks, signedOutMocks } from './session';
export type * from './types';

/** Loads the mocks every feature area declares (`Feature.mocks`), in the order of shell/features.ts. */
export async function loadFeatureMocks(features: readonly Feature[]): Promise<MockSource[]> {
  const sources: MockSource[] = [];
  for (const feature of features) {
    if (feature.mocks) sources.push({ name: feature.id, mocks: (await feature.mocks()).default });
  }
  return sources;
}

export interface MockSetup {
  handlers: HttpHandler[];
  events: EventStreamMock;
}

/** Shell mocks, then the areas', then the generated fallback for every other operation of the public OpenAPI. */
export function createMocks(sources: readonly MockSource[] = [], events: EventStreamOptions = {}): MockSetup {
  const stream = createEventStream(events);
  const handlers = composeHandlers({
    sources: [{ name: 'shell', mocks: shellMocks }, ...sources], fixtures: demoFixtures, before: [stream.handler],
    emit: (event) => { stream.emit(event); },
  });
  return { handlers, events: stream };
}

/** Handlers of overrides only, for `server.use()` in one test; no claim check, no fallback. */
export function overrideHandlers(mocks: FeatureMocks, events?: EventStreamMock): HttpHandler[] {
  return composeHandlers({
    sources: [{ name: 'test', mocks }], fixtures: demoFixtures, fallback: false,
    emit: (event) => { events?.emit(event); },
  });
}
