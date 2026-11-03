-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- SIRes — Database Design · DDL tham chiếu · database sires_audit (service audit)
-- Trạng thái: Đã duyệt — PO 03/11/2026 (DEC-57). Đặc tả: docs/database/sections/09-audit-and-platform.html
-- Chạy sau 00-common.sql. Nguồn: PRD 14.8 (CTX-AUDIT-001/002), 16.8 (NFR-RET-008), 16.9 (NFR-KPI-001), 18.1;
-- docs/architecture 6.4 (ADR-23).


-- AuditEvent — chỉ ghi thêm, idempotent theo id (= id dòng outbox của service nguồn).
-- Không chứa API key, nội dung tài liệu, toàn văn prompt (NFR-OBS-002).
CREATE TABLE app.audit_event (
  id              uuid PRIMARY KEY,
  account_id      uuid NOT NULL,
  project_id      uuid,
  source_service  text NOT NULL,
  actor           jsonb NOT NULL CHECK (app.is_actor_ref(actor)),
  actor_type      text GENERATED ALWAYS AS (actor->>'type') STORED,
  action          text NOT NULL,
  object_type     text NOT NULL,
  object_id       uuid NOT NULL,
  object_version  integer,
  from_state      text,
  to_state        text,
  apr             text CHECK (apr IS NULL OR apr ~ '^APR-(0[1-9]|10)$'),
  summary         text CHECK (length(summary) <= 2000),
  correlation_id  text,                       -- trace id
  at              timestamptz NOT NULL,       -- thời điểm ở service nguồn
  received_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_event_project_idx ON app.audit_event (account_id, project_id, at DESC);
CREATE INDEX audit_event_object_idx ON app.audit_event (account_id, object_type, object_id, at DESC);
CREATE INDEX audit_event_account_idx ON app.audit_event (account_id, at DESC);
CREATE TRIGGER audit_event_append_only BEFORE UPDATE ON app.audit_event
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable();

-- KPI định kỳ (NFR-KPI-001, KPI-01–KPI-04).
CREATE TABLE app.kpi_snapshot (
  id             uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id     uuid NOT NULL,
  project_id     uuid,
  kpi            text NOT NULL CHECK (kpi ~ '^KPI-0[1-9]$'),
  period_start   timestamptz NOT NULL,
  period_end     timestamptz NOT NULL,
  value          numeric,
  numerator      bigint,
  denominator    bigint,
  details        jsonb NOT NULL DEFAULT '{}',
  computed_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kpi_snapshot_period_ck CHECK (period_end > period_start),
  CONSTRAINT kpi_snapshot_uq UNIQUE NULLS NOT DISTINCT (account_id, project_id, kpi, period_start, period_end)
);

-- Gói export audit theo project (CTX-AUDIT-002): JSON/CSV tạo theo luồng, trả presigned URL.
CREATE TABLE app.audit_export (
  id            uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id    uuid NOT NULL,
  project_id    uuid NOT NULL,
  format        text NOT NULL CHECK (format IN ('json','csv')),
  status        text NOT NULL DEFAULT 'Queued' CHECK (status IN ('Queued','Running','Succeeded','Failed')),
  object_key    text,                          -- audit/acct/<accountId>/exports/<id>.zip, 7 ngày
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at    timestamptz,
  row_version   integer NOT NULL DEFAULT 1
);
CREATE TRIGGER audit_export_row_version BEFORE UPDATE ON app.audit_export
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

SELECT app.enable_tenant_rls();
SELECT app.grant_standard('audit');
-- Bảo vệ chỉ ghi thêm (6.4): _app và _system không UPDATE/DELETE audit_event; chỉ _purge DELETE theo
-- project/tài khoản khi xóa vĩnh viễn (NFR-RET-002, NFR-RET-008).
REVOKE UPDATE ON app.audit_event FROM sires_audit_app, sires_audit_system;
REVOKE INSERT ON app.audit_event FROM sires_audit_app;        -- chỉ consumer (_system) ghi
