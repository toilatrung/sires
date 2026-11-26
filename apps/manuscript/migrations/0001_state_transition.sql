-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- SQL sinh từ khai báo state machine; không sửa tay (DR-01, DEC-57).
-- Machine (số cặp): build (4), change_proposal (3), manuscript_file (1).
DELETE FROM app.state_transition
WHERE machine IN ('build', 'change_proposal', 'manuscript_file')
  AND (machine, from_state, to_state) NOT IN (VALUES
    ('build', 'Queued', 'Failed'),
    ('build', 'Queued', 'Running'),
    ('build', 'Running', 'Failed'),
    ('build', 'Running', 'Succeeded'),
    ('change_proposal', 'Proposed', 'Accepted'),
    ('change_proposal', 'Proposed', 'Outdated'),
    ('change_proposal', 'Proposed', 'Rejected'),
    ('manuscript_file', 'Active', 'Deleted'));
--> statement-breakpoint
INSERT INTO app.state_transition (machine, from_state, to_state, code) VALUES
  ('build', 'Queued', 'Failed', NULL),
  ('build', 'Queued', 'Running', NULL),
  ('build', 'Running', 'Failed', NULL),
  ('build', 'Running', 'Succeeded', NULL),
  ('change_proposal', 'Proposed', 'Accepted', NULL),
  ('change_proposal', 'Proposed', 'Outdated', NULL),
  ('change_proposal', 'Proposed', 'Rejected', NULL),
  ('manuscript_file', 'Active', 'Deleted', NULL)
ON CONFLICT (machine, from_state, to_state) DO UPDATE SET code = EXCLUDED.code
  WHERE app.state_transition.code IS DISTINCT FROM EXCLUDED.code;
