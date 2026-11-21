// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// State machine helper (PID-00158): declaration, transition check, rows and SQL of app.state_transition, row compare,
// command sires-state-transition-sql. API of spec 4.2; Python twin in sires_common.state_machine.

export { assertTransition, findTransition } from './check';
export { runCli, STATE_MACHINES_EXPORT, type StateTransitionCliIo } from './cli';
export {
  defineStateMachine,
  MACHINE_NAME_PATTERN,
  STATE_MACHINE_ACTORS,
  type StateMachine,
  type StateMachineActor,
  type StateMachineDeclaration,
  type StateTransition,
  type TransitionDeclaration,
} from './define';
export { InvalidTransitionError, StateMachineDefinitionError } from './errors';
export {
  compareStateTransitionRows,
  renderStateTransitionSql,
  STATEMENT_BREAKPOINT,
  stateTransitionRows,
  stateTransitionStatements,
  type DatabaseStateTransitionRow,
  type StateTransitionCodeMismatch,
  type StateTransitionDiff,
  type StateTransitionRow,
} from './sql';
