-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- SIRes — Database Design · DDL tham chiếu · database sires_library (service library)
-- Trạng thái: Đã duyệt — PO 03/11/2026 (DEC-57). Đặc tả: docs/database/sections/07-library-and-knowledge.html
-- Chạy sau 00-common.sql. Nguồn: PRD 5.6, 10, 17.6 (metadata chuẩn hóa), 18.1, 18.2, 18.5; docs/architecture 6.6, 6.7.

SELECT app.create_replica_project_state();

-- DiscoveredResult — cấp tài khoản (5.6); không bao giờ là nguồn evidence.
CREATE TABLE app.discovered_result (
  id                       uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id               uuid NOT NULL,
  project_id               uuid,                       -- project nơi chạy discovery (ngữ cảnh, không phải chủ sở hữu)
  source                   text NOT NULL,              -- google_scholar | openalex | semantic_scholar | ...
  query                    text NOT NULL,
  metadata                 jsonb NOT NULL,             -- schema chuẩn hóa 17.6
  source_url               text NOT NULL,
  status                   text NOT NULL DEFAULT 'New' CHECK (status IN ('New','Selected','Rejected','Imported')),
  imported_reference_id    uuid,
  created_by_agent_run_id  uuid,
  provenance               jsonb CHECK (provenance IS NULL OR app.is_provenance(provenance)),
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at               timestamptz,
  updated_by               jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version              integer NOT NULL DEFAULT 1,
  CONSTRAINT discovered_result_imported_ck CHECK ((status = 'Imported') = (imported_reference_id IS NOT NULL)),
  CONSTRAINT discovered_result_agent_ck CHECK (created_by->>'type' <> 'agent' OR provenance IS NOT NULL)
);
CREATE INDEX discovered_result_list_idx ON app.discovered_result (account_id, status, created_at DESC);
CREATE TRIGGER discovered_result_row_version BEFORE UPDATE ON app.discovered_result
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

-- Reference — Trusted Library cấp tài khoản. Metadata hiện hành ở cột metadata; lịch sử ở reference_metadata_version.
CREATE TABLE app.reference (
  id                     uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id             uuid NOT NULL,
  metadata               jsonb NOT NULL,             -- 17.6, đã chỉnh
  metadata_version       integer NOT NULL DEFAULT 1 CHECK (metadata_version >= 1),
  title                  text GENERATED ALWAYS AS (metadata->>'title') STORED,
  doi                    text,                       -- chuẩn hóa chữ thường, không tiền tố https://doi.org/
  year                   smallint,
  authors_text           text,                       -- "Họ Tên; Họ Tên" cho tìm gần đúng
  bibtex_key             text NOT NULL CHECK (bibtex_key ~ '^[A-Za-z0-9_:.\-]+$'),
  origin                 text NOT NULL CHECK (origin IN ('discovered','manual')),
  discovered_result_id   uuid REFERENCES app.discovered_result (id),
  approval_status        text NOT NULL DEFAULT 'Pending Approval'
                         CHECK (approval_status IN ('Pending Approval','Trusted','Rejected','Revoked')),
  indexing_status        text NOT NULL DEFAULT 'Not Indexed'
                         CHECK (indexing_status IN ('Not Indexed','Queued','Indexing','Indexed','Failed','Unavailable')),
  indexing_error         jsonb,                      -- {code: no_text_layer | too_large | too_many_pages | corrupt | ..., message}
  approval               jsonb CHECK (app.is_approval_record(approval)),
  revocation             jsonb,                      -- ApprovalRecord + reason
  merged_into_id         uuid REFERENCES app.reference (id),
  pdf_object_key         text,                       -- library/acct/<accountId>/pdf/<sha256>
  pdf_sha256             bytea,
  search_tsv             tsvector,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at             timestamptz,
  updated_by             jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version            integer NOT NULL DEFAULT 1,
  CONSTRAINT reference_bibtex_key_uq UNIQUE (account_id, bibtex_key),          -- 18.5
  CONSTRAINT reference_tenant_uq UNIQUE (account_id, id),
  CONSTRAINT reference_origin_ck CHECK ((origin = 'discovered') = (discovered_result_id IS NOT NULL)),
  CONSTRAINT reference_trusted_ck CHECK (approval_status <> 'Trusted' OR approval IS NOT NULL),
  CONSTRAINT reference_revoked_ck CHECK (approval_status <> 'Revoked' OR revocation ? 'reason'),
  CONSTRAINT reference_pdf_ck CHECK ((pdf_object_key IS NULL) = (pdf_sha256 IS NULL))
);
-- DOI trùng chỉ cảnh báo, đề xuất gộp (18.5) → index thường, không unique.
CREATE INDEX reference_doi_idx ON app.reference (account_id, doi) WHERE doi IS NOT NULL;
CREATE INDEX reference_library_idx ON app.reference (account_id, approval_status, created_at DESC);
CREATE INDEX reference_search_idx ON app.reference USING gin (search_tsv);
CREATE INDEX reference_title_trgm_idx ON app.reference USING gin (title gin_trgm_ops);
CREATE INDEX reference_authors_trgm_idx ON app.reference USING gin (authors_text gin_trgm_ops);
CREATE TRIGGER reference_row_version BEFORE UPDATE ON app.reference
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

CREATE OR REPLACE FUNCTION app.tg_reference_tsv() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv :=
       setweight(to_tsvector('app.sires_simple', coalesce(NEW.metadata->>'title', '')), 'A')
    || setweight(to_tsvector('app.sires_simple', coalesce(NEW.authors_text, '')), 'B')
    || setweight(to_tsvector('app.sires_simple', coalesce(NEW.metadata->>'venue', '') || ' ' ||
                             coalesce(NEW.doi, '') || ' ' || NEW.bibtex_key), 'C');
  RETURN NEW;
END $$;
CREATE TRIGGER reference_tsv BEFORE INSERT OR UPDATE OF metadata, authors_text, doi, bibtex_key ON app.reference
  FOR EACH ROW EXECUTE FUNCTION app.tg_reference_tsv();

-- Lịch sử metadata — bất biến; BibliographyEntry ghi version đã dùng (18.3).
CREATE TABLE app.reference_metadata_version (
  account_id        uuid NOT NULL,
  reference_id      uuid NOT NULL REFERENCES app.reference (id),
  metadata_version  integer NOT NULL,
  metadata          jsonb NOT NULL,
  change_note       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  PRIMARY KEY (reference_id, metadata_version)
);
CREATE TRIGGER reference_metadata_version_immutable BEFORE UPDATE ON app.reference_metadata_version
  FOR EACH ROW EXECUTE FUNCTION app.tg_immutable();

-- ProjectReferenceSelection — một dòng mỗi (project, reference); Active ⇄ Removed.
CREATE TABLE app.project_reference_selection (
  id            uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id    uuid NOT NULL,
  project_id    uuid NOT NULL,
  reference_id  uuid NOT NULL,
  status        text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Removed')),
  reason        text,
  selected_by   jsonb NOT NULL CHECK (app.is_actor_ref(selected_by)),
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    jsonb NOT NULL CHECK (app.is_actor_ref(created_by)),
  updated_at    timestamptz,
  updated_by    jsonb CHECK (updated_by IS NULL OR app.is_actor_ref(updated_by)),
  row_version   integer NOT NULL DEFAULT 1,
  CONSTRAINT project_reference_selection_uq UNIQUE (project_id, reference_id),
  FOREIGN KEY (account_id, reference_id) REFERENCES app.reference (account_id, id)
);
CREATE INDEX project_reference_selection_active_idx ON app.project_reference_selection (account_id, project_id)
  WHERE status = 'Active';
CREATE INDEX project_reference_selection_reference_idx ON app.project_reference_selection (reference_id)
  WHERE status = 'Active';
CREATE TRIGGER project_reference_selection_row_version BEFORE UPDATE ON app.project_reference_selection
  FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();

-- Chỉ chọn Reference Trusted vào project (10.5, 18.2).
CREATE OR REPLACE FUNCTION app.tg_selection_requires_trusted() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'Active' AND NOT EXISTS (
       SELECT 1 FROM app.reference r WHERE r.id = NEW.reference_id AND r.approval_status = 'Trusted') THEN
    RAISE EXCEPTION 'Reference % chưa Trusted, không chọn vào project được', NEW.reference_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER project_reference_selection_trusted BEFORE INSERT OR UPDATE OF status ON app.project_reference_selection
  FOR EACH ROW EXECUTE FUNCTION app.tg_selection_requires_trusted();
CREATE TRIGGER project_reference_selection_project_writable BEFORE INSERT OR UPDATE ON app.project_reference_selection
  FOR EACH ROW EXECUTE FUNCTION app.tg_project_writable();

-- State machine (18.2).
INSERT INTO app.state_transition (machine, from_state, to_state) VALUES
  ('discovered_result','New','Selected'), ('discovered_result','New','Rejected'),
  ('discovered_result','Selected','New'), ('discovered_result','Selected','Imported'),
  ('reference_approval','Pending Approval','Trusted'), ('reference_approval','Pending Approval','Rejected'),
  ('reference_approval','Trusted','Revoked'), ('reference_approval','Revoked','Trusted'),
  ('reference_indexing','Not Indexed','Queued'), ('reference_indexing','Not Indexed','Unavailable'),
  ('reference_indexing','Queued','Indexing'), ('reference_indexing','Indexing','Indexed'),
  ('reference_indexing','Indexing','Failed'), ('reference_indexing','Failed','Queued'),
  ('reference_indexing','Unavailable','Queued'), ('reference_indexing','Indexed','Queued'),
  ('project_reference_selection','Active','Removed'), ('project_reference_selection','Removed','Active');
CREATE TRIGGER discovered_result_state BEFORE UPDATE OF status ON app.discovered_result
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('discovered_result');
CREATE TRIGGER reference_approval_state BEFORE UPDATE OF approval_status ON app.reference
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('reference_approval', 'approval_status');
CREATE TRIGGER reference_indexing_state BEFORE UPDATE OF indexing_status ON app.reference
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('reference_indexing', 'indexing_status');
CREATE TRIGGER project_reference_selection_state BEFORE UPDATE OF status ON app.project_reference_selection
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('project_reference_selection');

SELECT app.enable_tenant_rls();
-- Xóa Reference khi không project nào dùng (NFR-RET-003): _app được DELETE reference và lịch sử metadata.
SELECT app.grant_standard('library', ARRAY['reference','reference_metadata_version']);
REVOKE UPDATE ON app.reference_metadata_version FROM sires_library_app, sires_library_system;
