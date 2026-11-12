// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Shared test fakes and containers (architecture 8.9): PostgreSQL 16 + pgvector, RabbitMQ and MinIO in
// Testcontainers, FakeOidcProvider (ID token signed with a test key), fake broker, FakeSourceAdapter, LocalKms.
// FakeModelGateway is Python (sires_common); TypeScript services use the agent-core fake mode instead.
export * from './containers';
export * from './fakes';
