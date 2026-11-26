// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Mock of GET /events (PID-00013 S03): `text/event-stream` records with `id`, `event` = Event.type and `data` =
// the Event as JSON (paths/14…#/events). Durable events get increasing ids, are kept (`retain`) and replayed after
// `Last-Event-ID` on reconnect (EC11); `chat.delta` has no `id` line and is never replayed. A `Last-Event-ID` that
// can no longer be replayed gets `replay.unavailable` first (PC-05 P2). The stream holds no data of its own: tests
// and the dev demo push events with `emit`.

import { http, HttpResponse, type HttpHandler } from 'msw';
import { eventTypes as contractEventTypes, type Event } from './generated';
import { basePath, MOCK_HEADER } from './runtime';

/** Signal “không còn phát lại được” (PC-05 P2): sent by the stream itself, never through `emit`. */
export const REPLAY_UNAVAILABLE = 'replay.unavailable' satisfies Event['type'];

export type EventInput = Omit<Event, 'id' | 'at'> & Partial<Pick<Event, 'at'>>;

export interface EventStreamOptions {
  /** Durable events kept for replay; an older `Last-Event-ID` can no longer be replayed (default 1000). */
  retain?: number;
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
        // Replayable: a position between the oldest kept event and the latest one (`0` before any event).
        const position = /^\d+$/.test(lastEventId) ? Number(lastEventId) : Number.NaN;
        const oldest = log.length ? Number(log[0]!.id) - 1 : sequence;
        if (position >= oldest && position <= sequence) {
          for (const event of log) if (Number(event.id) > position) send(connection, event, true);
          return;
        }
        // Too old, unknown or malformed: the signal comes first, with the latest position as id, then only new events.
        send(connection, { id: String(sequence), type: REPLAY_UNAVAILABLE, at: now().toISOString() }, true);
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
      if (!(contractEventTypes as readonly string[]).includes(input.type)) throw new Error(`Unknown event type ${input.type}`);
      if (input.type === REPLAY_UNAVAILABLE) throw new Error('replay.unavailable is sent by the stream on reconnect, not emitted');
      const durable = input.type !== 'chat.delta';
      const event: Event = { ...input, id: durable ? String(++sequence) : `delta-${++deltas}`, at: input.at ?? now().toISOString() };
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
