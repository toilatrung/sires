# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Plain tool-calling loop and structured output with format repair, on top of ``adapters`` (no framework).

Rules from architecture 8.1 and 8.5: at most 8 model rounds per Agent Run; the structured output is validated with
Pydantic in the gateway (the provider's "schema ok" flag is not trusted); an invalid output gets at most 2 repair turns
with a short validation message, then ``invalid_response``. Usage is summed over every call, retries included.
"""

from __future__ import annotations

import dataclasses
import time
from dataclasses import dataclass, field
from typing import Any

from adapters import Adapter, GatewayError, ModelRequest, Msg, Usage
from common import ResearchAnswer, run_tool, tool_args_valid, validate_answer

MAX_ROUNDS = 8
MAX_REPAIRS = 2


@dataclass
class LoopResult:
    ok: bool
    answer: ResearchAnswer | None
    final_text: str
    rounds: int
    tool_calls: list[dict[str, Any]]
    repairs: int
    usage: Usage
    latency_s: float
    error: dict[str, Any] | None = None
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "rounds": self.rounds,
            "tool_calls": self.tool_calls,
            "repairs": self.repairs,
            "usage": self.usage.as_dict(),
            "latency_s": round(self.latency_s, 3),
            "final_text": self.final_text[:400],
            "answer": self.answer.model_dump() if self.answer else None,
            "error": self.error,
            "notes": self.notes,
        }


def add_usage(total: Usage, part: Usage) -> Usage:
    """Sum usage over calls; a call without usage keeps the total and is counted in extra.no_data_calls."""
    extra = dict(total.extra)
    if part.no_data:
        extra["no_data_calls"] = extra.get("no_data_calls", 0) + 1
        return dataclasses.replace(total, calls=total.calls + part.calls, extra=extra)
    for key, value in part.extra.items():
        if isinstance(value, int):
            extra[key] = extra.get(key, 0) + value
    return Usage(
        (total.input_tokens or 0) + (part.input_tokens or 0),
        (total.output_tokens or 0) + (part.output_tokens or 0),
        total.calls + part.calls,
        extra,
    )


def empty_usage() -> Usage:
    return Usage(0, 0, 0)


async def tool_loop(adapter: Adapter, req: ModelRequest, *, max_rounds: int = MAX_ROUNDS) -> LoopResult:
    """model → tools → model until a final answer: text (no schema) or a structured answer that validates."""
    messages = list(req.messages)
    usage = empty_usage()
    calls_seen: list[dict[str, Any]] = []
    repairs = 0
    notes: list[str] = []
    start = time.perf_counter()
    last_text = ""

    def done(ok: bool, answer: ResearchAnswer | None, rounds: int, error: dict[str, Any] | None = None) -> LoopResult:
        return LoopResult(
            ok, answer, last_text, rounds, calls_seen, repairs, usage, time.perf_counter() - start, error, notes
        )

    for round_no in range(1, max_rounds + 1):
        try:
            result = await adapter.generate(dataclasses.replace(req, messages=messages))
        except GatewayError as exc:
            return done(False, None, round_no, exc.as_dict())
        usage = add_usage(usage, result.usage)
        last_text = result.text
        if result.refusal:
            return done(False, None, round_no, {"code": "content_refused", "signal": result.raw_stop_reason})
        all_calls = result.assistant.tool_calls
        output_calls = [c for c in all_calls if req.output_mode == "tool" and c.name == req.output_name]
        final_attempt = req.output_schema is not None and (
            result.structured is not None or bool(output_calls) or not result.tool_calls
        )
        if req.output_schema is None and not result.tool_calls:
            return done(bool(result.text.strip()), None, round_no)
        if final_attempt:
            if result.structured is None:
                answer, problem = None, result.structured_error or "không có đầu ra có cấu trúc"
            else:
                answer, problem = validate_answer(result.structured)
            if answer is not None:
                return done(True, answer, round_no)
            if repairs >= MAX_REPAIRS:
                return done(False, None, round_no, {"code": "invalid_response", "signal": problem})
            repairs += 1
            notes.append(f"sửa định dạng lần {repairs}: {problem}")
            hint = f"Your answer did not match the required JSON schema ({problem}). Answer again in that schema."
            if output_calls:
                messages.append(result.assistant)
                for call in all_calls:
                    text = hint if call in output_calls else run_tool(call.name, _dict(call.arguments))
                    messages.append(Msg("tool", text=text, tool_call_id=call.id, tool_name=call.name))
            else:
                messages.append(result.assistant if (result.text or all_calls) else Msg("assistant", text="{}"))
                messages.append(Msg("user", text=hint))
            continue
        messages.append(result.assistant)
        for call in all_calls:
            valid = tool_args_valid(call.name, call.arguments)
            calls_seen.append({"round": round_no, "name": call.name, "arguments": call.arguments, "args_valid": valid})
            messages.append(
                Msg("tool", text=run_tool(call.name, _dict(call.arguments)), tool_call_id=call.id, tool_name=call.name)
            )
    return done(False, None, max_rounds, {"code": "max_rounds", "signal": f"quá {max_rounds} vòng"})


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}
