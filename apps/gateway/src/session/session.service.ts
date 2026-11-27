// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ProblemException, withAccountTransaction } from '@sires/platform';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { csrfToken, equalHash, hashToken, newSessionId, sessionCookie, validSessionId } from './session.crypto';
import { session } from './session.schema';

export const SESSION_OPTIONS = Symbol('gateway.session.options');

export interface SessionOptions {
  databaseUrl: string;
  csrfKey: Buffer;
}

/** The only fields exposed by app.find_session before a tenant context exists. */
export interface CurrentSession {
  id: string;
  accountId: string;
  csrfTokenHash: Buffer;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

export interface CreateSessionInput {
  accountId: string;
  absoluteExpiresAt: Date;
  oidcSid?: string;
  refreshTokenEnc?: Buffer;
  userAgentHash?: Buffer;
}

@Injectable()
export class SessionService implements OnApplicationShutdown {
  private readonly pool: Pool;
  private readonly db;
  private readonly csrfKey: Buffer;

  constructor(@Inject(SESSION_OPTIONS) options: SessionOptions) {
    if (!options.databaseUrl || options.csrfKey.length !== 32) throw new Error('Invalid gateway session configuration');
    this.pool = new Pool({ connectionString: options.databaseUrl });
    this.db = drizzle(this.pool);
    this.csrfKey = Buffer.from(options.csrfKey);
  }

  async find(sessionId: string): Promise<CurrentSession> {
    if (!validSessionId(sessionId)) throw new ProblemException('unauthenticated');
    const result = await this.db.execute<{
      id: string;
      account_id: string;
      csrf_token_hash: Buffer;
      idle_expires_at: Date;
      absolute_expires_at: Date;
    }>(sql`select * from app.find_session(${hashToken(sessionId)})`);
    const row = result.rows[0];
    if (!row) throw new ProblemException('unauthenticated');
    return {
      id: row.id,
      accountId: row.account_id,
      csrfTokenHash: row.csrf_token_hash,
      idleExpiresAt: row.idle_expires_at,
      absoluteExpiresAt: row.absolute_expires_at,
    };
  }

  requireCsrf(current: CurrentSession, sessionId: string, header: string | string[] | undefined): void {
    // Both checks are required: the stored hash binds to the issued session, the current HMAC invalidates old keys.
    if (
      typeof header !== 'string' ||
      !equalHash(hashToken(header), current.csrfTokenHash) ||
      !equalHash(hashToken(header), hashToken(this.getCsrfToken(sessionId)))
    ) {
      throw new ProblemException('forbidden');
    }
  }

  async renew(current: CurrentSession): Promise<void> {
    await withAccountTransaction(this.db, current.accountId, async (tx) => {
      // Recheck under the row lock: concurrent requests must never revive an expired/revoked session or move time back.
      const rows = await tx
        .update(session)
        .set({
          lastSeenAt: sql`greatest(${session.lastSeenAt}, statement_timestamp())`,
          idleExpiresAt: sql`greatest(${session.idleExpiresAt}, statement_timestamp() + interval '12 hours')`,
        })
        .where(
          and(
            eq(session.id, current.id),
            isNull(session.revokedAt),
            gt(session.idleExpiresAt, sql`statement_timestamp()`),
            gt(session.absoluteExpiresAt, sql`statement_timestamp()`),
          ),
        )
        .returning({ id: session.id });
      if (!rows.length) throw new ProblemException('unauthenticated');
    });
  }

  async create(input: CreateSessionInput): Promise<{
    sessionId: string;
    csrfToken: string;
    cookie: string;
    session: typeof session.$inferSelect;
  }> {
    if (!Number.isFinite(input.absoluteExpiresAt.getTime()) || input.absoluteExpiresAt.getTime() <= Date.now()) {
      throw new TypeError('absoluteExpiresAt must be a future date');
    }
    const sessionId = newSessionId();
    const token = this.getCsrfToken(sessionId);
    const [created] = await withAccountTransaction(this.db, input.accountId, (tx) =>
      tx
        .insert(session)
        .values({
          ...input,
          sidHash: hashToken(sessionId),
          csrfTokenHash: hashToken(token),
        })
        .returning(),
    );
    return { sessionId, csrfToken: token, cookie: sessionCookie(sessionId, input.absoluteExpiresAt), session: created };
  }

  /** PID-00038 passes the current cookie id; no clear token is stored or read from PostgreSQL. */
  getCsrfToken(sessionId: string): string {
    if (!validSessionId(sessionId)) throw new ProblemException('unauthenticated');
    return csrfToken(this.csrfKey, sessionId);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
