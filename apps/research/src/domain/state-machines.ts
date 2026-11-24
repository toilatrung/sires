// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { defineStateMachine } from '@sires/platform';

/** Khai báo dùng chung cho domain của PID sau và SQL migration (PID-00158, DEC-57). */
export const artifactVersionMachine = defineStateMachine({
  machine: 'artifact_version',
  states: ['Draft', 'Accepted', 'Rejected', 'Superseded'],
  transitions: [
    { from: 'Draft', to: 'Accepted' },
    { from: 'Draft', to: 'Rejected' },
    { from: 'Accepted', to: 'Superseded' },
  ],
});

export const evidenceMachine = defineStateMachine({
  machine: 'evidence',
  states: ['Active', 'Excluded', 'Stale'],
  transitions: [
    { from: 'Active', to: 'Excluded' },
    { from: 'Excluded', to: 'Active' },
    { from: 'Active', to: 'Stale' },
  ],
});

export const claimApprovalMachine = defineStateMachine({
  machine: 'claim_approval',
  states: ['Draft', 'Accepted', 'Rejected'],
  transitions: [
    { from: 'Draft', to: 'Accepted' },
    { from: 'Draft', to: 'Rejected' },
    { from: 'Accepted', to: 'Draft' },
  ],
});

export const stateMachines = [artifactVersionMachine, evidenceMachine, claimApprovalMachine];
