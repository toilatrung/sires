# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S03 of SPK-01: Pydantic AI and LangGraph on the same tool-calling loop, no checkpointer (ADR-08, AC05).

    python frameworks.py [--out DIR] [--variants anthropic openai google] [--frameworks plain pydantic-ai langgraph]

Every framework drives the same loop through the same gateway adapters (adapters.py), because ADR-08 keeps provider
calls, usage and error mapping in the Model Gateway and allows a framework only inside one Agent Run:
  plain        loop.tool_loop, no framework (baseline)
  pydantic-ai  Agent + FunctionModel bridging to the adapter; output_type=ResearchAnswer (output tool), retries=2,
               UsageLimits(request_limit=8); Pydantic AI keeps no state between runs
  langgraph    StateGraph(model → tools → model) compiled without a checkpointer; recursion_limit for ≤ 8 rounds;
               output tool, validation and ≤ 2 repairs written in the graph
Same prompt, tools (search_library, get_reference), output schema and tool_choice=required. Also measured: glue code
lines, import time, installed footprint of each framework's dependency closure.
"""

from __future__ import annotations

import argparse
import asyncio
import inspect
import json
import operator
import subprocess
import sys
import time
from pathlib import Path
from typing import Annotated, Any, TypedDict

from adapters import (
    Adapter,
    GatewayError,
    ModelRequest,
    ModelResult,
    Msg,
    ToolCall,
    Usage,
    _structured_from,
    make_adapter,
)
from common import (
    EVIDENCE_ROOT,
    LOOP_PROMPT,
    SYSTEM_PROMPT,
    TOOLS,
    Evidence,
    ToolSpec,
    base_url_for,
    environment_info,
    estimate_cost_usd,
    md_table,
    model_for,
    output_schema,
    provider_of,
    read_key,
    run_tool,
    say,
    validate_answer,
)
from loop import MAX_REPAIRS, MAX_ROUNDS, add_usage, empty_usage, tool_loop

FRAMEWORKS = ("plain", "pydantic-ai", "langgraph")
OUTPUT_TOOL = "final_result"


class Meter:
    """Wraps an adapter to count every model call and sum usage, whatever the framework reports."""

    def __init__(self, adapter: Adapter) -> None:
        self.adapter = adapter
        self.usage = empty_usage()
        self.tool_calls = 0

    async def generate(self, req: ModelRequest) -> Any:
        res = await self.adapter.generate(req)
        self.usage = add_usage(self.usage, res.usage)
        self.tool_calls += len([c for c in res.assistant.tool_calls if c.name != OUTPUT_TOOL])
        return res


# ---------------------------------------------------------------- plain loop (baseline)


async def run_plain(meter: Meter, model: str) -> dict[str, Any]:
    req = ModelRequest(
        model,
        [Msg("user", LOOP_PROMPT)],
        SYSTEM_PROMPT,
        TOOLS,
        output_schema=output_schema("inline"),
        output_name=OUTPUT_TOOL,
        output_mode="tool",
        tool_choice="required",
    )
    res = await tool_loop(meter, req)  # type: ignore[arg-type]
    return {
        "ok": res.ok,
        "answer": res.answer.model_dump() if res.answer else None,
        "repairs": res.repairs,
        "error": res.error,
        "framework_usage": None,
    }


# ---------------------------------------------------------------- Pydantic AI


async def run_pydantic_ai(meter: Meter, model: str) -> dict[str, Any]:
    from common import ResearchAnswer
    from pydantic_ai import Agent
    from pydantic_ai.messages import (
        ModelResponse,
        RetryPromptPart,
        TextPart,
        ToolCallPart,
        ToolReturnPart,
        UserPromptPart,
    )
    from pydantic_ai.models.function import AgentInfo, FunctionModel
    from pydantic_ai.usage import RequestUsage, UsageLimits

    async def bridge(messages: list[Any], info: AgentInfo) -> ModelResponse:
        msgs: list[Msg] = []
        for message in messages:
            if isinstance(message, ModelResponse):
                calls = [
                    ToolCall(p.tool_call_id, p.tool_name, p.args_as_dict())
                    for p in message.parts
                    if isinstance(p, ToolCallPart)
                ]
                text = "".join(p.content for p in message.parts if isinstance(p, TextPart))
                raw = (message.provider_details or {}).get("spk01_raw")
                msgs.append(Msg("assistant", text=text, tool_calls=calls, provider_parts=raw))
                continue
            for part in message.parts:
                if isinstance(part, UserPromptPart):
                    msgs.append(Msg("user", text=part.content if isinstance(part.content, str) else str(part.content)))
                elif isinstance(part, ToolReturnPart):
                    msgs.append(
                        Msg(
                            "tool",
                            text=part.model_response_str(),
                            tool_call_id=part.tool_call_id,
                            tool_name=part.tool_name,
                        )
                    )
                elif isinstance(part, RetryPromptPart):
                    if part.tool_name:
                        msgs.append(
                            Msg(
                                "tool",
                                text=part.model_response(),
                                tool_call_id=part.tool_call_id,
                                tool_name=part.tool_name,
                            )
                        )
                    else:
                        msgs.append(Msg("user", text=part.model_response()))
        tools = [
            ToolSpec(t.name, t.description or "", t.parameters_json_schema)
            for t in info.function_tools + info.output_tools
        ]
        req = ModelRequest(
            model,
            msgs,
            info.instructions or SYSTEM_PROMPT,
            tools,
            tool_choice="auto" if info.allow_text_output else "required",
        )
        res = await meter.generate(req)
        parts: list[Any] = [TextPart(res.text)] if res.text else []
        parts += [ToolCallPart(c.name, c.arguments, tool_call_id=c.id) for c in res.assistant.tool_calls]
        return ModelResponse(
            parts=parts,
            usage=RequestUsage(input_tokens=res.usage.input_tokens or 0, output_tokens=res.usage.output_tokens or 0),
            model_name=model,
            provider_details={"spk01_raw": res.assistant.provider_parts},
        )

    agent = Agent(FunctionModel(bridge), output_type=ResearchAnswer, instructions=SYSTEM_PROMPT, retries=MAX_REPAIRS)

    @agent.tool_plain
    def search_library(query: str, limit: int) -> str:
        """Search the project library. Returns matching reference IDs and titles."""
        return run_tool("search_library", {"query": query, "limit": limit})

    @agent.tool_plain
    def get_reference(reference_id: str) -> str:
        """Return the library record (title, year, key finding) of one reference by its ID."""
        return run_tool("get_reference", {"reference_id": reference_id})

    result = await agent.run(LOOP_PROMPT, usage_limits=UsageLimits(request_limit=MAX_ROUNDS))
    usage = result.usage
    return {
        "ok": True,
        "answer": result.output.model_dump(),
        "repairs": None,
        "error": None,
        "framework_usage": {
            "requests": usage.requests,
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "tool_calls": usage.tool_calls,
        },
    }


# ---------------------------------------------------------------- LangGraph


class LoopState(TypedDict):
    messages: Annotated[list[Msg], operator.add]
    rounds: int
    repairs: int
    answer: dict[str, Any] | None
    error: dict[str, Any] | None


def build_langgraph(meter: Meter, model: str) -> Any:
    from langgraph.graph import END, START, StateGraph

    tools = [*TOOLS, ToolSpec(OUTPUT_TOOL, "Return the final answer.", output_schema("inline"))]

    async def call_model(state: LoopState) -> dict[str, Any]:
        if state["rounds"] >= MAX_ROUNDS:
            return {"error": {"code": "max_rounds"}}
        req = ModelRequest(model, state["messages"], SYSTEM_PROMPT, tools, tool_choice="required")
        try:
            res = await meter.generate(req)
        except GatewayError as exc:
            return {"error": exc.as_dict(), "rounds": state["rounds"] + 1}
        return {"messages": [res.assistant], "rounds": state["rounds"] + 1}

    async def run_tools(state: LoopState) -> dict[str, Any]:
        last = state["messages"][-1]
        out: list[Msg] = []
        answer = None
        repairs = state["repairs"]
        for call in last.tool_calls:
            if call.name == OUTPUT_TOOL:
                valid, problem = validate_answer(call.arguments)
                if valid is not None:
                    answer = valid.model_dump()
                    text = "Final answer accepted."
                else:
                    repairs += 1
                    text = f"Validation error: {problem}. Call {OUTPUT_TOOL} again with valid arguments."
            else:
                text = run_tool(call.name, call.arguments if isinstance(call.arguments, dict) else {})
            out.append(Msg("tool", text=text, tool_call_id=call.id, tool_name=call.name))
        update: dict[str, Any] = {"messages": out, "answer": answer, "repairs": repairs}
        if answer is None and repairs > MAX_REPAIRS:
            update["error"] = {"code": "invalid_response"}
        return update

    def after_model(state: LoopState) -> str:
        if state.get("error") or not state["messages"][-1].tool_calls:
            return END
        return "tools"

    def after_tools(state: LoopState) -> str:
        return END if state.get("answer") or state.get("error") else "model"

    graph = StateGraph(LoopState)
    graph.add_node("model", call_model)
    graph.add_node("tools", run_tools)
    graph.add_edge(START, "model")
    graph.add_conditional_edges("model", after_model, ["tools", END])
    graph.add_conditional_edges("tools", after_tools, ["model", END])
    return graph.compile()  # no checkpointer: state lives only inside this run


async def run_langgraph(meter: Meter, model: str) -> dict[str, Any]:
    app = build_langgraph(meter, model)
    initial: LoopState = {
        "messages": [Msg("user", LOOP_PROMPT)],
        "rounds": 0,
        "repairs": 0,
        "answer": None,
        "error": None,
    }
    final = await app.ainvoke(initial, config={"recursion_limit": 2 * MAX_ROUNDS + 2})
    error = final.get("error")
    if final.get("answer") is None and error is None:
        error = {"code": "no_output", "signal": "model trả lời văn bản, không gọi final_result"}
    return {
        "ok": final.get("answer") is not None,
        "answer": final.get("answer"),
        "repairs": final["repairs"],
        "error": error,
        "framework_usage": None,
        "checkpointer": None if app.checkpointer is None else type(app.checkpointer).__name__,
    }


RUNNERS = {"plain": run_plain, "pydantic-ai": run_pydantic_ai, "langgraph": run_langgraph}
GLUE = {
    "plain": [],
    "pydantic-ai": [run_pydantic_ai],
    "langgraph": [build_langgraph, run_langgraph, LoopState],
}
IMPORTS = {"plain": None, "pydantic-ai": "pydantic_ai", "langgraph": "langgraph.graph"}
ROOT_DIST = {"plain": None, "pydantic-ai": "pydantic-ai-slim", "langgraph": "langgraph"}


def glue_lines(framework: str) -> int:
    return sum(len([ln for ln in inspect.getsource(obj).splitlines() if ln.strip()]) for obj in GLUE[framework])


def import_probe(module: str | None) -> dict[str, Any]:
    if module is None:
        return {"import_ok": True, "import_s": 0.0}
    code = f"import time; t = time.perf_counter(); import {module}; print(time.perf_counter() - t)"
    proc = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        last = (proc.stderr.strip().splitlines() or ["?"])[-1]
        return {"import_ok": False, "import_error": last[:300]}
    return {"import_ok": True, "import_s": round(float(proc.stdout.strip()), 2)}


def footprint(root: str | None) -> dict[str, Any]:
    """Distributions and installed size of a package's dependency closure (base requirements, no extras)."""
    if root is None:
        return {"distributions": 0, "mb": 0.0}
    from importlib.metadata import PackageNotFoundError, distribution

    from packaging.requirements import Requirement

    seen: dict[str, int] = {}
    todo = [root]
    while todo:
        name = todo.pop().lower().replace("_", "-")
        if name in seen:
            continue
        try:
            dist = distribution(name)
        except PackageNotFoundError:
            continue
        seen[name] = sum((f.size or 0) for f in dist.files or [])
        for spec in dist.requires or []:
            req = Requirement(spec)
            if req.marker is None or req.marker.evaluate({"extra": ""}):
                todo.append(req.name)
    return {"distributions": len(seen), "mb": round(sum(seen.values()) / 1e6, 1), "names": sorted(seen)}


class ScriptedAdapter(Adapter):
    """Offline stand-in (architecture 8.9 FakeModelGateway): search → read two references → an invalid final answer →
    a valid one. Checks the glue of each framework, the repair turn and usage counting without any provider call."""

    provider = "fake"
    api = "scripted"

    async def generate(self, req: ModelRequest) -> ModelResult:
        turn = sum(1 for m in req.messages if m.role == "assistant")
        final = req.output_name if req.output_schema is not None else OUTPUT_TOOL
        script: list[list[ToolCall]] = [
            [ToolCall("c1", "search_library", {"query": "citation checking evidence grounding", "limit": 3})],
            [
                ToolCall("c2", "get_reference", {"reference_id": "R1"}),
                ToolCall("c3", "get_reference", {"reference_id": "R2"}),
            ],
            [ToolCall("c4", final, {"topic": "evidence grounding"})],
        ]
        good = {
            "topic": "evidence grounding",
            "findings": [
                {"claim": "Grounding cut unsupported claims.", "reference_ids": ["R1"], "support": "supported"}
            ],
            "confidence": 0.7,
            "follow_up_question": None,
        }
        calls = script[turn] if turn < len(script) else [ToolCall(f"c{turn + 2}", final, good)]
        structured, error, rest = _structured_from("", calls, req)
        return ModelResult(
            "",
            rest,
            structured,
            error,
            "tool_use",
            "tool_use",
            False,
            Usage(10, 5),
            0.0,
            Msg("assistant", tool_calls=calls),
        )


async def run_one(framework: str, variant: str, key: str) -> dict[str, Any]:
    provider = provider_of(variant)
    model = "scripted" if variant == "fake" else model_for(provider)
    adapter = ScriptedAdapter() if variant == "fake" else make_adapter(variant, key, base_url=base_url_for(provider))
    meter = Meter(adapter)
    start = time.perf_counter()
    try:
        data = await RUNNERS[framework](meter, model)
    except GatewayError as exc:
        data = {"ok": False, "error": exc.as_dict()}
    except Exception as exc:  # a finding about the framework, recorded rather than raised
        data = {
            "ok": False,
            "error": {"code": "framework_error", "type": type(exc).__name__, "message": str(exc)[:400]},
        }
    finally:
        await adapter.aclose()
    usage: Usage = meter.usage
    cost = estimate_cost_usd(provider, model, usage.input_tokens, usage.output_tokens)
    return {
        "framework": framework,
        "variant": variant,
        "model": model,
        **data,
        "model_calls": usage.calls,
        "tool_calls": meter.tool_calls,
        "usage": usage.as_dict(),
        "estimated_cost_usd": cost,
        "latency_s": round(time.perf_counter() - start, 2),
    }


async def main_async(args: argparse.Namespace, ev: Evidence) -> tuple[list[list[Any]], list[list[Any]]]:
    static_rows = []
    available = []
    for framework in args.frameworks:
        probe = import_probe(IMPORTS[framework])
        fp = footprint(ROOT_DIST[framework]) if probe["import_ok"] or framework == "langgraph" else {}
        info = {"framework": framework, **probe, "glue_lines": glue_lines(framework), "footprint": fp}
        ev.record(kind="static", **info)
        static_rows.append(
            [
                framework,
                "có" if probe["import_ok"] else f"KHÔNG — {probe.get('import_error', '')}",
                probe.get("import_s", "—"),
                info["glue_lines"],
                fp.get("distributions", "—"),
                fp.get("mb", "—"),
            ]
        )
        if probe["import_ok"]:
            available.append(framework)
    rows = []
    for variant in args.variants:
        key = "offline" if variant == "fake" else read_key(provider_of(variant))
        if key is None:
            rows.append([variant, "Bị chặn — chờ key", "", "", "", "", "", "", ""])
            continue
        for framework in available:
            for rep in range(args.repeat):
                result = await run_one(framework, variant, key)
                ev.record(kind="run", repeat=rep, **result)
                u = result["usage"]
                rows.append(
                    [
                        variant,
                        framework,
                        "đạt" if result["ok"] else f"KHÔNG ({(result.get('error') or {}).get('code')})",
                        result["model_calls"],
                        result["tool_calls"],
                        f"{u.get('input_tokens')} / {u.get('output_tokens')}",
                        f"{result['estimated_cost_usd']:.5f}" if result["estimated_cost_usd"] is not None else "—",
                        result["latency_s"],
                        json.dumps(result.get("framework_usage")) if result.get("framework_usage") else "",
                    ]
                )
                say(
                    f"{variant:10} {framework:12} ok={result['ok']} calls={result['model_calls']} "
                    f"tools={result['tool_calls']} {result['latency_s']}s {result.get('error') or ''}"
                )
    return static_rows, rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=EVIDENCE_ROOT / f"frameworks-{sys.platform}")
    parser.add_argument("--variants", nargs="*", default=["anthropic", "openai", "google"])
    parser.add_argument("--frameworks", nargs="*", default=list(FRAMEWORKS), choices=FRAMEWORKS)
    parser.add_argument("--repeat", type=int, default=1)
    args = parser.parse_args()
    ev = Evidence(args.out)
    ev.write("environment.json", environment_info())
    static_rows, rows = asyncio.run(main_async(args, ev))
    text = md_table(
        ["Framework", "Import được", "Thời gian import (s)", "Dòng mã nối", "Số gói phụ thuộc", "MB cài"], static_rows
    )
    text += "\n" + md_table(
        [
            "Adapter",
            "Framework",
            "Kết quả",
            "Lời gọi model",
            "Tool call",
            "Token vào / ra",
            "Chi phí ước tính (USD)",
            "Thời gian (s)",
            "Usage framework tự đếm",
        ],
        rows,
    )
    ev.write("summary.md", text)
    ev.close()
    print(text)


if __name__ == "__main__":
    main()
