// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// In-memory stand-in for the `sires.events` topic exchange (architecture: routing key = envelope `type`). Messages
// are queued per consumer and delivered only on flush(), where duplicate and out-of-order delivery are injected
// from a seeded PRNG, so the same scenario always yields the same deliveries (PID-00004 S03).

/**
 * Minimal envelope shape the broker needs. Pass the EventEnvelope type from @sires/contracts once it is generated
 * from AsyncAPI (PID-00007); until then any object with `id` and `type` works.
 */
export interface BrokerMessage {
  readonly id: string;
  readonly type: string;
}

export interface FakeBrokerFaults {
  /** PRNG seed (mulberry32). Default 1. */
  seed?: number;
  /** Event ids delivered twice; the copy follows the original and is flagged `redelivered`. */
  duplicateIds?: readonly string[];
  /** Share in [0, 1] of the other messages, drawn from the PRNG, that are delivered twice. */
  duplicateRate?: number;
  /** Reorders each consecutive window of `window` deliveries: `shuffle` (seeded, default) or `reverse`. */
  reorder?: { window: number; mode?: 'shuffle' | 'reverse' };
}

export interface DeliveryMeta {
  readonly consumer: string;
  readonly routingKey: string;
  readonly redelivered: boolean;
}

export type BrokerHandler<E> = (envelope: E, meta: DeliveryMeta) => void | Promise<void>;

export interface Delivery<E> extends DeliveryMeta {
  /** Position in the broker-wide delivery log, from 0. */
  readonly seq: number;
  readonly envelope: E;
  readonly error?: unknown;
}

/** Guards against handlers that publish forever. */
const MAX_FLUSH_ROUNDS = 1000;

interface Subscription<E> {
  consumer: string;
  patterns: string[];
  handler: BrokerHandler<E>;
  queue: { envelope: E; redelivered: boolean }[];
}

/** AMQP topic matching: words split on '.', '*' = exactly one word, '#' = zero or more words. */
export function topicMatches(pattern: string, routingKey: string): boolean {
  const match = (p: string[], k: string[]): boolean => {
    if (p.length === 0) return k.length === 0;
    const [head, ...rest] = p;
    if (head === '#') return match(rest, k) || (k.length > 0 && match(p, k.slice(1)));
    if (k.length === 0) return false;
    return (head === '*' || head === k[0]) && match(rest, k.slice(1));
  };
  return match(pattern.split('.'), routingKey.split('.'));
}

/** mulberry32: tiny deterministic PRNG returning floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class FakeBroker<E extends BrokerMessage = BrokerMessage> {
  private readonly subscriptions: Subscription<E>[] = [];
  private readonly log: Delivery<E>[] = [];
  private faults: FakeBrokerFaults = {};
  private random: () => number = mulberry32(1);

  constructor(faults: FakeBrokerFaults = {}) {
    this.setFaults(faults);
  }

  /** Replaces the fault scenario and reseeds the PRNG. */
  setFaults(faults: FakeBrokerFaults): void {
    const rate = faults.duplicateRate ?? 0;
    if (rate < 0 || rate > 1) throw new RangeError('duplicateRate must be within [0, 1]');
    if (faults.reorder && (!Number.isInteger(faults.reorder.window) || faults.reorder.window < 1)) {
      throw new RangeError('reorder.window must be a positive integer');
    }
    this.faults = { ...faults };
    this.random = mulberry32(faults.seed ?? 1);
  }

  /** Binds a named consumer queue to routing patterns. Returns an unsubscribe function. */
  subscribe(consumer: string, patterns: string | readonly string[], handler: BrokerHandler<E>): () => void {
    if (this.subscriptions.some((s) => s.consumer === consumer)) {
      throw new Error(`consumer ${consumer} is already subscribed`);
    }
    const subscription: Subscription<E> = {
      consumer,
      patterns: typeof patterns === 'string' ? [patterns] : [...patterns],
      handler,
      queue: [],
    };
    this.subscriptions.push(subscription);
    return () => {
      const index = this.subscriptions.indexOf(subscription);
      if (index >= 0) this.subscriptions.splice(index, 1);
    };
  }

  /** Routes the envelope by its `type` to every matching consumer queue (a deep copy each). Nothing is delivered yet. */
  publish(envelope: E): void {
    for (const s of this.subscriptions) {
      if (s.patterns.some((p) => topicMatches(p, envelope.type))) {
        s.queue.push({ envelope: structuredClone(envelope), redelivered: false });
      }
    }
  }

  /** Messages waiting in all consumer queues. */
  get pending(): number {
    return this.subscriptions.reduce((n, s) => n + s.queue.length, 0);
  }

  /** Every delivery so far, in order. */
  get deliveries(): readonly Delivery<E>[] {
    return this.log;
  }

  /**
   * Delivers every queued message, consumer by consumer in subscription order, applying the fault scenario.
   * Handlers run one at a time and may publish; those messages are delivered in a following round of the same
   * flush. Handler errors are recorded on the delivery and rethrown together once the queues are empty.
   */
  async flush(): Promise<Delivery<E>[]> {
    const delivered: Delivery<E>[] = [];
    for (let round = 0; this.pending > 0; round += 1) {
      if (round >= MAX_FLUSH_ROUNDS) throw new Error(`flush did not settle after ${MAX_FLUSH_ROUNDS} rounds`);
      for (const s of [...this.subscriptions]) {
        const batch = this.applyFaults(s.queue.splice(0));
        for (const item of batch) {
          const meta: DeliveryMeta = { consumer: s.consumer, routingKey: item.envelope.type, redelivered: item.redelivered };
          let error: unknown;
          try {
            await s.handler(item.envelope, meta);
          } catch (caught) {
            error = caught ?? new Error('handler failed');
          }
          const delivery: Delivery<E> = {
            ...meta,
            seq: this.log.length,
            envelope: item.envelope,
            ...(error === undefined ? {} : { error }),
          };
          this.log.push(delivery);
          delivered.push(delivery);
        }
      }
    }
    const failures = delivered.filter((d) => 'error' in d);
    if (failures.length > 0) {
      throw new AggregateError(failures.map((d) => d.error), `${failures.length} delivery(ies) failed`);
    }
    return delivered;
  }

  /** Drops queued messages and the delivery log; subscriptions stay. */
  reset(): void {
    for (const s of this.subscriptions) s.queue.length = 0;
    this.log.length = 0;
    this.setFaults(this.faults);
  }

  private applyFaults(queue: { envelope: E; redelivered: boolean }[]): { envelope: E; redelivered: boolean }[] {
    const ids = new Set(this.faults.duplicateIds ?? []);
    const rate = this.faults.duplicateRate ?? 0;
    const withCopies = queue.flatMap((item) => {
      const twice = ids.has(item.envelope.id) || (rate > 0 && this.random() < rate);
      return twice ? [item, { envelope: structuredClone(item.envelope), redelivered: true }] : [item];
    });
    const reorder = this.faults.reorder;
    if (!reorder || reorder.window < 2) return withCopies;
    const out: typeof withCopies = [];
    for (let start = 0; start < withCopies.length; start += reorder.window) {
      const window = withCopies.slice(start, start + reorder.window);
      if (reorder.mode === 'reverse') {
        window.reverse();
      } else {
        for (let i = window.length - 1; i > 0; i -= 1) {
          const j = Math.floor(this.random() * (i + 1));
          [window[i], window[j]] = [window[j] as (typeof window)[number], window[i] as (typeof window)[number]];
        }
      }
      out.push(...window);
    }
    return out;
  }
}
