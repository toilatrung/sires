-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- Migration đầu của database sires_workspace (PID-00017 S01; kiến trúc 6.10, H1). Custom migration SQL của
-- drizzle-kit, áp bằng migrate() của drizzle-orm trong một giao dịch; chỉ tiến, không sửa file này sau khi merge.
-- Nội dung chép nguyên văn từ docs/database/ddl/00-common.sql rồi docs/database/ddl/workspace.sql (DEC-57),
-- trừ ba dòng giấy phép đầu mỗi file và khối INSERT INTO app.state_transition. Vai trò sires_workspace_app,
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
-- docs/database/ddl/workspace.sql
-- ===========================================================================================================

-- SIRes — Database Design · DDL tham chiếu · database sires_workspace (service workspace)
-- Trạng thái: Đã duyệt — PO 03/11/2026 (DEC-57). Đặc tả: docs/database/sections/04-identity-gateway-workspace.html
-- Chạy sau 00-common.sql. Nguồn: PRD 5.1, 18.1 (ResearchProject, ResearchContextVersion, Conversation,
-- Message, PendingAction, Notification), 18.2 (ProjectStatus), NFR-RET-002; docs/architecture 6.8.

-- ResearchProject. Xóa mềm: deleted_at, purge_after = deleted_at + 30 ngày (OQ-030, OQ-078).
CREATE TABLE app.research_project (
  id                          uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id                  uuid NOT NULL,
  name                        text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  short_description           text,
  status                      text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Archived')),
  current_context_version_id  uuid NOT NULL,
  agent_response_language     text,
  last_activity_at            timestamptz NOT NULL DEFAULT now(),
  archived_at                 timestamptz,
  deleted_at                  timestamptz,
  purge_after                 timestamptz,
  status_before_deletion      text CHECK (status_before_deletion IN ('Active','Archived')),
  search_tsv                  tsvector,                           -- 6.7, trigger bên dưới
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at                  timestamptz,
  updated_by                  jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version                 integer NOT NULL DEFAULT 1,
  CONSTRAINT research_project_tenant_uq UNIQUE (account_id, id),
  CONSTRAINT research_project_deletion_ck CHECK (
    (deleted_at IS NULL AND purge_after IS NULL AND status_before_deletion IS NULL) OR
    (deleted_at IS NOT NULL AND purge_after = deleted_at + interval '30 days' AND status_before_deletion IS NOT NULL))
);
CREATE TRIGGER research_project_row_version BEFORE UPDATE ON app.research_project
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();
CREATE INDEX research_project_list_idx ON app.research_project (account_id, status, last_activity_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX research_project_deleted_idx ON app.research_project (account_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX research_project_purge_idx ON app.research_project (purge_after) WHERE deleted_at IS NOT NULL;
CREATE INDEX research_project_search_idx ON app.research_project USING gin (search_tsv);

-- View mặc định: lọc project đã xóa mềm (docs/architecture 6.2).
CREATE VIEW app.research_project_live AS
  SELECT * FROM app.research_project WHERE deleted_at IS NULL;
ALTER VIEW app.research_project_live SET (security_invoker = true);

CREATE OR REPLACE FUNCTION app.tg_research_project_tsv() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := setweight(to_tsvector('app.sires_simple', coalesce(NEW.name, '')), 'A')
                 || setweight(to_tsvector('app.sires_simple', coalesce(NEW.short_description, '')), 'B');
  RETURN NEW;
END $$;
CREATE TRIGGER research_project_tsv BEFORE INSERT OR UPDATE OF name, short_description ON app.research_project
  FOR EACH ROW EXECUTE FUNCTION app.tg_research_project_tsv();

-- ResearchContextVersion — bất biến (PROJ-CONTEXT-001).
CREATE TABLE app.research_context_version (
  id                   uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id           uuid NOT NULL,
  project_id           uuid NOT NULL,
  version_number       integer NOT NULL CHECK (version_number >= 1),
  research_question    text NOT NULL,
  objectives           jsonb NOT NULL DEFAULT '[]',
  domain               text,
  keywords             text[] NOT NULL DEFAULT '{}',
  scope                text,
  constraints          jsonb NOT NULL DEFAULT '[]',
  output_type          text CHECK (output_type IN ('article','thesis','report','other')),
  manuscript_language  text,
  citation_style       text,
  source_message_id    uuid,
  confirmed_by         jsonb NOT NULL CHECK (confirmed_by->>'type' = 'researcher'),
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  CONSTRAINT research_context_version_uq UNIQUE (project_id, version_number),
  CONSTRAINT research_context_version_tenant_uq UNIQUE (account_id, project_id, id),
  FOREIGN KEY (account_id, project_id) REFERENCES app.research_project (account_id, id)
);
CREATE TRIGGER research_context_version_immutable BEFORE UPDATE ON app.research_context_version
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable();

ALTER TABLE app.research_project ADD CONSTRAINT research_project_context_fk
  FOREIGN KEY (account_id, id, current_context_version_id)
  REFERENCES app.research_context_version (account_id, project_id, id) DEFERRABLE INITIALLY DEFERRED;

-- Conversation: global (Global AI Chat) hoặc project (Project AI Chat).
CREATE TABLE app.conversation (
  id           uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id   uuid NOT NULL,
  scope        text NOT NULL CHECK (scope IN ('global','project')),
  project_id   uuid,
  title        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at   timestamptz,
  updated_by   jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version  integer NOT NULL DEFAULT 1,
  CONSTRAINT conversation_scope_ck CHECK ((scope = 'project') = (project_id IS NOT NULL)),
  FOREIGN KEY (account_id, project_id) REFERENCES app.research_project (account_id, id)
);
CREATE TRIGGER conversation_row_version BEFORE UPDATE ON app.conversation
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();
CREATE INDEX conversation_project_idx ON app.conversation (account_id, project_id);

-- Message — chỉ ghi thêm.
CREATE TABLE app.message (
  id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id          uuid NOT NULL,
  project_id          uuid,                                   -- sao từ conversation để purge theo project
  conversation_id     uuid NOT NULL REFERENCES app.conversation (id),
  sender              jsonb NOT NULL CHECK (app.is_actor_ref(sender)),
  active_task_id      uuid,
  content             text NOT NULL CHECK (length(content) BETWEEN 1 AND 20000),
  embedded_prompt_id  uuid,
  agent_run_id        uuid,
  deliberation        jsonb,                                  -- DeliberationLabel (DEC-50)
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          jsonb NOT NULL CHECK (app.is_actor_ref(created_by))
);
CREATE TRIGGER message_immutable BEFORE UPDATE ON app.message
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable();
CREATE INDEX message_conversation_idx ON app.message (conversation_id, created_at);
CREATE INDEX message_project_idx ON app.message (account_id, project_id) WHERE project_id IS NOT NULL;

-- PendingAction (4.4). Một PendingAction Open cho mỗi đối tượng cần xử lý.
CREATE TABLE app.pending_action (
  id             uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id     uuid NOT NULL,
  project_id     uuid,
  kind           text NOT NULL CHECK (kind IN ('plan_approval','interactive_prompt','reference_approval','task_review',
                                               'manual_work','manuscript_change_proposal','recovery_decision')),
  object_type    text NOT NULL,
  object_id      uuid NOT NULL,
  title          text,
  deep_link      text,
  status         text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Resolved','Expired')),
  resolved_by    jsonb CHECK (resolved_by IS NULL OR app.is_actor_ref(resolved_by)),
  resolved_at    timestamptz,
  expiry_reason  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at     timestamptz,
  updated_by     jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version    integer NOT NULL DEFAULT 1
);
CREATE TRIGGER pending_action_row_version BEFORE UPDATE ON app.pending_action
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();
CREATE UNIQUE INDEX pending_action_open_uq ON app.pending_action (account_id, kind, object_type, object_id)
  WHERE status = 'Open';
CREATE INDEX pending_action_list_idx ON app.pending_action (account_id, status, created_at DESC);
CREATE INDEX pending_action_project_idx ON app.pending_action (account_id, project_id, status);

-- Notification — trong ứng dụng (OQ-020: không gửi ngoài ứng dụng ở MVP).
CREATE TABLE app.notification (
  id           uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id   uuid NOT NULL,
  project_id   uuid,
  kind         text NOT NULL CHECK (kind IN ('blocked_task','failure','completion','impact_warning','provider_issue')),
  object_type  text,
  object_id    uuid,
  message      text NOT NULL,
  status       text NOT NULL DEFAULT 'Unread' CHECK (status IN ('Unread','Read')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at   timestamptz,
  updated_by   jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version  integer NOT NULL DEFAULT 1
);
CREATE TRIGGER notification_row_version BEFORE UPDATE ON app.notification
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();
CREATE INDEX notification_unread_idx ON app.notification (account_id, created_at DESC) WHERE status = 'Unread';

-- Theo dõi purge xuyên service (docs/architecture 6.8): workspace phát project.purge_due, chờ data.purged.
CREATE TABLE app.project_purge (
  project_id      uuid PRIMARY KEY,
  account_id      uuid NOT NULL,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  expected        text[] NOT NULL,      -- service phải xác nhận: planning, orchestration, library, knowledge, ...
  confirmed       text[] NOT NULL DEFAULT '{}',
  completed_at    timestamptz
);

-- State machine (18.2).
-- (Khối INSERT INTO app.state_transition của DDL không chép: dòng do migration 0001_state_transition sinh từ
-- khai báo state machine trong src/domain/, PID-00017 S03, H2, H3, DEC-57.)
CREATE TRIGGER research_project_state BEFORE UPDATE OF status ON app.research_project
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('research_project');
CREATE TRIGGER pending_action_state BEFORE UPDATE OF status ON app.pending_action
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('pending_action');
CREATE TRIGGER notification_state BEFORE UPDATE OF status ON app.notification
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('notification');

SELECT app.enable_tenant_rls();
SELECT app.grant_standard('workspace');
REVOKE UPDATE ON app.research_context_version, app.message FROM sires_workspace_app, sires_workspace_system;
