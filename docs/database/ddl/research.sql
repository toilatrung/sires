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

INSERT INTO app.state_transition (machine, from_state, to_state) VALUES
  ('artifact_version','Draft','Accepted'), ('artifact_version','Draft','Rejected'), ('artifact_version','Accepted','Superseded'),
  ('evidence','Active','Excluded'), ('evidence','Excluded','Active'), ('evidence','Active','Stale'),
  ('claim_approval','Draft','Accepted'), ('claim_approval','Draft','Rejected'), ('claim_approval','Accepted','Draft');
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
