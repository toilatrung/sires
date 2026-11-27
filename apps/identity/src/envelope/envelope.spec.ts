// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Module envelope (PID-00016 S03, S04): chỉ lưu bản mã, không log key (PID-00016-AC01, NFR-SECRETS-001-AC01), lỗi
// KMS và database (EC01, EC02), AAD (EC03), DEK ngẫu nhiên (EC04), KMS cục bộ (EC09, EC10). Giải mã chỉ có trong
// test này để kiểm (H2). Cần Docker (Testcontainers).

import { createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { createLogger, withAccountTransaction, type TenantDatabase } from '@sires/platform';
import { LocalKms } from '@sires/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type IdentityPostgres, startIdentityPostgres } from '../db/database.testkit';
import { runMigrations } from '../db/migrate';
import type { KmsPort } from './kms';
import { LOCAL_KMS_ENV, LocalKeyKms, LocalKmsConfigError } from './local-kms';
import { ProviderSecretError, ProviderSecretService } from './provider-secret.service';

/** Key mẫu của NFR-SECRETS-001-AC01. */
const KNOWN_KEY = 'sk-test-KNOWN';
const DB = 'identity_envelope';
const ACTOR = JSON.stringify({ type: 'system', component: 'identity-test' });

interface SecretRow extends Record<string, unknown> {
  account_id: string;
  ciphertext: Buffer;
  nonce: Buffer;
  wrapped_dek: Buffer;
  kek_version: string;
}

/** Cổng KMS dùng LocalKms của @sires/testing (bọc bằng KEK trong bộ nhớ; test giải mã lại được). */
function testKms(kms: LocalKms): KmsPort {
  return { wrapDek: async (dek) => ({ wrappedDek: await kms.encrypt(dek), keyId: kms.primaryKeyId }) };
}

/** Giải mã chỉ trong test (H2): tag 16 byte cuối ciphertext, DEK mở qua `unwrap`. */
function openSecret(row: SecretRow, dek: Buffer, aad: string): string {
  const decipher = createDecipheriv('aes-256-gcm', dek, row.nonce);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(row.ciphertext.subarray(row.ciphertext.length - 16));
  return Buffer.concat([decipher.update(row.ciphertext.subarray(0, row.ciphertext.length - 16)), decipher.final()]).toString('utf8');
}

/** Mở wrapped DEK của KMS cục bộ như decrypt của sires_common.testing.LocalKms: nonce 12 byte, rồi ciphertext+tag. */
function unwrapLocal(wrapped: Buffer, kek: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', kek, wrapped.subarray(0, 12));
  decipher.setAuthTag(wrapped.subarray(wrapped.length - 16));
  return Buffer.concat([decipher.update(wrapped.subarray(12, wrapped.length - 16)), decipher.final()]);
}

describe('module envelope (PID-00016 S03, S04)', () => {
  let pg: IdentityPostgres;
  let pool: Pool;
  let db: TenantDatabase;
  const logs: string[] = [];
  const logger = createLogger({ service: 'identity', level: 'debug', accountHashKey: 'test', destination: { write: (line: string) => void logs.push(line) } });
  const kms = new LocalKms({ keyId: 'sires-provider-keys/1' });

  beforeAll(async () => {
    pg = await startIdentityPostgres();
    await pg.createDatabase(DB);
    await runMigrations(pg.url(DB));
    pool = new Pool({ connectionString: pg.url(DB, 'app'), max: 2 });
    db = drizzle(pool);
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await pg?.stop();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const seedConnection = async (): Promise<{ accountId: string; connectionId: string }> => {
    const accountId = randomUUID();
    const connectionId = randomUUID();
    await pg.admin(DB, `INSERT INTO app.account (id, auth_issuer, auth_subject, display_name, created_by) VALUES ($1, 'https://id.etroy.test', $2, 'Researcher', $3)`,
      [accountId, `sub-${accountId}`, ACTOR]);
    await pg.admin(DB, `INSERT INTO app.provider_connection (id, account_id, name, provider, base_url, key_hint, created_by)
      VALUES ($1, $2, 'Anthropic', 'anthropic', 'https://api.anthropic.com', 'NOWN', $3)`, [connectionId, accountId, ACTOR]);
    return { accountId, connectionId };
  };
  const secretRows = (connectionId: string) =>
    pg.admin<SecretRow>(DB, 'SELECT account_id, ciphertext, nonce, wrapped_dek, kek_version FROM app.provider_secret WHERE connection_id = $1', [connectionId]);
  /** Bản dump dữ liệu dạng rõ của cả database sires_identity. */
  const dataDump = async (): Promise<string> => {
    const result = await pg.server.container.exec(['pg_dump', '--data-only', '-U', pg.server.username, '-d', DB]);
    if (result.exitCode !== 0) throw new Error(result.stderr);
    return result.stdout;
  };
  /** Bắt mọi thứ ghi ra stdout, stderr trong lúc `work` chạy (ngoài logger của module). */
  const captureOutput = async <T>(work: () => Promise<T>): Promise<{ result: T | undefined; error: unknown; output: string }> => {
    const chunks: string[] = [];
    const record = (chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stdout, 'write').mockImplementation(record);
    vi.spyOn(process.stderr, 'write').mockImplementation(record);
    try {
      return { result: await work(), error: undefined, output: chunks.join('') };
    } catch (error) {
      return { result: undefined, error, output: chunks.join('') };
    } finally {
      vi.restoreAllMocks();
    }
  };
  const hasKey = (text: string) => text.includes(KNOWN_KEY) || text.includes(Buffer.from(KNOWN_KEY).toString('hex'));

  it('chỉ lưu bản mã, không log key (PID-00016-AC01, NFR-SECRETS-001-AC01)', async () => {
    logs.length = 0;
    const service = new ProviderSecretService(testKms(kms), logger);
    const { accountId, connectionId } = await seedConnection();
    const run = await captureOutput(() =>
      withAccountTransaction(db, accountId, (tx) => service.store(tx, { accountId, connectionId, apiKey: KNOWN_KEY })));
    expect(run.error).toBeUndefined();
    expect(run.result).toEqual({ connectionId, kekVersion: 'sires-provider-keys/1' });

    const rows = await secretRows(connectionId);
    expect(rows).toHaveLength(1);
    const [row] = rows as [SecretRow];
    // ciphertext = dữ liệu mã hóa rồi tag 16 byte (H4); nonce 12 byte; kek_version = id khóa đã bọc DEK.
    expect(row.ciphertext.length).toBe(Buffer.byteLength(KNOWN_KEY) + 16);
    expect(row.nonce.length).toBe(12);
    expect(row.wrapped_dek.length).toBeGreaterThan(32);
    expect(row.kek_version).toBe(kms.primaryKeyId);
    expect(row.account_id).toBe(accountId);

    // Không thấy key ở dạng chuỗi hay hex: dump dữ liệu của database, log của module, mọi thứ ra stdout/stderr.
    const dump = await dataDump();
    expect(dump).toContain(connectionId);
    expect(hasKey(dump)).toBe(false);
    expect(logs.some((line) => line.includes('đã lưu provider secret'))).toBe(true);
    expect(hasKey(logs.join('\n'))).toBe(false);
    expect(hasKey(run.output)).toBe(false);

    // Giải mã trong test (H2): DEK mở qua LocalKms, AAD đúng → ra đúng key.
    const dek = await kms.decrypt(row.wrapped_dek);
    expect(openSecret(row, dek, `${accountId}|${connectionId}`)).toBe(KNOWN_KEY);
  });

  it('chỉ lưu bản mã, không log key — mã của identity không có đường giải mã (H2)', () => {
    const service = new ProviderSecretService(testKms(kms), logger) as unknown as Record<string, unknown>;
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service)).filter((name) => name !== 'constructor');
    expect(methods).toEqual(['store']);
    expect(Object.getOwnPropertyNames(LocalKeyKms.prototype).filter((name) => name !== 'constructor')).toEqual(['wrapDek']);
  });

  it('KMS lỗi thì không lưu (EC01)', async () => {
    logs.length = 0;
    const failing: KmsPort = { wrapDek: () => Promise.reject(new Error(`KMS timeout while wrapping for ${KNOWN_KEY}`)) };
    const service = new ProviderSecretService(failing, logger);
    const { accountId, connectionId } = await seedConnection();
    const run = await captureOutput(() =>
      withAccountTransaction(db, accountId, (tx) => service.store(tx, { accountId, connectionId, apiKey: KNOWN_KEY })));
    expect(run.error).toBeInstanceOf(ProviderSecretError);
    expect(run.error).toMatchObject({ code: 'kms_unavailable' });
    // Lỗi của module không mang lỗi gốc (có thể chứa dữ liệu) và không chứa key.
    expect((run.error as Error).cause).toBeUndefined();
    expect(hasKey(String(run.error)) || hasKey(JSON.stringify(run.error))).toBe(false);
    expect(await secretRows(connectionId)).toEqual([]);
    expect(hasKey(logs.join('\n')) || hasKey(run.output) || hasKey(await dataDump())).toBe(false);
  });

  it('lỗi database không lộ key (EC02)', async () => {
    logs.length = 0;
    const service = new ProviderSecretService(testKms(kms), logger);
    const { accountId } = await seedConnection();
    const missingConnection = randomUUID();
    const run = await captureOutput(() =>
      withAccountTransaction(db, accountId, async (tx) => {
        await tx.execute(`UPDATE app.provider_connection SET name = 'đổi trong cùng giao dịch' WHERE account_id = '${accountId}'`);
        return service.store(tx, { accountId, connectionId: missingConnection, apiKey: KNOWN_KEY });
      }));
    expect(run.error).toMatchObject({ code: 'store_failed', sqlState: '23503' });
    expect((run.error as Error).cause).toBeUndefined();
    expect(hasKey((run.error as Error).message) || hasKey(JSON.stringify(run.error))).toBe(false);
    // Rollback cả giao dịch của bên gọi: không có dòng secret, thay đổi khác cũng không còn.
    expect(await pg.admin(DB, 'SELECT count(*)::int AS n FROM app.provider_secret WHERE account_id = $1', [accountId])).toEqual([{ n: 0 }]);
    expect(await pg.admin(DB, 'SELECT name FROM app.provider_connection WHERE account_id = $1', [accountId])).toEqual([{ name: 'Anthropic' }]);
    expect(hasKey(logs.join('\n')) || hasKey(run.output)).toBe(false);
    expect(logs.some((line) => line.includes('"sqlstate":"23503"'))).toBe(true);

    // Giao dịch thuộc tài khoản khác (RLS): cũng store_failed, không ghi.
    const other = await seedConnection();
    const rls = await withAccountTransaction(db, accountId, (tx) =>
      service.store(tx, { accountId: other.accountId, connectionId: other.connectionId, apiKey: KNOWN_KEY })).catch((e: unknown) => e);
    expect(rls).toMatchObject({ code: 'store_failed', sqlState: '42501' });
    expect(await secretRows(other.connectionId)).toEqual([]);
  });

  it('AAD khác không giải mã được (EC03)', async () => {
    const service = new ProviderSecretService(testKms(kms), logger);
    const first = await seedConnection();
    await withAccountTransaction(db, first.accountId, (tx) => service.store(tx, { ...first, apiKey: KNOWN_KEY }));
    const [row] = (await secretRows(first.connectionId)) as [SecretRow];
    const dek = await kms.decrypt(row.wrapped_dek);
    expect(() => openSecret(row, dek, `${first.accountId}|${randomUUID()}`)).toThrow();
    expect(() => openSecret(row, dek, `${randomUUID()}|${first.connectionId}`)).toThrow();
    expect(openSecret(row, dek, `${first.accountId}|${first.connectionId}`)).toBe(KNOWN_KEY);
  });

  it('hai lần lưu khác ciphertext (EC04)', async () => {
    const service = new ProviderSecretService(testKms(kms), logger);
    const { accountId, connectionId } = await seedConnection();
    const second = randomUUID();
    await pg.admin(DB, `INSERT INTO app.provider_connection (id, account_id, name, provider, base_url, key_hint, created_by)
      VALUES ($1, $2, 'Anthropic 2', 'anthropic', 'https://api.anthropic.com', 'NOWN', $3)`, [second, accountId, ACTOR]);
    await withAccountTransaction(db, accountId, async (tx) => {
      await service.store(tx, { accountId, connectionId, apiKey: KNOWN_KEY });
      await service.store(tx, { accountId, connectionId: second, apiKey: KNOWN_KEY });
    });
    const [a] = (await secretRows(connectionId)) as [SecretRow];
    const [b] = (await secretRows(second)) as [SecretRow];
    const [dekA, dekB] = [await kms.decrypt(a.wrapped_dek), await kms.decrypt(b.wrapped_dek)];
    expect(dekA.equals(dekB)).toBe(false);
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect([openSecret(a, dekA, `${accountId}|${connectionId}`), openSecret(b, dekB, `${accountId}|${second}`)]).toEqual([KNOWN_KEY, KNOWN_KEY]);
  });

  it('KMS cục bộ dùng lại được sau khởi động lại (EC09)', async () => {
    const kek = randomBytes(32);
    const env = { [LOCAL_KMS_ENV.kek]: kek.toString('base64'), [LOCAL_KMS_ENV.keyId]: 'local-kek-1' };
    const service = new ProviderSecretService(LocalKeyKms.fromEnv(env), logger);
    const { accountId, connectionId } = await seedConnection();
    expect(await withAccountTransaction(db, accountId, (tx) => service.store(tx, { accountId, connectionId, apiKey: KNOWN_KEY })))
      .toEqual({ connectionId, kekVersion: 'local-kek-1' });
    const [row] = (await secretRows(connectionId)) as [SecretRow];
    // Định dạng sires_common: nonce 12 byte, rồi DEK 32 byte mã hóa, rồi tag 16 byte.
    expect(row.wrapped_dek.length).toBe(12 + 32 + 16);
    // “Khởi động lại”: adapter mới cùng cấu hình; DEK đã bọc mở được bằng KEK cấu hình.
    const restarted = LocalKeyKms.fromEnv(env);
    expect(restarted.keyId).toBe('local-kek-1');
    const dek = unwrapLocal(row.wrapped_dek, Buffer.from(env[LOCAL_KMS_ENV.kek] as string, 'base64'));
    expect(openSecret(row, dek, `${accountId}|${connectionId}`)).toBe(KNOWN_KEY);
    // KEK khác thì không mở được.
    expect(() => unwrapLocal(row.wrapped_dek, randomBytes(32))).toThrow();
  });

  it('thiếu cấu hình KEK thì không khởi động (EC10)', () => {
    const kek = randomBytes(32).toString('base64');
    for (const [env, message] of [
      [{}, `thiếu cấu hình KMS cục bộ ${LOCAL_KMS_ENV.kek}, ${LOCAL_KMS_ENV.keyId}`],
      [{ [LOCAL_KMS_ENV.keyId]: 'local-kek-1' }, `thiếu cấu hình KMS cục bộ ${LOCAL_KMS_ENV.kek}`],
      [{ [LOCAL_KMS_ENV.kek]: kek, [LOCAL_KMS_ENV.keyId]: '  ' }, `thiếu cấu hình KMS cục bộ ${LOCAL_KMS_ENV.keyId}`],
      [{ [LOCAL_KMS_ENV.kek]: randomBytes(16).toString('base64'), [LOCAL_KMS_ENV.keyId]: 'k' }, 'phải là base64 của đúng 32 byte'],
      [{ [LOCAL_KMS_ENV.kek]: `${kek.slice(0, 10)}!${kek.slice(11)}`, [LOCAL_KMS_ENV.keyId]: 'k' }, 'phải là base64 của đúng 32 byte'],
    ] as const) {
      let error: unknown;
      try {
        LocalKeyKms.fromEnv(env as NodeJS.ProcessEnv);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(LocalKmsConfigError);
      expect((error as Error).message).toContain(message);
      expect((error as Error).message).not.toContain(kek);
    }
  });
});
