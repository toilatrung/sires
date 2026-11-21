# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""State machine declared as data, and the rows of `app.state_transition` generated from it (PID-00158, DEC-57).

Python twin of `libs/ts/platform/src/state-machine/` (same checks, same errors, same SQL byte for byte, pinned by the
shared `testdata/golden-machines.json` and `golden.txt` of the TS library). A service declares its machines once in
its domain module; the declaration gives the transition check of the domain (`assert_transition`) and the SQL pasted
into a migration (`render_state_transition_sql`, or `state_transition_statements` for one `op.execute` per statement
in an Alembic revision on asyncpg). Only the pair (from, to) is checked: guards, target choice, permissions by state,
APR, allowed actor and Audit Event stay in the domain module (database 10.2). No database, network or HTTP here
(NFR-MAINT-004): a service maps `InvalidTransitionError` to `409 invalid_transition` itself.

Command: `python -m sires_common.state_machine <module.path> [ATTR]` prints the SQL of the machines in `ATTR`
(default `STATE_MACHINES`) of an importable module.
"""

from __future__ import annotations

import importlib
import json
import re
import sys
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any, Final, Literal, Protocol, TextIO, cast

__all__ = [
    "MACHINE_NAME_PATTERN",
    "STATEMENT_BREAKPOINT",
    "STATE_MACHINES_ATTR",
    "STATE_MACHINE_ACTORS",
    "Actor",
    "CodeMismatch",
    "InvalidTransitionError",
    "StateMachine",
    "StateMachineDefinitionError",
    "StateTransitionDiff",
    "StateTransitionRow",
    "Transition",
    "assert_transition",
    "compare_state_transition_rows",
    "define_state_machine",
    "find_transition",
    "main",
    "render_state_transition_sql",
    "state_transition_rows",
    "state_transition_statements",
]

Actor = Literal["researcher", "agent", "system"]
#: ActorRef.type of the contract (docs/api-design/components/schemas/common.yaml); kept as data only.
STATE_MACHINE_ACTORS: Final[tuple[Actor, ...]] = ("researcher", "agent", "system")
#: Same pattern as every name in docs/database/ddl (checked with re.fullmatch: no trailing newline).
MACHINE_NAME_PATTERN: Final = re.compile(r"[a-z][a-z0-9_]*")
#: Drizzle-kit statement separator; a plain comment for PostgreSQL.
STATEMENT_BREAKPOINT: Final = "--> statement-breakpoint"
#: Attribute read by the command when it gets no second argument.
STATE_MACHINES_ATTR: Final = "STATE_MACHINES"

_HEADER: Final = "-- SQL sinh từ khai báo state machine; không sửa tay (DR-01, DEC-57)."
_USAGE: Final = f"Cách dùng: python -m sires_common.state_machine <module.path> [ATTR, mặc định {STATE_MACHINES_ATTR}]"

# Same explicit set as the TS helper (JS \s and str.strip differ on U+0085 and U+FEFF).
_EDGE_WHITESPACE: Final = frozenset(
    chr(c)
    for c in (0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0x85, 0xA0, 0x1680, *range(0x2000, 0x200B))
    + (0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF)
)


class InvalidTransitionError(Exception):
    """A pair (from → to) that the machine does not declare, X → X included (DATA-STATE-001)."""

    code: Final = "invalid_transition"

    def __init__(self, machine: str, current_state: str, target_state: str) -> None:
        super().__init__(f"Chuyển trạng thái không hợp lệ cho {machine}: {current_state} → {target_state}")
        self.machine = machine
        self.current_state = current_state
        self.target_state = target_state


class StateMachineDefinitionError(ValueError):
    """A wrong declaration, or a wrong list of machines given to the SQL and compare functions."""

    def __init__(self, machine: str, reason: str) -> None:
        super().__init__(reason if machine == "" else f"state machine {_show(machine)}: {reason}")
        #: Machine name as declared (empty when the error is about the list itself).
        self.machine = machine
        #: What is wrong, quoting the wrong value.
        self.reason = reason


_SURROGATE: Final = re.compile(f"[{chr(0xD800)}-{chr(0xDFFF)}]")


def _show(value: object) -> str:
    """JSON text of the value, like JSON.stringify of the TS helper (lone surrogates escaped)."""
    try:
        text = json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError):
        return repr(value)
    return _SURROGATE.sub(lambda m: f"\\u{ord(m.group()):04x}", text)


def _check_value(machine: str, what: str, value: object) -> str:
    if not isinstance(value, str):
        raise StateMachineDefinitionError(machine, f"{what} phải là chuỗi, nhận {_show(value)}")
    if value == "":
        raise StateMachineDefinitionError(machine, f"{what} rỗng")
    if any(ord(ch) <= 0x1F or ord(ch) == 0x7F for ch in value):
        raise StateMachineDefinitionError(machine, f"{what} {_show(value)} có ký tự điều khiển")
    if _SURROGATE.search(value):
        raise StateMachineDefinitionError(machine, f"{what} {_show(value)} có surrogate lẻ (không phải Unicode hợp lệ)")
    if value[0] in _EDGE_WHITESPACE or value[-1] in _EDGE_WHITESPACE:
        raise StateMachineDefinitionError(machine, f"{what} {_show(value)} có khoảng trắng ở đầu hoặc cuối")
    return value


@dataclass(frozen=True, slots=True)
class Transition:
    """One declared pair; `code` is the PRD code when there is one (T-01…T-19, APR-01)."""

    from_state: str
    to_state: str
    code: str | None = None
    actors: tuple[Actor, ...] = ()


@dataclass(frozen=True, slots=True)
class StateMachine:
    """A checked declaration (see `define_state_machine`); immutable, keeps the declared order."""

    machine: str
    states: tuple[str, ...]
    transitions: tuple[Transition, ...]
    _index: Mapping[str, Mapping[str, Transition]] = field(init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        raw_name: object = self.machine
        machine = raw_name if isinstance(raw_name, str) else _show(raw_name)
        if not isinstance(raw_name, str) or MACHINE_NAME_PATTERN.fullmatch(raw_name) is None:
            raise StateMachineDefinitionError(
                machine, f"tên machine {_show(raw_name)} không khớp ^{MACHINE_NAME_PATTERN.pattern}$"
            )

        raw_states: object = self.states
        if not isinstance(raw_states, list | tuple) or len(raw_states) == 0:
            raise StateMachineDefinitionError(machine, "states phải là danh sách không rỗng")
        states: list[str] = []
        for raw in raw_states:
            state = _check_value(machine, "trạng thái", raw)
            if state in states:
                raise StateMachineDefinitionError(machine, f"trạng thái {_show(state)} bị trùng")
            states.append(state)
        state_set = frozenset(states)

        raw_transitions: object = self.transitions
        if not isinstance(raw_transitions, list | tuple) or len(raw_transitions) == 0:
            raise StateMachineDefinitionError(machine, "transitions phải là danh sách không rỗng")
        transitions: list[Transition] = []
        index: dict[str, dict[str, Transition]] = {}
        for raw in raw_transitions:
            transition = _transition(machine, raw, state_set)
            targets = index.setdefault(transition.from_state, {})
            if transition.to_state in targets:
                pair = f"{_show(transition.from_state)} → {_show(transition.to_state)}"
                raise StateMachineDefinitionError(machine, f"cặp {pair} bị trùng")
            targets[transition.to_state] = transition
            transitions.append(transition)

        object.__setattr__(self, "states", tuple(states))
        object.__setattr__(self, "transitions", tuple(transitions))
        object.__setattr__(self, "_index", MappingProxyType({k: MappingProxyType(v) for k, v in index.items()}))


def _transition(machine: str, raw: object, states: frozenset[str]) -> Transition:
    if isinstance(raw, Transition):
        fields: Mapping[str, object] = {
            "from": raw.from_state,
            "to": raw.to_state,
            "code": raw.code,
            "actors": raw.actors,
        }
    elif isinstance(raw, Mapping):
        fields = cast(Mapping[str, object], raw)
    else:
        raise StateMachineDefinitionError(machine, f"cặp phải là object, nhận {_show(raw)}")
    from_state = _check_value(machine, "from", fields.get("from"))
    to_state = _check_value(machine, "to", fields.get("to"))
    pair = f"{_show(from_state)} → {_show(to_state)}"
    for state in (from_state, to_state):
        if state not in states:
            raise StateMachineDefinitionError(
                machine, f"trạng thái {_show(state)} của cặp {pair} không có trong states"
            )
    if from_state == to_state:
        raise StateMachineDefinitionError(machine, f"cặp {pair} về chính trạng thái đó")
    raw_code = fields.get("code")
    code = None if raw_code is None else _check_value(machine, f"code của cặp {pair}", raw_code)
    raw_actors = fields.get("actors")
    actors: list[Actor] = []
    if raw_actors is not None:
        if not isinstance(raw_actors, list | tuple):
            raise StateMachineDefinitionError(
                machine, f"actors của cặp {pair} phải là danh sách, nhận {_show(raw_actors)}"
            )
        for actor in raw_actors:
            if not isinstance(actor, str) or actor not in STATE_MACHINE_ACTORS:
                raise StateMachineDefinitionError(
                    machine,
                    f"actor {_show(actor)} của cặp {pair} không thuộc {', '.join(STATE_MACHINE_ACTORS)}",
                )
            actors.append(actor)
    return Transition(from_state, to_state, code, tuple(actors))


def define_state_machine(
    machine: str,
    states: Sequence[str],
    transitions: Iterable[Transition | Mapping[str, Any]],
) -> StateMachine:
    """Checks a declaration (PID-00158-AC02) and returns an immutable machine.

    `transitions` holds `Transition` or dicts with the keys of the shared JSON (`from`, `to`, `code`, `actors`), so
    `define_state_machine(**declaration)` takes one item of golden-machines.json. Raises
    `StateMachineDefinitionError` naming the machine and the wrong value: name not matching ^[a-z][a-z0-9_]*$;
    states or transitions empty; duplicate state; duplicate pair (even with another code); pair X → X; state not in
    `states`; empty value, control character, leading or trailing whitespace; actor other than researcher, agent,
    system.
    """
    raw_states: object = states
    raw_transitions: object = transitions
    # A str is a sequence of characters, not a list of states: reject it instead of splitting it.
    if not isinstance(raw_states, str) and isinstance(raw_states, Iterable) and not isinstance(raw_states, Mapping):
        raw_states = tuple(cast(Iterable[object], raw_states))
    if (
        not isinstance(raw_transitions, str)
        and isinstance(raw_transitions, Iterable)
        and not isinstance(raw_transitions, Mapping)
    ):
        raw_transitions = tuple(cast(Iterable[object], raw_transitions))
    return StateMachine(machine, cast(tuple[str, ...], raw_states), cast(tuple[Transition, ...], raw_transitions))


def _ensure_state_machine(value: object) -> StateMachine:
    if isinstance(value, StateMachine):
        return value
    if isinstance(value, Mapping):
        declaration = cast(Mapping[str, Any], value)
        return define_state_machine(
            declaration.get("machine"),  # type: ignore[arg-type]
            declaration.get("states"),  # type: ignore[arg-type]
            declaration.get("transitions"),  # type: ignore[arg-type]
        )
    raise StateMachineDefinitionError("", f"phần tử không phải machine hay khai báo dạng dữ liệu: {_show(value)}")


def find_transition(machine: StateMachine, from_state: str, to_state: str) -> Transition | None:
    """The declared pair (with code and actors), or None. X → X is never declared."""
    return _ensure_state_machine(machine)._index.get(from_state, {}).get(to_state)


def assert_transition(machine: StateMachine, from_state: str, to_state: str) -> Transition:
    """The declared pair, or `InvalidTransitionError` (invalid_transition, machine, current and target state)."""
    transition = find_transition(machine, from_state, to_state)
    if transition is None:
        raise InvalidTransitionError(machine.machine, from_state, to_state)
    return transition


@dataclass(frozen=True, slots=True)
class StateTransitionRow:
    """One row of app.state_transition; `code` is None when the pair has no code."""

    machine: str
    from_state: str
    to_state: str
    code: str | None


@dataclass(frozen=True, slots=True)
class CodeMismatch:
    #: The declared row (with the declared code).
    expected: StateTransitionRow
    #: The code found in the database.
    actual_code: str | None


@dataclass(frozen=True, slots=True)
class StateTransitionDiff:
    """Result of `compare_state_transition_rows`: all three empty when the rows match the declarations."""

    missing: tuple[StateTransitionRow, ...]
    unexpected: tuple[StateTransitionRow, ...]
    code_mismatch: tuple[CodeMismatch, ...]


def _row_key(row: StateTransitionRow) -> tuple[str, str, str]:
    return (row.machine, row.from_state, row.to_state)


def _machine_list(machines: Iterable[object]) -> list[StateMachine]:
    """Checks the list (not empty, no two machines with one name) and orders it by name (code point)."""
    if isinstance(machines, str | Mapping) or not isinstance(machines, Iterable):
        raise StateMachineDefinitionError("", "danh sách machine rỗng hoặc không phải danh sách")
    items = list(machines)
    if not items:
        raise StateMachineDefinitionError("", "danh sách machine rỗng hoặc không phải danh sách")
    seen: set[str] = set()
    result: list[StateMachine] = []
    for item in items:
        machine = _ensure_state_machine(item)
        if machine.machine in seen:
            raise StateMachineDefinitionError(machine.machine, "hai machine trùng tên trong danh sách")
        seen.add(machine.machine)
        result.append(machine)
    return sorted(result, key=lambda m: m.machine)


def _rows_of(machines: Sequence[StateMachine]) -> list[StateTransitionRow]:
    rows = [StateTransitionRow(m.machine, t.from_state, t.to_state, t.code) for m in machines for t in m.transitions]
    return sorted(rows, key=_row_key)


def state_transition_rows(machines: Iterable[StateMachine | Mapping[str, Any]]) -> list[StateTransitionRow]:
    """One row per declared pair, ordered by machine, from_state, to_state (code point); declaration order is
    ignored."""
    return _rows_of(_machine_list(machines))


def _literal(value: str | None) -> str:
    return "NULL" if value is None else "'" + value.replace("'", "''") + "'"


def _statements_of(machines: Sequence[StateMachine], rows: Sequence[StateTransitionRow]) -> tuple[str, str]:
    pairs = ",\n".join(f"    ({_literal(r.machine)}, {_literal(r.from_state)}, {_literal(r.to_state)})" for r in rows)
    remove = "\n".join(
        [
            "DELETE FROM app.state_transition",
            f"WHERE machine IN ({', '.join(_literal(m.machine) for m in machines)})",
            "  AND (machine, from_state, to_state) NOT IN (VALUES",
            f"{pairs});",
        ]
    )
    values = ",\n".join(
        "  (" + ", ".join(_literal(v) for v in (r.machine, r.from_state, r.to_state, r.code)) + ")" for r in rows
    )
    upsert = "\n".join(
        [
            "INSERT INTO app.state_transition (machine, from_state, to_state, code) VALUES",
            values,
            "ON CONFLICT (machine, from_state, to_state) DO UPDATE SET code = EXCLUDED.code",
            "  WHERE app.state_transition.code IS DISTINCT FROM EXCLUDED.code;",
        ]
    )
    return remove, upsert


def state_transition_statements(machines: Iterable[StateMachine | Mapping[str, Any]]) -> tuple[str, str]:
    """The two statements of the sync (DELETE of pairs no longer declared, then INSERT … ON CONFLICT updating the
    code), without comments or separator: one `op.execute` each in an Alembic revision on asyncpg."""
    machine_list = _machine_list(machines)
    return _statements_of(machine_list, _rows_of(machine_list))


def render_state_transition_sql(machines: Iterable[StateMachine | Mapping[str, Any]]) -> str:
    """The sync SQL: two comment lines, DELETE, `--> statement-breakpoint`, INSERT; LF, ends with LF. Same bytes as
    renderStateTransitionSql of @sires/platform."""
    machine_list = _machine_list(machines)
    remove, upsert = _statements_of(machine_list, _rows_of(machine_list))
    counts = ", ".join(f"{m.machine} ({len(m.transitions)})" for m in machine_list)
    return "\n".join([_HEADER, f"-- Machine (số cặp): {counts}.", remove, STATEMENT_BREAKPOINT, upsert, ""])


class _RecordLike(Protocol):
    def __getitem__(self, key: str, /) -> Any: ...


def _actual_row(raw: StateTransitionRow | Mapping[str, Any] | _RecordLike) -> StateTransitionRow:
    if isinstance(raw, StateTransitionRow):
        return raw
    try:
        code = raw["code"]
    except KeyError:
        code = None
    return StateTransitionRow(raw["machine"], raw["from_state"], raw["to_state"], code)


def compare_state_transition_rows(
    actual: Iterable[StateTransitionRow | Mapping[str, Any] | _RecordLike],
    machines: Iterable[StateMachine | Mapping[str, Any]],
) -> StateTransitionDiff:
    """Compares rows read from the database (StateTransitionRow, dict or asyncpg.Record with the table columns)
    with the declarations, for the test run after `alembic upgrade head` (DR-01). Rows of machines not passed in are
    ignored."""
    machine_list = _machine_list(machines)
    names = {m.machine for m in machine_list}
    expected = {_row_key(r): r for r in _rows_of(machine_list)}
    found: dict[tuple[str, str, str], StateTransitionRow] = {}
    for raw in actual:
        row = _actual_row(raw)
        if row.machine in names:
            found[_row_key(row)] = row
    missing = tuple(row for key, row in expected.items() if key not in found)
    code_mismatch = tuple(
        CodeMismatch(row, found[key].code)
        for key, row in expected.items()
        if key in found and found[key].code != row.code
    )
    unexpected = tuple(sorted((row for key, row in found.items() if key not in expected), key=_row_key))
    return StateTransitionDiff(missing, unexpected, code_mismatch)


def _write(stream: TextIO, text: str) -> None:
    # UTF-8 bytes, no newline translation (Windows consoles and pipes): same bytes as the TS command.
    buffer = getattr(stream, "buffer", None)
    if buffer is None:
        stream.write(text)
        return
    stream.flush()
    buffer.write(text.encode("utf-8", errors="backslashreplace"))
    buffer.flush()


def main(argv: Sequence[str] | None = None) -> int:
    """`python -m sires_common.state_machine <module.path> [ATTR]`: imports the module, reads ATTR (default
    STATE_MACHINES; each item a StateMachine or a dict of the same shape, passed through define_state_machine) and
    prints render_state_transition_sql. Returns 0, or 1 with the reason on stderr and nothing on stdout."""
    args = list(sys.argv[1:] if argv is None else argv)

    def fail(reason: str) -> int:
        _write(sys.stderr, f"sires_common.state_machine: {reason}\n")
        return 1

    if not 1 <= len(args) <= 2 or not args[0] or (len(args) == 2 and not args[1]):
        return fail(f"sai tham số.\n{_USAGE}")
    module_name = args[0]
    attr = args[1] if len(args) == 2 else STATE_MACHINES_ATTR
    try:
        module = importlib.import_module(module_name)
    except Exception as error:  # any import failure is reported, never raised
        return fail(f"không nạp được module {module_name}: {type(error).__name__}: {error}")
    if not hasattr(module, attr):
        return fail(f"module {module_name} không có thuộc tính {_show(attr)}")
    value: object = getattr(module, attr)
    if not isinstance(value, list | tuple):
        return fail(f"{_show(attr)} của {module_name} không phải danh sách machine (nhận {type(value).__name__})")
    try:
        sql = render_state_transition_sql(cast(Sequence[StateMachine], value))
    except StateMachineDefinitionError as error:
        return fail(f"{_show(attr)} của {module_name} không phải danh sách machine hợp lệ: {error}")
    _write(sys.stdout, sql)
    return 0


if __name__ == "__main__":
    # Run through the imported module, not this __main__ copy, so that machines defined by the service module
    # (instances of sires_common.state_machine.StateMachine) are recognised.
    from sires_common.state_machine import main as _main

    raise SystemExit(_main())
