// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Mock for Vitest (PID-00013 S02): `useMockServer()` intercepts fetch for the tests of one file, applies
// per-test overrides with `use()`, and resets them and the /events stream after each test.

import { setupServer, type SetupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import type { Feature } from '../feature';
import type { EventStreamMock, EventStreamOptions } from './events';
import { createMocks, loadFeatureMocks, overrideHandlers } from './index';
import type { MockSource } from './runtime';
import type { FeatureMocks } from './types';

export interface MockServerOptions {
  /** Feature areas whose `mocks` to load (their claims are checked, EC10). */
  features?: readonly Feature[];
  /** Mock sources given directly, for example an area's mocks without its Feature. */
  sources?: readonly MockSource[];
  events?: EventStreamOptions;
  /** What an unmocked request does (default `error`, so a test never reaches a real gateway). */
  onUnhandledRequest?: 'error' | 'warn' | 'bypass';
}

export interface MockServer {
  readonly server: SetupServer;
  readonly events: EventStreamMock;
  /** Overrides for the current test only. */
  use(mocks: FeatureMocks): void;
  close(): void;
}

export async function startMockServer(options: MockServerOptions = {}): Promise<MockServer> {
  const sources = [...(options.sources ?? []), ...(await loadFeatureMocks(options.features ?? []))];
  const { handlers, events } = createMocks(sources, options.events);
  const server = setupServer(...handlers);
  server.listen({ onUnhandledFrame: options.onUnhandledRequest ?? 'error' });
  return {
    server,
    events,
    use: (mocks) => server.use(...overrideHandlers(mocks)),
    close: () => {
      events.reset();
      server.close();
    },
  };
}

/** Origin relative URLs resolve against in tests (Node's fetch needs absolute URLs). */
export const MOCK_ORIGIN = 'http://localhost';

/**
 * `fetch` for the shell's clients in tests (`new ApiClient({ fetch: mockFetch })`, `createShellServices({ fetch: mockFetch })`):
 * resolves `/api/v1/…` against MOCK_ORIGIN so the mock server answers it.
 */
export const mockFetch = (input: string, init?: RequestInit): Promise<Response> => globalThis.fetch(new URL(input, MOCK_ORIGIN), init);

/** Registers Vitest hooks: start before the file's tests, reset after each test, stop after all. */
export function useMockServer(options: MockServerOptions = {}): MockServer {
  let current: MockServer | undefined;
  const get = () => {
    if (!current) throw new Error('useMockServer: the server starts in beforeAll; use it inside a test');
    return current;
  };
  beforeAll(async () => {
    current = await startMockServer(options);
  });
  afterEach(() => {
    current?.server.resetHandlers();
    current?.events.reset();
  });
  afterAll(() => current?.close());
  return {
    get server() { return get().server; },
    get events() { return get().events; },
    use: (mocks) => get().use(mocks),
    close: () => get().close(),
  };
}
