-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- Migration đầu của database sires_manuscript (PID-00030 S01; kiến trúc 6.10, H2). Custom migration SQL của
-- drizzle-kit, áp bằng migrate() của drizzle-orm trong một giao dịch; chỉ tiến, không sửa file này sau khi merge.
-- Nội dung chép nguyên văn từ docs/database/ddl/00-common.sql (gồm bản sửa EC09 của ba hàm kiểm JSON, PO 24/11/2026)
-- rồi docs/database/ddl/manuscript.sql (DEC-57), trừ ba dòng giấy phép đầu mỗi file và câu INSERT INTO
-- app.state_transition. Vai trò sires_manuscript_owner, _app, _system, _purge phải có sẵn (database 3.2): migration
-- không tạo vai trò; thiếu thì GRANT lỗi và cả giao dịch rollback. Test: src/db/migration.spec.ts so schema với
-- database dựng từ hai file DDL.

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
-- docs/database/ddl/manuscript.sql
-- ===========================================================================================================

-- SIRes — Database Design · DDL tham chiếu · database sires_manuscript (service manuscript)
-- Trạng thái: Đã duyệt — PO 03/11/2026 (DEC-57). Đặc tả: docs/database/sections/08-research-and-manuscript.html
-- Chạy sau 00-common.sql. Nguồn: PRD 5.8, 12, 18.1–18.5 (DATA-IDEMP-005); docs/architecture 6.6, 9.

SELECT app.create_replica_project_state();

-- Bản sao từ library: BibliographyEntry chỉ tham chiếu Reference Trusted (18.5); metadata_version để báo needs review.
CREATE TABLE replica.reference_state (
  reference_id      uuid PRIMARY KEY,
  account_id        uuid NOT NULL,
  approval_status   text NOT NULL,
  metadata_version  integer,             -- từ reference.metadata_updated và reference.status_changed (DBQ-04)
  bibtex_key        text NOT NULL,
  source_version    bigint NOT NULL,
  synced_at         timestamptz NOT NULL DEFAULT now()
);

-- Manuscript — tối đa một mỗi project.
CREATE TABLE app.manuscript (
  id                   uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id           uuid NOT NULL,
  project_id           uuid NOT NULL,
  init_mode            text NOT NULL CHECK (init_mode IN ('Default','Blank')),
  main_file            text NOT NULL DEFAULT 'main.tex',
  compiler             text NOT NULL DEFAULT 'pdflatex' CHECK (compiler IN ('pdflatex','xelatex','lualatex')),
  bibliography_tool    text NOT NULL DEFAULT 'bibtex',
  bibliography_style   text NOT NULL DEFAULT 'plainnat',
  current_revision_id  uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at           timestamptz,
  updated_by           jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version          integer NOT NULL DEFAULT 1,
  CONSTRAINT manuscript_project_uq UNIQUE (project_id),
  CONSTRAINT manuscript_tenant_uq UNIQUE (account_id, project_id, id)
);
CREATE TRIGGER manuscript_row_version BEFORE UPDATE ON app.manuscript
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

-- ManuscriptFile — trạng thái hiện hành của cây file; nội dung theo địa chỉ sha256 (DATA-STORE-001).
CREATE TABLE app.manuscript_file (
  id             uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id     uuid NOT NULL,
  project_id     uuid NOT NULL,
  manuscript_id  uuid NOT NULL,
  path           text NOT NULL CHECK (path !~ '(^/|\.\.)' AND length(path) <= 300),
  file_type      text NOT NULL CHECK (file_type IN ('tex','bib','figure','other')),
  content_ref    text NOT NULL,          -- manuscript/acct/<accountId>/blobs/<sha256>
  content_hash   bytea NOT NULL,
  size_bytes     integer NOT NULL CHECK (size_bytes >= 0),
  status         text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Deleted')),
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at     timestamptz,
  updated_by     jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version    integer NOT NULL DEFAULT 1,
  CONSTRAINT manuscript_file_deleted_ck CHECK ((status = 'Deleted') = (deleted_at IS NOT NULL)),
  FOREIGN KEY (account_id, project_id, manuscript_id) REFERENCES app.manuscript (account_id, project_id, id)
);
CREATE UNIQUE INDEX manuscript_file_path_uq ON app.manuscript_file (manuscript_id, path) WHERE status = 'Active';
CREATE TRIGGER manuscript_file_row_version BEFORE UPDATE ON app.manuscript_file
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

-- ManuscriptRevision — bất biến cho mọi thay đổi file.
CREATE TABLE app.manuscript_revision (
  id                    uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id            uuid NOT NULL,
  project_id            uuid NOT NULL,
  manuscript_id         uuid NOT NULL,
  revision_number       integer NOT NULL CHECK (revision_number >= 1),
  parent_revision_id    uuid REFERENCES app.manuscript_revision (id),
  changes               jsonb NOT NULL,       -- [{path, operation: add|modify|delete|rename, beforeHash, afterHash}]
  tree                  jsonb NOT NULL,       -- bản chụp {path: sha256} của cả cây file tại revision (DBD-09)
  source                text NOT NULL CHECK (source IN ('direct_edit','change_proposal','init')),
  change_proposal_id    uuid,
  task_id               uuid,
  artifact_version_ids  uuid[] NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  CONSTRAINT manuscript_revision_number_uq UNIQUE (manuscript_id, revision_number),
  CONSTRAINT manuscript_revision_ms_uq UNIQUE (manuscript_id, id),
  CONSTRAINT manuscript_revision_parent_ck CHECK ((revision_number = 1) = (parent_revision_id IS NULL)),
  CONSTRAINT manuscript_revision_source_ck CHECK ((source = 'change_proposal') = (change_proposal_id IS NOT NULL)),
  FOREIGN KEY (account_id, project_id, manuscript_id) REFERENCES app.manuscript (account_id, project_id, id)
);
CREATE TRIGGER manuscript_revision_immutable BEFORE UPDATE ON app.manuscript_revision
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable();
ALTER TABLE app.manuscript ADD CONSTRAINT manuscript_current_revision_fk
  FOREIGN KEY (id, current_revision_id) REFERENCES app.manuscript_revision (manuscript_id, id) DEFERRABLE INITIALLY DEFERRED;

-- ChangeProposal — chấp nhận khi base = revision hiện hành và citation check đạt (APR-05).
CREATE TABLE app.change_proposal (
  id                       uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id               uuid NOT NULL,
  project_id               uuid NOT NULL,
  manuscript_id            uuid NOT NULL,
  base_revision_id         uuid NOT NULL,
  diff                     jsonb NOT NULL,          -- [{path, hunks[]}]
  task_id                  uuid,
  claim_ids                uuid[] NOT NULL DEFAULT '{}',
  evidence_ids             uuid[] NOT NULL DEFAULT '{}',
  artifact_version_ids     uuid[] NOT NULL DEFAULT '{}',
  created_by_agent_run_id  uuid NOT NULL,
  citation_check_id        uuid,                    -- VerificationResult (research) target_type citation
  citation_check_passed    boolean,
  status                   text NOT NULL DEFAULT 'Proposed' CHECK (status IN ('Proposed','Accepted','Rejected','Outdated')),
  needs_review             boolean NOT NULL DEFAULT false,
  approval                 jsonb CHECK (app.is_approval_record(approval)),
  provenance               jsonb NOT NULL CHECK (app.is_provenance(provenance)),
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at               timestamptz,
  updated_by               jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version              integer NOT NULL DEFAULT 1,
  -- NULL (chưa có kết quả citation check) không được coi là đạt: EC10 PID-00030; DBQ-11, PO 25/11/2026.
  CONSTRAINT change_proposal_accept_ck CHECK (status <> 'Accepted' OR (citation_check_passed IS TRUE AND approval IS NOT NULL)),
  FOREIGN KEY (manuscript_id, base_revision_id) REFERENCES app.manuscript_revision (manuscript_id, id),
  FOREIGN KEY (account_id, project_id, manuscript_id) REFERENCES app.manuscript (account_id, project_id, id)
);
CREATE INDEX change_proposal_open_idx ON app.change_proposal (manuscript_id) WHERE status = 'Proposed';
CREATE TRIGGER change_proposal_row_version BEFORE UPDATE ON app.change_proposal
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();
CREATE TRIGGER change_proposal_immutable BEFORE UPDATE ON app.change_proposal
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable('status','approval','citation_check_id','citation_check_passed','needs_review');
ALTER TABLE app.manuscript_revision ADD CONSTRAINT manuscript_revision_proposal_fk
  FOREIGN KEY (change_proposal_id) REFERENCES app.change_proposal (id);

-- Chấp nhận chỉ khi base = revision hiện hành (18.2); ngược lại phải chuyển Outdated.
CREATE OR REPLACE FUNCTION app.tg_change_proposal_accept() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'Accepted' AND NOT EXISTS (
       SELECT 1 FROM app.manuscript m WHERE m.id = NEW.manuscript_id AND m.current_revision_id = NEW.base_revision_id) THEN
    RAISE EXCEPTION 'Change Proposal % đã lỗi thời (base khác revision hiện hành)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER change_proposal_accept BEFORE UPDATE OF status ON app.change_proposal
  FOR EACH ROW EXECUTE FUNCTION app.tg_change_proposal_accept();

-- BibliographyEntry — duy nhất theo (manuscript, bibtexKey) và (manuscript, reference) (18.5, DATA-IDEMP-005).
CREATE TABLE app.bibliography_entry (
  id                               uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id                       uuid NOT NULL,
  project_id                       uuid NOT NULL,
  manuscript_id                    uuid NOT NULL,
  bibtex_key                       text NOT NULL,
  reference_id                     uuid NOT NULL,
  bibtex                           text NOT NULL,
  generated_from_metadata_version  integer NOT NULL,
  needs_review                     boolean NOT NULL DEFAULT false,
  created_at                       timestamptz NOT NULL DEFAULT now(),
  created_by                       jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at                       timestamptz,
  updated_by                       jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version                      integer NOT NULL DEFAULT 1,
  CONSTRAINT bibliography_entry_key_uq UNIQUE (manuscript_id, bibtex_key),
  CONSTRAINT bibliography_entry_reference_uq UNIQUE (manuscript_id, reference_id),
  FOREIGN KEY (account_id, project_id, manuscript_id) REFERENCES app.manuscript (account_id, project_id, id)
);
CREATE INDEX bibliography_entry_reference_idx ON app.bibliography_entry (reference_id);
CREATE TRIGGER bibliography_entry_row_version BEFORE UPDATE ON app.bibliography_entry
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

CREATE OR REPLACE FUNCTION app.tg_bibliography_requires_trusted() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM replica.reference_state r
                 WHERE r.reference_id = NEW.reference_id AND r.approval_status = 'Trusted') THEN
    RAISE EXCEPTION 'Reference % không Trusted', NEW.reference_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bibliography_entry_trusted BEFORE INSERT ON app.bibliography_entry
  FOR EACH ROW EXECUTE FUNCTION app.tg_bibliography_requires_trusted();

-- Build — idempotent theo (revision, cấu hình build) (DATA-IDEMP-005-AC01).
CREATE TABLE app.build (
  id                   uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id           uuid NOT NULL,
  project_id           uuid NOT NULL,
  manuscript_id        uuid NOT NULL,
  revision_id          uuid NOT NULL,
  config_hash          bytea NOT NULL,          -- sha256(compiler, bibliography tool/style, main file, image TeX Live)
  status               text NOT NULL DEFAULT 'Queued' CHECK (status IN ('Queued','Running','Succeeded','Failed')),
  queued_at            timestamptz NOT NULL DEFAULT now(),
  started_at           timestamptz,
  ended_at             timestamptz,
  log_ref              text,                    -- manuscript/acct/<accountId>/builds/<buildId>/log.txt
  pdf_ref              text,
  issues               jsonb NOT NULL DEFAULT '[]',
  citation_keys_found  text[] NOT NULL DEFAULT '{}',
  unresolved_keys      text[] NOT NULL DEFAULT '{}',
  failure_reason       text,                    -- timeout | superseded | compile_error | sandbox_error
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at           timestamptz,
  row_version          integer NOT NULL DEFAULT 1,
  CONSTRAINT build_idem_uq UNIQUE (revision_id, config_hash),
  FOREIGN KEY (manuscript_id, revision_id) REFERENCES app.manuscript_revision (manuscript_id, id),
  FOREIGN KEY (account_id, project_id, manuscript_id) REFERENCES app.manuscript (account_id, project_id, id)
);
CREATE INDEX build_latest_idx ON app.build (manuscript_id, queued_at DESC);
CREATE INDEX build_queue_idx ON app.build (queued_at) WHERE status = 'Queued';
CREATE TRIGGER build_row_version BEFORE UPDATE ON app.build
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

-- (Câu INSERT INTO app.state_transition của DDL không chép: dòng do migration 0001_state_transition sinh từ khai
-- báo state machine trong src/domain/state-machines.ts bằng helper của PID-00158, PID-00030 S02, H1, DEC-57.)
CREATE TRIGGER change_proposal_state BEFORE UPDATE OF status ON app.change_proposal
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('change_proposal');
CREATE TRIGGER build_state BEFORE UPDATE OF status ON app.build
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('build');
CREATE TRIGGER manuscript_file_state BEFORE UPDATE OF status ON app.manuscript_file
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('manuscript_file');
CREATE TRIGGER manuscript_revision_project_writable BEFORE INSERT ON app.manuscript_revision
  FOR EACH ROW EXECUTE FUNCTION app.tg_project_writable();

SELECT app.enable_tenant_rls();
SELECT app.grant_standard('manuscript', ARRAY['bibliography_entry']);
REVOKE UPDATE ON app.manuscript_revision FROM sires_manuscript_app, sires_manuscript_system;
