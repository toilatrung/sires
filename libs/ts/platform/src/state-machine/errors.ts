// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Errors of the state machine helper (PID-00158). Domain errors only: no HTTP status here (NFR-MAINT-004); a service
// maps InvalidTransitionError to `409 invalid_transition` with `currentState` itself (components/responses.yaml).

/** A pair (from → to) that the machine does not declare, including X → X (database 10.2, DATA-STATE-001). */
export class InvalidTransitionError extends Error {
  override readonly name = 'InvalidTransitionError';
  /** ErrorCode of the contract (docs/api-design/components/schemas/common.yaml). */
  readonly code = 'invalid_transition' as const;
  readonly machine: string;
  readonly currentState: string;
  readonly targetState: string;

  constructor(machine: string, currentState: string, targetState: string) {
    super(`Chuyển trạng thái không hợp lệ cho ${machine}: ${currentState} → ${targetState}`);
    this.machine = machine;
    this.currentState = currentState;
    this.targetState = targetState;
  }
}

/** A wrong declaration, or a wrong list of machines given to the SQL and compare functions. */
export class StateMachineDefinitionError extends Error {
  override readonly name = 'StateMachineDefinitionError';
  /** Machine name as declared (empty when the error is about the list itself). */
  readonly machine: string;
  /** What is wrong, quoting the wrong value. */
  readonly reason: string;

  constructor(machine: string, reason: string) {
    super(machine === '' ? reason : `state machine ${JSON.stringify(machine)}: ${reason}`);
    this.machine = machine;
    this.reason = reason;
  }
}
