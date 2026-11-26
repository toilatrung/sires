// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// KMS cục bộ cho máy Dev (PID-00016 S04, H1): KEK 32 byte và id khóa đọc từ cấu hình; bọc DEK bằng AES-256-GCM với
// nonce 12 byte ngẫu nhiên, không AAD. Wrapped DEK = nonce rồi ciphertext có tag 16 byte — đúng định dạng encrypt của
// sires_common.testing.LocalKms, để phía Python mở được bằng cùng KEK. Id khóa trả về là id trong cấu hình (H4).
// Chỉ dùng ở máy Dev: staging, production dùng KMS thật (PID-00035, PID-00153).

import { createCipheriv, randomBytes } from 'node:crypto';
import type { KmsPort, WrappedDek } from './kms';

/** Biến cấu hình của KMS cục bộ (đặt trong .env cục bộ, không commit). */
export const LOCAL_KMS_ENV = {
  /** KEK 32 byte, mã base64 (sinh: `openssl rand -base64 32`). */
  kek: 'IDENTITY_LOCAL_KEK',
  /** Id khóa, ghi vào kek_version của mỗi dòng (ví dụ `local-kek-1`). */
  keyId: 'IDENTITY_LOCAL_KEK_ID',
} as const;

const KEK_BYTES = 32;
const NONCE_BYTES = 12;
const BASE64_32_BYTES = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;

/** Cấu hình KMS cục bộ thiếu hay sai: nêu tên biến, không nêu giá trị (EC10). */
export class LocalKmsConfigError extends Error {
  override readonly name = 'LocalKmsConfigError';
}

export class LocalKeyKms implements KmsPort {
  private readonly kek: Buffer;
  readonly keyId: string;

  constructor(kek: Uint8Array, keyId: string) {
    if (kek.length !== KEK_BYTES) throw new LocalKmsConfigError(`identity: KEK cục bộ phải đủ ${KEK_BYTES} byte`);
    if (keyId.trim() === '' || Buffer.byteLength(keyId) > 255) {
      throw new LocalKmsConfigError('identity: id khóa KMS cục bộ phải có 1–255 byte');
    }
    this.kek = Buffer.from(kek);
    this.keyId = keyId;
  }

  /** Đọc cấu hình từ biến môi trường; thiếu hay sai thì ném LocalKmsConfigError và identity không khởi động (EC10). */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): LocalKeyKms {
    const rawKek = env[LOCAL_KMS_ENV.kek]?.trim();
    const keyId = env[LOCAL_KMS_ENV.keyId]?.trim();
    const missing = [!rawKek && LOCAL_KMS_ENV.kek, !keyId && LOCAL_KMS_ENV.keyId].filter(Boolean);
    if (missing.length > 0) {
      throw new LocalKmsConfigError(`identity: thiếu cấu hình KMS cục bộ ${missing.join(', ')}`);
    }
    // Base64 chuẩn của đúng 32 byte: 43 ký tự rồi một '='. Buffer.from bỏ qua ký tự lạ nên phải kiểm trước.
    if (!BASE64_32_BYTES.test(rawKek as string)) {
      throw new LocalKmsConfigError(`identity: ${LOCAL_KMS_ENV.kek} phải là base64 của đúng ${KEK_BYTES} byte`);
    }
    return new LocalKeyKms(Buffer.from(rawKek as string, 'base64'), keyId as string);
  }

  async wrapDek(dek: Buffer): Promise<WrappedDek> {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.kek, nonce);
    const sealed = Buffer.concat([cipher.update(dek), cipher.final(), cipher.getAuthTag()]);
    return { wrappedDek: Buffer.concat([nonce, sealed]), keyId: this.keyId };
  }
}
