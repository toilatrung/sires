// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const sampleRecord = pgSchema('app').table('sample_record', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id').notNull(),
  status: text('status').notNull().default('Created'),
  effects: integer('effects').notNull().default(0),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
