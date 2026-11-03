-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

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
INSERT INTO app.state_transition (machine, from_state, to_state, code) VALUES
  ('task','Draft','Blocked','T-01'), ('task','Draft','Ready','T-02'),
  ('task','Blocked','Ready','T-03'), ('task','Ready','Blocked','T-04'),
  ('task','Ready','Queued','T-05'), ('task','Failed','Queued','T-05'),
  ('task','Queued','In Progress','T-06'), ('task','Queued','Ready','T-07'),
  ('task','In Progress','Waiting for User','T-08'), ('task','Waiting for User','In Progress','T-09'),
  ('task','In Progress','Ready','T-10'), ('task','In Progress','Blocked','T-10'),
  ('task','Waiting for User','Ready','T-10'), ('task','Waiting for User','Blocked','T-10'),
  ('task','In Progress','In Review','T-11'),
  ('task','In Progress','Failed','T-12'), ('task','Waiting for User','Failed','T-12'),
  ('task','In Review','Ready','T-13'), ('task','In Review','Completed','T-14'), ('task','In Review','Blocked','T-15'),
  ('task','Failed','Blocked','T-16'),
  ('task','Blocked','Cancelled','T-18'), ('task','Ready','Cancelled','T-18'), ('task','Queued','Cancelled','T-18'),
  ('task','In Review','Cancelled','T-18'), ('task','Failed','Cancelled','T-18'),
  ('task','Completed','Ready','T-19'), ('task','Completed','Blocked','T-19'),
  ('plan_version','Draft','Proposed',NULL), ('plan_version','Proposed','Approved','APR-01'),
  ('plan_version','Proposed','Rejected',NULL), ('plan_version','Approved','Superseded',NULL);
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
