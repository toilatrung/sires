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

// Demonstration uses the existing planning identity and task.activated envelope, without deploying a new service
// or extending ServiceName/contracts. The table and endpoint belong only to this sample.
export const SAMPLE_SERVICE_IDENTITY = 'planning' as const;
export const SAMPLE_CONSUMER = 'sample-service';

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
        producer: SAMPLE_SERVICE_IDENTITY, type: 'task.activated', accountId, actor,
        aggregate: { type: 'sample_record', id, version: record.rowVersion },
        data: { taskId: id },
      });
      await emitAudit(tx, {
        producer: SAMPLE_SERVICE_IDENTITY, accountId, actor, action: 'task.activated',
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
      routingKeys: ['task.activated'],
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
