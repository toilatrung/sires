-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- SIRes — Database Design · DDL tham chiếu · database sires_agent_core (service agent-core, Python)
-- Trạng thái: Đã duyệt — PO 03/11/2026 (DEC-57). Đặc tả: docs/database/sections/09-audit-and-platform.html
-- Chạy sau 00-common.sql. Migration thật: Alembic. Chỉ dữ liệu kỹ thuật; mất dữ liệu này không ảnh hưởng
-- nghiệp vụ (docs/architecture 6.1). Không dùng outbox (agent-core không phát sự kiện domain).

-- Semaphore theo Provider Connection: giới hạn lời gọi song song lên key của người dùng (5.12, TR-10).
CREATE TABLE app.provider_slot (
  provider_connection_id  uuid NOT NULL,
  slot                    smallint NOT NULL CHECK (slot >= 0),
  account_id              uuid NOT NULL,
  holder_agent_run_id     uuid,
  acquired_at             timestamptz,
  lease_until             timestamptz,
  PRIMARY KEY (provider_connection_id, slot),
  CONSTRAINT provider_slot_holder_ck CHECK ((holder_agent_run_id IS NULL) = (lease_until IS NULL))
);
CREATE INDEX provider_slot_free_idx ON app.provider_slot (provider_connection_id) WHERE holder_agent_run_id IS NULL;

-- Cache danh mục model theo provider + base URL (INT-PROVIDER-002); hết hạn thì gọi lại provider.
CREATE TABLE app.model_catalog_cache (
  provider_connection_id  uuid PRIMARY KEY,
  account_id              uuid NOT NULL,
  provider                text NOT NULL,
  models                  jsonb NOT NULL,      -- [{id, capabilities[]}]
  fetched_at              timestamptz NOT NULL DEFAULT now(),
  expires_at              timestamptz NOT NULL
);

SELECT app.enable_tenant_rls();
SELECT app.grant_standard('agent_core', ARRAY['provider_slot','model_catalog_cache']);
