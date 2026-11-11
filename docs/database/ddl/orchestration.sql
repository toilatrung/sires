-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

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
INSERT INTO app.state_transition (machine, from_state, to_state) VALUES
  ('workflow','Created','Running'), ('workflow','Running','Waiting for User'), ('workflow','Waiting for User','Running'),
  ('workflow','Running','Paused'), ('workflow','Waiting for User','Paused'), ('workflow','Paused','Running'),
  ('workflow','Paused','Waiting for User'), ('workflow','Running','Interrupted'), ('workflow','Interrupted','Running'),
  ('workflow','Running','Succeeded'), ('workflow','Running','Failed'),
  ('workflow','Created','Cancelled'), ('workflow','Running','Cancelled'), ('workflow','Waiting for User','Cancelled'),
  ('workflow','Paused','Cancelled'), ('workflow','Interrupted','Cancelled'),
  ('workflow_step','Pending','Running'), ('workflow_step','Running','Succeeded'), ('workflow_step','Running','Failed'),
  ('workflow_step','Running','Waiting for User'), ('workflow_step','Waiting for User','Running'),
  ('workflow_step','Waiting for User','Pending'), ('workflow_step','Waiting for User','Succeeded'),
  ('workflow_step','Pending','Cancelled'), ('workflow_step','Running','Cancelled'),
  ('workflow_step','Waiting for User','Cancelled'), ('workflow_step','Failed','Running'),
  ('agent_run','Pending','Running'), ('agent_run','Running','Succeeded'), ('agent_run','Running','Failed'),
  ('agent_run','Pending','Cancelled'), ('agent_run','Running','Cancelled'),
  ('prompt','Open','Answered'), ('prompt','Open','Expired'), ('prompt','Open','Cancelled'),
  ('context_item','Active','Superseded'), ('context_item','Active','Retracted'),
  ('deliberation','Running','Completed'), ('deliberation','Running','Failed'), ('deliberation','Running','Cancelled'),
  ('deliberation_entry','draft','final'), ('deliberation_entry','draft','retracted'),
  ('deliberation_entry','final','retracted');
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
