// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Cấu hình của OIDC mock từ biến môi trường (PID-00160 spec 4.2) và các chặn khởi động (spec 4.4): mock chỉ chạy
// ở `local` hoặc `staging`, không bao giờ ở production. Mọi lỗi ném ConfigError với một dòng lý do, trước khi mở cổng.

import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Seeds } from './seed.js';

export type MockEnv = 'local' | 'staging';

export interface MockConfig {
  readonly env: MockEnv;
  /** Issuer khớp tuyệt đối (K9): không có `/` cuối, query hay fragment. */
  readonly issuer: string;
  readonly port: number;
  readonly clientsFile: string;
  readonly accountsFile: string;
  /** Khóa ký cookie của oidc-provider; `local` thiếu thì sinh ngẫu nhiên mỗi lần chạy. */
  readonly cookieKeys: readonly string[];
}

/** Cấu hình sai: thông điệp một dòng, không chứa mật khẩu hay secret. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export const DEFAULT_ISSUER = 'http://localhost:9400';
export const DEFAULT_PORT = 9400;
/** Đường dẫn tính từ thư mục package (src/ khi test, dist/ khi chạy bản build), không theo thư mục chạy lệnh. */
export const DEFAULT_CLIENTS_FILE = fileURLToPath(new URL('../config/clients.local.json', import.meta.url));
export const DEFAULT_ACCOUNTS_FILE = fileURLToPath(new URL('../config/accounts.local.json', import.meta.url));

/** Giá trị của file cục bộ và chỗ giữ chỗ của file mẫu: cấm ở staging (H5, EC05). */
export const LOCAL_PASSWORD = 'sires-local';
export const LOCAL_CLIENT_SECRET = 'sires-local-gateway-secret';
export const PLACEHOLDER = 'CHANGE-ME';
const PLACEHOLDER_HOST = 'example.invalid';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function value(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

function checkIssuer(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError('OIDC_MOCK_ISSUER phải là URL tuyệt đối');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ConfigError('OIDC_MOCK_ISSUER phải dùng http hoặc https');
  if (raw.includes('?') || raw.includes('#')) throw new ConfigError('OIDC_MOCK_ISSUER không được có query hay fragment');
  if (raw.endsWith('/')) throw new ConfigError('OIDC_MOCK_ISSUER không được có dấu / cuối (issuer khớp tuyệt đối)');
  if (url.username || url.password) throw new ConfigError('OIDC_MOCK_ISSUER không được chứa thông tin đăng nhập');
  return url;
}

/**
 * Đọc sáu biến của spec 4.2 và kiểm theo thứ tự spec 4.4 (môi trường, issuer, host cục bộ, quy tắc staging về biến).
 * Giá trị trong file client, tài khoản kiểm sau khi đọc file (`checkStagingSeeds`).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): MockConfig {
  const mode = value(env, 'OIDC_MOCK_ENV');
  if (mode !== 'local' && mode !== 'staging') {
    throw new ConfigError(
      `OIDC_MOCK_ENV phải là local hoặc staging (nhận ${mode === undefined ? 'trống' : JSON.stringify(mode)}); mock không bao giờ chạy ở production`,
    );
  }

  const issuerRaw = value(env, 'OIDC_MOCK_ISSUER') ?? (mode === 'local' ? DEFAULT_ISSUER : undefined);
  if (issuerRaw === undefined) throw new ConfigError('staging: thiếu OIDC_MOCK_ISSUER (https)');
  const issuer = checkIssuer(issuerRaw);
  if (mode === 'local' && !LOCAL_HOSTS.has(issuer.hostname)) {
    throw new ConfigError('local: host của OIDC_MOCK_ISSUER phải là localhost hoặc 127.0.0.1');
  }

  const portRaw = value(env, 'OIDC_MOCK_PORT');
  const port = portRaw === undefined ? DEFAULT_PORT : Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError('OIDC_MOCK_PORT phải là số cổng 1–65535');

  const clientsFile = value(env, 'OIDC_MOCK_CLIENTS_FILE');
  const accountsFile = value(env, 'OIDC_MOCK_ACCOUNTS_FILE');
  const cookieKeys = value(env, 'OIDC_MOCK_COOKIE_KEYS')?.split(',').map((k) => k.trim()).filter(Boolean) ?? [];

  if (mode === 'staging') {
    if (issuer.protocol !== 'https:') throw new ConfigError('staging: OIDC_MOCK_ISSUER phải dùng https');
    if (issuer.hostname.endsWith(PLACEHOLDER_HOST)) throw new ConfigError('staging: OIDC_MOCK_ISSUER còn là chỗ giữ chỗ example.invalid');
    if (!clientsFile) throw new ConfigError('staging: thiếu OIDC_MOCK_CLIENTS_FILE (file gắn từ Secret)');
    if (!accountsFile) throw new ConfigError('staging: thiếu OIDC_MOCK_ACCOUNTS_FILE (file gắn từ Secret)');
    if (cookieKeys.length === 0) throw new ConfigError('staging: thiếu OIDC_MOCK_COOKIE_KEYS');
    if (cookieKeys.some((k) => k === PLACEHOLDER || k.length < 32)) {
      throw new ConfigError('staging: mỗi khóa của OIDC_MOCK_COOKIE_KEYS phải có ít nhất 32 ký tự và không là chỗ giữ chỗ');
    }
  }

  return {
    env: mode,
    issuer: issuerRaw,
    port,
    clientsFile: clientsFile ?? DEFAULT_CLIENTS_FILE,
    accountsFile: accountsFile ?? DEFAULT_ACCOUNTS_FILE,
    cookieKeys: cookieKeys.length > 0 ? cookieKeys : [randomBytes(32).toString('base64url')],
  };
}

/** Staging không được dùng mật khẩu, secret cục bộ hay chỗ giữ chỗ của file mẫu (H5, EC05). */
export function checkStagingSeeds(config: MockConfig, seeds: Seeds): void {
  if (config.env !== 'staging') return;
  seeds.accounts.forEach((account, index) => {
    if (account.password === LOCAL_PASSWORD || account.password === PLACEHOLDER) {
      throw new ConfigError(`staging: ${config.accountsFile} tài khoản #${index} dùng mật khẩu cục bộ hay chỗ giữ chỗ`);
    }
  });
  seeds.clients.forEach((client, index) => {
    const secret = client.client_secret;
    if (secret === LOCAL_CLIENT_SECRET || secret === PLACEHOLDER) {
      throw new ConfigError(`staging: ${config.clientsFile} client #${index} dùng secret cục bộ hay chỗ giữ chỗ`);
    }
    const uris = [...(client.redirect_uris ?? []), ...(client.post_logout_redirect_uris ?? [])];
    if (uris.some((uri) => uri.includes(PLACEHOLDER_HOST))) {
      throw new ConfigError(`staging: ${config.clientsFile} client #${index} còn URI chỗ giữ chỗ example.invalid`);
    }
  });
}
