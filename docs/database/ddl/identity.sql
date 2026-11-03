-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- SIRes — Database Design · DDL tham chiếu · database sires_identity (service identity)
-- Trạng thái: Đã duyệt — PO 03/11/2026 (DEC-57). Đặc tả: docs/database/sections/04-identity-gateway-workspace.html
-- Chạy sau 00-common.sql. Nguồn: PRD 18.1 (Account/Profile, VerificationThresholds, ProviderConnection,
-- AgentModelAssignment), docs/architecture 3.2, 10.3.

-- Account / Profile — một dòng mỗi tài khoản; account_id = id để policy RLS dùng chung.
CREATE TABLE app.account (
  id                                uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id                        uuid NOT NULL GENERATED ALWAYS AS (id) STORED,
  auth_issuer                       text NOT NULL,              -- iss của eTroy OIDC
  auth_subject                      text NOT NULL,              -- claim sub (OQ-073, INT-OIDC-002)
  status                            text NOT NULL DEFAULT 'Active'
                                    CHECK (status IN ('Active','Locked','Deletion Requested')),  -- DBD-07
  email                             text,                       -- từ claim OIDC (ASM-13)
  display_name                      text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  affiliation                       text,
  research_field                    text,
  avatar_object_key                 text,
  google_scholar_profile_url        text CHECK (google_scholar_profile_url ~ '^https://'),  -- ASM-14
  ui_language                       text NOT NULL DEFAULT 'vi' CHECK (ui_language IN ('vi','en')),
  default_agent_language            text,
  include_research_field_in_context boolean NOT NULL DEFAULT false,
  timezone                          text NOT NULL DEFAULT 'Asia/Saigon',
  debug_mode                        boolean NOT NULL DEFAULT false,                -- OQ-062
  embedding_provider_connection_id  uuid,                       -- DEC-31: một embedding model mỗi tài khoản
  embedding_model                   text,
  deletion_requested_at             timestamptz,                -- NFR-RET-004
  created_at                        timestamptz NOT NULL DEFAULT now(),
  created_by                        jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at                        timestamptz,
  updated_by                        jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version                       integer NOT NULL DEFAULT 1,
  CONSTRAINT account_auth_identity_uq UNIQUE (auth_issuer, auth_subject),         -- 18.5, toàn hệ thống
  CONSTRAINT account_embedding_ck CHECK ((embedding_model IS NULL) = (embedding_provider_connection_id IS NULL))
);
CREATE TRIGGER account_row_version BEFORE UPDATE ON app.account
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

-- Tra cứu khi đăng nhập: chưa có tenant context → hàm SECURITY DEFINER chỉ trả id (11-security).
CREATE OR REPLACE FUNCTION app.find_account_by_identity(p_issuer text, p_subject text)
RETURNS TABLE (id uuid, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT a.id, a.status FROM app.account a WHERE a.auth_issuer = p_issuer AND a.auth_subject = p_subject
$$;

-- VerificationThresholds — một bộ mỗi tài khoản (OQ-092, ASM-15). Giá trị theo khóa ngưỡng do hệ thống định nghĩa.
CREATE TABLE app.verification_thresholds (
  account_id     uuid PRIMARY KEY REFERENCES app.account (id),
  is_default     boolean NOT NULL DEFAULT true,
  values         jsonb NOT NULL,          -- {claimSupported: 0.8, claimPartial: 0.5, citationMismatch: 0.6, ...}
  schema_version smallint NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at     timestamptz,
  updated_by     jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version    integer NOT NULL DEFAULT 1
);
CREATE TRIGGER verification_thresholds_row_version BEFORE UPDATE ON app.verification_thresholds
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

-- ProviderConnection (SCOPE-13, INT-PROVIDER-005). Không chứa key; key ở provider_secret.
CREATE TABLE app.provider_connection (
  id               uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id       uuid NOT NULL REFERENCES app.account (id),
  name             text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  provider         text NOT NULL CHECK (provider IN ('anthropic','openai','google')),
  base_url         text NOT NULL CHECK (base_url ~ '^https://'),              -- NFR-TRANSIT-001
  key_hint         text NOT NULL CHECK (length(key_hint) <= 4),
  test_status      text NOT NULL DEFAULT 'Untested' CHECK (test_status IN ('Untested','Valid','Invalid')),
  last_tested_at   timestamptz,
  last_error       jsonb,                                                     -- {code, message} đã che dữ liệu
  available_models jsonb NOT NULL DEFAULT '[]',                               -- [{id, capabilities[]}]
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at       timestamptz,
  updated_by       jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version      integer NOT NULL DEFAULT 1,
  CONSTRAINT provider_connection_name_uq UNIQUE (account_id, name),
  CONSTRAINT provider_connection_tenant_uq UNIQUE (account_id, id)          -- cho FK ghép cùng tài khoản
);
CREATE TRIGGER provider_connection_row_version BEFORE UPDATE ON app.provider_connection
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

ALTER TABLE app.account ADD CONSTRAINT account_embedding_connection_fk
  FOREIGN KEY (id, embedding_provider_connection_id) REFERENCES app.provider_connection (account_id, id)
  DEFERRABLE INITIALLY DEFERRED;

-- Ciphertext API key (docs/architecture 10.3): envelope AES-256-GCM, AAD = accountId|connectionId.
-- Chỉ API nội bộ trả ciphertext cho agent-core, knowledge; không vai trò nào đọc được key rõ.
CREATE TABLE app.provider_secret (
  connection_id  uuid PRIMARY KEY,
  account_id     uuid NOT NULL,
  ciphertext     bytea NOT NULL,
  nonce          bytea NOT NULL CHECK (length(nonce) = 12),
  wrapped_dek    bytea NOT NULL,
  kek_version    text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, connection_id) REFERENCES app.provider_connection (account_id, id) ON DELETE CASCADE
);

-- AgentModelAssignment — duy nhất theo (account, agent, instance) (DEC-50). agent = 'default' là mặc định tài khoản.
CREATE TABLE app.agent_model_assignment (
  id                      uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id              uuid NOT NULL REFERENCES app.account (id),
  agent                   text NOT NULL CHECK (agent IN ('default','orchestrator','discovery','reference_processing',
                            'evidence_retrieval','synthesis','writing','verification','diagram','analysis')),
  instance                text CHECK (instance IN ('A','B')),
  provider_connection_id  uuid NOT NULL,
  model                   text NOT NULL,
  capability_warnings     jsonb NOT NULL DEFAULT '[]',
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at              timestamptz,
  updated_by              jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version             integer NOT NULL DEFAULT 1,
  CONSTRAINT agent_model_assignment_instance_ck CHECK ((agent = 'analysis') = (instance IS NOT NULL)),
  CONSTRAINT agent_model_assignment_uq UNIQUE NULLS NOT DISTINCT (account_id, agent, instance),
  FOREIGN KEY (account_id, provider_connection_id) REFERENCES app.provider_connection (account_id, id)
);
CREATE TRIGGER agent_model_assignment_row_version BEFORE UPDATE ON app.agent_model_assignment
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();
CREATE INDEX agent_model_assignment_connection_idx ON app.agent_model_assignment (account_id, provider_connection_id);

-- sameModelWarning là giá trị suy ra (chỉ đọc, DEC-50): hai instance analysis có cùng provider + model hiệu lực,
-- kể cả khi cùng thừa kế 'default'.
CREATE VIEW app.analysis_same_model AS
WITH eff AS (
  SELECT a.account_id, i.instance,
         coalesce(x.provider_connection_id, d.provider_connection_id) AS connection_id,
         coalesce(x.model, d.model) AS model
  FROM app.account a
  CROSS JOIN (VALUES ('A'), ('B')) AS i(instance)
  LEFT JOIN app.agent_model_assignment x ON x.account_id = a.id AND x.agent = 'analysis' AND x.instance = i.instance
  LEFT JOIN app.agent_model_assignment d ON d.account_id = a.id AND d.agent = 'default'
)
SELECT ea.account_id,
       (pa.provider = pb.provider AND ea.model = eb.model) AS same_model_warning
FROM eff ea
JOIN eff eb ON eb.account_id = ea.account_id AND ea.instance = 'A' AND eb.instance = 'B'
LEFT JOIN app.provider_connection pa ON pa.id = ea.connection_id
LEFT JOIN app.provider_connection pb ON pb.id = eb.connection_id;
ALTER VIEW app.analysis_same_model SET (security_invoker = true);

-- State machine (18.2) của entity do identity sở hữu.
INSERT INTO app.state_transition (machine, from_state, to_state) VALUES
  ('provider_connection','Untested','Valid'), ('provider_connection','Untested','Invalid'),
  ('provider_connection','Valid','Invalid'),  ('provider_connection','Valid','Untested'),
  ('provider_connection','Invalid','Untested'), ('provider_connection','Invalid','Valid'),
  ('account','Active','Locked'), ('account','Locked','Active'),
  ('account','Active','Deletion Requested'), ('account','Locked','Deletion Requested');
CREATE TRIGGER provider_connection_state BEFORE UPDATE OF test_status ON app.provider_connection
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('provider_connection', 'test_status');
CREATE TRIGGER account_state BEFORE UPDATE OF status ON app.account
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('account');

SELECT app.enable_tenant_rls();
SELECT app.grant_standard('identity', ARRAY['provider_connection','provider_secret','agent_model_assignment']);
-- provider_secret: _app chỉ INSERT/DELETE (lưu key mới, xóa khi xóa connection); đọc ciphertext qua _system
-- cho API nội bộ của agent-core, knowledge (10.3). Không vai trò nào có quyền UPDATE.
REVOKE SELECT, UPDATE ON app.provider_secret FROM sires_identity_app;
REVOKE UPDATE ON app.provider_secret FROM sires_identity_system;
GRANT EXECUTE ON FUNCTION app.find_account_by_identity(text, text) TO sires_identity_app;
