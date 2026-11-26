// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// fetch and SSE stubs for shell tests (rule 1.4.4: no real gateway). Records every request.

import type { FetchLike } from '../api/client';
import * as fx from './fixtures';

export interface RecordedRequest {
  method: string;
  url: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body?: string;
}

type Handler = (request: RecordedRequest) => Response | Promise<Response>;

export function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

export function problem(status: number, code: string, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ type: `https://sires.etroy.local/problems/${code}`, title: code, status, code, ...extra }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

/** A text/event-stream response the test writes to. */
export class SseChannel {
  private controller?: ReadableStreamDefaultController<Uint8Array>;
  private readonly encoder = new TextEncoder();
  readonly response: Response;

  constructor() {
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
      },
    });
    this.response = new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }

  /** Write one record: `id:`, `event:`, `data:` then a blank line. */
  send(record: { id?: string; event?: string; data: unknown }): void {
    let text = '';
    if (record.id !== undefined) text += `id: ${record.id}\n`;
    if (record.event) text += `event: ${record.event}\n`;
    text += `data: ${typeof record.data === 'string' ? record.data : JSON.stringify(record.data)}\n\n`;
    this.controller?.enqueue(this.encoder.encode(text));
  }

  raw(text: string): void {
    this.controller?.enqueue(this.encoder.encode(text));
  }

  /** The server closes the stream (connection lost). */
  end(): void {
    try {
      this.controller?.close();
    } catch {
      // already closed
    }
  }

  /** The network breaks mid-stream. */
  fail(): void {
    try {
      this.controller?.error(new TypeError('network'));
    } catch {
      // already closed
    }
  }
}

export class FetchStub {
  readonly requests: RecordedRequest[] = [];
  private readonly handlers: Array<{ method: string; path: string | RegExp; handler: Handler }> = [];
  /** SSE connections in order; each GET /events opens the next one. */
  readonly sse: SseChannel[] = [];

  on(method: string, path: string | RegExp, handler: Handler | Response | (() => Response)): this {
    const fn: Handler = typeof handler === 'function' ? (handler as Handler) : () => (handler as Response).clone();
    this.handlers.unshift({ method: method.toUpperCase(), path, handler: fn });
    return this;
  }

  readonly fetch: FetchLike = async (input, init = {}) => {
    const url = new URL(input, 'http://localhost');
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    const request: RecordedRequest = {
      method: (init.method ?? 'GET').toUpperCase(),
      url: input,
      path: url.pathname,
      query: url.searchParams,
      headers,
      body: typeof init.body === 'string' ? init.body : undefined,
    };
    this.requests.push(request);
    const match = this.handlers.find((h) => h.method === request.method && (typeof h.path === 'string' ? h.path === request.path : h.path.test(request.path)));
    if (!match) return problem(404, 'not_found');
    return match.handler(request);
  };

  /** Requests to a path (and method). */
  calls(path: string | RegExp, method = 'GET'): RecordedRequest[] {
    return this.requests.filter((r) => r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)));
  }
}

/** Stub answering every request the shell makes, with the fixtures. */
export function shellStub(options: { signedIn?: boolean; uiLanguage?: 'vi' | 'en' } = {}): FetchStub {
  const stub = new FetchStub();
  const signedIn = options.signedIn ?? true;
  stub
    .on('GET', '/api/v1/auth/session', () => (signedIn ? json(fx.session) : problem(401, 'unauthenticated')))
    .on('GET', '/api/v1/me', () => (signedIn ? json(fx.account(options.uiLanguage), { headers: { etag: '"v7"' } }) : problem(401, 'unauthenticated')))
    .on('GET', '/api/v1/pending-actions', (req) => {
      const projectId = req.query.get('projectId');
      if (projectId) {
        const items = fx.projectPendingActions.filter((p) => p.projectId === projectId);
        return json({ items, nextCursor: null, openCount: items.length });
      }
      return json({ items: [], nextCursor: null, openCount: fx.OPEN_COUNT });
    })
    .on('GET', '/api/v1/notifications', () => json({ items: [], nextCursor: null, unreadCount: fx.UNREAD_COUNT }))
    .on('GET', '/api/v1/projects', (req) => {
      const status = req.query.get('status');
      return json({ items: fx.projects.filter((p) => !status || p.status === status), nextCursor: null });
    })
    .on('GET', /^\/api\/v1\/projects\/[^/]+$/, (req) => {
      const id = decodeURIComponent(req.path.split('/').pop() ?? '');
      const project = fx.projects.find((p) => p.id === id);
      return project ? json(project, { headers: { etag: '"7"' } }) : problem(404, 'not_found');
    })
    .on('GET', /^\/api\/v1\/projects\/[^/]+\/plan$/, () => json(fx.plan))
    .on('GET', /^\/api\/v1\/projects\/[^/]+\/tasks\/[^/]+$/, () => json(fx.task))
    .on('PUT', /^\/api\/v1\/projects\/[^/]+\/active-task$/, () => json({ ...fx.projects[0], activeTaskId: undefined }))
    .on('GET', '/api/v1/events', () => {
      const channel = new SseChannel();
      stub.sse.push(channel);
      return channel.response;
    });
  return stub;
}
