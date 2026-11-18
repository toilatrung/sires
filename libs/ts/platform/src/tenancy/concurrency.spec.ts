// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Body, Controller, Headers, HttpStatus, Inject, NotFoundException, Param, Patch, PreconditionFailedException } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertIfMatch,
  formatEtag,
  parseIfMatch,
  PreconditionRequiredException,
  updateIfMatch,
} from './concurrency';
import { note, startTenantDatabase, type TenantTestDatabase } from './postgres.testkit';
import { type TenantDatabase, withAccountTransaction } from './transaction';
import { uuidv7 } from './uuid';

const ACCOUNT = uuidv7();
const DB = Symbol('DB');

/** Minimal controller shaped like a service write endpoint: PATCH with If-Match, answers the new ETag. */
@Controller('notes')
class NotesController {
  constructor(@Inject(DB) private readonly db: TenantDatabase) {}

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: { body: string },
  ): Promise<{ etag: string; body: string }> {
    return withAccountTransaction(this.db, ACCOUNT, async (tx) => {
      const [current] = await tx.select().from(note).where(eq(note.id, id));
      if (!current) throw new NotFoundException();
      const updated = await updateIfMatch(ifMatch, (expected) =>
        tx
          .update(note)
          .set({ body: body.body })
          .where(and(eq(note.id, id), eq(note.rowVersion, expected)))
          .returning(),
      );
      return { etag: formatEtag(updated.rowVersion), body: updated.body };
    });
  }
}

describe('If-Match — đọc header', () => {
  it('ETag là rowVersion trong ngoặc kép', () => {
    expect(formatEtag(7)).toBe('"7"');
    expect(() => formatEtag(-1)).toThrow(TypeError);
    expect(() => formatEtag(1.5)).toThrow(TypeError);
  });

  it('đọc phiên bản từ ETag mạnh', () => {
    expect(parseIfMatch('"7"')).toBe(7);
    expect(parseIfMatch(' "12" ')).toBe(12);
    expect(parseIfMatch(['"3"'])).toBe(3);
  });

  it('thiếu If-Match trả 428', () => {
    for (const missing of [undefined, '', '  ', []]) {
      const error = captureError(() => parseIfMatch(missing));
      expect(error).toBeInstanceOf(PreconditionRequiredException);
      expect((error as PreconditionRequiredException).getStatus()).toBe(HttpStatus.PRECONDITION_REQUIRED);
    }
  });

  it('giá trị không chỉ ra được một phiên bản trả 412', () => {
    for (const value of ['*', 'W/"7"', '7', '"7", "8"', '"abc"', '"1234567890123456"']) {
      const error = captureError(() => parseIfMatch(value));
      expect(error, value).toBeInstanceOf(PreconditionFailedException);
    }
  });

  it('so với phiên bản hiện hành', () => {
    expect(() => assertIfMatch('"4"', 4)).not.toThrow();
    expect(captureError(() => assertIfMatch('"3"', 4))).toBeInstanceOf(PreconditionFailedException);
  });
});

describe('If-Match — cập nhật trên PostgreSQL thật', () => {
  let database: TenantTestDatabase;
  let pool: Pool;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    database = await startTenantDatabase();
    pool = new Pool({ connectionString: database.appUrl, max: 2 });
    const moduleRef = await Test.createTestingModule({
      controllers: [NotesController],
      providers: [{ provide: DB, useValue: drizzle(pool) }],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await database?.stop();
  }, 60_000);

  async function seedNote(): Promise<string> {
    const id = uuidv7();
    await database.admin('INSERT INTO app.note (id, account_id, body) VALUES ($1, $2, $3)', [id, ACCOUNT, 'v1']);
    return id;
  }

  async function readNote(id: string) {
    const [row] = await database.admin<{ body: string; row_version: number }>(
      'SELECT body, row_version FROM app.note WHERE id = $1',
      [id],
    );
    return row;
  }

  it('lệch phiên bản trả 412', async () => {
    const id = await seedNote();

    const first = await app.inject({ method: 'PATCH', url: `/notes/${id}`, headers: { 'if-match': '"1"' }, payload: { body: 'v2' } });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ etag: '"2"', body: 'v2' });

    const stale = await app.inject({ method: 'PATCH', url: `/notes/${id}`, headers: { 'if-match': '"1"' }, payload: { body: 'v3' } });
    expect(stale.statusCode).toBe(412);
    expect(await readNote(id)).toEqual({ body: 'v2', row_version: 2 });
  });

  it('thiếu If-Match trả 428, dữ liệu không đổi', async () => {
    const id = await seedNote();
    const response = await app.inject({ method: 'PATCH', url: `/notes/${id}`, payload: { body: 'x' } });
    expect(response.statusCode).toBe(428);
    expect(await readNote(id)).toEqual({ body: 'v1', row_version: 1 });
  });

  it('helper trực tiếp: lệch phiên bản ném 412, không cập nhật dòng nào', async () => {
    const id = await seedNote();
    const db = drizzle(pool);
    const error = await withAccountTransaction(db, ACCOUNT, (tx) =>
      updateIfMatch('"5"', (expected) =>
        tx
          .update(note)
          .set({ body: 'không được ghi' })
          .where(and(eq(note.id, id), eq(note.rowVersion, expected)))
          .returning(),
      ),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PreconditionFailedException);
    expect((error as PreconditionFailedException).getStatus()).toBe(412);
    expect(await readNote(id)).toEqual({ body: 'v1', row_version: 1 });
  });
});

function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected an error');
}
