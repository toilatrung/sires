-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- Migration đầu của database sires_orchestration (PID-00019 S01; kiến trúc 6.10, D1). Custom migration SQL của
-- drizzle-kit, áp bằng migrate() của drizzle-orm trong một giao dịch; chỉ tiến, không sửa file này sau khi merge.
-- Nội dung chép nguyên văn từ docs/database/ddl/00-common.sql rồi docs/database/ddl/orchestration.sql (DEC-57),
-- trừ ba dòng giấy phép đầu mỗi file và khối INSERT INTO app.state_transition. Vai trò sires_orchestration_app,
-- _system, _purge phải có sẵn (database 3.2): migration không tạo vai trò; thiếu thì GRANT lỗi và cả giao dịch
-- rollback. Test: src/db/migration.spec.ts so schema với database dựng từ hai file DDL.

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

-- ActorRef (PRD 18.1): {type: researcher|agent|system, accountId?, agent?, instance?, agentRunId?, component?}
CREATE OR REPLACE FUNCTION app.is_actor_ref(a jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT a IS NOT NULL AND jsonb_typeof(a) = 'object' AND CASE a->>'type'
    WHEN 'researcher' THEN a ? 'accountId'
    WHEN 'agent' THEN a->>'agent' IN ('orchestrator','discovery','reference_processing','evidence_retrieval',
                                       'synthesis','writing','verification','diagram','analysis')
                      AND a ? 'agentRunId'
                      AND ((a->>'agent' = 'analysis') = (a->>'instance' IN ('A','B')))
    WHEN 'system' THEN a ? 'component'
    ELSE false END
$$;

-- ApprovalRecord (PRD 18.1): approvedBy luôn là researcher; gắn objectVersion và APR-01–APR-10.
CREATE OR REPLACE FUNCTION app.is_approval_record(r jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT r IS NULL OR (
    jsonb_typeof(r) = 'object'
    AND r->'approvedBy'->>'type' = 'researcher'
    AND r->>'decision' IN ('approved','rejected','edited_and_approved')
    AND r->>'apr' ~ '^APR-(0[1-9]|10)$'
    AND r ? 'decidedAt' AND r ? 'objectType' AND r ? 'objectId' AND r ? 'objectVersion')
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
  SELECT p IS NOT NULL AND jsonb_typeof(p) = 'object'
    AND app.is_actor_ref(p->'createdBy')
    AND jsonb_typeof(p->'inputs') = 'array'
    AND app.is_versioned_refs(p->'inputs')
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
-- docs/database/ddl/orchestration.sql
-- ===========================================================================================================

-- SIRes — Database Design · DDL tham chiếu · database sires_orchestration (service orchestration)
-- Trạng thái: Đã duyệt — PO 03/11/2026 (DEC-57). Đặc tả: docs/database/sections/06-orchestration.html
-- Chạy sau 00-common.sql. Nguồn: PRD 5.4, 5.5, 5.9, 8.7, 14, 18.1–18.4; docs/architecture 5 (ADR-03, ADR-24).

SELECT app.create_replica_project_state();

-- Workflow — nguồn sự thật của engine (ADR-03).
CREATE TABLE app.workflow (
  id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id          uuid NOT NULL,
  project_id          uuid NOT NULL,
  type                text NOT NULL CHECK (type IN ('plan_proposal','task_execution','discovery','reference_processing',
                        'indexing','synthesis','verification','manuscript_edit','diagram','readiness_semantic',
                        'deliberation','recovery')),
  task_id             uuid,
  plan_version_id     uuid,
  triggered_by        jsonb NOT NULL CHECK (app.is_actor_ref(triggered_by)),
  status              text NOT NULL DEFAULT 'Created' CHECK (status IN ('Created','Running','Waiting for User','Paused',
                        'Interrupted','Succeeded','Failed','Cancelled')),
  current_step_id     uuid,
  started_at          timestamptz,
  ended_at            timestamptz,
  last_error          jsonb,                          -- {code, message, agentRunId}
  last_checkpoint_id  uuid,
  idempotency_key     text NOT NULL,
  heartbeat_at        timestamptz,                    -- 5.4: agent-core gọi heartbeat 30 s
  lease_owner         text,
  pause_requested     boolean NOT NULL DEFAULT false,
  plan_next_count     smallint NOT NULL DEFAULT 0 CHECK (plan_next_count <= 10),   -- giới hạn 5.9
  step_count          smallint NOT NULL DEFAULT 0 CHECK (step_count <= 30),
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at          timestamptz,
  updated_by          jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version         integer NOT NULL DEFAULT 1,
  CONSTRAINT workflow_idem_uq UNIQUE (account_id, idempotency_key),
  CONSTRAINT workflow_tenant_uq UNIQUE (account_id, project_id, id),
  CONSTRAINT workflow_task_ck CHECK (type <> 'task_execution' OR task_id IS NOT NULL),
  CONSTRAINT workflow_ended_ck CHECK ((status IN ('Succeeded','Failed','Cancelled')) = (ended_at IS NOT NULL))
);
-- DATA-IDEMP-002: mỗi Task tối đa một Workflow chưa kết thúc — chặn ngay ở database (5.8).
CREATE UNIQUE INDEX workflow_one_active_per_task_uq ON app.workflow (task_id)
  WHERE task_id IS NOT NULL AND status IN ('Created','Running','Waiting for User','Paused','Interrupted');
-- Sweeper 10 s (5.4): index partial trên Running.
CREATE INDEX workflow_heartbeat_idx ON app.workflow (heartbeat_at) WHERE status = 'Running';
CREATE INDEX workflow_project_idx ON app.workflow (account_id, project_id, created_at DESC);
CREATE INDEX workflow_attention_idx ON app.workflow (account_id) WHERE status IN ('Waiting for User','Interrupted');
CREATE TRIGGER workflow_row_version BEFORE UPDATE ON app.workflow
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

-- WorkflowStep.
CREATE TABLE app.workflow_step (
  id                    uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id            uuid NOT NULL,
  project_id            uuid NOT NULL,
  workflow_id           uuid NOT NULL,
  "order"               integer NOT NULL CHECK ("order" >= 1),
  kind                  text NOT NULL DEFAULT 'agent_run' CHECK (kind IN ('agent_run','deliberation','system')),
  description           text NOT NULL,
  assigned_agent        text,
  status                text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Running','Waiting for User',
                          'Succeeded','Failed','Cancelled')),
  depends_on            uuid[] NOT NULL DEFAULT '{}',   -- 5.7 bước song song
  write_set             text[] NOT NULL DEFAULT '{}',
  input_refs            jsonb NOT NULL DEFAULT '[]' CHECK (app.is_versioned_refs(input_refs)),
  output_refs           jsonb NOT NULL DEFAULT '[]' CHECK (app.is_versioned_refs(output_refs)),
  open_prompt_id        uuid,
  current_agent_run_id  uuid,
  attempt_count         smallint NOT NULL DEFAULT 0 CHECK (attempt_count <= 3),   -- 1 + 2 Agent Run mới (5.6)
  awaiting_slot_since   timestamptz,                    -- "đợi lượt" theo giới hạn mềm của tài khoản (5.2)
  deliberation_skipped  boolean NOT NULL DEFAULT false, -- "Bỏ qua" thảo luận (5.12, OQ-099)
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at            timestamptz,
  updated_by            jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version           integer NOT NULL DEFAULT 1,
  CONSTRAINT workflow_step_order_uq UNIQUE (workflow_id, "order"),
  CONSTRAINT workflow_step_wf_uq UNIQUE (workflow_id, id),
  FOREIGN KEY (account_id, project_id, workflow_id) REFERENCES app.workflow (account_id, project_id, id)
);
CREATE INDEX workflow_step_awaiting_idx ON app.workflow_step (account_id, awaiting_slot_since)
  WHERE awaiting_slot_since IS NOT NULL;
CREATE TRIGGER workflow_step_row_version BEFORE UPDATE ON app.workflow_step
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

ALTER TABLE app.workflow ADD CONSTRAINT workflow_current_step_fk
  FOREIGN KEY (id, current_step_id) REFERENCES app.workflow_step (workflow_id, id) DEFERRABLE INITIALLY DEFERRED;

-- AgentRun — bất biến sau trạng thái cuối, trừ cờ discarded (kết quả đến muộn, DATA-IDEMP-003).
CREATE TABLE app.agent_run (
  id                        uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id                uuid NOT NULL,
  project_id                uuid NOT NULL,
  workflow_id               uuid NOT NULL,
  step_id                   uuid NOT NULL,
  task_id                   uuid,                          -- sao từ workflow để tổng hợp usage (NFR-USAGE-002)
  agent                     text NOT NULL CHECK (agent IN ('orchestrator','discovery','reference_processing',
                              'evidence_retrieval','synthesis','writing','verification','diagram','analysis')),
  instance                  text CHECK (instance IN ('A','B')),
  deliberation_id           uuid,
  deliberation_round        smallint,
  provider_connection_id    uuid NOT NULL,
  provider                  text NOT NULL CHECK (provider IN ('anthropic','openai','google')),
  model                     text NOT NULL,
  adapter_version           text NOT NULL,
  agent_definition_version  text NOT NULL,                 -- NFR-OBS-006 (registry 5.10)
  prompt_template_version   text NOT NULL,
  retrieval_config_version  text,                          -- 7.8 kiến trúc
  embedding_model           text,
  capabilities_used         text[] NOT NULL DEFAULT '{}',
  input_summary             text NOT NULL,
  context_manifest          jsonb NOT NULL,                -- {entities[], evidenceIds[], truncated[]} (14.2)
  tool_calls                jsonb NOT NULL DEFAULT '[]',
  output_refs               jsonb NOT NULL DEFAULT '[]' CHECK (app.is_versioned_refs(output_refs)),
  structured_output         jsonb,                         -- bắt buộc khi Succeeded
  output_schema_version     smallint,
  usage                     jsonb,                         -- {inputTokens, outputTokens, calls, extra} hoặc {unavailable: true}
  input_tokens              integer GENERATED ALWAYS AS ((usage->>'inputTokens')::integer) STORED,
  output_tokens             integer GENERATED ALWAYS AS ((usage->>'outputTokens')::integer) STORED,
  status                    text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Running','Succeeded','Failed','Cancelled')),
  attempts                  smallint NOT NULL DEFAULT 0,
  error                     jsonb,                         -- {code (8.6 hoặc interrupted), message}
  queue_wait_ms             integer,                       -- chờ semaphore Provider Connection (5.12)
  dispatched_at             timestamptz,
  started_at                timestamptz,
  ended_at                  timestamptz,
  discarded                 boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at                timestamptz,
  row_version               integer NOT NULL DEFAULT 1,
  CONSTRAINT agent_run_instance_ck CHECK ((agent = 'analysis') = (instance IS NOT NULL)),
  CONSTRAINT agent_run_round_ck CHECK ((deliberation_id IS NULL) = (deliberation_round IS NULL)),
  CONSTRAINT agent_run_output_ck CHECK (status <> 'Succeeded' OR structured_output IS NOT NULL),
  CONSTRAINT agent_run_usage_ck CHECK (status NOT IN ('Succeeded','Failed') OR usage IS NOT NULL),     -- NFR-USAGE-001
  CONSTRAINT agent_run_error_ck CHECK (status <> 'Failed' OR error ? 'code'),
  FOREIGN KEY (workflow_id, step_id) REFERENCES app.workflow_step (workflow_id, id),
  FOREIGN KEY (account_id, project_id, workflow_id) REFERENCES app.workflow (account_id, project_id, id)
);
CREATE INDEX agent_run_step_idx ON app.agent_run (step_id, created_at);
CREATE INDEX agent_run_workflow_idx ON app.agent_run (workflow_id, created_at);
CREATE INDEX agent_run_active_idx ON app.agent_run (account_id) WHERE status IN ('Pending','Running');
CREATE INDEX agent_run_usage_idx ON app.agent_run (account_id, project_id, ended_at)
  INCLUDE (task_id, agent, provider_connection_id, input_tokens, output_tokens);
CREATE INDEX agent_run_deliberation_idx ON app.agent_run (deliberation_id, deliberation_round) WHERE deliberation_id IS NOT NULL;
CREATE TRIGGER agent_run_row_version BEFORE UPDATE ON app.agent_run
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

CREATE OR REPLACE FUNCTION app.tg_agent_run_final() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('Succeeded','Failed','Cancelled') AND
     (to_jsonb(NEW) - ARRAY['discarded','row_version','updated_at','input_tokens','output_tokens']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['discarded','row_version','updated_at','input_tokens','output_tokens']) THEN
    RAISE EXCEPTION 'Agent Run % đã kết thúc, bất biến', OLD.id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_run_final BEFORE UPDATE ON app.agent_run
  FOR EACH ROW EXECUTE FUNCTION app.tg_agent_run_final();

ALTER TABLE app.workflow_step ADD CONSTRAINT workflow_step_current_run_fk
  FOREIGN KEY (current_agent_run_id) REFERENCES app.agent_run (id) DEFERRABLE INITIALLY DEFERRED;

-- Debug transcript — chỉ khi Account.debugMode bật; toàn văn ở object storage, mã hóa; 30 ngày (NFR-RET-009).
CREATE TABLE app.agent_run_debug_transcript (
  agent_run_id    uuid PRIMARY KEY REFERENCES app.agent_run (id),
  account_id      uuid NOT NULL,
  project_id      uuid NOT NULL,
  prompt_ref      text NOT NULL,          -- orchestration/acct/<accountId>/debug/<agentRunId>.bin
  response_ref    text NOT NULL,
  captured_at     timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  CONSTRAINT debug_transcript_expiry_ck CHECK (expires_at = captured_at + interval '30 days')
);
CREATE INDEX debug_transcript_expiry_idx ON app.agent_run_debug_transcript (expires_at);

-- Checkpoint — ghi cùng giao dịch với bước Succeeded (DATA-PERSIST-002); chỉ ghi thêm.
CREATE TABLE app.checkpoint (
  id                 uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id         uuid NOT NULL,
  project_id         uuid NOT NULL,
  workflow_id        uuid NOT NULL,
  step_id            uuid NOT NULL,
  sequence           integer NOT NULL CHECK (sequence >= 1),
  step_statuses      jsonb NOT NULL,          -- {stepId: StepStatus}
  saved_output_refs  jsonb NOT NULL CHECK (app.is_versioned_refs(saved_output_refs)),
  open_prompt_ids    uuid[] NOT NULL DEFAULT '{}',
  consistent         boolean NOT NULL,
  at                 timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  CONSTRAINT checkpoint_sequence_uq UNIQUE (workflow_id, sequence),
  FOREIGN KEY (workflow_id, step_id) REFERENCES app.workflow_step (workflow_id, id)
);
CREATE TRIGGER checkpoint_immutable BEFORE UPDATE ON app.checkpoint
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable();
ALTER TABLE app.workflow ADD CONSTRAINT workflow_last_checkpoint_fk
  FOREIGN KEY (last_checkpoint_id) REFERENCES app.checkpoint (id) DEFERRABLE INITIALLY DEFERRED;

-- InteractiveAgentPrompt — không hết hạn theo thời gian (5.9); trả lời đúng một lần.
CREATE TABLE app.interactive_agent_prompt (
  id                       uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id               uuid NOT NULL,
  project_id               uuid,
  task_id                  uuid,
  workflow_id              uuid NOT NULL,
  step_id                  uuid NOT NULL,
  created_by_agent_run_id  uuid NOT NULL REFERENCES app.agent_run (id),
  type                     text NOT NULL CHECK (type IN ('approval','choice','edit_and_approve','information_request')),
  purpose                  text NOT NULL DEFAULT 'general'
                           CHECK (purpose IN ('general','deliberation_proposal','deliberation_decision')),
  deliberation_proposal    jsonb,
  deliberation_id          uuid,
  question                 text NOT NULL,
  pending_action           jsonb NOT NULL,        -- {apr?, objectType, objectId, objectVersion}
  choices                  jsonb NOT NULL DEFAULT '[]',
  editable_payload         jsonb,
  status                   text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Answered','Expired','Cancelled')),
  status_reason            text,
  response                 jsonb,                 -- {choiceIds[], editedPayload, text, respondedBy, respondedAt}
  idempotency_key          text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at               timestamptz,
  updated_by               jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version              integer NOT NULL DEFAULT 1,
  CONSTRAINT prompt_response_ck CHECK ((status = 'Answered') = (response IS NOT NULL)),       -- tối đa một response
  CONSTRAINT prompt_purpose_ck CHECK (
    (purpose = 'deliberation_proposal') = (deliberation_proposal IS NOT NULL) AND
    (purpose <> 'deliberation_decision' OR deliberation_id IS NOT NULL)),
  FOREIGN KEY (workflow_id, step_id) REFERENCES app.workflow_step (workflow_id, id)
);
CREATE INDEX prompt_open_idx ON app.interactive_agent_prompt (account_id, project_id) WHERE status = 'Open';
CREATE INDEX prompt_workflow_idx ON app.interactive_agent_prompt (workflow_id);
CREATE TRIGGER prompt_row_version BEFORE UPDATE ON app.interactive_agent_prompt
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();
CREATE TRIGGER prompt_answer_once BEFORE UPDATE ON app.interactive_agent_prompt
  FOR EACH ROW WHEN (OLD.status <> 'Open') EXECUTE FUNCTION app.tg_immutable();

ALTER TABLE app.workflow_step ADD CONSTRAINT workflow_step_open_prompt_fk
  FOREIGN KEY (open_prompt_id) REFERENCES app.interactive_agent_prompt (id) DEFERRABLE INITIALLY DEFERRED;

-- ContextItem (Shared Context Store) — chỉ ghi thêm; chỉ đổi status và superseded_by_id.
CREATE TABLE app.context_item (
  id                uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id        uuid NOT NULL,
  project_id        uuid NOT NULL,
  scope             text NOT NULL CHECK (scope IN ('project','task')),
  task_id           uuid,
  kind              text NOT NULL CHECK (kind IN ('decision','constraint','fact','assumption','summary')),
  content           jsonb NOT NULL,
  source_type       text NOT NULL CHECK (source_type IN ('prompt','message','agent_run','approval','researcher')),
  source_id         uuid NOT NULL,
  status            text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Superseded','Retracted')),
  supersedes_id     uuid REFERENCES app.context_item (id),
  superseded_by_id  uuid REFERENCES app.context_item (id),
  deliberation      jsonb,                                 -- DeliberationLabel (DEC-50)
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at        timestamptz,
  updated_by        jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version       integer NOT NULL DEFAULT 1,
  CONSTRAINT context_item_scope_ck CHECK ((scope = 'task') = (task_id IS NOT NULL)),
  CONSTRAINT context_item_superseded_ck CHECK ((status = 'Superseded') = (superseded_by_id IS NOT NULL))
);
CREATE INDEX context_item_active_idx ON app.context_item (account_id, project_id, scope, task_id) WHERE status = 'Active';
CREATE TRIGGER context_item_row_version BEFORE UPDATE ON app.context_item
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();
CREATE TRIGGER context_item_append_only BEFORE UPDATE ON app.context_item
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable('status','superseded_by_id');

-- ContextSnapshot — bất biến; chỉ đổi outdated, changed_entities (ADR-24).
CREATE TABLE app.context_snapshot (
  id                uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id        uuid NOT NULL,
  project_id        uuid NOT NULL,
  deliberation_id   uuid NOT NULL,
  entities          jsonb NOT NULL CHECK (app.is_versioned_refs(entities)),
  outdated          boolean NOT NULL DEFAULT false,
  changed_entities  jsonb NOT NULL DEFAULT '[]',          -- [{type, id, newVersion}]
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        jsonb NOT NULL CHECK (app.is_actor_ref(created_by))
);
CREATE INDEX context_snapshot_entities_idx ON app.context_snapshot USING gin (entities jsonb_path_ops) WHERE NOT outdated;
CREATE TRIGGER context_snapshot_append_only BEFORE UPDATE ON app.context_snapshot
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable('outdated','changed_entities');
-- outdated false → true, không chuyển ngược (18.2).
CREATE TRIGGER context_snapshot_no_revert BEFORE UPDATE OF outdated ON app.context_snapshot
  FOR EACH ROW WHEN (OLD.outdated AND NOT NEW.outdated) EXECUTE FUNCTION app.tg_immutable();

-- Deliberation (DEC-47, 8.7).
CREATE TABLE app.deliberation (
  id                          uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id                  uuid NOT NULL,
  project_id                  uuid NOT NULL,
  workflow_id                 uuid NOT NULL,
  step_id                     uuid NOT NULL,
  problem_type                text NOT NULL CHECK (problem_type IN ('research_direction','plan_structure','methodology',
                                'evidence_conflict','recovery_option','major_change_impact')),
  brief                       jsonb NOT NULL,      -- {problem, constraints[], criteria[], knownOptions[], perspectives[]}
  current_round               smallint NOT NULL DEFAULT 0,
  max_rounds                  smallint NOT NULL DEFAULT 2 CHECK (max_rounds BETWEEN 1 AND 4),
  context_snapshot_id         uuid NOT NULL REFERENCES app.context_snapshot (id),
  status                      text NOT NULL DEFAULT 'Running' CHECK (status IN ('Running','Completed','Failed','Cancelled')),
  record_artifact_id          uuid,                -- Artifact loại deliberation_record (research)
  record_artifact_version_id  uuid,
  decision_prompt_id          uuid REFERENCES app.interactive_agent_prompt (id),
  usage_total                 jsonb,               -- {inputTokens, outputTokens, cost} (NFR-USAGE-005)
  same_model_warning          boolean NOT NULL DEFAULT false,
  started_at                  timestamptz NOT NULL DEFAULT now(),
  ended_at                    timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at                  timestamptz,
  updated_by                  jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version                 integer NOT NULL DEFAULT 1,
  CONSTRAINT deliberation_step_uq UNIQUE (step_id),
  FOREIGN KEY (workflow_id, step_id) REFERENCES app.workflow_step (workflow_id, id)
);
CREATE INDEX deliberation_project_idx ON app.deliberation (account_id, project_id, started_at DESC);
CREATE TRIGGER deliberation_row_version BEFORE UPDATE ON app.deliberation
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();
ALTER TABLE app.context_snapshot ADD CONSTRAINT context_snapshot_deliberation_fk
  FOREIGN KEY (deliberation_id) REFERENCES app.deliberation (id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE app.agent_run ADD CONSTRAINT agent_run_deliberation_fk
  FOREIGN KEY (deliberation_id) REFERENCES app.deliberation (id);

-- Bên tham gia phiên (participants[] của PRD, tách bảng vì status/currentAgentRunId đổi trong phiên).
CREATE TABLE app.deliberation_participant (
  deliberation_id           uuid NOT NULL REFERENCES app.deliberation (id),
  account_id                uuid NOT NULL,
  agent                     text NOT NULL CHECK (agent IN ('orchestrator','analysis')),
  instance                  text NOT NULL DEFAULT '' CHECK (instance IN ('','A','B')),   -- '' cho orchestrator
  perspective               text,
  provider_connection_id    uuid NOT NULL,
  provider_connection_name  text NOT NULL,          -- ghi lúc mở phiên
  provider                  text NOT NULL,
  model                     text NOT NULL,
  status                    text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running','error')),
  current_agent_run_id      uuid REFERENCES app.agent_run (id),
  PRIMARY KEY (deliberation_id, agent, instance),
  CONSTRAINT participant_instance_ck CHECK ((agent = 'analysis') = (instance <> ''))
);

-- DeliberationEntry (Deliberation Board) — nội dung bất biến; chỉ đổi status, visible_from, needs_review.
CREATE TABLE app.deliberation_entry (
  id                   uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id           uuid NOT NULL,
  project_id           uuid NOT NULL,
  workflow_id          uuid NOT NULL REFERENCES app.workflow (id),
  deliberation_id      uuid REFERENCES app.deliberation (id),   -- NULL: entry finding của bước song song (CTX-BOARD-003)
  round                smallint,
  author               jsonb NOT NULL,              -- {agent, instance, agentRunId}
  author_agent_run_id  uuid NOT NULL REFERENCES app.agent_run (id),
  type                 text NOT NULL CHECK (type IN ('problem_brief','position','critique','finding','synthesis','retraction')),
  content              jsonb NOT NULL,
  content_schema_version smallint NOT NULL DEFAULT 1,
  source_refs          jsonb NOT NULL DEFAULT '[]' CHECK (app.is_versioned_refs(source_refs)),
  assumption_flags     text[] NOT NULL DEFAULT '{}',   -- id của point mang nhãn giả định
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final','retracted')),
  supersedes_entry_id  uuid REFERENCES app.deliberation_entry (id),
  change_reason        text,
  needs_review         boolean NOT NULL DEFAULT false,
  visible_from         timestamptz,                 -- thời điểm vòng đóng; trước đó bên khác không thấy
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  CONSTRAINT entry_round_ck CHECK ((deliberation_id IS NULL) = (round IS NULL)),
  CONSTRAINT entry_change_reason_ck CHECK (supersedes_entry_id IS NULL OR change_reason IS NOT NULL)
);
CREATE INDEX deliberation_entry_board_idx ON app.deliberation_entry (deliberation_id, round, created_at);
CREATE INDEX deliberation_entry_workflow_idx ON app.deliberation_entry (workflow_id, created_at);
CREATE TRIGGER deliberation_entry_append_only BEFORE UPDATE ON app.deliberation_entry
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable('status','visible_from','needs_review');

-- Sổ usage gộp cho NFR-USAGE-002: Agent Run (khi kết thúc) + embedding do knowledge báo qua usage.recorded (DBQ-03).
CREATE TABLE app.usage_ledger (
  id                      uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id              uuid NOT NULL,
  project_id              uuid,
  task_id                 uuid,
  source                  text NOT NULL CHECK (source IN ('agent_run','embedding')),
  source_id               uuid NOT NULL,                 -- agent_run.id hoặc id dòng embedding_usage của knowledge (DBQ-03)
  agent                   text,
  provider_connection_id  uuid NOT NULL,
  provider                text NOT NULL,
  model                   text NOT NULL,
  input_tokens            integer,
  output_tokens           integer,
  calls                   integer,
  unavailable             boolean NOT NULL DEFAULT false,   -- provider không trả usage: không ước tính (NFR-USAGE-001)
  at                      timestamptz NOT NULL,
  CONSTRAINT usage_ledger_source_uq UNIQUE (source, source_id)
);
CREATE INDEX usage_ledger_report_idx ON app.usage_ledger (account_id, at) INCLUDE (project_id, task_id, agent,
  provider_connection_id, input_tokens, output_tokens, calls);
CREATE TRIGGER usage_ledger_immutable BEFORE UPDATE ON app.usage_ledger
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable();

-- State machine (18.2).
-- (Khối INSERT INTO app.state_transition của DDL không chép: dòng do migration sinh từ khai báo state machine,
-- PID-00019 S02, DEC-57.)
CREATE TRIGGER workflow_state BEFORE UPDATE OF status ON app.workflow
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('workflow');
CREATE TRIGGER workflow_step_state BEFORE UPDATE OF status ON app.workflow_step
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('workflow_step');
CREATE TRIGGER agent_run_state BEFORE UPDATE OF status ON app.agent_run
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('agent_run');
CREATE TRIGGER prompt_state BEFORE UPDATE OF status ON app.interactive_agent_prompt
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('prompt');
CREATE TRIGGER context_item_state BEFORE UPDATE OF status ON app.context_item
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('context_item');
CREATE TRIGGER deliberation_state BEFORE UPDATE OF status ON app.deliberation
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('deliberation');
CREATE TRIGGER deliberation_entry_state BEFORE UPDATE OF status ON app.deliberation_entry
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('deliberation_entry');
CREATE TRIGGER workflow_project_writable BEFORE INSERT ON app.workflow
  FOR EACH ROW EXECUTE FUNCTION app.tg_project_writable();

SELECT app.enable_tenant_rls();
SELECT app.grant_standard('orchestration');
REVOKE UPDATE ON app.checkpoint, app.usage_ledger FROM sires_orchestration_app, sires_orchestration_system;
