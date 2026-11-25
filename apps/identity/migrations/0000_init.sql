-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- Migration đầu của database sires_identity (PID-00016 S01; kiến trúc 6.10, H5, H6). Custom migration SQL của
-- drizzle-kit, áp bằng migrate() của drizzle-orm trong một giao dịch; chỉ tiến, không sửa file này sau khi merge.
-- Nội dung chép nguyên văn từ docs/database/ddl/00-common.sql rồi docs/database/ddl/identity.sql (DEC-57),
-- trừ ba dòng giấy phép đầu mỗi file và khối INSERT INTO app.state_transition. Vai trò sires_identity_app,
-- _system, _purge phải có sẵn (database 3.2): migration không tạo vai trò; thiếu thì GRANT lỗi và cả giao dịch
-- rollback. Test: src/migration.spec.ts so schema với database dựng từ hai file DDL. Bản chép theo DDL sau EC09
-- (COALESCE ở ba hàm kiểm JSON, #94) và DBD-14 (policy owner_lookup cho app.find_account_by_identity, đóng DBQ-10).

-- ===========================================================================================================
-- docs/database/ddl/00-common.sql
-- ===========================================================================================================

-- SIRes — Database Design · DDL tham chiếu
-- 00-common.sql — chạy ĐẦU TIÊN trong MỌI database của SIRes (mỗi service một database, ADR-22).
-- Trạng thái: Đã duyệt — PO 03/11/2026 (DEC-57). Đây là DDL tham chiếu cho thiết kế; migration thật viết bằng
-- drizzle-kit (service NestJS) hoặc Alembic (knowledge, agent-core) theo docs/architecture 6.10 và phải
-- sinh ra cùng schema này. Quy ước: docs/database/sections/02-schema-conventions.html.
--
-- Biến psql: :svc là tên service (identity, workspace, planning, ...). Ví dụ:
--   psql -v svc=planning -d sires_planning -f 00-common.sql -f planning.sql
-- Vai trò (sires_<svc>_owner/_app/_system/_purge) do hạ tầng tạo trước (11. Security), xem 03-topology.

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_bytes cho uuid_v7()
CREATE EXTENSION IF NOT EXISTS unaccent;   -- tìm kiếm tiếng Việt không dấu (6.7)
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- tìm gần đúng tiêu đề, tác giả (6.7)

CREATE SCHEMA IF NOT EXISTS app;       -- bảng nghiệp vụ và bảng nền tảng của service
CREATE SCHEMA IF NOT EXISTS replica;   -- bản sao chỉ đọc nhận qua sự kiện của service khác (03-topology)

-- ---------------------------------------------------------------------------
-- Định danh: UUIDv7 (sắp theo thời gian). Ứng dụng sinh id (libs/ts/platform, sires_common);
-- hàm này là giá trị mặc định dự phòng. PostgreSQL 18 có sẵn uuidv7() — khi hạ tầng nâng cấp thì thay.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.uuid_v7() RETURNS uuid
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  ms   bigint := floor(extract(epoch FROM clock_timestamp()) * 1000);
  b    bytea  := gen_random_bytes(16);
BEGIN
  b := set_byte(b, 0, ((ms >> 40) & 255)::int);
  b := set_byte(b, 1, ((ms >> 32) & 255)::int);
  b := set_byte(b, 2, ((ms >> 24) & 255)::int);
  b := set_byte(b, 3, ((ms >> 16) & 255)::int);
  b := set_byte(b, 4, ((ms >> 8) & 255)::int);
  b := set_byte(b, 5, (ms & 255)::int);
  b := set_byte(b, 6, (get_byte(b, 6) & 15) | 112);   -- version 7
  b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);   -- variant RFC 4122
  RETURN encode(b, 'hex')::uuid;
END $$;

-- ---------------------------------------------------------------------------
-- Ngữ cảnh tenant: mỗi giao dịch của vai trò _app đặt SET LOCAL app.account_id (6.3 kiến trúc).
-- Thiếu biến → NULL → policy RLS không khớp dòng nào (an toàn mặc định).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.current_account_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.account_id', true), '')::uuid
$$;

-- EC09 (PO 24/11/2026): CHECK coi NULL là đạt, nên is_actor_ref, is_approval_record, is_provenance bọc COALESCE(…, false).
-- ActorRef (PRD 18.1): {type: researcher|agent|system, accountId?, agent?, instance?, agentRunId?, component?}
-- Thiếu instance coi như không phải A/B, để agent khác analysis (không có instance) vẫn hợp lệ khi đã bọc COALESCE.
CREATE OR REPLACE FUNCTION app.is_actor_ref(a jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((a IS NOT NULL AND jsonb_typeof(a) = 'object' AND CASE a->>'type'
    WHEN 'researcher' THEN a ? 'accountId'
    WHEN 'agent' THEN a->>'agent' IN ('orchestrator','discovery','reference_processing','evidence_retrieval',
                                       'synthesis','writing','verification','diagram','analysis')
                      AND a ? 'agentRunId'
                      AND ((a->>'agent' = 'analysis') = COALESCE(a->>'instance' IN ('A','B'), false))
    WHEN 'system' THEN a ? 'component'
    ELSE false END), false)
$$;

-- ApprovalRecord (PRD 18.1): approvedBy luôn là researcher; gắn objectVersion và APR-01–APR-10.
CREATE OR REPLACE FUNCTION app.is_approval_record(r jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((r IS NULL OR (
    jsonb_typeof(r) = 'object'
    AND r->'approvedBy'->>'type' = 'researcher'
    AND r->>'decision' IN ('approved','rejected','edited_and_approved')
    AND r->>'apr' ~ '^APR-(0[1-9]|10)$'
    AND r ? 'decidedAt' AND r ? 'objectType' AND r ? 'objectId' AND r ? 'objectVersion')), false)
$$;

-- Tham chiếu có phiên bản {type, id, version} (inputRefs, outputRefs, provenance.inputs).
CREATE OR REPLACE FUNCTION app.is_versioned_refs(a jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT a IS NULL OR (jsonb_typeof(a) = 'array' AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(a) e
    WHERE NOT (e ? 'type' AND e ? 'id' AND e ? 'version')))
$$;

-- Provenance (PRD 18.3): createdBy, inputs[] bắt buộc; thiếu → từ chối ghi (DATA-PROV-001).
CREATE OR REPLACE FUNCTION app.is_provenance(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((p IS NOT NULL AND jsonb_typeof(p) = 'object'
    AND app.is_actor_ref(p->'createdBy')
    AND jsonb_typeof(p->'inputs') = 'array'
    AND app.is_versioned_refs(p->'inputs')), false)
$$;

-- ---------------------------------------------------------------------------
-- row_version (DATA-CONC-001): mỗi UPDATE tăng đúng 1. Ứng dụng ghi
--   UPDATE ... WHERE id = :id AND row_version = :v   (0 dòng → 412)
-- và có thể tự đặt row_version = row_version + 1; trigger bảo đảm không có giá trị khác.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_row_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.row_version = OLD.row_version THEN
    NEW.row_version := OLD.row_version + 1;
  ELSIF NEW.row_version <> OLD.row_version + 1 THEN
    RAISE EXCEPTION 'row_version phải tăng đúng 1 (%.%)', TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = 'serialization_failure';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Bất biến (docs/architecture 6.5): chặn UPDATE, trừ các cột liệt kê trong TG_ARGV.
--   CREATE TRIGGER ... BEFORE UPDATE ... EXECUTE FUNCTION app.tg_immutable('status','superseded_by_id');
-- Không có đối số → chặn mọi UPDATE. Cột GENERATED là NULL trong trigger BEFORE: bảng có cột sinh tự động
-- phải đưa cột đó vào danh sách được đổi hoặc dùng trigger riêng (ví dụ agent_run_final).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  allowed text[] := coalesce(TG_ARGV::text[], '{}') || ARRAY['row_version','updated_at','updated_by'];
BEGIN
  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION '%.% bất biến; chỉ được đổi: %', TG_TABLE_SCHEMA, TG_TABLE_NAME,
      coalesce(nullif(array_to_string(TG_ARGV, ', '), ''), 'không cột nào')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- State machine (DATA-STATE-001): lớp bảo vệ thứ hai sau module domain của service.
-- Mỗi database chỉ nạp các chuyển trạng thái của entity mà service đó sở hữu.
--   CREATE TRIGGER ... BEFORE UPDATE OF status ... EXECUTE FUNCTION app.tg_state_transition('task');
--   Đối số thứ hai (tùy chọn) là tên cột trạng thái, mặc định 'status'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.state_transition (
  machine     text NOT NULL,      -- 'task', 'plan_version', 'workflow', ...
  from_state  text NOT NULL,
  to_state    text NOT NULL,
  code        text,               -- mã PRD khi có (T-01…T-19)
  PRIMARY KEY (machine, from_state, to_state)
);

CREATE OR REPLACE FUNCTION app.tg_state_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  col    text := coalesce(TG_ARGV[1], 'status');
  v_from text := to_jsonb(OLD)->>col;
  v_to   text := to_jsonb(NEW)->>col;
BEGIN
  IF v_from IS DISTINCT FROM v_to AND NOT EXISTS (
       SELECT 1 FROM app.state_transition
       WHERE machine = TG_ARGV[0] AND from_state = v_from AND to_state = v_to) THEN
    RAISE EXCEPTION 'Chuyển trạng thái không hợp lệ cho %: % → %', TG_ARGV[0], v_from, v_to
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Tìm kiếm (docs/architecture 6.7): cấu hình simple + unaccent.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'sires_simple') THEN
    CREATE TEXT SEARCH CONFIGURATION app.sires_simple (COPY = pg_catalog.simple);
    ALTER TEXT SEARCH CONFIGURATION app.sires_simple
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, simple;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Bảng nền tảng có ở mọi database (09-audit-and-platform).
-- ---------------------------------------------------------------------------

-- Outbox: sự kiện domain, Audit Event, lệnh — ghi cùng giao dịch với thay đổi (DATA-PERSIST-001, ADR-23).
CREATE TABLE IF NOT EXISTS app.outbox (
  id                 uuid PRIMARY KEY DEFAULT app.uuid_v7(),   -- = id message trên RabbitMQ
  account_id         uuid,                                     -- NULL chỉ với sự kiện hệ thống
  kind               text NOT NULL CHECK (kind IN ('event','audit','command')),
  routing_key        text NOT NULL,                            -- task.activated, audit.recorded, agent.run…
  aggregate_type     text,
  aggregate_id       uuid,
  aggregate_version  integer,                                  -- consumer bỏ bản cũ đến sau bản mới
  payload            jsonb NOT NULL,
  traceparent        text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  published_at       timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_unpublished_idx ON app.outbox (created_at) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS outbox_published_idx   ON app.outbox (published_at) WHERE published_at IS NOT NULL;

-- Inbox: consumer ghi event_id cùng giao dịch với tác dụng; đã có → bỏ qua.
CREATE TABLE IF NOT EXISTS app.inbox (
  consumer      text NOT NULL,
  event_id      uuid NOT NULL,
  account_id    uuid,
  routing_key   text NOT NULL,
  processed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);
CREATE INDEX IF NOT EXISTS inbox_processed_idx ON app.inbox (processed_at);

-- Idempotency key của lệnh từ client (DATA-IDEMP-001), giữ 24 giờ (docs/architecture 5.8).
CREATE TABLE IF NOT EXISTS app.idempotency_key (
  account_id       uuid NOT NULL,
  key              text NOT NULL CHECK (length(key) BETWEEN 8 AND 200),
  operation        text NOT NULL,                 -- operationId của OpenAPI
  request_hash     bytea NOT NULL,                -- cùng khóa, khác nội dung → 422
  response_status  smallint,
  response_body    jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  PRIMARY KEY (account_id, key)
);
CREATE INDEX IF NOT EXISTS idempotency_key_expires_idx ON app.idempotency_key (expires_at);

-- Khóa leader cho job nền (outbox relay, sweeper, purge…).
CREATE TABLE IF NOT EXISTS app.job_lock (
  name         text PRIMARY KEY,
  owner        text NOT NULL,          -- pod id
  lease_until  timestamptz NOT NULL
);

-- Bản sao vòng đời project (03-topology). Service có dữ liệu cấp project (planning, orchestration,
-- library, knowledge, research, manuscript) gọi hàm này; cập nhật từ project.lifecycle_changed,
-- dùng để chặn ghi khi project Archived hoặc đã xóa mềm (PRD 18.2 › Quyền theo trạng thái).
CREATE OR REPLACE FUNCTION app.create_replica_project_state() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS replica.project_state (
    project_id      uuid PRIMARY KEY,
    account_id      uuid NOT NULL,
    status          text NOT NULL CHECK (status IN ('Active','Archived')),
    deleted_at      timestamptz,
    purge_after     timestamptz,
    source_version  bigint NOT NULL,     -- aggregate.version của sự kiện (DBQ-04); bản cũ đến sau bị bỏ
    synced_at       timestamptz NOT NULL DEFAULT now()
  );
END $$;

-- Ghi chặn theo vòng đời project: gắn vào bảng cấp project của service (trừ workspace, nơi sở hữu project).
CREATE OR REPLACE FUNCTION app.tg_project_writable() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE s record;
BEGIN
  -- Chỉ áp cho vai trò _app (thao tác của người dùng, agent). Consumer và job (_system) vẫn phải ghi được
  -- khi project Archived, ví dụ prompt Open → Expired khi lưu trữ project (PRD 18.2).
  IF current_user NOT LIKE '%\_app' THEN
    RETURN NEW;
  END IF;
  SELECT status, deleted_at INTO s FROM replica.project_state WHERE project_id = NEW.project_id;
  IF NOT FOUND OR s.status <> 'Active' OR s.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Project % không ở trạng thái cho phép ghi', NEW.project_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Bật RLS cho mọi bảng có account_id trong schema app và replica (gọi ở CUỐI file của service).
-- Bảng nền tảng outbox/inbox/job_lock không bật: chỉ vai trò _system đọc (relay, consumer).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enable_tenant_rls(skip text[] DEFAULT ARRAY['outbox','inbox','job_lock','state_transition'])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t USING (table_schema, table_name)
    WHERE c.column_name = 'account_id' AND t.table_type = 'BASE TABLE'
      AND c.table_schema IN ('app','replica','vec') AND NOT (c.table_name = ANY (skip))
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.table_schema, r.table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', r.table_schema, r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I.%I', r.table_schema, r.table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I.%I USING (account_id = app.current_account_id()) '
                   'WITH CHECK (account_id = app.current_account_id())', r.table_schema, r.table_name);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Cấp quyền chuẩn (gọi ở CUỐI file của service, sau enable_tenant_rls).
--   _app    : SELECT/INSERT/UPDATE trên app.*, SELECT trên replica.*; DELETE chỉ bảng liệt kê ở p_app_delete.
--   _system : như _app + đọc/ghi outbox, inbox, job_lock, replica.* (BYPASSRLS, đặt ở cấp vai trò).
--   _purge  : SELECT/DELETE trên mọi bảng (BYPASSRLS).
-- Bảng bất biến/chỉ ghi thêm bị thu UPDATE riêng trong file service.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.grant_standard(p_svc text, p_app_delete text[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r_app    text := format('sires_%s_app', p_svc);
  r_system text := format('sires_%s_system', p_svc);
  r_purge  text := format('sires_%s_purge', p_svc);
  t        text;
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA app, replica TO %I, %I, %I', r_app, r_system, r_purge);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA app TO %I, %I', r_app, r_system);
  EXECUTE format('REVOKE ALL ON app.outbox, app.inbox, app.job_lock FROM %I', r_app);
  EXECUTE format('GRANT INSERT ON app.outbox TO %I', r_app);           -- app chỉ ghi outbox
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON app.outbox, app.inbox, app.job_lock, app.idempotency_key TO %I', r_system);
  EXECUTE format('GRANT DELETE ON app.idempotency_key TO %I', r_app);
  EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON app.state_transition FROM %I, %I', r_app, r_system);
  EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA replica TO %I', r_app);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA replica TO %I', r_system);
  EXECUTE format('GRANT SELECT, DELETE ON ALL TABLES IN SCHEMA app, replica TO %I', r_purge);
  FOREACH t IN ARRAY p_app_delete LOOP
    EXECUTE format('GRANT DELETE ON app.%I TO %I', t, r_app);
  END LOOP;
END $$;

-- ===========================================================================================================
-- docs/database/ddl/identity.sql
-- ===========================================================================================================

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
-- (Khối INSERT INTO app.state_transition của DDL không chép: dòng do migration 0001_state_transition sinh từ
-- khai báo state machine trong src/domain/, PID-00016 S02, H3, DEC-57.)
CREATE TRIGGER provider_connection_state BEFORE UPDATE OF test_status ON app.provider_connection
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('provider_connection', 'test_status');
CREATE TRIGGER account_state BEFORE UPDATE OF status ON app.account
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('account');

SELECT app.enable_tenant_rls();
-- DBD-14 (PO 24/11/2026, đóng DBQ-10): app.find_account_by_identity là SECURITY DEFINER, chạy bằng owner trước khi có
-- tenant context; owner không BYPASSRLS và bảng FORCE RLS, nên owner đọc app.account qua policy riêng, chỉ đọc.
-- Ứng dụng không kết nối bằng owner và không cấp owner cho vai trò khác (3.2).
CREATE POLICY owner_lookup ON app.account FOR SELECT TO sires_identity_owner USING (true);
SELECT app.grant_standard('identity', ARRAY['provider_connection','provider_secret','agent_model_assignment']);
-- provider_secret: _app chỉ INSERT/DELETE (lưu key mới, xóa khi xóa connection); đọc ciphertext qua _system
-- cho API nội bộ của agent-core, knowledge (10.3). Không vai trò nào có quyền UPDATE.
REVOKE SELECT, UPDATE ON app.provider_secret FROM sires_identity_app;
REVOKE UPDATE ON app.provider_secret FROM sires_identity_system;
GRANT EXECUTE ON FUNCTION app.find_account_by_identity(text, text) TO sires_identity_app;
