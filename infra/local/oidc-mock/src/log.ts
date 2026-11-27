// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Log sự kiện của OIDC mock (PID-00160 spec 4.3, O7; NFR-OBS-002): một dòng JSON mỗi sự kiện ra stdout. Chỉ nhận
// các trường đã khai dưới đây, nên giá trị token, code, mật khẩu, secret, cookie hay header Authorization không có
// đường vào log. Test thay bộ ghi để thu log (AC10).

export interface LogFields {
  readonly client_id?: string;
  readonly sub?: string;
  readonly grant_type?: string;
  /** Mã lỗi OAuth/OIDC (`invalid_grant`…) hay tên lớp lỗi; không có mô tả lỗi. */
  readonly error?: string;
  readonly env?: string;
  readonly issuer?: string;
  readonly port?: number;
  readonly kid?: string;
}

export type LogSink = (line: string) => void;

export interface Logger {
  event(event: string, fields?: LogFields): void;
}

const ALLOWED = ['client_id', 'sub', 'grant_type', 'error', 'env', 'issuer', 'port', 'kid'] as const;

export function createLogger(sink: LogSink = (line) => process.stdout.write(`${line}\n`)): Logger {
  return {
    event(event, fields = {}) {
      const record: Record<string, unknown> = { ts: new Date().toISOString(), event };
      for (const key of ALLOWED) {
        const v = fields[key];
        if (v !== undefined && v !== null && v !== '') record[key] = v;
      }
      sink(JSON.stringify(record));
    },
  };
}
