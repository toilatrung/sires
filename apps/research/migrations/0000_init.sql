-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

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

-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- SIRes — Database Design · DDL tham chiếu · database sires_research (service research)
-- Trạng thái: Đã duyệt — PO 03/11/2026 (DEC-57). Đặc tả: docs/database/sections/08-research-and-manuscript.html
-- Chạy sau 00-common.sql. Nguồn: PRD 5.6, 5.7, 11, 13, 18.1–18.3; docs/architecture 7.5–7.7.

SELECT app.create_replica_project_state();

-- Bản sao từ library (reference.status_changed, project_reference.changed): Evidence chỉ tham chiếu Reference Trusted
-- và được chọn Active (18.5); thu hồi → Stale (7.7).
CREATE TABLE replica.reference_state (
  reference_id      uuid PRIMARY KEY,
  account_id        uuid NOT NULL,
  approval_status   text NOT NULL,
  source_version    bigint NOT NULL,
  synced_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE replica.project_reference_scope (
  project_id      uuid NOT NULL,
  reference_id    uuid NOT NULL,
  account_id      uuid NOT NULL,
  status          text NOT NULL CHECK (status IN ('Active','Removed')),
  source_version  bigint NOT NULL,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, reference_id)
);

-- Artifact và ArtifactVersion (gồm sơ đồ, bản ghi thảo luận).
CREATE TABLE app.artifact (
  id                           uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id                   uuid NOT NULL,
  project_id                   uuid NOT NULL,
  type                         text NOT NULL CHECK (type IN ('note','table','synthesis','diagram','draft_section','file',
                                 'manual_submission','verification_report','deliberation_record')),
  title                        text NOT NULL,
  task_id                      uuid,
  current_accepted_version_id  uuid,
  search_tsv                   tsvector,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  created_by                   jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at                   timestamptz,
  updated_by                   jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version                  integer NOT NULL DEFAULT 1,
  CONSTRAINT artifact_tenant_uq UNIQUE (account_id, project_id, id)
);
CREATE INDEX artifact_project_idx ON app.artifact (account_id, project_id, type);
CREATE INDEX artifact_task_idx ON app.artifact (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX artifact_search_idx ON app.artifact USING gin (search_tsv);
CREATE TRIGGER artifact_row_version BEFORE UPDATE ON app.artifact
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();
CREATE OR REPLACE FUNCTION app.tg_artifact_tsv() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('app.sires_simple', coalesce(NEW.title, ''));
  RETURN NEW;
END $$;
CREATE TRIGGER artifact_tsv BEFORE INSERT OR UPDATE OF title ON app.artifact
  FOR EACH ROW EXECUTE FUNCTION app.tg_artifact_tsv();

CREATE TABLE app.artifact_version (
  id               uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id       uuid NOT NULL,
  project_id       uuid NOT NULL,
  artifact_id      uuid NOT NULL,
  version_number   integer NOT NULL CHECK (version_number >= 1),
  content          jsonb,                       -- nội dung nhỏ (bảng, ghi chú, synthesis)
  file_ref         text,                        -- research/acct/<accountId>/artifacts/<sha256> (SVG/PDF sơ đồ, file lớn)
  format           text NOT NULL,               -- markdown | json | mermaid | svg | pdf | ...
  content_hash     bytea NOT NULL,
  status           text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Accepted','Rejected','Superseded')),
  provenance       jsonb NOT NULL CHECK (app.is_provenance(provenance)),       -- DATA-PROV-001
  review           jsonb,                       -- {decision, by, at, note}
  approval         jsonb CHECK (app.is_approval_record(approval)),
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at       timestamptz,
  updated_by       jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version      integer NOT NULL DEFAULT 1,
  CONSTRAINT artifact_version_number_uq UNIQUE (artifact_id, version_number),
  CONSTRAINT artifact_version_artifact_uq UNIQUE (artifact_id, id),
  CONSTRAINT artifact_version_content_ck CHECK (num_nonnulls(content, file_ref) = 1),
  CONSTRAINT artifact_version_accepted_ck CHECK (status NOT IN ('Accepted','Superseded') OR approval IS NOT NULL),
  FOREIGN KEY (account_id, project_id, artifact_id) REFERENCES app.artifact (account_id, project_id, id)
);
-- 18.5: mỗi Artifact tối đa một version Accepted.
CREATE UNIQUE INDEX artifact_version_one_accepted_uq ON app.artifact_version (artifact_id) WHERE status = 'Accepted';
CREATE INDEX artifact_version_draft_idx ON app.artifact_version (account_id, project_id) WHERE status = 'Draft';
CREATE TRIGGER artifact_version_row_version BEFORE UPDATE ON app.artifact_version
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();
CREATE TRIGGER artifact_version_immutable BEFORE UPDATE ON app.artifact_version
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable('status','review','approval');

ALTER TABLE app.artifact ADD CONSTRAINT artifact_current_accepted_fk
  FOREIGN KEY (id, current_accepted_version_id) REFERENCES app.artifact_version (artifact_id, id)
  DEFERRABLE INITIALLY DEFERRED;

-- Evidence — vị trí lấy từ Chunk (System), không từ chữ model viết (7.5).
CREATE TABLE app.evidence (
  id                       uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id               uuid NOT NULL,
  project_id               uuid NOT NULL,
  reference_id             uuid NOT NULL,
  chunk_id                 uuid NOT NULL,          -- knowledge.app.chunk (khác database, không FK)
  quote                    text NOT NULL,
  location                 jsonb NOT NULL CHECK (location ? 'page'),    -- {page, paragraph}
  retrieval_query          text,
  task_id                  uuid,
  created_by_agent_run_id  uuid,
  relevance_score          real,
  status                   text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Excluded','Stale')),
  status_reason            text,
  provenance               jsonb CHECK (provenance IS NULL OR app.is_provenance(provenance)),
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at               timestamptz,
  updated_by               jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version              integer NOT NULL DEFAULT 1,
  CONSTRAINT evidence_tenant_uq UNIQUE (account_id, project_id, id),
  CONSTRAINT evidence_agent_ck CHECK (created_by->>'type' <> 'agent' OR provenance IS NOT NULL)
);
CREATE INDEX evidence_project_idx ON app.evidence (account_id, project_id, status);
CREATE INDEX evidence_reference_idx ON app.evidence (reference_id) WHERE status = 'Active';
CREATE INDEX evidence_task_idx ON app.evidence (task_id) WHERE task_id IS NOT NULL;
CREATE TRIGGER evidence_row_version BEFORE UPDATE ON app.evidence
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();
CREATE TRIGGER evidence_immutable BEFORE UPDATE ON app.evidence
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable('status','status_reason');

CREATE OR REPLACE FUNCTION app.tg_evidence_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM replica.reference_state r
                 JOIN replica.project_reference_scope s ON s.reference_id = r.reference_id
                 WHERE r.reference_id = NEW.reference_id AND r.approval_status = 'Trusted'
                   AND s.project_id = NEW.project_id AND s.status = 'Active') THEN
    RAISE EXCEPTION 'Reference % không Trusted hoặc không được chọn cho project %', NEW.reference_id, NEW.project_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER evidence_scope BEFORE INSERT ON app.evidence
  FOR EACH ROW EXECUTE FUNCTION app.tg_evidence_scope();

-- Claim. Sửa phát biểu Accepted → Draft tạo bản ghi lịch sử (18.2) ở claim_revision.
CREATE TABLE app.claim (
  id                    uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id            uuid NOT NULL,
  project_id            uuid NOT NULL,
  statement             text NOT NULL,
  revision              integer NOT NULL DEFAULT 1,
  task_id               uuid,
  artifact_version_id   uuid REFERENCES app.artifact_version (id),
  approval_status       text NOT NULL DEFAULT 'Draft' CHECK (approval_status IN ('Draft','Accepted','Rejected')),
  support_status        text NOT NULL DEFAULT 'Not Assessed' CHECK (support_status IN ('Supported','Partially Supported',
                          'Unsupported','Conflicting','Not Assessed')),
  support_override      jsonb,                   -- Researcher điều chỉnh có lý do
  last_verification_id  uuid,
  needs_review          boolean NOT NULL DEFAULT false,
  needs_review_reasons  jsonb NOT NULL DEFAULT '[]',
  approval              jsonb CHECK (app.is_approval_record(approval)),
  provenance            jsonb CHECK (provenance IS NULL OR app.is_provenance(provenance)),
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at            timestamptz,
  updated_by            jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version           integer NOT NULL DEFAULT 1,
  CONSTRAINT claim_tenant_uq UNIQUE (account_id, project_id, id),
  CONSTRAINT claim_accept_ck CHECK (approval_status <> 'Accepted' OR (support_status <> 'Not Assessed' AND approval IS NOT NULL)),
  CONSTRAINT claim_agent_ck CHECK (created_by->>'type' <> 'agent' OR provenance IS NOT NULL)
);
CREATE INDEX claim_project_idx ON app.claim (account_id, project_id, approval_status);
CREATE INDEX claim_needs_review_idx ON app.claim (account_id, project_id) WHERE needs_review;
CREATE TRIGGER claim_row_version BEFORE UPDATE ON app.claim
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

CREATE TABLE app.claim_revision (
  claim_id      uuid NOT NULL REFERENCES app.claim (id),
  account_id    uuid NOT NULL,
  revision      integer NOT NULL,
  statement     text NOT NULL,
  approval_status text NOT NULL,
  support_status  text NOT NULL,
  approval      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  PRIMARY KEY (claim_id, revision)
);
CREATE TRIGGER claim_revision_immutable BEFORE UPDATE ON app.claim_revision
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable();

CREATE TABLE app.claim_evidence_link (
  account_id   uuid NOT NULL,
  project_id   uuid NOT NULL,
  claim_id     uuid NOT NULL,
  evidence_id  uuid NOT NULL,
  relation     text NOT NULL CHECK (relation IN ('supports','contradicts','context')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  PRIMARY KEY (claim_id, evidence_id),
  FOREIGN KEY (account_id, project_id, claim_id) REFERENCES app.claim (account_id, project_id, id),
  FOREIGN KEY (account_id, project_id, evidence_id) REFERENCES app.evidence (account_id, project_id, id)
);
CREATE INDEX claim_evidence_link_evidence_idx ON app.claim_evidence_link (evidence_id);

-- VerificationResult — chỉ ghi thêm; ghi bản chụp ngưỡng đã dùng (OQ-092).
CREATE TABLE app.verification_result (
  id               uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id       uuid NOT NULL,
  project_id       uuid NOT NULL,
  target_type      text NOT NULL CHECK (target_type IN ('claim','citation','change_proposal')),
  target_id        uuid NOT NULL,
  agent_run_id     uuid NOT NULL,
  outcome          text NOT NULL CHECK (outcome IN ('Supported','Partially Supported','Unsupported','Conflicting',
                     'Not Assessed','resolved','unresolved','mismatch')),
  details          jsonb NOT NULL DEFAULT '[]',
  thresholds_used  jsonb NOT NULL,
  at               timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       jsonb NOT NULL CHECK (app.is_actor_ref(created_by))
);
CREATE INDEX verification_result_target_idx ON app.verification_result (target_type, target_id, at DESC);
CREATE TRIGGER verification_result_immutable BEFORE UPDATE ON app.verification_result
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable();
ALTER TABLE app.claim ADD CONSTRAINT claim_last_verification_fk
  FOREIGN KEY (last_verification_id) REFERENCES app.verification_result (id);

-- Đầu vào provenance dạng bảng để truy vấn ngược (needs review, 9.11, 10.8; docs/architecture 6.2).
CREATE TABLE app.provenance_input (
  account_id      uuid NOT NULL,
  dependent_type  text NOT NULL CHECK (dependent_type IN ('artifact_version','claim','evidence')),
  dependent_id    uuid NOT NULL,
  input_type      text NOT NULL,
  input_id        uuid NOT NULL,
  input_version   integer,
  PRIMARY KEY (dependent_type, dependent_id, input_type, input_id)
);
CREATE INDEX provenance_input_reverse_idx ON app.provenance_input (account_id, input_type, input_id);

-- SQL sinh từ khai báo state machine; không sửa tay (DR-01, DEC-57).
-- Machine (số cặp): artifact_version (3), claim_approval (3), evidence (3).
DELETE FROM app.state_transition
WHERE machine IN ('artifact_version', 'claim_approval', 'evidence')
  AND (machine, from_state, to_state) NOT IN (VALUES
    ('artifact_version', 'Accepted', 'Superseded'),
    ('artifact_version', 'Draft', 'Accepted'),
    ('artifact_version', 'Draft', 'Rejected'),
    ('claim_approval', 'Accepted', 'Draft'),
    ('claim_approval', 'Draft', 'Accepted'),
    ('claim_approval', 'Draft', 'Rejected'),
    ('evidence', 'Active', 'Excluded'),
    ('evidence', 'Active', 'Stale'),
    ('evidence', 'Excluded', 'Active'));
--> statement-breakpoint
INSERT INTO app.state_transition (machine, from_state, to_state, code) VALUES
  ('artifact_version', 'Accepted', 'Superseded', NULL),
  ('artifact_version', 'Draft', 'Accepted', NULL),
  ('artifact_version', 'Draft', 'Rejected', NULL),
  ('claim_approval', 'Accepted', 'Draft', NULL),
  ('claim_approval', 'Draft', 'Accepted', NULL),
  ('claim_approval', 'Draft', 'Rejected', NULL),
  ('evidence', 'Active', 'Excluded', NULL),
  ('evidence', 'Active', 'Stale', NULL),
  ('evidence', 'Excluded', 'Active', NULL)
ON CONFLICT (machine, from_state, to_state) DO UPDATE SET code = EXCLUDED.code
  WHERE app.state_transition.code IS DISTINCT FROM EXCLUDED.code;

CREATE TRIGGER artifact_version_state BEFORE UPDATE OF status ON app.artifact_version
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('artifact_version');
CREATE TRIGGER evidence_state BEFORE UPDATE OF status ON app.evidence
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('evidence');
CREATE TRIGGER claim_approval_state BEFORE UPDATE OF approval_status ON app.claim
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('claim_approval', 'approval_status');
CREATE TRIGGER artifact_version_project_writable BEFORE INSERT OR UPDATE ON app.artifact_version
  FOR EACH ROW EXECUTE FUNCTION app.tg_project_writable();
CREATE TRIGGER claim_project_writable BEFORE INSERT OR UPDATE ON app.claim
  FOR EACH ROW EXECUTE FUNCTION app.tg_project_writable();

SELECT app.enable_tenant_rls();
SELECT app.grant_standard('research', ARRAY['claim_evidence_link','provenance_input']);
REVOKE UPDATE ON app.claim_revision, app.verification_result, app.claim_evidence_link
  FROM sires_research_app, sires_research_system;
