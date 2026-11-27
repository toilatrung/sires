// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Body, Controller, Module, Post } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServiceApp } from '../bootstrap';
import { ProblemException } from '../errors/problem.exception';
import { startMessagingStack, type MessagingTestStack } from '../outbox/messaging.testkit';
import { uuidv7 } from '../tenancy/uuid';
import { Idempotent, IdempotencyModule, idempotentTransaction } from './interceptor';

const ACCOUNT_A = uuidv7();
const ACCOUNT_B = uuidv7();
const calls = { create: 0, archive: 0 };
const failOnce = new Set<string>();
let slowMs = 0;

interface NoteBody {
  body: string;
}

@Controller('notes')
class NoteController {
  @Post()
  @Idempotent('createNote')
  async create(@Body() input: NoteBody): Promise<{ id: string; body: string }> {
    calls.create += 1;
    const tx = idempotentTransaction();
    const id = uuidv7();
    await tx.execute(sql`INSERT INTO app.note (id, account_id, body) VALUES (${id}, app.current_account_id(), ${input.body})`);
    if (slowMs > 0) await new Promise((resolve) => setTimeout(resolve, slowMs));
    if (failOnce.delete(input.body)) throw new ProblemException('duplicate_name', { detail: 'lỗi lần đầu' });
    return { id, body: input.body };
  }

  @Post('archive')
  @Idempotent('archiveNote')
  archive(@Body() input: NoteBody): { archived: string } {
    calls.archive += 1;
    return { archived: input.body };
  }
}

describe('Idempotency-Key trên PostgreSQL thật (PID-00002 S03)', () => {
  let stack: MessagingTestStack;
  let app: NestFastifyApplication;
  let url: string;

  const post = async (path: string, body: unknown, key: string | undefined, account = ACCOUNT_A) => {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-account-id': account };
    if (key !== undefined) headers['idempotency-key'] = key;
    const res = await fetch(`${url}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const notes = async (body: string) =>
    (await stack.database.admin<{ total: number }>('SELECT count(*)::int AS total FROM app.note WHERE body = $1', [body]))[0].total;

  beforeAll(async () => {
    stack = await startMessagingStack({ rabbit: false });
    @Module({
      imports: [
        IdempotencyModule.forRoot({
          db: stack.appDb,
          accountId: (request) => request.headers['x-account-id'] as string | undefined,
        }),
      ],
      controllers: [NoteController],
    })
    class TestModule {}
    app = await createServiceApp(TestModule, { name: 'idempotency-test', port: 0 }, { logDestination: { write: () => undefined } });
    await app.listen(0, '127.0.0.1');
    url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    await stack?.stop();
  });

  beforeEach(() => {
    calls.create = 0;
    calls.archive = 0;
    slowMs = 0;
  });

  it('gửi lại trả kết quả lần đầu (PID-00002-AC04)', async () => {
    const key = uuidv7();
    const first = await post('/notes', { body: 'ac04' }, key);
    expect(first).toMatchObject({ status: 201, body: { body: 'ac04' } });
    const again = await post('/notes', { body: 'ac04' }, key);
    expect(again).toEqual(first);
    expect(calls.create).toBe(1);
    expect(await notes('ac04')).toBe(1);
    const [stored] = await stack.database.admin<{ response_status: number; ttl: boolean }>(
      "SELECT response_status, expires_at - created_at = interval '24 hours' AS ttl FROM app.idempotency_key WHERE key = $1",
      [key],
    );
    expect(stored).toEqual({ response_status: 201, ttl: true });
  });

  it('cùng khóa khác nội dung (PID-00002-AC05)', async () => {
    const key = uuidv7();
    await post('/notes', { body: 'ac05' }, key);
    const reused = await post('/notes', { body: 'ac05-khác' }, key);
    expect(reused).toMatchObject({ status: 422, body: { code: 'idempotency_key_reused', status: 422 } });
    expect(calls.create).toBe(1);
    expect(await notes('ac05-khác')).toBe(0);
    // Key order does not matter: the body is normalised before hashing.
    const keyB = uuidv7();
    await post('/notes', { body: 'ac05-order', extra: { b: 1, a: 2 } }, keyB);
    expect((await post('/notes', { extra: { a: 2, b: 1 }, body: 'ac05-order' }, keyB)).status).toBe(201);
    expect(calls.create).toBe(2);
  });

  it('hai request đồng thời (EC10)', async () => {
    const key = uuidv7();
    slowMs = 400;
    const [a, b] = await Promise.all([post('/notes', { body: 'ec10' }, key), post('/notes', { body: 'ec10' }, key)]);
    expect(a).toEqual(b);
    expect(a.status).toBe(201);
    expect(calls.create).toBe(1);
    expect(await notes('ec10')).toBe(1);
  });

  it('lần đầu lỗi (EC11)', async () => {
    const key = uuidv7();
    failOnce.add('ec11');
    expect(await post('/notes', { body: 'ec11' }, key)).toMatchObject({ status: 409, body: { code: 'duplicate_name' } });
    expect(await stack.database.admin('SELECT 1 FROM app.idempotency_key WHERE key = $1', [key])).toEqual([]);
    expect(await notes('ec11')).toBe(0);
    expect((await post('/notes', { body: 'ec11' }, key)).status).toBe(201);
    expect(calls.create).toBe(2);
    expect(await notes('ec11')).toBe(1);
  });

  it('khác operation (EC12)', async () => {
    const key = uuidv7();
    await post('/notes', { body: 'ec12' }, key);
    expect(await post('/notes/archive', { body: 'ec12' }, key)).toMatchObject({ status: 422, body: { code: 'idempotency_key_reused' } });
    expect(calls.archive).toBe(0);
    // Keys belong to an account: another account may use the same key.
    expect((await post('/notes/archive', { body: 'ec12' }, key, ACCOUNT_B)).status).toBe(201);
    expect(calls.archive).toBe(1);
  });

  it('khóa hết hạn (EC13)', async () => {
    const key = uuidv7();
    await post('/notes', { body: 'ec13' }, key);
    await stack.database.admin("UPDATE app.idempotency_key SET expires_at = now() - interval '1 second' WHERE key = $1", [key]);
    // Expired but not yet cleaned up: a new request, even with another body.
    expect(await post('/notes', { body: 'ec13-mới' }, key)).toMatchObject({ status: 201, body: { body: 'ec13-mới' } });
    expect(calls.create).toBe(2);
    const rows = await stack.database.admin<{ expired: boolean }>(
      'SELECT expires_at < now() AS expired FROM app.idempotency_key WHERE key = $1',
      [key],
    );
    expect(rows).toEqual([{ expired: false }]);
  });

  it('thiếu header (EC14)', async () => {
    const missing = await post('/notes', { body: 'ec14' }, undefined);
    expect(missing).toMatchObject({
      status: 400,
      body: { code: 'validation_failed', errors: [{ field: 'Idempotency-Key', code: 'required' }] },
    });
    expect(calls.create).toBe(0);
  });

  it('độ dài khóa (EC15)', async () => {
    expect(await post('/notes', { body: 'ec15' }, 'a'.repeat(7))).toMatchObject({
      status: 400,
      body: { code: 'validation_failed', errors: [{ field: 'Idempotency-Key', code: 'too_small' }] },
    });
    expect(await post('/notes', { body: 'ec15' }, 'a'.repeat(129))).toMatchObject({
      status: 400,
      body: { code: 'validation_failed', errors: [{ field: 'Idempotency-Key', code: 'too_big' }] },
    });
    expect(calls.create).toBe(0);
    expect((await post('/notes', { body: 'ec15-8' }, `${uuidv7().slice(0, 8)}`)).status).toBe(201);
    expect((await post('/notes', { body: 'ec15-128' }, 'k'.repeat(120) + uuidv7().slice(0, 8))).status).toBe(201);
  });
});
