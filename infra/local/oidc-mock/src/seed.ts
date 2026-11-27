// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// File client và file tài khoản thử của OIDC mock (PID-00160 spec 4.1): đọc lúc khởi động, kiểm, tra tài khoản theo
// sub và email, so mật khẩu bằng timingSafeEqual trên SHA-256. Thông báo lỗi nêu file và chỉ số, không in mật khẩu.

import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ConfigError } from './config.js';

/** Client metadata của oidc-provider; mock chỉ đọc vài trường để kiểm, phần còn lại oidc-provider kiểm. */
export interface ClientMetadata {
  readonly client_id: string;
  readonly client_secret?: string;
  readonly redirect_uris?: readonly string[];
  readonly post_logout_redirect_uris?: readonly string[];
  readonly [key: string]: unknown;
}

export interface TestAccount {
  readonly sub: string;
  readonly email: string;
  readonly email_verified: boolean;
  readonly name: string;
  readonly password: string;
  readonly picture?: string;
}

export interface Seeds {
  readonly clients: readonly ClientMetadata[];
  readonly accounts: readonly TestAccount[];
}

function readJson(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new ConfigError(`${file}: không đọc được file`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ConfigError(`${file}: JSON không hợp lệ`);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** Mảng client metadata, mỗi phần tử có client_id; trùng client_id bị từ chối (EC03). */
export function readClients(file: string): ClientMetadata[] {
  const data = readJson(file);
  if (!Array.isArray(data) || data.length === 0) throw new ConfigError(`${file}: phải là mảng client metadata, ít nhất một client`);
  const ids = new Set<string>();
  data.forEach((client, index) => {
    if (!isObject(client) || !nonEmpty(client.client_id)) throw new ConfigError(`${file}: client #${index} thiếu client_id`);
    if (ids.has(client.client_id)) throw new ConfigError(`${file}: client #${index} trùng client_id`);
    ids.add(client.client_id);
  });
  return data as ClientMetadata[];
}

/** Ít nhất hai tài khoản; sub, email (không phân biệt hoa thường) không trùng (EC02). */
export function readAccounts(file: string): TestAccount[] {
  const data = readJson(file);
  if (!Array.isArray(data)) throw new ConfigError(`${file}: phải là mảng tài khoản`);
  const subs = new Set<string>();
  const emails = new Set<string>();
  data.forEach((account, index) => {
    const where = `${file}: tài khoản #${index}`;
    if (!isObject(account)) throw new ConfigError(`${where} không phải object`);
    for (const field of ['sub', 'email', 'name', 'password'] as const) {
      if (!nonEmpty(account[field])) throw new ConfigError(`${where} thiếu ${field} hoặc ${field} không phải chuỗi khác rỗng`);
    }
    if (typeof account.email_verified !== 'boolean') throw new ConfigError(`${where}: email_verified phải là boolean`);
    if (account.picture !== undefined && !nonEmpty(account.picture)) throw new ConfigError(`${where}: picture phải là chuỗi`);
    const sub = account.sub as string;
    const email = (account.email as string).toLowerCase();
    if (subs.has(sub)) throw new ConfigError(`${where} trùng sub`);
    if (emails.has(email)) throw new ConfigError(`${where} trùng email`);
    subs.add(sub);
    emails.add(email);
  });
  if (data.length < 2) throw new ConfigError(`${file}: cần ít nhất 2 tài khoản thử (nhận ${data.length})`);
  return data as TestAccount[];
}

export function loadSeeds(clientsFile: string, accountsFile: string): Seeds {
  return { clients: readClients(clientsFile), accounts: readAccounts(accountsFile) };
}

const sha256 = (text: string): Buffer => createHash('sha256').update(text, 'utf8').digest();

/** Tra tài khoản và kiểm mật khẩu; không cho biết email có tồn tại hay không (EC06). */
export class AccountStore {
  private readonly bySub = new Map<string, TestAccount>();
  private readonly byEmail = new Map<string, TestAccount>();

  constructor(accounts: readonly TestAccount[]) {
    for (const account of accounts) {
      this.bySub.set(account.sub, account);
      this.byEmail.set(account.email.toLowerCase(), account);
    }
  }

  findBySub(sub: string): TestAccount | undefined {
    return this.bySub.get(sub);
  }

  findByEmail(email: string): TestAccount | undefined {
    return this.byEmail.get(email.trim().toLowerCase());
  }

  /** Tài khoản khi email và mật khẩu đúng; so băm cố định độ dài nên thời gian không phụ thuộc mật khẩu. */
  authenticate(email: string, password: string): TestAccount | undefined {
    const account = this.findByEmail(email);
    const expected = sha256(account?.password ?? '\u0000no-account');
    const matches = timingSafeEqual(expected, sha256(password));
    return account && matches ? account : undefined;
  }

  /** Email của tài khoản thử, để trang đăng nhập ở `local` gợi ý. */
  emails(): string[] {
    return [...this.bySub.values()].map((a) => a.email);
  }
}
