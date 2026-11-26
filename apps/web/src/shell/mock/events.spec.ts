// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00013 S03: mock of GET /events (EC04, EC11). The reader below reads the stream the way the contract
// describes (id, event, data; reconnect with the Last-Event-ID header); the shell's SSE client of PID-00012 S05
// replaces it once merged.

import { describe, expect, it } from 'vitest';
import { eventTypes } from './generated';
import { formatRecord, id, projectIds, REPLAY_UNAVAILABLE } from './index';
import { useMockServer } from './node';

interface Record {
  id?: string;
  event: string;
  data: { id: string; type: string; projectId?: string };
}

/** Minimal SSE reader over fetch: one connection, records until the server ends the stream. */
function connect(lastEventId?: string, query = '') {
  const records: Record[] = [];
  const controller = new AbortController();
  let wake: () => void = () => undefined;
  const done = (async () => {
    const response = await fetch(`http://localhost/api/v1/events${query}`, {
      headers: lastEventId ? { 'Last-Event-ID': lastEventId } : {}, signal: controller.signal,
    });
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done: ended } = await reader.read();
      if (ended) break;
      buffer += decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const fields = Object.fromEntries(buffer.slice(0, end).split('\n').map((line) => {
          const colon = line.indexOf(': ');
          return [line.slice(0, colon), line.slice(colon + 2)];
        }));
        buffer = buffer.slice(end + 2);
        records.push({ ...(fields.id ? { id: fields.id } : {}), event: fields.event, data: JSON.parse(fields.data) });
        wake();
      }
    }
  })().catch((error: unknown) => {
    // close() aborts the request; anything else is a real failure.
    if (!(error instanceof Error && error.name === 'AbortError')) throw error;
  });
  const until = async (count: number) => {
    while (records.length < count) await new Promise<void>((resolve) => { wake = resolve; });
    return records;
  };
  return { records, done, until, close: () => controller.abort() };
}

/** Last durable id the client saw: chat.delta records carry none (EC11). */
const lastId = (records: Record[]) => records.filter((record) => record.id).at(-1)?.id;
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('mock /events (S03)', () => {
  const mock = useMockServer();
  const event = (n: number) => ({ type: 'workflow.status_changed' as const, projectId: projectIds.rag, objectType: 'workflow', objectId: id('workflow', n), toState: 'Running' });

  it('nối lại', async () => {
    // EC11: the client gets sample events, loses the connection, reconnects with Last-Event-ID and continues
    // with exactly the events after that id.
    const first = connect();
    await tick();
    mock.events.emit(event(1));
    mock.events.emit(event(2));
    const seen = await first.until(2);
    expect(seen.map((record) => [record.id, record.event])).toEqual([['1', 'workflow.status_changed'], ['2', 'workflow.status_changed']]);
    expect(seen[0]!.data).toMatchObject({ id: '1', type: 'workflow.status_changed', objectId: id('workflow', 1) });

    mock.events.disconnect();
    await first.done;
    mock.events.emit(event(3));
    mock.events.emit(event(4));

    const second = connect(lastId(seen));
    const resumed = await second.until(2);
    expect(resumed.map((record) => record.id)).toEqual(['3', '4']);
    mock.events.emit(event(5));
    expect((await second.until(3)).map((record) => record.id)).toEqual(['3', '4', '5']);
    expect(mock.events.lastEventIds).toEqual([null, '2']);
    second.close();
  });

  it('chat.delta không có id', async () => {
    // EC11: chat.delta has no durable id; it does not move Last-Event-ID and is never replayed.
    const client = connect();
    await tick();
    mock.events.emit(event(1));
    mock.events.emit({ type: 'chat.delta', projectId: projectIds.rag, objectType: 'message', objectId: id('message', 2) });
    const records = await client.until(2);
    expect(records[1]).toMatchObject({ event: 'chat.delta', data: { type: 'chat.delta' } });
    expect(records[1]).not.toHaveProperty('id');
    expect(formatRecord(records[1]!.data as never, false).startsWith('event: chat.delta\n')).toBe(true);
    expect(lastId(records)).toBe('1');
    mock.events.disconnect();
    await client.done;
    mock.events.emit(event(2));
    const again = connect(lastId(records));
    expect((await again.until(1)).map((record) => record.event)).toEqual(['workflow.status_changed']);
    expect(mock.events.log.map((logged) => logged.type)).not.toContain('chat.delta');
    again.close();
  });

  it('chỉ nhận sự kiện của project đã lọc', async () => {
    const client = connect(undefined, `?projectId=${projectIds.learning}`);
    await tick();
    mock.events.emit(event(1));
    mock.events.emit({ ...event(2), projectId: projectIds.learning });
    expect((await client.until(1)).map((record) => record.data.projectId)).toEqual([projectIds.learning]);
    client.close();
  });

  it('nối lại trong thời gian giữ log thì không có tín hiệu', async () => {
    // PC-05 P2: first connection and a replayable Last-Event-ID (including 0 before any event) get no signal.
    const fresh = connect('0');
    await tick();
    mock.events.emit(event(1));
    expect((await fresh.until(1)).map((record) => [record.id, record.event])).toEqual([['1', 'workflow.status_changed']]);
    fresh.close();
  });
});

describe('mock /events khi Last-Event-ID không còn phát lại được (YC3, PC-05 P2)', () => {
  const mock = useMockServer({ events: { retain: 2 } });
  const task = (n: number) => ({ type: 'task.status_changed' as const, projectId: projectIds.rag, objectType: 'task', objectId: id('task', n) });

  it('Last-Event-ID quá xa thì gửi tín hiệu trước, không phát lại', async () => {
    // The contract's Event.type lists the signal; it comes first, carries only id (latest position), type, at.
    expect(eventTypes).toContain(REPLAY_UNAVAILABLE);
    for (const n of [1, 2, 3, 4]) mock.events.emit(task(n));
    expect(mock.events.log.map((logged) => logged.id)).toEqual(['3', '4']);
    const client = connect('1');
    const records = await client.until(1);
    expect(records[0]).toMatchObject({ id: '4', event: REPLAY_UNAVAILABLE });
    expect(Object.keys(records[0]!.data).sort()).toEqual(['at', 'id', 'type']);
    expect(records[0]!.data).toMatchObject({ id: '4', type: REPLAY_UNAVAILABLE });
    mock.events.emit(task(5));
    expect((await client.until(2)).map((record) => record.id)).toEqual(['4', '5']);
    client.close();

    // Reconnecting from the signal's id replays normally, without a second signal.
    mock.events.emit(task(6));
    const again = connect('4');
    expect((await again.until(2)).map((record) => record.id)).toEqual(['5', '6']);
    again.close();
  });

  it('Last-Event-ID không đúng định dạng hoặc lạ thì gửi tín hiệu', async () => {
    for (const lastEventId of ['stale-id', '99']) {
      const client = connect(lastEventId);
      expect((await client.until(1))[0]).toMatchObject({ id: '0', event: REPLAY_UNAVAILABLE });
      client.close();
    }
    expect(() => mock.events.emit({ type: REPLAY_UNAVAILABLE })).toThrow(/sent by the stream/);
  });
});
