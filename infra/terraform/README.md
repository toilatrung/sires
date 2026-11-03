# infra/terraform

Hạ tầng staging, eval và production (kiến trúc 11.1, 11.2; ADR-28). Module viết trung lập nhà cloud: Kubernetes managed, PostgreSQL managed (một database mỗi service), RabbitMQ, object storage, KMS, secret manager. Nhà cloud và vùng dữ liệu chờ AQ-12; staging dựng khi có trả lời ([docs/tickets PH-01](../../docs/tickets/sections/02-phases-and-gates.html#ph-01)).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
