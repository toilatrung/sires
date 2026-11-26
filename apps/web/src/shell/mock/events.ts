// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Mock of GET /events (PID-00013 S03): `text/event-stream` records with `id`, `event` = Event.type and `data` =
// the Event as JSON (paths/14…#/events). Durable events are kept and replayed after `Last-Event-ID` on reconnect
// (EC11); `chat.delta` has no `id` line and is never replayed. The stream holds no data of its own: tests and the
// dev demo push events with `emit`.

import { http, HttpResponse, type HttpHandler } from 'msw';
import { eventTypes as contractEventTypes, type Event } from './generated';
import { basePath, MOCK_HEADER } from './runtime';

/** Signal of PC-05 P2 (“không còn phát lại được”); sent only when the contract's Event.type lists it. */
export const REPLAY_UNAVAILABLE = 'replay.unavailable';

export type EventInput = Omit<Event, 'id' | 'at'> & Partial<Pick<Event, 'id' | 'at'>>;

export interface EventStreamOptions {
  /** Durable events kept for replay; an older `Last-Event-ID` is “too far” (default 1000). */
  retain?: number;
  /** Event types the contract defines (default: Event.type of the bundle). */
  eventTypes?: readonly string[];
  /** Clock for `at` (tests pass a fixed one). */
  now?: () => Date;
}

export interface EventStreamMock {
  readonly handler: HttpHandler;
  /** Sends an event to every open connection; durable events get the next id and are kept for replay. */
  emit(event: EventInput): Event;
  /** Ends every open connection, as when the network drops; clients reconnect with `Last-Event-ID`. */
  disconnect(): void;
  /** `Last-Event-ID` header of each connection, in order (null when absent). */
  readonly lastEventIds: readonly (string | null)[];
  readonly connections: number;
  /** Durable events still kept for replay. */
  readonly log: readonly Event[];
  reset(): void;
}

interface Connection {
  controller: ReadableStreamDefaultController<Uint8Array>;
  projectId: string | null;
}

const encoder = new TextEncoder();

export function formatRecord(event: Event, durable: boolean): string {
  return `${durable ? `id: ${event.id}\n` : ''}event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function createEventStream(options: EventStreamOptions = {}): EventStreamMock {
  const retain = options.retain ?? 1000;
  const types: readonly string[] = options.eventTypes ?? contractEventTypes;
  const now = options.now ?? (() => new Date());
  const open = new Set<Connection>();
  let log: Event[] = [];
  let sequence = 0;
  let deltas = 0;
  let lastEventIds: (string | null)[] = [];

  const send = (connection: Connection, event: Event, durable: boolean) => {
    if (connection.projectId && event.projectId && event.projectId !== connection.projectId) return;
    connection.controller.enqueue(encoder.encode(formatRecord(event, durable)));
  };

  const handler = http.get(`*${basePath}/events`, ({ request }) => {
    const lastEventId = request.headers.get('last-event-id');
    lastEventIds = [...lastEventIds, lastEventId];
    const projectId = new URL(request.url).searchParams.get('projectId');
    let connection: Connection | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        connection = { controller, projectId };
        open.add(connection);
        if (lastEventId === null) return;
        const index = log.findIndex((event) => event.id === lastEventId);
        if (index === -1) {
          // Too far back (or unknown): nothing to replay. The contract signal is sent only once it exists.
          if (types.includes(REPLAY_UNAVAILABLE)) {
            const signal = { id: `signal-${++deltas}`, type: REPLAY_UNAVAILABLE, at: now().toISOString() } as unknown as Event;
            send(connection, signal, false);
          }
          return;
        }
        for (const event of log.slice(index + 1)) send(connection, event, true);
      },
      cancel() {
        if (connection) open.delete(connection);
      },
    });
    return new HttpResponse(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', [MOCK_HEADER]: 'streamEvents' },
    });
  });

  const disconnect = () => {
    for (const connection of open) {
      try {
        connection.controller.close();
      } catch {
        // already closed by the client
      }
    }
    open.clear();
  };

  return {
    handler,
    emit(input) {
      if (!types.includes(input.type)) throw new Error(`Unknown event type ${input.type}`);
      const durable = input.type !== 'chat.delta';
      const event = {
        ...input,
        id: input.id ?? (durable ? String(++sequence) : `delta-${++deltas}`),
        at: input.at ?? now().toISOString(),
      } as Event;
      if (durable) {
        log = [...log, event].slice(-retain);
      }
      for (const connection of open) send(connection, event, durable);
      return event;
    },
    disconnect,
    get lastEventIds() {
      return lastEventIds;
    },
    get connections() {
      return open.size;
    },
    get log() {
      return log;
    },
    reset() {
      disconnect();
      log = [];
      sequence = 0;
      deltas = 0;
      lastEventIds = [];
    },
  };
}
