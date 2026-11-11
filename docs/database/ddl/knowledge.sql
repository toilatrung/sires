-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- SIRes — Database Design · DDL tham chiếu · database sires_knowledge (service knowledge, Python)
-- Trạng thái: Đã duyệt — PO 03/11/2026 (DEC-57). Đặc tả: docs/database/sections/07-library-and-knowledge.html
-- Chạy sau 00-common.sql. Migration thật: Alembic. Nguồn: PRD 11.1, 17.3, 18.1, 18.4 (DATA-IDEMP-005, DATA-STORE-001);
-- docs/architecture 7 (ADR-05, ADR-15), 6.1.

CREATE EXTENSION IF NOT EXISTS vector;      -- pgvector ≥ 0.8 (AQ-09)
CREATE SCHEMA IF NOT EXISTS vec;

SELECT app.create_replica_project_state();

-- Bản sao chỉ đọc từ library (7.4): phạm vi truy xuất KHÔNG nhận từ model.
CREATE TABLE replica.reference_state (
  reference_id     uuid PRIMARY KEY,
  account_id       uuid NOT NULL,
  approval_status  text NOT NULL,             -- Trusted | Revoked | ...
  source_version   bigint NOT NULL,
  synced_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE replica.project_reference_scope (
  project_id       uuid NOT NULL,
  reference_id     uuid NOT NULL,
  account_id       uuid NOT NULL,
  status           text NOT NULL CHECK (status IN ('Active','Removed')),
  source_version   bigint NOT NULL,
  synced_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, reference_id)
);
CREATE INDEX project_reference_scope_active_idx ON replica.project_reference_scope (account_id, project_id)
  WHERE status = 'Active';
-- Embedding model của tài khoản (DEC-31), từ embedding_model.changed của identity.
CREATE TABLE replica.account_embedding (
  account_id              uuid PRIMARY KEY,
  provider_connection_id  uuid,
  embedding_model         text,              -- slug trong app.embedding_model_catalog
  source_version          bigint NOT NULL,
  synced_at               timestamptz NOT NULL DEFAULT now()
);

-- Danh mục embedding model hệ thống hỗ trợ; mỗi model một bảng vec.emb_<slug> (7.3).
CREATE TABLE app.embedding_model_catalog (
  slug         text PRIMARY KEY CHECK (slug ~ '^[a-z0-9_]+$'),
  provider     text NOT NULL CHECK (provider IN ('openai','google')),
  model        text NOT NULL,
  dimensions   integer NOT NULL CHECK (dimensions BETWEEN 64 AND 4000),
  table_name   text NOT NULL UNIQUE,
  active       boolean NOT NULL DEFAULT true
);

-- SourceDocument — cấp tài khoản, một mỗi Reference (18.5), index một lần dùng mọi project (OQ-024).
CREATE TABLE app.source_document (
  id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id          uuid NOT NULL,
  reference_id        uuid NOT NULL,
  content_hash        bytea NOT NULL,                 -- sha256 của PDF
  file_ref            text NOT NULL,                  -- library/acct/<accountId>/pdf/<sha256>
  page_count          integer CHECK (page_count BETWEEN 1 AND 500),
  extracted_text_ref  text,                           -- knowledge/acct/<accountId>/text/<id>/
  embedding_model     text NOT NULL REFERENCES app.embedding_model_catalog (slug),
  extractor_version   text NOT NULL,                  -- RetrievalConfig.extractor (7.8)
  needs_reindex       boolean NOT NULL DEFAULT false, -- đổi embedding model (INT-VECTOR-003)
  metadata_warnings   jsonb NOT NULL DEFAULT '[]',    -- lệch DOI/tiêu đề so với Reference (7.1 bước 5)
  indexed_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at          timestamptz,
  updated_by          jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version         integer NOT NULL DEFAULT 1,
  CONSTRAINT source_document_reference_uq UNIQUE (reference_id)
);
CREATE INDEX source_document_reindex_idx ON app.source_document (account_id) WHERE needs_reindex;
CREATE TRIGGER source_document_row_version BEFORE UPDATE ON app.source_document
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

-- Job indexing — idempotent theo (referenceId, contentHash, embeddingModel) (DATA-IDEMP-005, 7.1 bước 3).
CREATE TABLE app.indexing_job (
  id                uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id        uuid NOT NULL,
  reference_id      uuid NOT NULL,
  content_hash      bytea NOT NULL,
  embedding_model   text NOT NULL REFERENCES app.embedding_model_catalog (slug),
  kind              text NOT NULL DEFAULT 'index' CHECK (kind IN ('index','reembed')),
  status            text NOT NULL DEFAULT 'Queued' CHECK (status IN ('Queued','Indexing','Indexed','Failed','Waiting Configuration')),
  attempts          smallint NOT NULL DEFAULT 0 CHECK (attempts <= 3),   -- tự chạy lại tối đa 3 lần (5.6)
  error             jsonb,
  started_at        timestamptz,
  ended_at          timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT indexing_job_natural_uq UNIQUE (reference_id, content_hash, embedding_model, kind)
);
CREATE INDEX indexing_job_queue_idx ON app.indexing_job (status, created_at) WHERE status IN ('Queued','Waiting Configuration');

-- Chunk — vị trí ổn định; chunk_key = sha256(sourceDocumentId | page | paragraph | char_start) (7.2).
CREATE TABLE app.chunk (
  id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id          uuid NOT NULL,
  reference_id        uuid NOT NULL,                  -- sao để lọc phạm vi không cần join
  source_document_id  uuid NOT NULL REFERENCES app.source_document (id) ON DELETE CASCADE,
  chunk_key           bytea NOT NULL,
  page                integer NOT NULL CHECK (page >= 1),
  paragraph           integer NOT NULL CHECK (paragraph >= 0),
  char_start          integer NOT NULL CHECK (char_start >= 0),
  char_end            integer NOT NULL,
  region              text NOT NULL DEFAULT 'body' CHECK (region IN ('body','references','appendix')),
  token_count         integer,
  CONSTRAINT chunk_key_uq UNIQUE (source_document_id, chunk_key),
  CONSTRAINT chunk_range_ck CHECK (char_end > char_start)
);
CREATE INDEX chunk_scope_idx ON app.chunk (account_id, reference_id) WHERE region = 'body';

-- Văn bản chunk + tsvector cho nhánh từ khóa và kiểm tra trích dẫn (7.2, 7.5).
CREATE TABLE app.chunk_text (
  chunk_id      uuid PRIMARY KEY REFERENCES app.chunk (id) ON DELETE CASCADE,
  account_id    uuid NOT NULL,
  reference_id  uuid NOT NULL,
  text          text NOT NULL,
  tsv           tsvector NOT NULL
);
CREATE INDEX chunk_text_tsv_idx ON app.chunk_text USING gin (tsv);
CREATE INDEX chunk_text_scope_idx ON app.chunk_text (account_id, reference_id);

CREATE OR REPLACE FUNCTION app.tg_chunk_text_tsv() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.tsv := to_tsvector('app.sires_simple', NEW.text);
  RETURN NEW;
END $$;
CREATE TRIGGER chunk_text_tsv BEFORE INSERT OR UPDATE OF text ON app.chunk_text
  FOR EACH ROW EXECUTE FUNCTION app.tg_chunk_text_tsv();

-- Bảng vector theo embedding model (mẫu). Thêm model = migration thêm dòng catalog + bảng + index.
-- Ví dụ minh họa; danh mục model thật chưa chốt (DBQ-05).
INSERT INTO app.embedding_model_catalog (slug, provider, model, dimensions, table_name) VALUES
  ('openai_text_embedding_3_small', 'openai', 'text-embedding-3-small', 1536, 'emb_openai_text_embedding_3_small');

CREATE TABLE vec.emb_openai_text_embedding_3_small (
  chunk_id      uuid PRIMARY KEY REFERENCES app.chunk (id) ON DELETE CASCADE,
  account_id    uuid NOT NULL,
  reference_id  uuid NOT NULL,
  embedding     vector(1536) NOT NULL
);
CREATE INDEX emb_openai_text_embedding_3_small_scope_idx ON vec.emb_openai_text_embedding_3_small (account_id, reference_id);
CREATE INDEX emb_openai_text_embedding_3_small_hnsw_idx ON vec.emb_openai_text_embedding_3_small
  USING hnsw (embedding vector_cosine_ops);

-- Usage của lời gọi embedding (indexing không phải Agent Run, 7.3); báo về orchestration qua usage.recorded (DBQ-03).
CREATE TABLE app.embedding_usage (
  id                      uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id              uuid NOT NULL,
  indexing_job_id         uuid NOT NULL REFERENCES app.indexing_job (id),
  provider_connection_id  uuid NOT NULL,
  model                   text NOT NULL,
  input_tokens            integer,
  calls                   integer NOT NULL,
  unavailable             boolean NOT NULL DEFAULT false,
  at                      timestamptz NOT NULL DEFAULT now(),
  reported_at             timestamptz
);
CREATE INDEX embedding_usage_unreported_idx ON app.embedding_usage (at) WHERE reported_at IS NULL;

INSERT INTO app.state_transition (machine, from_state, to_state) VALUES
  ('indexing_job','Queued','Indexing'), ('indexing_job','Indexing','Indexed'), ('indexing_job','Indexing','Failed'),
  ('indexing_job','Indexing','Queued'), ('indexing_job','Failed','Queued'),
  ('indexing_job','Queued','Waiting Configuration'), ('indexing_job','Waiting Configuration','Queued');
CREATE TRIGGER indexing_job_state BEFORE UPDATE OF status ON app.indexing_job
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('indexing_job');

SELECT app.enable_tenant_rls();
SELECT app.grant_standard('knowledge', ARRAY['source_document','chunk','chunk_text']);
GRANT USAGE ON SCHEMA vec TO sires_knowledge_app, sires_knowledge_system, sires_knowledge_purge;
GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA vec TO sires_knowledge_app, sires_knowledge_system;
GRANT SELECT, DELETE ON ALL TABLES IN SCHEMA vec TO sires_knowledge_purge;
REVOKE INSERT, UPDATE, DELETE ON app.embedding_model_catalog FROM sires_knowledge_app, sires_knowledge_system;
