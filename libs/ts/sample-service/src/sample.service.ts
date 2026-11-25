// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import {
  emitAudit, EventConsumer, withAccountTransaction, writeEvent,
  type TenantDatabase,
} from '@sires/platform';
import { sampleRecord } from './schema';

// The sample has its own event type, outside docs/api-design (spec 2.3: no contract or table of a real service; QC
// PID-00006 G2, PO 24/11/2026). `planning` is borrowed only because `producer` and service-auth accept a ServiceName
// alone; the sample is not deployed. The table, endpoint and event type belong only to this sample.
export const SAMPLE_SERVICE_IDENTITY = 'planning' as const;
export const SAMPLE_CONSUMER = 'sample-service';
export const SAMPLE_EVENT_TYPE = 'sample_record.activated';

@Injectable()
export class SampleService {
  constructor(private readonly db: TenantDatabase) {}

  async activate(accountId: string, id: string): Promise<void> {
    await withAccountTransaction(this.db, accountId, async (tx) => {
      const [record] = await tx.update(sampleRecord).set({ status: 'Active' })
        .where(eq(sampleRecord.id, id)).returning();
      if (!record) throw new Error('Không thấy bản ghi mẫu trong tài khoản');
      const actor = { type: 'system', component: 'sample-service' } as const;
      await writeEvent(tx, {
        producer: SAMPLE_SERVICE_IDENTITY, type: SAMPLE_EVENT_TYPE, accountId, actor,
        aggregate: { type: 'sample_record', id, version: record.rowVersion },
        data: { sampleRecordId: id },
      });
      await emitAudit(tx, {
        producer: SAMPLE_SERVICE_IDENTITY, accountId, actor, action: SAMPLE_EVENT_TYPE,
        objectType: 'sample_record', objectId: id, objectVersion: record.rowVersion,
        fromState: 'Created', toState: 'Active',
      });
    });
  }
}

/** _system connection: inbox and effect commit together using only the public consumer API. */
export function createSampleConsumer(db: TenantDatabase, amqpUrl: string): EventConsumer {
  return new EventConsumer({
    service: SAMPLE_CONSUMER, db, amqpUrl,
    handlers: [{
      routingKeys: [SAMPLE_EVENT_TYPE],
      handle: async (event, tx) => {
        const updated = await tx.update(sampleRecord)
          .set({ effects: sql`${sampleRecord.effects} + 1` })
          .where(and(eq(sampleRecord.id, event.aggregate.id), eq(sampleRecord.accountId, event.accountId)))
          .returning({ id: sampleRecord.id });
        if (updated.length !== 1) throw new Error('Không thấy đích sự kiện mẫu');
      },
    }],
  });
}
