// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// State machine declared as data (PID-00158, DEC-57): one declaration gives the domain check (check.ts) and the
// rows of app.state_transition (sql.ts). Python twin: libs/py/sires_common/src/sires_common/state_machine.py.

import { StateMachineDefinitionError } from './errors';

/** ActorRef.type of the contract (docs/api-design/components/schemas/common.yaml). Kept as data only: checking the
 * actor, guards and APR belongs to the service domain module (database 10.2). */
export const STATE_MACHINE_ACTORS = ['researcher', 'agent', 'system'] as const;
export type StateMachineActor = (typeof STATE_MACHINE_ACTORS)[number];

/** One declared pair. `code` is the PRD code of the transition when there is one (T-01…T-19, APR-01). */
export interface TransitionDeclaration<S extends string = string> {
  readonly from: S;
  readonly to: S;
  readonly code?: string | null;
  readonly actors?: readonly StateMachineActor[];
}

/** Declaration of one machine, named like the `machine` column of app.state_transition (task, plan_version, …). */
export interface StateMachineDeclaration<S extends string = string> {
  readonly machine: string;
  readonly states: readonly S[];
  readonly transitions: readonly TransitionDeclaration<NoInfer<S>>[];
}

export interface StateTransition<S extends string = string> {
  readonly from: S;
  readonly to: S;
  /** `null` when the pair has no code. */
  readonly code: string | null;
  /** Empty when the declaration names no actor. */
  readonly actors: readonly StateMachineActor[];
}

/** A checked declaration: deeply frozen; states and transitions keep the declared order. */
export interface StateMachine<S extends string = string> {
  readonly machine: string;
  readonly states: readonly S[];
  readonly transitions: readonly StateTransition<S>[];
}

/** Same pattern as every name in docs/database/ddl. */
export const MACHINE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

// Values must be stable text in SQL and identical in TS and Python: no C0 control character or DEL, no lone surrogate
// (not valid UTF-8, PostgreSQL rejects it), no leading or trailing whitespace. The whitespace set is explicit so that
// both languages reject the same values (JS \s and Python str.strip differ on U+0085 and U+FEFF).
// With the u flag a valid surrogate pair is one code point, so this matches lone surrogates only.
const LONE_SURROGATE = /[\u{d800}-\u{dfff}]/u;
const EDGE_WHITESPACE =
  /^[\t\n\v\f\r \u{85}\u{a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}]|[\t\n\v\f\r \u{85}\u{a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}]$/u;

/** U+0000–U+001F or U+007F. */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit <= 0x1f || unit === 0x7f) return true;
  }
  return false;
}

const ACTORS: ReadonlySet<string> = new Set(STATE_MACHINE_ACTORS);

/** Pair lookup by (from, to) for every machine returned by defineStateMachine. */
const INDEX = new WeakMap<StateMachine, ReadonlyMap<string, ReadonlyMap<string, StateTransition>>>();

export function show(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkValue(machine: string, what: string, value: unknown): string {
  if (typeof value !== 'string') throw new StateMachineDefinitionError(machine, `${what} phải là chuỗi, nhận ${show(value)}`);
  if (value === '') throw new StateMachineDefinitionError(machine, `${what} rỗng`);
  if (hasControlCharacter(value)) throw new StateMachineDefinitionError(machine, `${what} ${show(value)} có ký tự điều khiển`);
  if (LONE_SURROGATE.test(value)) {
    throw new StateMachineDefinitionError(machine, `${what} ${show(value)} có surrogate lẻ (không phải Unicode hợp lệ)`);
  }
  if (EDGE_WHITESPACE.test(value)) {
    throw new StateMachineDefinitionError(machine, `${what} ${show(value)} có khoảng trắng ở đầu hoặc cuối`);
  }
  return value;
}

/**
 * Checks a declaration (PID-00158-AC02) and returns a deeply frozen machine. Throws StateMachineDefinitionError naming
 * the machine and the wrong value: name not matching ^[a-z][a-z0-9_]*$; states or transitions empty; duplicate state;
 * duplicate pair (even with another code); pair X → X; state not in `states`; empty value, control character, leading
 * or trailing whitespace; actor other than researcher, agent, system.
 */
export function defineStateMachine<const S extends string>(declaration: StateMachineDeclaration<S>): StateMachine<S> {
  const decl: unknown = declaration;
  if (!isRecord(decl)) throw new StateMachineDefinitionError('', `khai báo machine phải là object, nhận ${show(decl)}`);
  const rawName = decl['machine'];
  const machine = typeof rawName === 'string' ? rawName : show(rawName);
  if (typeof rawName !== 'string' || !MACHINE_NAME_PATTERN.test(rawName)) {
    throw new StateMachineDefinitionError(machine, `tên machine ${show(rawName)} không khớp ${MACHINE_NAME_PATTERN.source}`);
  }

  const rawStates = decl['states'];
  if (!Array.isArray(rawStates) || rawStates.length === 0) {
    throw new StateMachineDefinitionError(machine, 'states phải là danh sách không rỗng');
  }
  const states: string[] = [];
  const stateSet = new Set<string>();
  for (const raw of rawStates) {
    const state = checkValue(machine, 'trạng thái', raw);
    if (stateSet.has(state)) throw new StateMachineDefinitionError(machine, `trạng thái ${show(state)} bị trùng`);
    stateSet.add(state);
    states.push(state);
  }

  const rawTransitions = decl['transitions'];
  if (!Array.isArray(rawTransitions) || rawTransitions.length === 0) {
    throw new StateMachineDefinitionError(machine, 'transitions phải là danh sách không rỗng');
  }
  const transitions: StateTransition[] = [];
  const index = new Map<string, Map<string, StateTransition>>();
  for (const raw of rawTransitions) {
    if (!isRecord(raw)) throw new StateMachineDefinitionError(machine, `cặp phải là object, nhận ${show(raw)}`);
    const from = checkValue(machine, 'from', raw['from']);
    const to = checkValue(machine, 'to', raw['to']);
    const pair = `${show(from)} → ${show(to)}`;
    for (const state of [from, to]) {
      if (!stateSet.has(state)) {
        throw new StateMachineDefinitionError(machine, `trạng thái ${show(state)} của cặp ${pair} không có trong states`);
      }
    }
    if (from === to) throw new StateMachineDefinitionError(machine, `cặp ${pair} về chính trạng thái đó`);
    const rawCode = raw['code'];
    const code = rawCode === undefined || rawCode === null ? null : checkValue(machine, `code của cặp ${pair}`, rawCode);
    const rawActors = raw['actors'];
    const actors: StateMachineActor[] = [];
    if (rawActors !== undefined && rawActors !== null) {
      if (!Array.isArray(rawActors)) {
        throw new StateMachineDefinitionError(machine, `actors của cặp ${pair} phải là danh sách, nhận ${show(rawActors)}`);
      }
      for (const actor of rawActors) {
        if (typeof actor !== 'string' || !ACTORS.has(actor)) {
          throw new StateMachineDefinitionError(
            machine,
            `actor ${show(actor)} của cặp ${pair} không thuộc ${STATE_MACHINE_ACTORS.join(', ')}`,
          );
        }
        actors.push(actor as StateMachineActor);
      }
    }
    const targets = index.get(from) ?? new Map<string, StateTransition>();
    if (targets.has(to)) throw new StateMachineDefinitionError(machine, `cặp ${pair} bị trùng`);
    const transition: StateTransition = Object.freeze({ from, to, code, actors: Object.freeze(actors) });
    targets.set(to, transition);
    index.set(from, targets);
    transitions.push(transition);
  }

  const defined: StateMachine = Object.freeze({
    machine,
    states: Object.freeze(states),
    transitions: Object.freeze(transitions),
  });
  INDEX.set(defined, index);
  return defined as StateMachine<S>;
}

/** Returns `value` when it came from defineStateMachine, otherwise passes it through defineStateMachine (data
 * declarations of the CLI, machines rebuilt by hand). */
export function ensureStateMachine(value: unknown): StateMachine {
  if (typeof value === 'object' && value !== null && INDEX.has(value as StateMachine)) return value as StateMachine;
  return defineStateMachine(value as StateMachineDeclaration);
}

/** Lookup by (from, to) of a defined machine. */
export function lookupTransition(machine: StateMachine, from: string, to: string): StateTransition | undefined {
  const defined = ensureStateMachine(machine);
  return INDEX.get(defined)?.get(from)?.get(to);
}
