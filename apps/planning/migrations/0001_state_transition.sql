-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- SQL sinh từ khai báo state machine; không sửa tay (DR-01, DEC-57).
-- Machine (số cặp): plan_version (4), task (28).
DELETE FROM app.state_transition
WHERE machine IN ('plan_version', 'task')
  AND (machine, from_state, to_state) NOT IN (VALUES
    ('plan_version', 'Approved', 'Superseded'),
    ('plan_version', 'Draft', 'Proposed'),
    ('plan_version', 'Proposed', 'Approved'),
    ('plan_version', 'Proposed', 'Rejected'),
    ('task', 'Blocked', 'Cancelled'),
    ('task', 'Blocked', 'Ready'),
    ('task', 'Completed', 'Blocked'),
    ('task', 'Completed', 'Ready'),
    ('task', 'Draft', 'Blocked'),
    ('task', 'Draft', 'Ready'),
    ('task', 'Failed', 'Blocked'),
    ('task', 'Failed', 'Cancelled'),
    ('task', 'Failed', 'Queued'),
    ('task', 'In Progress', 'Blocked'),
    ('task', 'In Progress', 'Failed'),
    ('task', 'In Progress', 'In Review'),
    ('task', 'In Progress', 'Ready'),
    ('task', 'In Progress', 'Waiting for User'),
    ('task', 'In Review', 'Blocked'),
    ('task', 'In Review', 'Cancelled'),
    ('task', 'In Review', 'Completed'),
    ('task', 'In Review', 'Ready'),
    ('task', 'Queued', 'Cancelled'),
    ('task', 'Queued', 'In Progress'),
    ('task', 'Queued', 'Ready'),
    ('task', 'Ready', 'Blocked'),
    ('task', 'Ready', 'Cancelled'),
    ('task', 'Ready', 'Queued'),
    ('task', 'Waiting for User', 'Blocked'),
    ('task', 'Waiting for User', 'Failed'),
    ('task', 'Waiting for User', 'In Progress'),
    ('task', 'Waiting for User', 'Ready'));
--> statement-breakpoint
INSERT INTO app.state_transition (machine, from_state, to_state, code) VALUES
  ('plan_version', 'Approved', 'Superseded', NULL),
  ('plan_version', 'Draft', 'Proposed', NULL),
  ('plan_version', 'Proposed', 'Approved', 'APR-01'),
  ('plan_version', 'Proposed', 'Rejected', NULL),
  ('task', 'Blocked', 'Cancelled', 'T-18'),
  ('task', 'Blocked', 'Ready', 'T-03'),
  ('task', 'Completed', 'Blocked', 'T-19'),
  ('task', 'Completed', 'Ready', 'T-19'),
  ('task', 'Draft', 'Blocked', 'T-01'),
  ('task', 'Draft', 'Ready', 'T-02'),
  ('task', 'Failed', 'Blocked', 'T-16'),
  ('task', 'Failed', 'Cancelled', 'T-18'),
  ('task', 'Failed', 'Queued', 'T-05'),
  ('task', 'In Progress', 'Blocked', 'T-10'),
  ('task', 'In Progress', 'Failed', 'T-12'),
  ('task', 'In Progress', 'In Review', 'T-11'),
  ('task', 'In Progress', 'Ready', 'T-10'),
  ('task', 'In Progress', 'Waiting for User', 'T-08'),
  ('task', 'In Review', 'Blocked', 'T-15'),
  ('task', 'In Review', 'Cancelled', 'T-18'),
  ('task', 'In Review', 'Completed', 'T-14'),
  ('task', 'In Review', 'Ready', 'T-13'),
  ('task', 'Queued', 'Cancelled', 'T-18'),
  ('task', 'Queued', 'In Progress', 'T-06'),
  ('task', 'Queued', 'Ready', 'T-07'),
  ('task', 'Ready', 'Blocked', 'T-04'),
  ('task', 'Ready', 'Cancelled', 'T-18'),
  ('task', 'Ready', 'Queued', 'T-05'),
  ('task', 'Waiting for User', 'Blocked', 'T-10'),
  ('task', 'Waiting for User', 'Failed', 'T-12'),
  ('task', 'Waiting for User', 'In Progress', 'T-09'),
  ('task', 'Waiting for User', 'Ready', 'T-10')
ON CONFLICT (machine, from_state, to_state) DO UPDATE SET code = EXCLUDED.code
  WHERE app.state_transition.code IS DISTINCT FROM EXCLUDED.code;
