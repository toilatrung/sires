// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Hai state machine của identity (PRD 18.2; database 10.2), nơi khai báo duy nhất (DR-01, DEC-57; PID-00016 S02, H3):
// cùng khai báo cho hàm kiểm chuyển ở domain và dòng app.state_transition của migration 0001. PID-00041 (account),
// PID-00042 (provider_connection) dùng lại, không khai báo lại. Chỉ các cặp của docs/database/ddl/identity.sql;
// không có mã PRD hay actor. `stateMachines` là export mà lệnh sires-state-transition-sql đọc từ bản build
// (dist/domain/state-machines.js).

import { assertTransition, defineStateMachine, type StateTransition } from '@sires/platform';

/** Trạng thái tài khoản (cột app.account.status; DBD-07). */
export const ACCOUNT_STATUSES = ['Active', 'Locked', 'Deletion Requested'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const accountMachine = defineStateMachine({
  machine: 'account',
  states: ACCOUNT_STATUSES,
  transitions: [
    { from: 'Active', to: 'Locked' },
    { from: 'Locked', to: 'Active' },
    { from: 'Active', to: 'Deletion Requested' },
    { from: 'Locked', to: 'Deletion Requested' },
  ],
});

/** Kết quả kiểm tra kết nối (cột app.provider_connection.test_status; trigger dùng cột này). */
export const PROVIDER_CONNECTION_TEST_STATUSES = ['Untested', 'Valid', 'Invalid'] as const;
export type ProviderConnectionTestStatus = (typeof PROVIDER_CONNECTION_TEST_STATUSES)[number];

export const providerConnectionMachine = defineStateMachine({
  machine: 'provider_connection',
  states: PROVIDER_CONNECTION_TEST_STATUSES,
  transitions: [
    { from: 'Untested', to: 'Valid' },
    { from: 'Untested', to: 'Invalid' },
    { from: 'Valid', to: 'Invalid' },
    { from: 'Valid', to: 'Untested' },
    { from: 'Invalid', to: 'Untested' },
    { from: 'Invalid', to: 'Valid' },
  ],
});

/** Cặp khai báo của account, hoặc InvalidTransitionError (`invalid_transition`, `currentState`). */
export function assertAccountTransition(from: string, to: string): StateTransition<AccountStatus> {
  return assertTransition(accountMachine, from, to);
}

/** Cặp khai báo của provider_connection (test_status), hoặc InvalidTransitionError. */
export function assertProviderConnectionTransition(from: string, to: string): StateTransition<ProviderConnectionTestStatus> {
  return assertTransition(providerConnectionMachine, from, to);
}

/** Mọi state machine của identity, theo thứ tự khối INSERT của docs/database/ddl/identity.sql. */
export const stateMachines = [providerConnectionMachine, accountMachine];
