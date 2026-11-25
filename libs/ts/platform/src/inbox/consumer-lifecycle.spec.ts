// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventConsumer } from './consumer';

// Order of start() and stop() against connection attempts whose end the test decides (PC-05 P36): amqplib is
// replaced by a fake whose connect() resolves only when the test says so and honours the abort signal.
const broker = vi.hoisted(() => {
  // Hoisted above the imports: a minimal emitter for the 'error' and 'close' events the consumer listens to.
  class Emitter {
    private readonly listeners = new Map<string, ((...args: unknown[]) => void)[]>();
    on(event: string, listener: (...args: unknown[]) => void): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      return this;
    }
    emit(event: string, ...args: unknown[]): void {
      for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }
  }
  class FakeChannel extends Emitter {
    consumers = 0;
    assertExchange = async () => ({});
    assertQueue = async () => ({});
    bindQueue = async () => ({});
    prefetch = async () => ({});
    consume = async () => {
      this.consumers += 1;
      return { consumerTag: `tag-${this.consumers}` };
    };
    cancel = async () => {
      this.consumers -= 1;
      return {};
    };
  }
  class FakeConnection extends Emitter {
    closed = false;
    channel = new FakeChannel();
    createChannel = async () => this.channel;
    close = async () => {
      if (this.closed) return;
      this.closed = true;
      this.emit('close');
    };
  }
  interface Attempt {
    connection: FakeConnection;
    accept(): void;
  }
  const attempts: Attempt[] = [];
  const connect = (_url: string, options: { signal?: AbortSignal }) =>
    new Promise<FakeConnection>((resolve, reject) => {
      const connection = new FakeConnection();
      options.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      attempts.push({ connection, accept: () => resolve(connection) });
    });
  return { attempts, connect };
});

vi.mock('amqplib', () => ({ connect: broker.connect }));

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

function consumer() {
  return new EventConsumer({
    service: 'order',
    db: {} as never,
    amqpUrl: 'amqp://fake',
    handlers: [{ routingKeys: ['project.lifecycle_changed.*'], handle: async () => undefined }],
    reconnectDelayMs: 50,
    reconnectMaxDelayMs: 50,
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  });
}

/** Connections still open and consuming: what the broker would see. */
const live = () => broker.attempts.filter(({ connection }) => !connection.closed && connection.channel.consumers > 0);

beforeEach(() => {
  broker.attempts.length = 0;
});

describe('start() ngay sau stop() không await (PC-05 P36)', () => {
  it('stop() khi lần mở đầu còn dở, start() lại: start() chờ stop() xong, đúng một kết nối và consumer vẫn chạy', async () => {
    const subject = consumer();
    const first = subject.start();
    await flush();
    expect(broker.attempts).toHaveLength(1);

    const stopping = subject.stop();
    const second = subject.start();
    await flush();
    // The second attempt opens only once stop() is done.
    const opened = broker.attempts.length;
    broker.attempts.at(-1)!.accept();
    broker.attempts[0]!.accept();
    await Promise.all([first, stopping]);
    await flush();
    if (broker.attempts.length > opened) broker.attempts.at(-1)!.accept();
    await second;
    await flush();

    expect(live()).toHaveLength(1);
    expect(live()[0]).toBe(broker.attempts.at(-1));
    expect(subject.isConsuming).toBe(true);
    // The consumer is not stuck: losing the link is followed by a reconnect.
    await broker.attempts.at(-1)!.connection.close();
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 100));
    broker.attempts.at(-1)!.accept();
    await flush();
    expect(subject.isConsuming).toBe(true);
    expect(live()).toHaveLength(1);
    await subject.stop();
    expect(live()).toEqual([]);
  });

  it('stop() khi đang consume, start() lại không await: kết nối cũ đóng, kết nối mới consume', async () => {
    const subject = consumer();
    const first = subject.start();
    await flush();
    broker.attempts[0]!.accept();
    await first;
    expect(subject.isConsuming).toBe(true);

    const stopping = subject.stop();
    const second = subject.start();
    await stopping;
    await flush();
    expect(broker.attempts).toHaveLength(2);
    broker.attempts[1]!.accept();
    await second;
    expect(broker.attempts[0]!.connection.closed).toBe(true);
    expect(live()).toEqual([broker.attempts[1]]);
    expect(subject.isConsuming).toBe(true);
    await subject.stop();
    expect(live()).toEqual([]);
  });

  it('start(), stop(), start(), stop() không await: lệnh cuối thắng, không còn kết nối', async () => {
    const subject = consumer();
    const calls = [subject.start(), subject.stop(), subject.start(), subject.stop()];
    await flush();
    for (const attempt of broker.attempts) attempt.accept();
    await Promise.all(calls);
    await flush();
    expect(live()).toEqual([]);
    expect(subject.isConsuming).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(live()).toEqual([]);
  });
});
