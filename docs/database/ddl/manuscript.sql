-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- SIRes — Database Design · DDL tham chiếu · database sires_manuscript (service manuscript)
-- Trạng thái: Đã duyệt — PO 03/11/2026 (DEC-57). Đặc tả: docs/database/sections/08-research-and-manuscript.html
-- Chạy sau 00-common.sql. Nguồn: PRD 5.8, 12, 18.1–18.5 (DATA-IDEMP-005); docs/architecture 6.6, 9.

SELECT app.create_replica_project_state();

-- Bản sao từ library: BibliographyEntry chỉ tham chiếu Reference Trusted (18.5); metadata_version để báo needs review.
CREATE TABLE replica.reference_state (
  reference_id      uuid PRIMARY KEY,
  account_id        uuid NOT NULL,
  approval_status   text NOT NULL,
  metadata_version  integer,             -- từ reference.metadata_updated; status_changed chưa mang trường này (DBQ-04)
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
  CONSTRAINT change_proposal_accept_ck CHECK (status <> 'Accepted' OR (citation_check_passed AND approval IS NOT NULL)),
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

INSERT INTO app.state_transition (machine, from_state, to_state) VALUES
  ('change_proposal','Proposed','Accepted'), ('change_proposal','Proposed','Rejected'),
  ('change_proposal','Proposed','Outdated'),
  ('build','Queued','Running'), ('build','Running','Succeeded'), ('build','Running','Failed'), ('build','Queued','Failed'),
  ('manuscript_file','Active','Deleted');
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
