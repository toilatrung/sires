// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Cổng KMS của identity (PID-00016 S03; kiến trúc 10.3, ADR-10): chỉ có thao tác bọc DEK (KMS Encrypt bằng KEK
// sires-provider-keys). Không có thao tác giải mã: identity chỉ có quyền Encrypt, agent-core và knowledge giải mã (H2).

/** DEK đã bọc và id khóa KMS đã dùng — ghi vào app.provider_secret.kek_version (H4). */
export interface WrappedDek {
  readonly wrappedDek: Buffer;
  readonly keyId: string;
}

export interface KmsPort {
  /** Bọc DEK bằng KEK; lỗi (KMS không truy cập được, khóa không có) thì ném. */
  wrapDek(dek: Buffer): Promise<WrappedDek>;
}

/** Token Nest của cổng KMS. */
export const KMS_PORT = Symbol('identity.kmsPort');
