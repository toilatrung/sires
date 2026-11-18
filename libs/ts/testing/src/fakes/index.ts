// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

export {
  FakeBroker,
  topicMatches,
  type BrokerHandler,
  type BrokerMessage,
  type Delivery,
  type DeliveryMeta,
  type FakeBrokerFaults,
} from './broker.fake';
export { LocalKms, LocalKmsError, type LocalKmsOptions } from './local-kms';
export {
  DEFAULT_FAKE_OIDC_USER,
  FakeOidcProvider,
  type FakeOidcClient,
  type FakeOidcLogout,
  type FakeOidcOutage,
  type FakeOidcProviderOptions,
  type FakeOidcUser,
} from './oidc.fake';
export {
  FakeSourceAdapter,
  SourceAdapterError,
  type FakeSourceAdapterOptions,
  type NormalizedRecord,
  type SourceAdapter,
  type SourceAdapterKey,
  type SourceCall,
  type SourceCapabilities,
  type SourceErrorCode,
  type SourceOperation,
  type SourcePage,
  type SourceScenario,
  type SourceSearchFilters,
} from './source-adapter.fake';
