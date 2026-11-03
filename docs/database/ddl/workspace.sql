-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

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
INSERT INTO app.state_transition (machine, from_state, to_state) VALUES
  ('research_project','Active','Archived'), ('research_project','Archived','Active'),
  ('pending_action','Open','Resolved'), ('pending_action','Open','Expired'), ('pending_action','Expired','Resolved'),
  ('notification','Unread','Read');
CREATE TRIGGER research_project_state BEFORE UPDATE OF status ON app.research_project
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('research_project');
CREATE TRIGGER pending_action_state BEFORE UPDATE OF status ON app.pending_action
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('pending_action');
CREATE TRIGGER notification_state BEFORE UPDATE OF status ON app.notification
  FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('notification');

SELECT app.enable_tenant_rls();
SELECT app.grant_standard('workspace');
REVOKE UPDATE ON app.research_context_version, app.message FROM sires_workspace_app, sires_workspace_system;
