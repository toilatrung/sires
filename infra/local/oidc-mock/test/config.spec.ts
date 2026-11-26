// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Cấu hình và file của OIDC mock (PID-00160 S01): chặn theo môi trường (AC08, EC01), quy tắc staging (EC05), issuer
// sai (EC04), file tài khoản, client sai (EC02, EC03), file cục bộ hợp lệ (AC07), file mẫu staging bị từ chối.

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_ACCOUNTS_FILE, DEFAULT_CLIENTS_FILE, DEFAULT_ISSUER, loadConfig } from '../src/config.js';
import { startMock } from '../src/main.js';
import { readAccounts, readClients } from '../src/seed.js';
import { freePort, listening } from './browser.js';

const CONFIG_DIR = fileURLToPath(new URL('../config/', import.meta.url));
const STAGING_CLIENTS_EXAMPLE = join(CONFIG_DIR, 'clients.staging.example.json');
const STAGING_ACCOUNTS_EXAMPLE = join(CONFIG_DIR, 'accounts.staging.example.json');
const COOKIE_KEY = 'k'.repeat(40);
const dir = mkdtempSync(join(tmpdir(), 'sires-oidc-mock-config-'));
let fileNo = 0;

function file(content: unknown): string {
  const path = join(dir, `f${(fileNo += 1)}.json`);
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
  return path;
}

const ACCOUNT_A = { sub: 'a', email: 'a@sires.test', email_verified: true, name: 'A', password: 'p-a-1234' };
const ACCOUNT_B = { sub: 'b', email: 'b@sires.test', email_verified: true, name: 'B', password: 'p-b-1234' };
const STAGING_CLIENT = {
  client_id: 'sires-gateway-staging',
  client_secret: 's'.repeat(40),
  redirect_uris: ['https://app.sires.test/api/v1/auth/callback'],
  post_logout_redirect_uris: ['https://app.sires.test/'],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'client_secret_basic',
};

function staging(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    OIDC_MOCK_ENV: 'staging',
    OIDC_MOCK_ISSUER: 'https://oidc-mock.sires.test',
    OIDC_MOCK_CLIENTS_FILE: file([STAGING_CLIENT]),
    OIDC_MOCK_ACCOUNTS_FILE: file([ACCOUNT_A, ACCOUNT_B]),
    OIDC_MOCK_COOKIE_KEYS: COOKIE_KEY,
    ...overrides,
  };
}

/** startMock bị từ chối với ConfigError trước khi nghe cổng (AC08: thoát mã 1, không mở cổng). */
async function refused(env: NodeJS.ProcessEnv, message: RegExp): Promise<void> {
  const port = await freePort();
  await expect(startMock({ env: { OIDC_MOCK_PORT: String(port), ...env }, sink: () => undefined, host: '127.0.0.1' }))
    .rejects.toThrow(message);
  await expect(startMock({ env: { OIDC_MOCK_PORT: String(port), ...env }, sink: () => undefined, host: '127.0.0.1' }))
    .rejects.toBeInstanceOf(ConfigError);
  expect(await listening(port)).toBe(false);
}

describe('chặn theo môi trường', () => {
  it('thiếu, rỗng, production hay giá trị khác thì từ chối, không mở cổng (AC08 ca 1, 2; EC01)', async () => {
    await refused({}, /OIDC_MOCK_ENV phải là local hoặc staging/);
    await refused({ OIDC_MOCK_ENV: '' }, /OIDC_MOCK_ENV/);
    await refused({ OIDC_MOCK_ENV: 'production' }, /không bao giờ chạy ở production/);
    await refused({ OIDC_MOCK_ENV: 'dev' }, /OIDC_MOCK_ENV/);
  });

  it('local với issuer mặc định thì khởi động được', async () => {
    expect(loadConfig({ OIDC_MOCK_ENV: 'local' })).toMatchObject({
      env: 'local', issuer: DEFAULT_ISSUER, port: 9400, clientsFile: DEFAULT_CLIENTS_FILE, accountsFile: DEFAULT_ACCOUNTS_FILE,
    });
    const port = await freePort();
    const mock = await startMock({
      env: { OIDC_MOCK_ENV: 'local', OIDC_MOCK_ISSUER: `http://127.0.0.1:${port}`, OIDC_MOCK_PORT: String(port) },
      sink: () => undefined,
      host: '127.0.0.1',
    });
    try {
      expect(await (await fetch(`http://127.0.0.1:${port}/health`)).json()).toEqual({ status: 'ok' });
    } finally {
      await mock.close();
    }
  });
});

describe('issuer sai', () => {
  it('local với host khác localhost, 127.0.0.1 (AC08 ca 7; EC04)', () => {
    expect(() => loadConfig({ OIDC_MOCK_ENV: 'local', OIDC_MOCK_ISSUER: 'http://192.168.1.5:9400' })).toThrow(/localhost hoặc 127\.0\.0\.1/);
    expect(() => loadConfig({ OIDC_MOCK_ENV: 'local', OIDC_MOCK_ISSUER: 'http://oidc.sires.test' })).toThrow(ConfigError);
  });

  it('dấu / cuối, query, fragment, không phải URL (AC08 ca 8; EC04)', () => {
    expect(() => loadConfig({ OIDC_MOCK_ENV: 'local', OIDC_MOCK_ISSUER: 'http://localhost:9400/' })).toThrow(/dấu \/ cuối/);
    expect(() => loadConfig({ OIDC_MOCK_ENV: 'local', OIDC_MOCK_ISSUER: 'http://localhost:9400?x=1' })).toThrow(/query hay fragment/);
    expect(() => loadConfig({ OIDC_MOCK_ENV: 'local', OIDC_MOCK_ISSUER: 'http://localhost:9400#a' })).toThrow(/query hay fragment/);
    expect(() => loadConfig({ OIDC_MOCK_ENV: 'local', OIDC_MOCK_ISSUER: 'localhost:9400' })).toThrow(ConfigError);
    expect(() => loadConfig({ OIDC_MOCK_ENV: 'local', OIDC_MOCK_ISSUER: '/oidc' })).toThrow(/URL tuyệt đối/);
  });
});

describe('quy tắc staging', () => {
  it('issuer http, thiếu file hay cookie key (AC08 ca 3, 6; EC05)', async () => {
    await refused(staging({ OIDC_MOCK_ISSUER: 'http://oidc-mock.sires.test' }), /staging: OIDC_MOCK_ISSUER phải dùng https/);
    await refused(staging({ OIDC_MOCK_ISSUER: undefined }), /staging: thiếu OIDC_MOCK_ISSUER/);
    await refused(staging({ OIDC_MOCK_COOKIE_KEYS: undefined }), /staging: thiếu OIDC_MOCK_COOKIE_KEYS/);
    await refused(staging({ OIDC_MOCK_COOKIE_KEYS: 'CHANGE-ME' }), /OIDC_MOCK_COOKIE_KEYS/);
    await refused(staging({ OIDC_MOCK_CLIENTS_FILE: undefined }), /staging: thiếu OIDC_MOCK_CLIENTS_FILE/);
    await refused(staging({ OIDC_MOCK_ACCOUNTS_FILE: undefined }), /staging: thiếu OIDC_MOCK_ACCOUNTS_FILE/);
  });

  it('dùng nguyên file cục bộ: mật khẩu sires-local, secret cục bộ (AC08 ca 4; EC05)', async () => {
    await refused(staging({ OIDC_MOCK_ACCOUNTS_FILE: DEFAULT_ACCOUNTS_FILE }), /tài khoản #0 dùng mật khẩu cục bộ/);
    await refused(staging({ OIDC_MOCK_CLIENTS_FILE: DEFAULT_CLIENTS_FILE }), /client #0 dùng secret cục bộ/);
  });

  it('cấu hình staging đầy đủ thì khởi động được', async () => {
    const port = await freePort();
    const mock = await startMock({ env: staging({ OIDC_MOCK_PORT: String(port) }), sink: () => undefined, host: '127.0.0.1' });
    await mock.close();
  });
});

describe('file mẫu staging bị từ chối khi chưa thay chỗ giữ chỗ', () => {
  it('CHANGE-ME, example.invalid (AC08 ca 5)', async () => {
    await refused(staging({ OIDC_MOCK_ACCOUNTS_FILE: STAGING_ACCOUNTS_EXAMPLE }), /tài khoản #0 dùng mật khẩu cục bộ hay chỗ giữ chỗ/);
    await refused(staging({ OIDC_MOCK_CLIENTS_FILE: STAGING_CLIENTS_EXAMPLE }), /client #0 dùng secret cục bộ hay chỗ giữ chỗ/);
    const placeholderUri = file([{ ...STAGING_CLIENT, redirect_uris: ['https://staging.example.invalid/api/v1/auth/callback'] }]);
    await refused(staging({ OIDC_MOCK_CLIENTS_FILE: placeholderUri }), /example\.invalid/);
    await refused(staging({ OIDC_MOCK_ISSUER: 'https://oidc.staging.example.invalid' }), /chỗ giữ chỗ/);
  });
});

describe('file tài khoản sai', () => {
  const cases: [string, unknown, RegExp][] = [
    ['JSON hỏng', '[{"sub": ', /JSON không hợp lệ/],
    ['không phải mảng', { sub: 'a' }, /phải là mảng tài khoản/],
    ['thiếu trường', [ACCOUNT_A, { ...ACCOUNT_B, name: undefined }], /tài khoản #1 thiếu name/],
    ['sai kiểu', [ACCOUNT_A, { ...ACCOUNT_B, email_verified: 'true' }], /tài khoản #1: email_verified phải là boolean/],
    ['trùng sub', [ACCOUNT_A, { ...ACCOUNT_B, sub: 'a' }], /tài khoản #1 trùng sub/],
    ['trùng email khác hoa thường', [ACCOUNT_A, { ...ACCOUNT_B, email: 'A@SIRES.TEST' }], /tài khoản #1 trùng email/],
    ['ít hơn 2 tài khoản', [ACCOUNT_A], /ít nhất 2 tài khoản/],
  ];
  it.each(cases)('%s → nêu file, chỉ số, không in mật khẩu (EC02)', (_name, content, message) => {
    const path = file(content);
    let error: unknown;
    try {
      readAccounts(path);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toMatch(message);
    expect((error as Error).message).toContain(path);
    expect((error as Error).message).not.toMatch(/p-a-1234|p-b-1234/);
  });
});

describe('file client sai', () => {
  it('JSON hỏng, rỗng, thiếu client_id, trùng client_id (EC03)', () => {
    expect(() => readClients(file('{'))).toThrow(/JSON không hợp lệ/);
    expect(() => readClients(file([]))).toThrow(/ít nhất một client/);
    expect(() => readClients(file([{ client_secret: 'x' }]))).toThrow(/client #0 thiếu client_id/);
    expect(() => readClients(file([STAGING_CLIENT, STAGING_CLIENT]))).toThrow(/client #1 trùng client_id/);
  });

  it('metadata bị oidc-provider từ chối thì không mở cổng, nêu file (EC03)', async () => {
    const bad = file([{ ...STAGING_CLIENT, token_endpoint_auth_method: 'client_secret_post' }]);
    await refused({ OIDC_MOCK_ENV: 'local', OIDC_MOCK_CLIENTS_FILE: bad }, new RegExp(`${bad.replace(/\\/g, '\\\\')}.*bị oidc-provider từ chối`));
    const noRedirect = file([{ ...STAGING_CLIENT, redirect_uris: [] }]);
    await refused({ OIDC_MOCK_ENV: 'local', OIDC_MOCK_CLIENTS_FILE: noRedirect }, /bị oidc-provider từ chối/);
  });
});

describe('file cục bộ hợp lệ', () => {
  it('hai tài khoản sires-mock-a, sires-mock-b khác sub và email; một client gateway (AC07 phần file)', () => {
    const accounts = readAccounts(DEFAULT_ACCOUNTS_FILE);
    expect(accounts.map((a) => a.sub)).toEqual(['sires-mock-a', 'sires-mock-b']);
    expect(new Set(accounts.map((a) => a.email.toLowerCase())).size).toBe(2);
    expect(accounts.every((a) => a.email_verified && a.name && a.password === 'sires-local')).toBe(true);
    const clients = readClients(DEFAULT_CLIENTS_FILE);
    expect(clients.map((c) => c.client_id)).toEqual(['sires-gateway-local']);
    expect(clients[0]).toMatchObject({
      redirect_uris: ['http://localhost:5173/api/v1/auth/callback', 'http://localhost:3000/api/v1/auth/callback'],
      post_logout_redirect_uris: ['http://localhost:5173/', 'http://localhost:3000/'],
      token_endpoint_auth_method: 'client_secret_basic',
    });
  });
});
