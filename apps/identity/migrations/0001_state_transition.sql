-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- SQL sinh từ khai báo state machine; không sửa tay (DR-01, DEC-57).
-- Machine (số cặp): account (4), provider_connection (6).
DELETE FROM app.state_transition
WHERE machine IN ('account', 'provider_connection')
  AND (machine, from_state, to_state) NOT IN (VALUES
    ('account', 'Active', 'Deletion Requested'),
    ('account', 'Active', 'Locked'),
    ('account', 'Locked', 'Active'),
    ('account', 'Locked', 'Deletion Requested'),
    ('provider_connection', 'Invalid', 'Untested'),
    ('provider_connection', 'Invalid', 'Valid'),
    ('provider_connection', 'Untested', 'Invalid'),
    ('provider_connection', 'Untested', 'Valid'),
    ('provider_connection', 'Valid', 'Invalid'),
    ('provider_connection', 'Valid', 'Untested'));
--> statement-breakpoint
INSERT INTO app.state_transition (machine, from_state, to_state, code) VALUES
  ('account', 'Active', 'Deletion Requested', NULL),
  ('account', 'Active', 'Locked', NULL),
  ('account', 'Locked', 'Active', NULL),
  ('account', 'Locked', 'Deletion Requested', NULL),
  ('provider_connection', 'Invalid', 'Untested', NULL),
  ('provider_connection', 'Invalid', 'Valid', NULL),
  ('provider_connection', 'Untested', 'Invalid', NULL),
  ('provider_connection', 'Untested', 'Valid', NULL),
  ('provider_connection', 'Valid', 'Invalid', NULL),
  ('provider_connection', 'Valid', 'Untested', NULL)
ON CONFLICT (machine, from_state, to_state) DO UPDATE SET code = EXCLUDED.code
  WHERE app.state_transition.code IS DISTINCT FROM EXCLUDED.code;
