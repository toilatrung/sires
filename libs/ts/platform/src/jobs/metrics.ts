// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { metrics, type Meter, type ObservableResult } from '@opentelemetry/api';
import { sql } from 'drizzle-orm';
import type { SqlExecutor } from '../outbox/outbox';

// Age of the oldest unpublished outbox row (PID-00002 S05, architecture 11.4): the alert “outbox unpublished > 30 s”
// is built on this gauge by operations (PID-00057). Read with the `_system` role.

export const OUTBOX_AGE_METRIC = 'sires.outbox.oldest_unpublished_age';

/** Seconds since the oldest unpublished outbox row was written; 0 when every row is published. */
export async function oldestUnpublishedOutboxAgeSeconds(db: SqlExecutor): Promise<number> {
  const { rows } = await db.execute(sql`
    SELECT coalesce(extract(epoch FROM now() - min(created_at)), 0)::float8 AS age
    FROM app.outbox WHERE published_at IS NULL`);
  return Math.max(0, Number((rows[0] as { age: number }).age));
}

/**
 * Registers the observable gauge {@link OUTBOX_AGE_METRIC} (unit `s`), read at each metric collection. Returns a
 * function that unregisters it.
 */
export function registerOutboxAgeMetric(db: SqlExecutor, meter: Meter = metrics.getMeter('@sires/platform')): () => void {
  const gauge = meter.createObservableGauge(OUTBOX_AGE_METRIC, {
    unit: 's',
    description: 'Tuổi dòng outbox chưa publish cũ nhất',
  });
  const callback = async (result: ObservableResult) => {
    result.observe(await oldestUnpublishedOutboxAgeSeconds(db));
  };
  gauge.addCallback(callback);
  return () => gauge.removeCallback(callback);
}
