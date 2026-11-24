// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

export interface AuditDatabaseConfig {
  readonly appUrl: string;
  readonly systemUrl: string;
}

export const AUDIT_DATABASE_CONFIG = Symbol('audit.database.config');

export function readDatabaseConfig(env: NodeJS.ProcessEnv = process.env): AuditDatabaseConfig {
  const read = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`audit: thiếu cấu hình ${name}`);
    try {
      const parsed = new URL(value);
      if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.username || parsed.pathname.length < 2) {
        throw new Error('invalid');
      }
    } catch {
      throw new Error(`audit: ${name} phải là URL PostgreSQL có username và tên database`);
    }
    return value;
  };
  return Object.freeze({ appUrl: read('DATABASE_APP_URL'), systemUrl: read('DATABASE_SYSTEM_URL') });
}
