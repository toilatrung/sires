# @sires/platform

Thư viện dùng chung cho service NestJS, thuộc luồng `platform` ([docs/tickets 1.3](../../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-3)). Hiện có `bootstrapService` và `HealthModule`.

Dựng ở PH-01 (kiến trúc 3.4): tenancy (RLS, `SET LOCAL app.account_id`), transaction, outbox + relay, inbox, idempotency, audit-emit, problem+json, OpenTelemetry, logger che dữ liệu, service-auth guard, UUIDv7.

Chỉ đổi tương thích ngược (quy tắc 1.4.5): đổi phá vỡ thì thêm API mới và đánh dấu API cũ deprecated; luồng service tự chuyển.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
