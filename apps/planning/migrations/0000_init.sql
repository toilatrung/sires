-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- Migration đầu của database sires_planning (PID-00023 S01; kiến trúc 6.10, H1). Custom migration SQL của
-- drizzle-kit, áp bằng migrate() của drizzle-orm trong một giao dịch; chỉ tiến, không sửa file này sau khi merge.
-- Nội dung chép nguyên văn từ docs/database/ddl/00-common.sql rồi docs/database/ddl/planning.sql (DEC-57),
-- trừ ba dòng giấy phép đầu mỗi file và khối INSERT INTO app.state_transition. Vai trò sires_planning_app,
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
-- docs/database/ddl/planning.sql
-- ===========================================================================================================

-- SIRes — Database Design · DDL tham chiếu · database sires_planning (service planning)
-- Trạng thái: Đã duyệt — PO 03/11/2026 (DEC-57). Đặc tả: docs/database/sections/05-planning.html
-- Chạy sau 00-common.sql. Nguồn: PRD 5.2, 5.3, 9.8 (TASK-STATE-001, T-01–T-19), 18.1, 18.2, 18.5.

SELECT app.create_replica_project_state();

-- ResearchPlan — một mỗi project.
CREATE TABLE app.research_plan (
  id                    uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id            uuid NOT NULL,
  project_id            uuid NOT NULL,
  baseline_version_id   uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at            timestamptz,
  updated_by            jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version           integer NOT NULL DEFAULT 1,
  CONSTRAINT research_plan_project_uq UNIQUE (project_id),
  CONSTRAINT research_plan_tenant_uq UNIQUE (account_id, project_id, id)
);
CREATE TRIGGER research_plan_row_version BEFORE UPDATE ON app.research_plan
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

-- PlanVersion — bất biến khi status ≠ Draft (chỉ đổi cột trạng thái theo state machine).
CREATE TABLE app.plan_version (
  id                       uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id               uuid NOT NULL,
  project_id               uuid NOT NULL,
  plan_id                  uuid NOT NULL,
  version_number           integer NOT NULL CHECK (version_number >= 1),
  status                   text NOT NULL DEFAULT 'Draft'
                           CHECK (status IN ('Draft','Proposed','Approved','Superseded','Rejected')),
  goals                    jsonb NOT NULL DEFAULT '[]',
  methods                  jsonb NOT NULL DEFAULT '[]',
  deliverables             jsonb NOT NULL DEFAULT '[]',
  milestones               jsonb NOT NULL DEFAULT '[]',
  risks                    jsonb NOT NULL DEFAULT '[]',
  assumption_item_ids      uuid[] NOT NULL DEFAULT '{}',       -- ref ContextItem (orchestration)
  context_version_id       uuid NOT NULL,                      -- ref ResearchContextVersion (workspace)
  based_on_version_id      uuid REFERENCES app.plan_version (id),
  change_summary           text,
  change_class             text CHECK (change_class IN ('material','minor')),
  created_by_workflow_id   uuid,
  approval                 jsonb CHECK (app.is_approval_record(approval)),
  rejection_reason         text,
  provenance               jsonb CHECK (provenance IS NULL OR app.is_provenance(provenance)),  -- khi Orchestrator tạo
  deliberation             jsonb,                              -- DeliberationLabel (DEC-50)
  deleted_at               timestamptz,                        -- hủy bản Draft (xóa mềm)
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at               timestamptz,
  updated_by               jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version              integer NOT NULL DEFAULT 1,
  CONSTRAINT plan_version_number_uq UNIQUE (plan_id, version_number),
  CONSTRAINT plan_version_tenant_uq UNIQUE (account_id, project_id, id),
  CONSTRAINT plan_version_agent_provenance_ck CHECK (created_by->>'type' <> 'agent' OR provenance IS NOT NULL),
  CONSTRAINT plan_version_approval_ck CHECK (status NOT IN ('Approved','Superseded') OR approval IS NOT NULL),
  CONSTRAINT plan_version_rejected_ck CHECK (status <> 'Rejected' OR rejection_reason IS NOT NULL),
  CONSTRAINT plan_version_deleted_ck CHECK (deleted_at IS NULL OR status = 'Draft'),
  FOREIGN KEY (account_id, project_id, plan_id) REFERENCES app.research_plan (account_id, project_id, id)
);
-- 18.5: tối đa một Approved; tối đa một Draft/Proposed đang mở mỗi plan.
CREATE UNIQUE INDEX plan_version_one_approved_uq ON app.plan_version (plan_id) WHERE status = 'Approved';
CREATE UNIQUE INDEX plan_version_one_open_uq ON app.plan_version (plan_id)
  WHERE status IN ('Draft','Proposed') AND deleted_at IS NULL;
CREATE TRIGGER plan_version_row_version BEFORE UPDATE ON app.plan_version
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

CREATE OR REPLACE FUNCTION app.tg_plan_version_frozen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'Draft' AND
     (to_jsonb(NEW) - ARRAY['status','approval','rejection_reason','row_version','updated_at','updated_by'])
       IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','approval','rejection_reason','row_version','updated_at','updated_by']) THEN
    RAISE EXCEPTION 'Plan Version % ở trạng thái % không sửa được nội dung; tạo Draft mới', OLD.id, OLD.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER plan_version_frozen BEFORE UPDATE ON app.plan_version
  FOR EACH ROW EXECUTE FUNCTION app.tg_plan_version_frozen();

ALTER TABLE app.research_plan ADD CONSTRAINT research_plan_baseline_fk
  FOREIGN KEY (account_id, project_id, baseline_version_id)
  REFERENCES app.plan_version (account_id, project_id, id) DEFERRABLE INITIALLY DEFERRED;

-- Phase — thuộc một Plan Version, sao chép khi tạo version mới.
CREATE TABLE app.phase (
  id               uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id       uuid NOT NULL,
  project_id       uuid NOT NULL,
  plan_version_id  uuid NOT NULL,
  "order"          integer NOT NULL CHECK ("order" >= 1),
  name             text NOT NULL,
  objective        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at       timestamptz,
  updated_by       jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version      integer NOT NULL DEFAULT 1,
  CONSTRAINT phase_order_uq UNIQUE (plan_version_id, "order") DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT phase_version_uq UNIQUE (plan_version_id, id),
  FOREIGN KEY (account_id, project_id, plan_version_id) REFERENCES app.plan_version (account_id, project_id, id)
);
CREATE TRIGGER phase_row_version BEFORE UPDATE ON app.phase
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

-- Task — danh tính ổn định qua các Plan Version; nội dung ở TaskDefinition.
CREATE TABLE app.task (
  id                     uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id             uuid NOT NULL,
  project_id             uuid NOT NULL,
  plan_id                uuid NOT NULL,
  stable_key             text NOT NULL CHECK (stable_key ~ '^T-[0-9]{3,}$'),
  status                 text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Blocked','Ready','Queued',
                           'In Progress','Waiting for User','In Review','Completed','Failed','Cancelled')),
  current_definition_id  uuid NOT NULL,
  needs_review           boolean NOT NULL DEFAULT false,
  needs_review_reasons   jsonb NOT NULL DEFAULT '[]',          -- [{cause, sourceType, sourceId, at}]
  active_workflow_id     uuid,                                 -- bản sao; nguồn sự thật ở orchestration
  last_readiness_id      uuid,
  search_tsv             tsvector,
  deleted_at             timestamptz,                          -- T-17: Task Draft bị bỏ khỏi bản nháp
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at             timestamptz,
  updated_by             jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version            integer NOT NULL DEFAULT 1,
  CONSTRAINT task_stable_key_uq UNIQUE (project_id, stable_key),
  CONSTRAINT task_tenant_uq UNIQUE (account_id, project_id, id),
  CONSTRAINT task_needs_review_ck CHECK (needs_review = (jsonb_array_length(needs_review_reasons) > 0)),
  CONSTRAINT task_active_workflow_ck CHECK (active_workflow_id IS NULL OR status IN
                                            ('Queued','In Progress','Waiting for User')),
  FOREIGN KEY (account_id, project_id, plan_id) REFERENCES app.research_plan (account_id, project_id, id)
);
CREATE UNIQUE INDEX task_active_workflow_uq ON app.task (active_workflow_id) WHERE active_workflow_id IS NOT NULL;
CREATE INDEX task_board_idx ON app.task (account_id, project_id, status) WHERE deleted_at IS NULL;
CREATE INDEX task_needs_review_idx ON app.task (account_id, project_id) WHERE needs_review;
CREATE INDEX task_search_idx ON app.task USING gin (search_tsv);
CREATE TRIGGER task_row_version BEFORE UPDATE ON app.task
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

-- TaskDefinition — bất biến; mỗi Plan Version có bản riêng.
CREATE TABLE app.task_definition (
  id                    uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id            uuid NOT NULL,
  project_id            uuid NOT NULL,
  task_id               uuid NOT NULL,
  plan_version_id       uuid NOT NULL,
  phase_id              uuid NOT NULL,
  title                 text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  description           text,
  objective             text NOT NULL,
  execution_label       text NOT NULL CHECK (execution_label IN ('Available for agent','Manual editor requirement')),
  required_inputs       jsonb NOT NULL DEFAULT '[]',           -- [{type: context|reference|artifact|decision, refId?, description}]
  expected_outputs      jsonb NOT NULL CHECK (jsonb_array_length(expected_outputs) >= 1),
  acceptance_criteria   jsonb NOT NULL CHECK (jsonb_array_length(acceptance_criteria) >= 1),
  checklist             jsonb NOT NULL DEFAULT '[]',
  proposed_agent        text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  CONSTRAINT task_definition_version_uq UNIQUE (task_id, plan_version_id),
  CONSTRAINT task_definition_task_uq UNIQUE (task_id, id),
  -- Deferrable: tạo Task mới thì chèn TaskDefinition trước để trigger task_tsv đọc được tiêu đề.
  FOREIGN KEY (account_id, project_id, task_id) REFERENCES app.task (account_id, project_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (plan_version_id, phase_id) REFERENCES app.phase (plan_version_id, id)
);
CREATE INDEX task_definition_version_idx ON app.task_definition (plan_version_id);
CREATE TRIGGER task_definition_immutable BEFORE UPDATE ON app.task_definition
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable();

ALTER TABLE app.task ADD CONSTRAINT task_current_definition_fk
  FOREIGN KEY (id, current_definition_id) REFERENCES app.task_definition (task_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION app.tg_task_tsv() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  SELECT setweight(to_tsvector('app.sires_simple', NEW.stable_key || ' ' || d.title), 'A')
      || setweight(to_tsvector('app.sires_simple', coalesce(d.objective, '')), 'B')
    INTO NEW.search_tsv
  FROM app.task_definition d WHERE d.id = NEW.current_definition_id;
  RETURN NEW;
END $$;
CREATE TRIGGER task_tsv BEFORE INSERT OR UPDATE OF current_definition_id ON app.task
  FOR EACH ROW EXECUTE FUNCTION app.tg_task_tsv();

-- TaskDependency — trong cùng Plan Version; không chu trình (kiểm tra ở readiness/trình duyệt, 18.5).
CREATE TABLE app.task_dependency (
  account_id          uuid NOT NULL,
  plan_version_id     uuid NOT NULL,
  task_id             uuid NOT NULL,
  depends_on_task_id  uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_version_id, task_id, depends_on_task_id),
  CONSTRAINT task_dependency_self_ck CHECK (task_id <> depends_on_task_id),
  FOREIGN KEY (task_id, plan_version_id) REFERENCES app.task_definition (task_id, plan_version_id),
  FOREIGN KEY (depends_on_task_id, plan_version_id) REFERENCES app.task_definition (task_id, plan_version_id)
);
CREATE INDEX task_dependency_reverse_idx ON app.task_dependency (plan_version_id, depends_on_task_id);

-- Phát hiện chu trình trước khi trình duyệt (DATA-VALID-001-AC01): trả các Task nằm trên chu trình.
CREATE OR REPLACE FUNCTION app.plan_version_cycles(p_plan_version_id uuid)
RETURNS TABLE (task_id uuid) LANGUAGE sql STABLE AS $$
  WITH RECURSIVE walk(start_id, cur_id, path, cyc) AS (
    SELECT d.task_id, d.depends_on_task_id, ARRAY[d.task_id], false
    FROM app.task_dependency d WHERE d.plan_version_id = p_plan_version_id
    UNION ALL
    SELECT w.start_id, d.depends_on_task_id, w.path || w.cur_id, d.depends_on_task_id = w.start_id
    FROM walk w JOIN app.task_dependency d
      ON d.plan_version_id = p_plan_version_id AND d.task_id = w.cur_id
    WHERE NOT w.cyc AND NOT (w.cur_id = ANY (w.path))
  )
  SELECT DISTINCT start_id FROM walk WHERE cyc
$$;

-- ReadinessResult — chỉ ghi thêm.
CREATE TABLE app.readiness_result (
  id                           uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id                   uuid NOT NULL,
  project_id                   uuid NOT NULL,
  task_id                      uuid NOT NULL,
  plan_version_id              uuid NOT NULL,
  passed                       boolean NOT NULL,
  checks                       jsonb NOT NULL,                  -- [{code: RC-01…RC-09, passed, detail, suggestedAction}]
  semantic_check_agent_run_id  uuid,
  at                           timestamptz NOT NULL DEFAULT now(),
  created_at                   timestamptz NOT NULL DEFAULT now(),
  created_by                   jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  FOREIGN KEY (account_id, project_id, task_id) REFERENCES app.task (account_id, project_id, id)
);
CREATE INDEX readiness_result_task_idx ON app.readiness_result (task_id, at DESC);
CREATE TRIGGER readiness_result_immutable BEFORE UPDATE ON app.readiness_result
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable();

-- TaskReview — kết quả nghiệm thu/trả lại/chặn/hủy; chỉ ghi thêm.
CREATE TABLE app.task_review (
  id                uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id        uuid NOT NULL,
  project_id        uuid NOT NULL,
  task_id           uuid NOT NULL,
  workflow_id       uuid,
  outcome           text NOT NULL CHECK (outcome IN ('accepted','returned','blocked','cancelled')),
  criteria_results  jsonb NOT NULL DEFAULT '[]',               -- [{criterionId, met}]
  feedback          text,
  reason_code       text CHECK (reason_code IN ('missing_input','quality_insufficient','scope_changed','wrong_approach',
                                                'provider_error','dependency_changed','other')),
  approval          jsonb CHECK (app.is_approval_record(approval)),
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  CONSTRAINT task_review_reason_ck CHECK (outcome NOT IN ('returned','blocked') OR reason_code IS NOT NULL),  -- KPI-04
  CONSTRAINT task_review_approval_ck CHECK (outcome <> 'accepted' OR approval IS NOT NULL),
  FOREIGN KEY (account_id, project_id, task_id) REFERENCES app.task (account_id, project_id, id)
);
CREATE INDEX task_review_task_idx ON app.task_review (task_id, created_at DESC);
CREATE INDEX task_review_kpi_idx ON app.task_review (account_id, project_id, outcome, reason_code);
CREATE TRIGGER task_review_immutable BEFORE UPDATE ON app.task_review
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable();

-- Đầu vào có phiên bản của Task (truy vấn ngược cho needs review, 9.11, 10.8).
CREATE TABLE app.task_input_ref (
  account_id     uuid NOT NULL,
  task_id        uuid NOT NULL REFERENCES app.task (id),
  input_type     text NOT NULL,         -- reference | artifact_version | evidence | context_item | research_context_version
  input_id       uuid NOT NULL,
  input_version  integer,
  PRIMARY KEY (task_id, input_type, input_id)
);
CREATE INDEX task_input_ref_reverse_idx ON app.task_input_ref (account_id, input_type, input_id);

-- State machine Task (TASK-STATE-001, 9.8 là chuẩn) và Plan Version (18.2).
-- (Khối INSERT INTO app.state_transition của DDL không chép: dòng do migration 0001_state_transition sinh từ
-- khai báo state machine trong src/task-state/, PID-00023 S03, S05, DEC-57.)
CREATE TRIGGER task_state BEFORE UPDATE OF status ON app.task
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('task');
CREATE TRIGGER plan_version_state BEFORE UPDATE OF status ON app.plan_version
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('plan_version');

-- Chặn ghi khi project không Active (PRD 18.2 › Quyền theo trạng thái).
CREATE TRIGGER plan_version_project_writable BEFORE INSERT OR UPDATE ON app.plan_version
  FOR EACH ROW EXECUTE FUNCTION app.tg_project_writable();
CREATE TRIGGER task_project_writable BEFORE INSERT OR UPDATE ON app.task
  FOR EACH ROW EXECUTE FUNCTION app.tg_project_writable();

SELECT app.enable_tenant_rls();
SELECT app.grant_standard('planning', ARRAY['task_dependency','task_input_ref']);
REVOKE UPDATE ON app.task_definition, app.readiness_result, app.task_review
  FROM sires_planning_app, sires_planning_system;
