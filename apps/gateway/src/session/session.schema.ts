// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { sql } from 'drizzle-orm';
import { customType, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });
const app = pgSchema('app');
const time = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** Feature mapping of the approved SQL; migration is the DDL source of truth. */
export const session = app.table('session', {
  id: uuid('id')
    .primaryKey()
    .default(sql`app.uuid_v7()`),
  accountId: uuid('account_id').notNull(),
  sidHash: bytea('sid_hash').notNull().unique(),
  csrfTokenHash: bytea('csrf_token_hash').notNull(),
  oidcSid: text('oidc_sid'),
  refreshTokenEnc: bytea('refresh_token_enc'),
  userAgentHash: bytea('user_agent_hash'),
  createdAt: time('created_at').notNull().defaultNow(),
  lastSeenAt: time('last_seen_at').notNull().defaultNow(),
  idleExpiresAt: time('idle_expires_at')
    .notNull()
    .default(sql`now() + interval '12 hours'`),
  absoluteExpiresAt: time('absolute_expires_at').notNull(),
  revokedAt: time('revoked_at'),
  revokeReason: text('revoke_reason'),
});
