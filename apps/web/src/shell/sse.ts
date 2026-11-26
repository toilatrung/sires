// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Client for GET /events (paths/14…#/events, orchestration.yaml#/Event): one connection per session, read with
// fetch so the reconnect can send the Last-Event-ID header (EventSource cannot set headers).
// - Last-Event-ID = id of the last durable event; chat.delta has no durable id and never moves it (EC13).
// - Lost connection → reconnect with backoff, then signal “reconnected” (EC14).
// - Server says Last-Event-ID can no longer be replayed (`replay.unavailable`, PC-05 P2) → signal “reload” (H5).
// - 401 → no retry; the session-expired flow takes over (EC15).

import type { PublicApi } from '@sires/contracts';
import { API_BASE, type FetchLike } from './api/client';

/**
 * orchestration.yaml#/Event, written out because openapi.yaml references it only through `x-event-schema` of
 * /events, so PublicApi has no `Event` yet (report.md, Đề xuất cho PO). Once the contract lists Event under
 * components.schemas, `ContractEvent` below switches to the generated type by itself.
 */
interface EventFromSpec {
  id: string;
  type:
    | 'account.deletion_requested'
    | 'provider_connection.changed'
    | 'provider_connection.issue_reported'
    | 'project.lifecycle_changed'
    | 'message.posted'
    | 'pending_action.changed'
    | 'notification.created'
    | 'plan_version.status_changed'
    | 'task.status_changed'
    | 'workflow.status_changed'
    | 'agent_run.status_changed'
    | 'prompt.status_changed'
    | 'deliberation.started'
    | 'deliberation.round_closed'
    | 'deliberation.entry_retracted'
    | 'deliberation.status_changed'
    | 'context_snapshot.outdated'
    | 'reference.status_changed'
    | 'reference.indexing_status_changed'
    | 'project_reference.changed'
    | 'research.object_status_changed'
    | 'manuscript.object_status_changed'
    | 'chat.delta';
  projectId?: string;
  objectType?: string;
  objectId?: string;
  fromState?: string;
  toState?: string;
  at: string;
}
type Schemas = PublicApi.components['schemas'];
type ContractEvent = Schemas extends { Event: infer E extends { type: string } } ? E : EventFromSpec;

/** Event type of the stream. `replay.unavailable` is the server's “cannot replay” signal (PC-05 P2). */
export type StreamEventType = ContractEvent['type'] | typeof REPLAY_UNAVAILABLE;
export type StreamEvent = Omit<ContractEvent, 'type'> & { type: StreamEventType };

export const REPLAY_UNAVAILABLE = 'replay.unavailable' as const;
export const CHAT_DELTA = 'chat.delta' as const;

export type StreamSignal = 'reconnected' | 'reload';
export type StreamStatus = 'idle' | 'connecting' | 'open' | 'waiting' | 'closed';

export interface EventFilter {
  /** Only these Event.type values; all when omitted. */
  types?: readonly StreamEventType[];
  /** Only events of this project; all when omitted. */
  projectId?: string;
}

export type EventHandler = (event: StreamEvent) => void;

export interface EventStreamOptions {
  fetch?: FetchLike;
  url?: string;
  /** Reconnect delays in ms; the last one repeats. Technical value (S05), see implement.md. */
  retryDelays?: readonly number[];
  onUnauthenticated?: () => void;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

interface Subscription {
  filter: EventFilter;
  handler: EventHandler;
}

interface RawRecord {
  id?: string;
  event?: string;
  data: string;
}

/** Incremental text/event-stream parser (WHATWG HTML §9.2.6, without the `retry` field). */
export class SseParser {
  private buffer = '';
  private data: string[] = [];
  private event?: string;
  private id?: string;
  private hasId = false;

  feed(chunk: string, emit: (record: RawRecord) => void): void {
    this.buffer += chunk;
    let index: number;
    while ((index = this.buffer.search(/\r\n|\r|\n/)) >= 0) {
      const line = this.buffer.slice(0, index);
      const eol = this.buffer[index] === '\r' && this.buffer[index + 1] === '\n' ? 2 : 1;
      this.buffer = this.buffer.slice(index + eol);
      this.line(line, emit);
    }
  }

  private line(line: string, emit: (record: RawRecord) => void): void {
    if (line === '') {
      if (this.data.length > 0) emit({ id: this.hasId ? this.id : undefined, event: this.event, data: this.data.join('\n') });
      this.data = [];
      this.event = undefined;
      this.id = undefined;
      this.hasId = false;
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') this.data.push(value);
    else if (field === 'event') this.event = value;
    else if (field === 'id' && !value.includes('\0')) {
      this.id = value;
      this.hasId = true;
    }
  }
}

function matches(filter: EventFilter, event: StreamEvent): boolean {
  if (filter.types && !filter.types.includes(event.type)) return false;
  if (filter.projectId && event.projectId !== filter.projectId) return false;
  return true;
}

const DEFAULT_RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000] as const;

export class EventStream {
  private readonly fetchImpl: FetchLike;
  private readonly url: string;
  private readonly retryDelays: readonly number[];
  private readonly subscriptions = new Set<Subscription>();
  private readonly signalListeners = new Set<(signal: StreamSignal) => void>();
  private readonly statusListeners = new Set<(status: StreamStatus) => void>();
  private controller?: AbortController;
  private retryHandle?: unknown;
  private attempt = 0;
  private everOpened = false;
  private stopped = true;
  private statusValue: StreamStatus = 'idle';
  private lastId?: string;
  private readonly timers: Required<Pick<EventStreamOptions, 'setTimeout' | 'clearTimeout'>>;

  constructor(private readonly options: EventStreamOptions = {}) {
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.url = options.url ?? `${API_BASE}/events`;
    this.retryDelays = options.retryDelays ?? DEFAULT_RETRY_DELAYS;
    this.timers = {
      setTimeout: options.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms)),
      clearTimeout: options.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>)),
    };
  }

  /** Id sent as Last-Event-ID on the next reconnect. */
  get lastEventId(): string | undefined {
    return this.lastId;
  }

  get status(): StreamStatus {
    return this.statusValue;
  }

  /** Receive events of the given types and project; returns the unsubscribe function (call it on unmount). */
  subscribe(filter: EventFilter, handler: EventHandler): () => void {
    const subscription = { filter, handler };
    this.subscriptions.add(subscription);
    return () => this.subscriptions.delete(subscription);
  }

  /** “reconnected” after every successful reconnect; “reload” when the server cannot replay (H5). */
  onSignal(listener: (signal: StreamSignal) => void): () => void {
    this.signalListeners.add(listener);
    return () => this.signalListeners.delete(listener);
  }

  onStatus(listener: (status: StreamStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Open the connection (idempotent). */
  connect(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.open();
  }

  /** Close for good: session over (sign-out, expiry) or app unmounted. */
  close(): void {
    this.stopped = true;
    if (this.retryHandle !== undefined) this.timers.clearTimeout(this.retryHandle);
    this.retryHandle = undefined;
    this.controller?.abort();
    this.controller = undefined;
    this.setStatus('closed');
  }

  private setStatus(status: StreamStatus): void {
    if (this.statusValue === status) return;
    this.statusValue = status;
    for (const listener of [...this.statusListeners]) listener(status);
  }

  private signal(signal: StreamSignal): void {
    for (const listener of [...this.signalListeners]) listener(signal);
  }

  private async open(): Promise<void> {
    if (this.stopped) return;
    this.setStatus('connecting');
    const controller = new AbortController();
    this.controller = controller;
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (this.lastId !== undefined) headers['Last-Event-ID'] = this.lastId;

    let response: Response;
    try {
      response = await this.fetchImpl(this.url, { method: 'GET', headers, credentials: 'same-origin', signal: controller.signal, cache: 'no-store' });
    } catch {
      this.scheduleReconnect(controller);
      return;
    }
    if (this.stopped || controller.signal.aborted) return;
    if (response.status === 401) {
      this.close();
      this.options.onUnauthenticated?.();
      return;
    }
    if (!response.ok || !response.body) {
      this.scheduleReconnect(controller);
      return;
    }

    const reconnect = this.everOpened;
    this.everOpened = true;
    this.attempt = 0;
    this.setStatus('open');
    if (reconnect) this.signal('reconnected');

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    const parser = new SseParser();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.feed(value, (record) => this.dispatch(record));
      }
    } catch {
      // Stream broke: reconnect below unless closed.
    }
    this.scheduleReconnect(controller);
  }

  private dispatch(record: RawRecord): void {
    let event: StreamEvent;
    try {
      event = JSON.parse(record.data) as StreamEvent;
    } catch {
      return;
    }
    const type = (record.event ?? event.type) as StreamEventType;
    if (!event.type) event = { ...event, type };

    if (type === REPLAY_UNAVAILABLE) {
      // The stream restarts from “now”: take the id the server gives, or forget the stale one (PC-05 P2).
      this.lastId = record.id || event.id || undefined;
      this.signal('reload');
      return;
    }
    if (type !== CHAT_DELTA) {
      const id = record.id ?? event.id;
      if (id) this.lastId = id;
    }
    for (const subscription of [...this.subscriptions]) {
      if (!matches(subscription.filter, event)) continue;
      try {
        subscription.handler(event);
      } catch {
        // One failing subscriber must not stop the others.
      }
    }
  }

  private scheduleReconnect(controller: AbortController): void {
    if (this.stopped || this.controller !== controller) return;
    this.setStatus('waiting');
    const delay = this.retryDelays[Math.min(this.attempt, this.retryDelays.length - 1)] ?? 1000;
    this.attempt += 1;
    this.retryHandle = this.timers.setTimeout(() => {
      this.retryHandle = undefined;
      void this.open();
    }, delay);
  }
}
