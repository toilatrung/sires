// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

export { EnvelopeModule } from './envelope.module';
export { KMS_PORT, type KmsPort, type WrappedDek } from './kms';
export { LOCAL_KMS_ENV, LocalKeyKms, LocalKmsConfigError } from './local-kms';
export {
  ENVELOPE_LOGGER,
  ProviderSecretError,
  ProviderSecretService,
  type EnvelopeLogger,
  type ProviderSecretErrorCode,
  type StoredProviderSecret,
  type StoreProviderSecretInput,
} from './provider-secret.service';
