// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Bốn state machine của library (PRD 18.2; database 10.2), nơi khai báo duy nhất (DEC-57, DR-01; PID-00024 S02, H3):
// cùng khai báo cho kiểm chuyển ở domain (assertTransition của @sires/platform) và dòng app.state_transition của
// migration 0000_init (sinh bằng lệnh sires-state-transition-sql của PID-00158). Đúng 18 cặp từ → đến của
// docs/database/ddl/library.sql, không mã PRD, không điều kiện: điều kiện chuyển (duyệt Reference APR, chỉ chọn
// Reference Trusted, hàng đợi indexing) do PID tính năng thêm (PID-00050, PID-00076 và sau), các PID đó dùng lại
// khai báo này. `stateMachines` là export mà lệnh sires-state-transition-sql đọc từ bản build
// (dist/domain/state-machines.js).

import { defineStateMachine } from '@sires/platform';

/** DiscoveredResult.status (cột status của app.discovered_result). */
export const DISCOVERED_RESULT_STATUSES = ['New', 'Selected', 'Rejected', 'Imported'] as const;
export type DiscoveredResultStatus = (typeof DISCOVERED_RESULT_STATUSES)[number];

export const discoveredResultMachine = defineStateMachine({
  machine: 'discovered_result',
  states: DISCOVERED_RESULT_STATUSES,
  transitions: [
    { from: 'New', to: 'Selected' },
    { from: 'New', to: 'Rejected' },
    { from: 'Selected', to: 'New' },
    { from: 'Selected', to: 'Imported' },
  ],
});

/** Reference.approval_status — Trusted Library; Reference nhập tay luôn bắt đầu ở Pending Approval (LIB-IMPORT-002). */
export const REFERENCE_APPROVAL_STATUSES = ['Pending Approval', 'Trusted', 'Rejected', 'Revoked'] as const;
export type ReferenceApprovalStatus = (typeof REFERENCE_APPROVAL_STATUSES)[number];

export const referenceApprovalMachine = defineStateMachine({
  machine: 'reference_approval',
  states: REFERENCE_APPROVAL_STATUSES,
  transitions: [
    { from: 'Pending Approval', to: 'Trusted' },
    { from: 'Pending Approval', to: 'Rejected' },
    { from: 'Trusted', to: 'Revoked' },
    { from: 'Revoked', to: 'Trusted' },
  ],
});

/** Reference.indexing_status. */
export const REFERENCE_INDEXING_STATUSES = ['Not Indexed', 'Queued', 'Indexing', 'Indexed', 'Failed', 'Unavailable'] as const;
export type ReferenceIndexingStatus = (typeof REFERENCE_INDEXING_STATUSES)[number];

export const referenceIndexingMachine = defineStateMachine({
  machine: 'reference_indexing',
  states: REFERENCE_INDEXING_STATUSES,
  transitions: [
    { from: 'Not Indexed', to: 'Queued' },
    { from: 'Not Indexed', to: 'Unavailable' },
    { from: 'Queued', to: 'Indexing' },
    { from: 'Indexing', to: 'Indexed' },
    { from: 'Indexing', to: 'Failed' },
    { from: 'Failed', to: 'Queued' },
    { from: 'Unavailable', to: 'Queued' },
    { from: 'Indexed', to: 'Queued' },
  ],
});

/** ProjectReferenceSelection.status — một dòng mỗi (project, reference), Active ⇄ Removed. */
export const PROJECT_REFERENCE_SELECTION_STATUSES = ['Active', 'Removed'] as const;
export type ProjectReferenceSelectionStatus = (typeof PROJECT_REFERENCE_SELECTION_STATUSES)[number];

export const projectReferenceSelectionMachine = defineStateMachine({
  machine: 'project_reference_selection',
  states: PROJECT_REFERENCE_SELECTION_STATUSES,
  transitions: [
    { from: 'Active', to: 'Removed' },
    { from: 'Removed', to: 'Active' },
  ],
});

/** Mọi state machine của library, theo thứ tự khối INSERT của docs/database/ddl/library.sql. */
export const stateMachines = [
  discoveredResultMachine,
  referenceApprovalMachine,
  referenceIndexingMachine,
  projectReferenceSelectionMachine,
];
