// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Transition check for the service domain module (PID-00158-AC01). Only the pair (from, to) is checked: guards, target
// choice (T-10, T-19), permissions by state, APR, allowed actor and Audit Event stay in the domain module (database
// 10.2). No database, network or HTTP layer here (NFR-MAINT-004).

import { lookupTransition, type StateMachine, type StateTransition } from './define';
import { InvalidTransitionError } from './errors';

/** The declared pair (with code and actors), or undefined. X → X is never declared, so it is always undefined. */
export function findTransition<S extends string>(
  machine: StateMachine<S>,
  from: string,
  to: string,
): StateTransition<S> | undefined {
  return lookupTransition(machine, from, to) as StateTransition<S> | undefined;
}

/** The declared pair, or InvalidTransitionError (`invalid_transition`, machine, currentState, targetState). */
export function assertTransition<S extends string>(machine: StateMachine<S>, from: string, to: string): StateTransition<S> {
  const transition = findTransition(machine, from, to);
  if (transition === undefined) throw new InvalidTransitionError(machine.machine, from, to);
  return transition;
}
