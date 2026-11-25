// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Lưu API key của Provider Connection dạng envelope (PID-00016 S03; kiến trúc 10.3, ADR-10, NFR-SECRETS-001):
// DEK 32 byte ngẫu nhiên → AES-256-GCM với AAD `accountId|connectionId` → ciphertext = dữ liệu mã hóa rồi tag 16 byte
// (H4); DEK bọc qua cổng KMS → wrapped DEK, kek_version = id khóa KMS đã bọc (H4). Ghi một dòng app.provider_secret
// trong giao dịch của bên gọi (vai trò _app, có app.account_id — withAccountTransaction), để PID-00042 tạo
// connection và lưu key cùng một giao dịch. Không có hàm giải mã, không trả key rõ (H2); key, DEK không xuất hiện
// trong log hay thông báo lỗi.

import { createCipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { createLogger, isUuid, type SqlExecutor } from '@sires/platform';
import { sql } from 'drizzle-orm';
import { KMS_PORT, type KmsPort } from './kms';

const DEK_BYTES = 32;
const NONCE_BYTES = 12;

export interface StoreProviderSecretInput {
  readonly accountId: string;
  readonly connectionId: string;
  /** API key rõ của Researcher. Không giữ lại sau khi mã hóa. */
  readonly apiKey: string;
}

export interface StoredProviderSecret {
  readonly connectionId: string;
  /** Id khóa KMS đã bọc DEK (= kek_version, trả ra thành kekKeyId ở PID-00062). */
  readonly kekVersion: string;
}

export type ProviderSecretErrorCode = 'invalid_input' | 'kms_unavailable' | 'store_failed';

/** Lỗi của module envelope; thông điệp cố định, không chứa key (EC01, EC02). Ánh xạ HTTP ở PID-00042. */
export class ProviderSecretError extends Error {
  override readonly name = 'ProviderSecretError';
  constructor(
    readonly code: ProviderSecretErrorCode,
    message: string,
    /** SQLSTATE khi lỗi database. */
    readonly sqlState?: string,
  ) {
    super(message);
  }
}

/** Logger mà module ghi (logger che dữ liệu của @sires/platform). */
export type EnvelopeLogger = Pick<ReturnType<typeof createLogger>, 'info' | 'warn'>;

/** Token Nest của logger module envelope. */
export const ENVELOPE_LOGGER = Symbol('identity.envelopeLogger');

@Injectable()
export class ProviderSecretService {
  constructor(
    @Inject(KMS_PORT) private readonly kms: KmsPort,
    @Inject(ENVELOPE_LOGGER) private readonly logger: EnvelopeLogger = createLogger({ service: 'identity' }),
  ) {}

  /**
   * Mã hóa và ghi key trong giao dịch `tx` của bên gọi. KMS lỗi → không ghi gì, ném `kms_unavailable` (EC01); lỗi
   * database (connection không có, sai tài khoản) → ném `store_failed`, bên gọi rollback (EC02).
   */
  async store(tx: SqlExecutor, input: StoreProviderSecretInput): Promise<StoredProviderSecret> {
    const { accountId, connectionId } = input;
    if (!isUuid(accountId) || !isUuid(connectionId)) {
      throw new ProviderSecretError('invalid_input', 'identity: accountId, connectionId phải là UUID');
    }
    if (typeof input.apiKey !== 'string' || input.apiKey.length === 0) {
      throw new ProviderSecretError('invalid_input', 'identity: API key rỗng');
    }

    const plaintext = Buffer.from(input.apiKey, 'utf8');
    const dek = randomBytes(DEK_BYTES);
    const nonce = randomBytes(NONCE_BYTES);
    let ciphertext: Buffer;
    let wrapped: Awaited<ReturnType<KmsPort['wrapDek']>>;
    try {
      const cipher = createCipheriv('aes-256-gcm', dek, nonce);
      cipher.setAAD(Buffer.from(`${accountId}|${connectionId}`, 'utf8'));
      ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
      try {
        wrapped = await this.kms.wrapDek(dek);
      } catch {
        this.logger.warn({ connection_id: connectionId }, 'identity: KMS không bọc được DEK, không lưu key');
        throw new ProviderSecretError('kms_unavailable', 'identity: KMS không bọc được khóa dữ liệu, key chưa được lưu');
      }
    } finally {
      plaintext.fill(0);
      dek.fill(0);
    }

    try {
      await tx.execute(sql`
        INSERT INTO app.provider_secret (connection_id, account_id, ciphertext, nonce, wrapped_dek, kek_version)
        VALUES (${connectionId}, ${accountId}, ${ciphertext}, ${nonce}, ${wrapped.wrappedDek}, ${wrapped.keyId})`);
    } catch (error) {
      const state = sqlStateOf(error);
      this.logger.warn({ connection_id: connectionId, sqlstate: state }, 'identity: không ghi được provider secret');
      throw new ProviderSecretError('store_failed', 'identity: không ghi được key của provider connection', state);
    }
    this.logger.info({ connection_id: connectionId, kek_version: wrapped.keyId }, 'identity: đã lưu provider secret');
    return { connectionId, kekVersion: wrapped.keyId };
  }
}

/** SQLSTATE của lỗi PostgreSQL, kể cả khi drizzle bọc lỗi trong `cause`; không giữ lại lỗi gốc (có tham số). */
function sqlStateOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = current.cause;
  }
  return undefined;
}
