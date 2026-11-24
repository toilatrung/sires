// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Ba state machine của manuscript (PRD 18.2; database 10.2), nơi khai báo duy nhất (DEC-57, DR-01; PID-00030 S02, H1):
// dạng dữ liệu theo helper defineStateMachine của PID-00158, đúng các cặp từ → đến của docs/database/ddl/manuscript.sql.
// Không điều kiện, không mã: điều kiện chuyển (base = revision hiện hành, citation check, phê duyệt APR-05) do DDL và
// PID tính năng giữ; PID-00053, PID-00079, PID-00108 dùng lại khai báo này, không khai báo lại. `stateMachines` là
// export mà lệnh sires-state-transition-sql đọc từ bản build (dist/domain/state-machines.js) để sinh migration
// 0001_state_transition.sql.

import { defineStateMachine } from '@sires/platform';

/** Trạng thái của ChangeProposal, đúng CHECK của app.change_proposal.status. */
export const CHANGE_PROPOSAL_STATUSES = ['Proposed', 'Accepted', 'Rejected', 'Outdated'] as const;
export type ChangeProposalStatus = (typeof CHANGE_PROPOSAL_STATUSES)[number];

export const changeProposalMachine = defineStateMachine({
  machine: 'change_proposal',
  states: CHANGE_PROPOSAL_STATUSES,
  transitions: [
    { from: 'Proposed', to: 'Accepted' },
    { from: 'Proposed', to: 'Rejected' },
    { from: 'Proposed', to: 'Outdated' },
  ],
});

/** Trạng thái của Build, đúng CHECK của app.build.status. */
export const BUILD_STATUSES = ['Queued', 'Running', 'Succeeded', 'Failed'] as const;
export type BuildStatus = (typeof BUILD_STATUSES)[number];

export const buildMachine = defineStateMachine({
  machine: 'build',
  states: BUILD_STATUSES,
  transitions: [
    { from: 'Queued', to: 'Running' },
    { from: 'Running', to: 'Succeeded' },
    { from: 'Running', to: 'Failed' },
    { from: 'Queued', to: 'Failed' },
  ],
});

/** Trạng thái của ManuscriptFile, đúng CHECK của app.manuscript_file.status. */
export const MANUSCRIPT_FILE_STATUSES = ['Active', 'Deleted'] as const;
export type ManuscriptFileStatus = (typeof MANUSCRIPT_FILE_STATUSES)[number];

export const manuscriptFileMachine = defineStateMachine({
  machine: 'manuscript_file',
  states: MANUSCRIPT_FILE_STATUSES,
  transitions: [{ from: 'Active', to: 'Deleted' }],
});

/** Mọi state machine của manuscript, theo thứ tự khối INSERT của docs/database/ddl/manuscript.sql. */
export const stateMachines = [changeProposalMachine, buildMachine, manuscriptFileMachine];
