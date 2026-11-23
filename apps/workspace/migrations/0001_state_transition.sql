-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- SQL sinh từ khai báo state machine; không sửa tay (DR-01, DEC-57).
-- Machine (số cặp): notification (1), pending_action (3), research_project (2).
DELETE FROM app.state_transition
WHERE machine IN ('notification', 'pending_action', 'research_project')
  AND (machine, from_state, to_state) NOT IN (VALUES
    ('notification', 'Unread', 'Read'),
    ('pending_action', 'Expired', 'Resolved'),
    ('pending_action', 'Open', 'Expired'),
    ('pending_action', 'Open', 'Resolved'),
    ('research_project', 'Active', 'Archived'),
    ('research_project', 'Archived', 'Active'));
--> statement-breakpoint
INSERT INTO app.state_transition (machine, from_state, to_state, code) VALUES
  ('notification', 'Unread', 'Read', NULL),
  ('pending_action', 'Expired', 'Resolved', NULL),
  ('pending_action', 'Open', 'Expired', NULL),
  ('pending_action', 'Open', 'Resolved', NULL),
  ('research_project', 'Active', 'Archived', NULL),
  ('research_project', 'Archived', 'Active', NULL)
ON CONFLICT (machine, from_state, to_state) DO UPDATE SET code = EXCLUDED.code
  WHERE app.state_transition.code IS DISTINCT FROM EXCLUDED.code;
