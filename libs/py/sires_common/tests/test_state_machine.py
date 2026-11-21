# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""PID-00158 S05 — sires_common.state_machine without database: same checks, errors and SQL as @sires/platform."""

from __future__ import annotations

import dataclasses
import json
from typing import Any

import pytest
from support import REPO_ROOT

from sires_common.state_machine import (
    STATEMENT_BREAKPOINT,
    CodeMismatch,
    InvalidTransitionError,
    StateMachine,
    StateMachineDefinitionError,
    StateTransitionDiff,
    StateTransitionRow,
    Transition,
    assert_transition,
    compare_state_transition_rows,
    define_state_machine,
    find_transition,
    render_state_transition_sql,
    state_transition_rows,
    state_transition_statements,
)

TESTDATA = REPO_ROOT / "libs" / "ts" / "platform" / "src" / "state-machine" / "testdata"


def golden_declarations() -> list[dict[str, Any]]:
    declarations: list[dict[str, Any]] = json.loads((TESTDATA / "golden-machines.json").read_text(encoding="utf-8"))
    return declarations


def golden_sql() -> str:
    # golden.txt is committed with LF; a Windows checkout with core.autocrlf=true turns it into CRLF (EC15).
    with open(TESTDATA / "golden.txt", encoding="utf-8", newline="") as file:
        return file.read().replace("\r", "")


# 4 states, 5 pairs, with and without code: the same machine as check.spec.ts.
REVIEW = define_state_machine(
    "review",
    ["Draft", "In Review", "Approved", "Rejected"],
    [
        {"from": "Draft", "to": "In Review", "code": "R-01", "actors": ["researcher"]},
        Transition("In Review", "Approved", "APR-01", ("researcher",)),
        {"from": "In Review", "to": "Rejected", "code": "R-02"},
        {"from": "Rejected", "to": "Draft", "actors": ["researcher", "system"]},
        Transition("In Review", "Draft"),
    ],
)

# Written by hand: every ordered pair of the 4 states, X → X included; "rejected" means InvalidTransitionError.
EXPECTED: list[tuple[str, str, str | None]] = [
    ("Draft", "Draft", "rejected"),
    ("Draft", "In Review", "R-01"),
    ("Draft", "Approved", "rejected"),
    ("Draft", "Rejected", "rejected"),
    ("In Review", "Draft", None),
    ("In Review", "In Review", "rejected"),
    ("In Review", "Approved", "APR-01"),
    ("In Review", "Rejected", "R-02"),
    ("Approved", "Draft", "rejected"),
    ("Approved", "In Review", "rejected"),
    ("Approved", "Approved", "rejected"),
    ("Approved", "Rejected", "rejected"),
    ("Rejected", "Draft", None),
    ("Rejected", "In Review", "rejected"),
    ("Rejected", "Approved", "rejected"),
    ("Rejected", "Rejected", "rejected"),
]


def test_every_ordered_pair() -> None:
    """PID-00158-AC01, EC01."""
    assert len(EXPECTED) == len(REVIEW.states) ** 2
    for from_state, to_state, expected in EXPECTED:
        found = find_transition(REVIEW, from_state, to_state)
        if expected == "rejected":
            assert found is None, (from_state, to_state)
            with pytest.raises(InvalidTransitionError) as caught:
                assert_transition(REVIEW, from_state, to_state)
            error = caught.value
            assert error.code == "invalid_transition"
            assert error.machine == "review"
            assert error.current_state == from_state
            assert error.target_state == to_state
            assert str(error) == f"Chuyển trạng thái không hợp lệ cho review: {from_state} → {to_state}"
        else:
            assert found is not None, (from_state, to_state)
            assert found.code == expected
            assert assert_transition(REVIEW, from_state, to_state) is found

    assert assert_transition(REVIEW, "Rejected", "Draft") == Transition(
        "Rejected", "Draft", None, ("researcher", "system")
    )
    assert assert_transition(REVIEW, "In Review", "Rejected").actors == ()
    assert find_transition(REVIEW, "Archived", "Draft") is None
    with pytest.raises(InvalidTransitionError):
        assert_transition(REVIEW, "draft", "in review")


VALID: dict[str, Any] = {
    "machine": "sample_job",
    "states": ["Queued", "Running", "Waiting for User", "Done"],
    "transitions": [
        {"from": "Queued", "to": "Running", "code": "J-01", "actors": ["system"]},
        {"from": "Running", "to": "Waiting for User", "actors": ["agent", "system"]},
        {"from": "Waiting for User", "to": "Running", "code": "J-02", "actors": ["researcher"]},
        {"from": "Running", "to": "Done"},
    ],
}


def variant(**patch: Any) -> dict[str, Any]:
    return {**VALID, **patch}


def with_pair(pair: Any) -> dict[str, Any]:
    return variant(transitions=[*VALID["transitions"], pair])


def with_state(state: Any) -> dict[str, Any]:
    return variant(states=[*VALID["states"], state])


def test_accepts_valid_declaration() -> None:
    machine = define_state_machine(**VALID)
    assert machine.machine == "sample_job"
    assert machine.states == ("Queued", "Running", "Waiting for User", "Done")
    assert machine.transitions == (
        Transition("Queued", "Running", "J-01", ("system",)),
        Transition("Running", "Waiting for User", None, ("agent", "system")),
        Transition("Waiting for User", "Running", "J-02", ("researcher",)),
        Transition("Running", "Done", None, ()),
    )
    quotes = define_state_machine(
        "quotes",
        ["Researcher's Draft", "Đã duyệt", "𝐀 mới"],
        [{"from": "Researcher's Draft", "to": "Đã duyệt", "code": "APR'01"}, {"from": "Đã duyệt", "to": "𝐀 mới"}],
    )
    assert quotes.states == ("Researcher's Draft", "Đã duyệt", "𝐀 mới")
    assert define_state_machine(
        "a1", ("A", "B"), [{"from": "A", "to": "B", "code": None, "actors": []}]
    ).transitions == (Transition("A", "B", None, ()),)


INVALID: list[tuple[str, Any, str, str]] = [
    ("tên machine chữ hoa", variant(machine="Sample_job"), "Sample_job", '"Sample_job"'),
    ("tên machine có khoảng trắng", variant(machine="sample job"), "sample job", '"sample job"'),
    ("tên machine có gạch nối", variant(machine="sample-job"), "sample-job", '"sample-job"'),
    ("tên machine bắt đầu bằng số", variant(machine="1job"), "1job", '"1job"'),
    ("tên machine có xuống dòng cuối", variant(machine="sample_job\n"), "sample_job\n", '"sample_job\\n"'),
    ("tên machine rỗng", variant(machine=""), "", '""'),
    ("tên machine không phải chuỗi", variant(machine=42), "42", "42"),
    ("states rỗng", variant(states=[]), "sample_job", "states"),
    ("states không phải danh sách", variant(states="Queued"), "sample_job", "states"),
    ("trạng thái trùng", with_state("Running"), "sample_job", '"Running"'),
    ("transitions rỗng", variant(transitions=[]), "sample_job", "transitions"),
    ("transitions không phải danh sách", variant(transitions={}), "sample_job", "transitions"),
    ("cặp trùng", with_pair({"from": "Queued", "to": "Running", "code": "J-01"}), "sample_job", '"Queued" → "Running"'),
    (
        "cặp trùng khác mã",
        with_pair({"from": "Running", "to": "Done", "code": "J-09"}),
        "sample_job",
        '"Running" → "Done"',
    ),
    ("cặp X → X", with_pair({"from": "Done", "to": "Done"}), "sample_job", '"Done" → "Done"'),
    ("from ngoài states", with_pair({"from": "Archived", "to": "Done"}), "sample_job", '"Archived"'),
    ("to ngoài states", with_pair({"from": "Done", "to": "Archived"}), "sample_job", '"Archived"'),
    ("trạng thái rỗng", with_state(""), "sample_job", "rỗng"),
    ("trạng thái có U+0000", with_state("Do\x00ne"), "sample_job", '"Do\\u0000ne"'),
    ("trạng thái có U+001F", with_state("Do\x1fne"), "sample_job", '"Do\\u001fne"'),
    ("trạng thái có U+007F", with_state("Do\x7fne"), "sample_job", '"Do\x7fne"'),
    ("trạng thái có tab giữa", with_state("Do\tne"), "sample_job", '"Do\\tne"'),
    ("trạng thái có khoảng trắng đầu", with_state(" Archived"), "sample_job", '" Archived"'),
    ("trạng thái có khoảng trắng cuối", with_state("Archived "), "sample_job", '"Archived "'),
    ("trạng thái có NBSP cuối", with_state("Archived\N{NO-BREAK SPACE}"), "sample_job", '"Archived\N{NO-BREAK SPACE}"'),
    (
        "trạng thái có U+3000 đầu",
        with_state("\N{IDEOGRAPHIC SPACE}Archived"),
        "sample_job",
        '"\N{IDEOGRAPHIC SPACE}Archived"',
    ),
    ("trạng thái có surrogate lẻ", with_state("A" + chr(0xD800)), "sample_job", "surrogate"),
    ("trạng thái không phải chuỗi", with_state(7), "sample_job", "7"),
    ("from rỗng", with_pair({"from": "", "to": "Done"}), "sample_job", "from rỗng"),
    ("to thiếu", with_pair({"from": "Done"}), "sample_job", "null"),
    ("code rỗng", with_pair({"from": "Done", "to": "Queued", "code": ""}), "sample_job", "rỗng"),
    (
        "code có khoảng trắng cuối",
        with_pair({"from": "Done", "to": "Queued", "code": "J-03 "}),
        "sample_job",
        '"J-03 "',
    ),
    (
        "code có ký tự điều khiển",
        with_pair({"from": "Done", "to": "Queued", "code": "J\n03"}),
        "sample_job",
        '"J\\n03"',
    ),
    ("code không phải chuỗi", with_pair({"from": "Done", "to": "Queued", "code": 3}), "sample_job", "3"),
    (
        "actor ngoài ba giá trị",
        with_pair({"from": "Done", "to": "Queued", "actors": ["admin"]}),
        "sample_job",
        '"admin"',
    ),
    (
        "actor viết hoa",
        with_pair({"from": "Done", "to": "Queued", "actors": ["Researcher"]}),
        "sample_job",
        '"Researcher"',
    ),
    (
        "actors không phải danh sách",
        with_pair({"from": "Done", "to": "Queued", "actors": "agent"}),
        "sample_job",
        '"agent"',
    ),
    ("cặp không phải object", variant(transitions=["Queued → Running"]), "sample_job", '"Queued → Running"'),
]


@pytest.mark.parametrize(("name", "declaration", "machine", "wrong_value"), INVALID, ids=[c[0] for c in INVALID])
def test_invalid_declarations(name: str, declaration: dict[str, Any], machine: str, wrong_value: str) -> None:
    """PID-00158-AC02, EC02–EC07: same cases as define.spec.ts › từ chối khai báo sai."""
    with pytest.raises(StateMachineDefinitionError) as caught:
        define_state_machine(**declaration)
    error = caught.value
    assert isinstance(error, ValueError)
    assert error.machine == machine
    assert wrong_value in error.reason
    assert wrong_value in str(error)
    if machine != "":
        assert json.dumps(machine, ensure_ascii=False) in str(error)


def test_machine_is_immutable() -> None:
    """EC14: dataclass frozen, tuples; changing the declaration later does not change the machine."""
    states = ["A", "B", "C"]
    actors = ["agent"]
    transitions: list[Any] = [{"from": "A", "to": "B", "code": "X-01", "actors": actors}, {"from": "B", "to": "C"}]
    machine = define_state_machine("frozen", states, transitions)

    assert isinstance(machine.states, tuple)
    assert isinstance(machine.transitions, tuple)
    assert all(isinstance(t.actors, tuple) for t in machine.transitions)
    with pytest.raises(dataclasses.FrozenInstanceError):
        machine.machine = "other"  # type: ignore[misc]
    with pytest.raises(dataclasses.FrozenInstanceError):
        machine.transitions[0].code = "X-99"  # type: ignore[misc]
    with pytest.raises(AttributeError):
        machine.states.append("D")  # type: ignore[attr-defined]
    with pytest.raises(TypeError):
        machine._index["A"]["C"] = Transition("A", "C")  # type: ignore[index]

    states.append("D")
    actors.append("system")
    transitions.append({"from": "C", "to": "A"})
    assert machine.states == ("A", "B", "C")
    assert machine.transitions == (Transition("A", "B", "X-01", ("agent",)), Transition("B", "C", None, ()))
    assert find_transition(machine, "C", "A") is None


def test_render_is_deterministic() -> None:
    """PID-00158-AC03: same string twice and after reordering machines, states, transitions."""
    declarations = golden_declarations()

    def reordered(d: dict[str, Any]) -> dict[str, Any]:
        return {**d, "states": list(reversed(d["states"])), "transitions": list(reversed(d["transitions"]))}

    first = render_state_transition_sql([define_state_machine(**d) for d in declarations])
    assert render_state_transition_sql([define_state_machine(**d) for d in declarations]) == first
    assert render_state_transition_sql([define_state_machine(**d) for d in reversed(declarations)]) == first
    assert render_state_transition_sql([define_state_machine(**reordered(d)) for d in declarations]) == first
    assert state_transition_statements([define_state_machine(**reordered(d)) for d in reversed(declarations)]) == (
        state_transition_statements([define_state_machine(**d) for d in declarations])
    )


def test_matches_shared_golden() -> None:
    """PID-00158-AC03, EC07, EC08, EC15: byte for byte the golden.txt of the TS helper."""
    sql = render_state_transition_sql([define_state_machine(**d) for d in golden_declarations()])
    assert sql == golden_sql()
    assert sql.encode("utf-8") == golden_sql().encode("utf-8")
    assert "\r" not in sql
    assert sql.endswith(";\n") and not sql.endswith("\n\n")
    assert "'Researcher''s Draft'" in sql and "'N''02'" in sql and "'Lưu\\trữ'" in sql
    # Data declarations of the same shape are accepted as they are (the command does this).
    assert render_state_transition_sql(golden_declarations()) == sql


ORDER = define_state_machine(
    "order",
    ["New", "Paid", "Shipped", "Cancelled"],
    [
        {"from": "New", "to": "Paid", "code": "O-01"},
        {"from": "Paid", "to": "Shipped", "code": "O-02"},
        {"from": "New", "to": "Cancelled"},
        {"from": "Paid", "to": "Cancelled", "code": "O-03"},
    ],
)
INVOICE = define_state_machine("invoice", ["Open", "Closed"], [{"from": "Open", "to": "Closed"}])


def row(machine: str, from_state: str, to_state: str, code: str | None) -> StateTransitionRow:
    return StateTransitionRow(machine, from_state, to_state, code)


def test_rows_and_statements() -> None:
    assert state_transition_rows([ORDER, INVOICE]) == [
        row("invoice", "Open", "Closed", None),
        row("order", "New", "Cancelled", None),
        row("order", "New", "Paid", "O-01"),
        row("order", "Paid", "Cancelled", "O-03"),
        row("order", "Paid", "Shipped", "O-02"),
    ]
    remove, upsert = state_transition_statements([ORDER, INVOICE])
    sql = render_state_transition_sql([ORDER, INVOICE])
    header = "-- SQL sinh từ khai báo state machine; không sửa tay (DR-01, DEC-57).\n"
    header += "-- Machine (số cặp): invoice (1), order (4).\n"
    assert sql == f"{header}{remove}\n{STATEMENT_BREAKPOINT}\n{upsert}\n"
    assert remove.startswith("DELETE FROM app.state_transition\nWHERE machine IN ('invoice', 'order')\n")
    assert upsert.endswith("  WHERE app.state_transition.code IS DISTINCT FROM EXCLUDED.code;")
    # Code point order (U+FF3A before U+1D400), the order of the TS helper.
    machine = define_state_machine("cp", ["𝐀", "Ｚ", "a"], [{"from": "a", "to": "𝐀"}, {"from": "a", "to": "Ｚ"}])
    assert [r.to_state for r in state_transition_rows([machine])] == ["Ｚ", "𝐀"]


def test_compare_rows() -> None:
    """PID-00158-AC05, EC13: missing, unexpected, code mismatch; rows of other machines ignored."""
    declared = state_transition_rows([ORDER, INVOICE])
    actual: list[Any] = [
        row("order", "New", "Cancelled", None),
        row("order", "Paid", "Cancelled", "O-03"),
        row("order", "Paid", "Shipped", "O-99"),
        row("order", "Shipped", "New", None),
        row("invoice", "Open", "Closed", None),
        row("other", "X", "Y", "Z-01"),
    ]
    assert compare_state_transition_rows(actual, [ORDER, INVOICE]) == StateTransitionDiff(
        missing=(row("order", "New", "Paid", "O-01"),),
        unexpected=(row("order", "Shipped", "New", None),),
        code_mismatch=(CodeMismatch(row("order", "Paid", "Shipped", "O-02"), "O-99"),),
    )
    assert compare_state_transition_rows(actual[:4], [ORDER]).missing == (row("order", "New", "Paid", "O-01"),)

    matching = [*reversed(declared), row("other", "X", "Y", None)]
    assert compare_state_transition_rows(matching, [ORDER, INVOICE]) == StateTransitionDiff((), (), ())

    null_code = [dataclasses.replace(r, code=None) if r.code == "O-01" else r for r in declared]
    assert compare_state_transition_rows(null_code, [ORDER, INVOICE]).code_mismatch == (
        CodeMismatch(row("order", "New", "Paid", "O-01"), None),
    )
    extra_code = [dataclasses.replace(r, code="I-01") if r.machine == "invoice" else r for r in declared]
    assert compare_state_transition_rows(extra_code, [ORDER, INVOICE]).code_mismatch == (
        CodeMismatch(row("invoice", "Open", "Closed", None), "I-01"),
    )

    # Rows read straight from the table (dict or asyncpg.Record with the column names).
    database = [
        {"machine": r.machine, "from_state": r.from_state, "to_state": r.to_state, "code": r.code} for r in declared
    ]
    assert compare_state_transition_rows(database, [ORDER, INVOICE]) == StateTransitionDiff((), (), ())
    without_invoice = [r for r in database if r["machine"] != "invoice"]
    assert compare_state_transition_rows(without_invoice, [ORDER, INVOICE]).missing == (
        row("invoice", "Open", "Closed", None),
    )


def test_render_rejects_bad_lists() -> None:
    """EC09, EC10: empty list, two machines with one name, a wrong data declaration."""
    duplicate = define_state_machine("order", ["A", "B"], [{"from": "A", "to": "B"}])
    wrong = {"machine": "bad", "states": ["A"], "transitions": [{"from": "A", "to": "A"}]}
    functions = [
        state_transition_rows,
        state_transition_statements,
        render_state_transition_sql,
        lambda machines: compare_state_transition_rows([], machines),
    ]
    for function in functions:
        with pytest.raises(StateMachineDefinitionError, match="danh sách machine rỗng"):
            function([])
        with pytest.raises(StateMachineDefinitionError, match="trùng tên") as caught:
            function([ORDER, INVOICE, duplicate])
        assert caught.value.machine == "order"
        with pytest.raises(StateMachineDefinitionError):
            function([ORDER, wrong])
        with pytest.raises(StateMachineDefinitionError):
            function([ORDER, "order"])


def test_state_machine_constructor_checks_too() -> None:
    """A StateMachine built directly is checked like define_state_machine."""
    with pytest.raises(StateMachineDefinitionError, match="về chính trạng thái đó"):
        StateMachine("direct", ("A", "B"), (Transition("A", "A"),))
