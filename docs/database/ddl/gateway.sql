-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- SIRes — Database Design · DDL tham chiếu · database sires_gateway (service gateway)
-- Trạng thái: Đã duyệt — PO 03/11/2026 (DEC-57). Đặc tả: docs/database/sections/04-identity-gateway-workspace.html
-- Chạy sau 00-common.sql. Nguồn: docs/architecture 3.2, 6.1, 10.2 (ADR-09, phiên server-side; ADR-07, SSE).
-- gateway không có entity nghiệp vụ.

-- Phiên đăng nhập (cookie sires_session). Lưu băm của session id, không lưu id rõ.
-- Hết hạn khi không hoạt động 12 giờ (INT-OIDC-003, DEC-54, AQ-03).
CREATE TABLE app.session (
  id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id          uuid NOT NULL,
  sid_hash            bytea NOT NULL UNIQUE,           -- sha256(session id)
  csrf_token_hash     bytea NOT NULL,
  oidc_sid            text,                            -- sid của eTroy OIDC nếu có (single logout, AQ-11)
  refresh_token_enc   bytea,                           -- mã hóa lớp ứng dụng (SPK-02, TR-05)
  user_agent_hash     bytea,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  idle_expires_at     timestamptz NOT NULL DEFAULT now() + interval '12 hours',
  absolute_expires_at timestamptz NOT NULL,
  revoked_at          timestamptz,
  revoke_reason       text CHECK (revoke_reason IN ('logout','account_locked','account_deletion','rotated','admin'))
);
CREATE INDEX session_account_idx ON app.session (account_id) WHERE revoked_at IS NULL;
CREATE INDEX session_expiry_idx ON app.session (idle_expires_at) WHERE revoked_at IS NULL;

-- Tra phiên theo cookie trước khi có tenant context (11-security).
CREATE OR REPLACE FUNCTION app.find_session(p_sid_hash bytea)
RETURNS TABLE (id uuid, account_id uuid, csrf_token_hash bytea, idle_expires_at timestamptz,
               absolute_expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT s.id, s.account_id, s.csrf_token_hash, s.idle_expires_at, s.absolute_expires_at
  FROM app.session s
  WHERE s.sid_hash = p_sid_hash AND s.revoked_at IS NULL
    AND s.idle_expires_at > now() AND s.absolute_expires_at > now()
$$;

-- Log sự kiện cho SSE /events, phát lại theo Last-Event-ID trong 24 giờ (ADR-07, F-03).
CREATE TABLE app.sse_event_log (
  seq          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   -- Last-Event-ID
  event_id     uuid NOT NULL UNIQUE,                              -- id message RabbitMQ (dedupe)
  account_id   uuid NOT NULL,
  project_id   uuid,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sse_event_log_replay_idx ON app.sse_event_log (account_id, seq);
CREATE INDEX sse_event_log_created_idx ON app.sse_event_log (created_at);

SELECT app.enable_tenant_rls();
SELECT app.grant_standard('gateway', ARRAY['session']);
GRANT EXECUTE ON FUNCTION app.find_session(bytea) TO sires_gateway_app;
