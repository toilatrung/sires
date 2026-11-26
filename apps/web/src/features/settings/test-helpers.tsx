// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Test helpers of the settings area: the real shell on the PID-00013 mock, with every request recorded so a test
// can check what was sent (and what was not).

import { MOCK_ORIGIN, mockFetch } from '../../shell/mock/node';
import { renderShell } from '../../shell/test/render';
import type { FetchStub } from '../../shell/test/stub';

export interface SentRequest {
  method: string;
  /** Path under /api/v1, e.g. `/me/profile`. */
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body?: string;
  url: string;
}

export function renderSettings(path: string) {
  const sent: SentRequest[] = [];
  const fetch = (input: string, init: RequestInit = {}) => {
    const url = new URL(input, MOCK_ORIGIN);
    sent.push({
      method: (init.method ?? 'GET').toUpperCase(),
      path: url.pathname.replace(/^\/api\/v1/, ''),
      query: url.searchParams,
      headers: { ...((init.headers ?? {}) as Record<string, string>) },
      body: typeof init.body === 'string' ? init.body : undefined,
      url: url.toString(),
    });
    return mockFetch(input, init);
  };
  const view = renderShell({ path, stub: { fetch } as unknown as FetchStub });
  const calls = (method: string, p: string | RegExp) => sent.filter((r) => r.method === method && (typeof p === 'string' ? r.path === p : p.test(r.path)));
  return { ...view, sent, calls };
}

/**
 * Problem Details answer for one-off overrides in `mock.use`. A Response, because the PID-00013 runtime drops the
 * body of a status the operation does not declare (a 503 on listProviderConnections, for example).
 */
export function problem(status: number, code: string): Response {
  return new Response(JSON.stringify({ type: `https://sires.example/problems/${code}`, title: code, status, code }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}
