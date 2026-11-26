// @vitest-environment node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { describe, expect, it, vi } from 'vitest';
import { EventStream, REPLAY_UNAVAILABLE, SseParser, type StreamEvent, type StreamSignal } from './sse';
import { FetchStub, problem, SseChannel } from './test/stub';

const event = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, type, at: '2026-11-27T09:00:00Z', ...extra });

function setup() {
  const stub = new FetchStub();
  const channels: SseChannel[] = [];
  let next: (() => Response) | undefined;
  stub.on('GET', '/api/v1/events', () => {
    if (next) {
      const respond = next;
      next = undefined;
      return respond();
    }
    const channel = new SseChannel();
    channels.push(channel);
    return channel.response;
  });
  const onUnauthenticated = vi.fn();
  const stream = new EventStream({ fetch: stub.fetch, retryDelays: [0], onUnauthenticated, setTimeout: (fn) => setTimeout(fn, 0) });
  const signals: StreamSignal[] = [];
  stream.onSignal((s) => signals.push(s));
  const received: StreamEvent[] = [];
  stream.subscribe({}, (e) => received.push(e));
  return { stub, channels, stream, signals, received, onUnauthenticated, failNextWith: (r: () => Response) => (next = r) };
}

const connections = (stub: FetchStub) => stub.calls('/api/v1/events');

describe('client SSE', () => {
  it('gửi Last-Event-ID khi nối lại (PID-00012-AC02)', async () => {
    const { stub, channels, stream } = setup();
    stream.connect();
    await vi.waitFor(() => expect(channels).toHaveLength(1));
    expect(connections(stub)[0].headers['Last-Event-ID']).toBeUndefined();

    channels[0].send({ id: 'e-42', event: 'pending_action.changed', data: event('e-42', 'pending_action.changed') });
    channels[0].send({ event: 'chat.delta', data: event('', 'chat.delta', { objectId: 'm-1' }) });
    await vi.waitFor(() => expect(stream.lastEventId).toBe('e-42'));
    channels[0].end();

    await vi.waitFor(() => expect(connections(stub)).toHaveLength(2));
    expect(connections(stub)[1].headers['Last-Event-ID']).toBe('e-42');
    stream.close();
  });

  it('chat.delta: không dùng làm Last-Event-ID, vẫn giao cho nơi đăng ký (EC13)', async () => {
    const { channels, stream, received } = setup();
    stream.connect();
    await vi.waitFor(() => expect(channels).toHaveLength(1));
    channels[0].send({ id: 'e-7', event: 'message.posted', data: event('e-7', 'message.posted') });
    channels[0].send({ id: 'd-1', event: 'chat.delta', data: event('d-1', 'chat.delta') });
    await vi.waitFor(() => expect(received.map((e) => e.type)).toEqual(['message.posted', 'chat.delta']));
    expect(stream.lastEventId).toBe('e-7');
    stream.close();
  });

  it('báo đã nối lại sau khi nối lại, không báo cần tải lại (EC14)', async () => {
    const { stub, channels, stream, signals } = setup();
    stream.connect();
    await vi.waitFor(() => expect(channels).toHaveLength(1));
    expect(signals).toEqual([]);
    channels[0].fail();
    await vi.waitFor(() => expect(connections(stub)).toHaveLength(2));
    await vi.waitFor(() => expect(signals).toEqual(['reconnected']));
    channels[1].send({ id: 'e-43', event: 'task.status_changed', data: event('e-43', 'task.status_changed') });
    await vi.waitFor(() => expect(stream.lastEventId).toBe('e-43'));
    expect(signals).not.toContain('reload');
    stream.close();
  });

  it('tải lại khi server báo không còn phát lại được (PID-00012-AC04)', async () => {
    const { stub, channels, stream, signals, received } = setup();
    const second = vi.fn();
    stream.onSignal(second);
    stream.connect();
    await vi.waitFor(() => expect(channels).toHaveLength(1));
    channels[0].send({ id: 'e-42', event: 'pending_action.changed', data: event('e-42', 'pending_action.changed') });
    await vi.waitFor(() => expect(stream.lastEventId).toBe('e-42'));
    channels[0].end();

    await vi.waitFor(() => expect(channels).toHaveLength(2));
    expect(connections(stub)[1].headers['Last-Event-ID']).toBe('e-42');
    channels[1].send({ id: 'e-90', event: REPLAY_UNAVAILABLE, data: event('e-90', REPLAY_UNAVAILABLE) });

    await vi.waitFor(() => expect(signals).toEqual(['reconnected', 'reload']));
    expect(second).toHaveBeenCalledWith('reload');
    // The signal is not an event for subscribers; the stream continues from the id the server gave.
    expect(received.map((e) => e.type)).toEqual(['pending_action.changed']);
    expect(stream.lastEventId).toBe('e-90');

    // Next normal reconnect: only “reconnected”.
    channels[1].end();
    await vi.waitFor(() => expect(channels).toHaveLength(3));
    await vi.waitFor(() => expect(signals).toEqual(['reconnected', 'reload', 'reconnected']));
    expect(connections(stub)[2].headers['Last-Event-ID']).toBe('e-90');
    stream.close();
  });

  it('tín hiệu không kèm id: bỏ Last-Event-ID cũ để không lặp tải lại', async () => {
    const { stub, channels, stream, signals } = setup();
    stream.connect();
    await vi.waitFor(() => expect(channels).toHaveLength(1));
    channels[0].send({ id: 'e-1', event: 'task.status_changed', data: event('e-1', 'task.status_changed') });
    await vi.waitFor(() => expect(stream.lastEventId).toBe('e-1'));
    channels[0].end();
    await vi.waitFor(() => expect(channels).toHaveLength(2));
    channels[1].send({ event: REPLAY_UNAVAILABLE, data: { type: REPLAY_UNAVAILABLE, at: '2026-11-27T09:00:00Z' } });
    await vi.waitFor(() => expect(signals).toContain('reload'));
    expect(stream.lastEventId).toBeUndefined();
    channels[1].end();
    await vi.waitFor(() => expect(connections(stub)).toHaveLength(3));
    expect(connections(stub)[2].headers['Last-Event-ID']).toBeUndefined();
    stream.close();
  });

  it('tín hiệu chỉ có id trong data: dùng id đó làm Last-Event-ID tiếp theo', async () => {
    const { stub, channels, stream, signals } = setup();
    stream.connect();
    await vi.waitFor(() => expect(channels).toHaveLength(1));
    channels[0].send({ id: 'e-1', event: 'task.status_changed', data: event('e-1', 'task.status_changed') });
    await vi.waitFor(() => expect(stream.lastEventId).toBe('e-1'));
    channels[0].end();
    await vi.waitFor(() => expect(channels).toHaveLength(2));
    channels[1].send({ event: REPLAY_UNAVAILABLE, data: event('0', REPLAY_UNAVAILABLE) });
    await vi.waitFor(() => expect(signals).toContain('reload'));
    expect(stream.lastEventId).toBe('0');
    channels[1].end();
    await vi.waitFor(() => expect(connections(stub)).toHaveLength(3));
    expect(connections(stub)[2].headers['Last-Event-ID']).toBe('0');
    stream.close();
  });

  it('401: không thử lại, chuyển luồng phiên hết hạn (EC15)', async () => {
    const { stub, channels, stream, onUnauthenticated, failNextWith } = setup();
    stream.connect();
    await vi.waitFor(() => expect(channels).toHaveLength(1));
    failNextWith(() => problem(401, 'unauthenticated'));
    channels[0].end();
    await vi.waitFor(() => expect(onUnauthenticated).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(connections(stub)).toHaveLength(2);
    expect(stream.status).toBe('closed');
  });

  it('đăng ký theo loại sự kiện và project; hủy đăng ký', async () => {
    const { channels, stream } = setup();
    const p1Tasks: string[] = [];
    const off = stream.subscribe({ types: ['task.status_changed'], projectId: 'p1' }, (e) => p1Tasks.push(e.id));
    stream.connect();
    await vi.waitFor(() => expect(channels).toHaveLength(1));
    channels[0].send({ id: 'a', event: 'task.status_changed', data: event('a', 'task.status_changed', { projectId: 'p1' }) });
    channels[0].send({ id: 'b', event: 'task.status_changed', data: event('b', 'task.status_changed', { projectId: 'p2' }) });
    channels[0].send({ id: 'c', event: 'workflow.status_changed', data: event('c', 'workflow.status_changed', { projectId: 'p1' }) });
    await vi.waitFor(() => expect(stream.lastEventId).toBe('c'));
    expect(p1Tasks).toEqual(['a']);
    off();
    channels[0].send({ id: 'd', event: 'task.status_changed', data: event('d', 'task.status_changed', { projectId: 'p1' }) });
    await vi.waitFor(() => expect(stream.lastEventId).toBe('d'));
    expect(p1Tasks).toEqual(['a']);
    stream.close();
  });

  it('đóng kết nối khi phiên kết thúc: không nối lại', async () => {
    const { stub, channels, stream } = setup();
    stream.connect();
    await vi.waitFor(() => expect(channels).toHaveLength(1));
    stream.close();
    channels[0].end();
    await new Promise((r) => setTimeout(r, 30));
    expect(connections(stub)).toHaveLength(1);
  });

  it('đọc bản ghi nhiều dòng data, CRLF, chú thích', () => {
    const parser = new SseParser();
    const out: Array<{ id?: string; event?: string; data: string }> = [];
    parser.feed(': keep-alive\r\nid: x1\r\nevent: a\r\ndata: {"k":\r\ndata: 1}\r\n\r\n', (r) => out.push(r));
    parser.feed('data: tail', (r) => out.push(r));
    expect(out).toEqual([{ id: 'x1', event: 'a', data: '{"k":\n1}' }]);
    parser.feed('\n\n', (r) => out.push(r));
    expect(out[1]).toEqual({ id: undefined, event: undefined, data: 'tail' });
  });
});
