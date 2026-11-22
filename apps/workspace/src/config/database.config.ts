// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Cấu hình kết nối database sires_workspace (PID-00017 S04; database 3.2, 11.2): một DSN cho mỗi vai trò dịch vụ,
// đọc từ biến môi trường và kiểm khi khởi động. DSN của vai trò migrator (DATABASE_MIGRATOR_URL) chỉ Job migration
// dùng (src/db/migrate.ts), service không đọc. Không in DSN ra log (có mật khẩu).

/** Biến môi trường của từng vai trò. */
export const DATABASE_ENV = {
  /** sires_workspace_app: request của người dùng, agent; RLS theo app.account_id (withAccountTransaction). */
  app: 'DATABASE_APP_URL',
  /** sires_workspace_system: consumer, job (BYPASSRLS). */
  system: 'DATABASE_SYSTEM_URL',
} as const;

export interface DatabaseConfig {
  readonly appUrl: string;
  readonly systemUrl: string;
  /** Số kết nối tối đa của mỗi pool (DATABASE_POOL_MAX, mặc định 10). */
  readonly poolMax: number;
}

/** Lỗi cấu hình: nêu tên biến, không nêu giá trị. */
export class DatabaseConfigError extends Error {
  override readonly name = 'DatabaseConfigError';
}

/** Đọc và kiểm cấu hình; thiếu biến, DSN không phải postgres:// hay pool không hợp lệ thì ném DatabaseConfigError. */
export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const url = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) throw new DatabaseConfigError(`workspace: thiếu biến môi trường ${name}`);
    let protocol: string;
    try {
      protocol = new URL(value).protocol;
    } catch {
      throw new DatabaseConfigError(`workspace: ${name} không phải URL hợp lệ`);
    }
    if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
      throw new DatabaseConfigError(`workspace: ${name} phải bắt đầu bằng postgres:// hoặc postgresql://`);
    }
    return value;
  };
  const rawPool = env['DATABASE_POOL_MAX']?.trim();
  const poolMax = rawPool ? Number(rawPool) : 10;
  if (!Number.isInteger(poolMax) || poolMax < 1) {
    throw new DatabaseConfigError('workspace: DATABASE_POOL_MAX phải là số nguyên ≥ 1');
  }
  return { appUrl: url(DATABASE_ENV.app), systemUrl: url(DATABASE_ENV.system), poolMax };
}
