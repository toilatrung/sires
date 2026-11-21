# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S01 of SPK-01: tool calling, structured output on one schema, streaming and usage per provider (AC01, AC02).

    python capabilities.py [--out DIR] [--variants anthropic openai openai-responses google]
    python capabilities.py --list-models            model IDs each key can use (choose SPK01_MODEL_<PROVIDER>)

Each adapter variant runs the same scenarios with a low-cost model and short calls:
  structured_<raw|inline|inline_typelist>  native structured output with the three schema variants of ResearchAnswer
  structured_tool                          the same schema as a forced tool ("output tool"), inline variant
  tool_call                                one tool round: the model must call get_reference with valid arguments
  tool_parallel                            two IDs in one request: does the model emit several calls in one turn
  tool_loop_structured                     tools + output schema in the same request until a valid answer (≤ 8 rounds)
  stream / stream_no_usage_option          text streaming; usage present in the stream (OpenAI Chat: with and without
                                           stream_options.include_usage)
Usage of every call is recorded raw and normalised (no_data when absent); cost is an estimate (genai-prices).
A provider without a key is recorded as "Bị chặn — chờ key" (EC01) and the others still run.
"""

from __future__ import annotations

import argparse
import asyncio
import time
from pathlib import Path
from typing import Any

from adapters import Adapter, GatewayError, ModelRequest, Msg, Usage, make_adapter
from common import (
    EVIDENCE_ROOT,
    LOOP_PROMPT,
    PROVIDERS,
    SCHEMA_VARIANTS,
    STRUCTURED_PROMPT,
    SYSTEM_PROMPT,
    TOOLS,
    VARIANTS,
    Evidence,
    base_url_for,
    endpoint_label,
    environment_info,
    estimate_cost_usd,
    key_names,
    md_table,
    model_for,
    output_schema,
    provider_of,
    read_key,
    say,
    tool_args_valid,
    validate_answer,
)
from loop import add_usage, empty_usage, tool_loop


class Run:
    """Results of one adapter variant; sums usage over every call it makes."""

    def __init__(self, variant: str, adapter: Adapter, ev: Evidence) -> None:
        self.variant = variant
        self.provider = provider_of(variant)
        self.model = model_for(self.provider)
        self.adapter = adapter
        self.ev = ev
        self.usage = empty_usage()
        self.results: dict[str, dict[str, Any]] = {}

    def add(self, usage: Usage) -> None:
        self.usage = add_usage(self.usage, usage)

    def done(self, scenario: str, ok: bool, **data: Any) -> None:
        self.results[scenario] = {"ok": ok, **data}
        self.ev.record(variant=self.variant, model=self.model, scenario=scenario, ok=ok, **data)
        mark = "đạt" if ok else "KHÔNG"
        say(f"  {self.variant:17} {scenario:24} {mark}  {data.get('note', '')}")

    async def scenario(self, name: str, coro: Any) -> None:
        start = time.perf_counter()
        try:
            await coro
        except GatewayError as exc:
            self.done(name, False, error=exc.as_dict(), note=f"{exc.code}: {exc.signal}")
        except Exception as exc:  # a spike finding, not a crash: record and continue
            self.done(name, False, error={"code": "unhandled", "type": type(exc).__name__, "message": str(exc)[:300]})
        finally:
            self.results.setdefault(name, {})["seconds"] = round(time.perf_counter() - start, 2)


async def structured(run: Run, variant: str) -> None:
    req = ModelRequest(run.model, [Msg("user", STRUCTURED_PROMPT)], SYSTEM_PROMPT, output_schema=output_schema(variant))
    res = await run.adapter.generate(req)
    run.add(res.usage)
    if res.structured is None:
        answer, problem = None, res.structured_error
    else:
        answer, problem = validate_answer(res.structured)
    run.done(
        f"structured_{variant}",
        answer is not None,
        stop=res.stop_reason,
        problem=problem,
        answer=answer.model_dump() if answer else res.text[:300],
        usage=res.usage.as_dict(),
        latency_s=round(res.latency_s, 2),
        note=problem or "",
    )


async def structured_tool(run: Run) -> None:
    req = ModelRequest(
        run.model,
        [Msg("user", STRUCTURED_PROMPT)],
        SYSTEM_PROMPT,
        output_schema=output_schema("inline"),
        output_mode="tool",
    )
    res = await run.adapter.generate(req)
    run.add(res.usage)
    answer, problem = validate_answer(res.structured) if res.structured is not None else (None, res.structured_error)
    run.done(
        "structured_tool",
        answer is not None,
        stop=res.stop_reason,
        problem=problem,
        usage=res.usage.as_dict(),
        latency_s=round(res.latency_s, 2),
        note=problem or "",
    )


async def tool_call(run: Run) -> None:
    req = ModelRequest(
        run.model, [Msg("user", "What is the key finding of reference R2? Use get_reference.")], SYSTEM_PROMPT, TOOLS
    )
    res = await run.adapter.generate(req)
    run.add(res.usage)
    calls = [
        {"name": c.name, "arguments": c.arguments, "args_valid": tool_args_valid(c.name, c.arguments)}
        for c in res.tool_calls
    ]
    ok = any(c["name"] == "get_reference" and c["args_valid"] for c in calls)
    final = ""
    if ok:
        # Send the tool result back and check the model finishes with text.
        from common import run_tool

        msgs = [req.messages[0], res.assistant] + [
            Msg(
                "tool",
                text=run_tool(c.name, c.arguments if isinstance(c.arguments, dict) else {}),
                tool_call_id=c.id,
                tool_name=c.name,
            )
            for c in res.tool_calls
        ]
        res2 = await run.adapter.generate(ModelRequest(run.model, msgs, SYSTEM_PROMPT, TOOLS))
        run.add(res2.usage)
        final = res2.text
        ok = bool(final.strip()) and not res2.tool_calls
    run.done(
        "tool_call",
        ok,
        stop=res.stop_reason,
        calls=calls,
        final_text=final[:300],
        usage=res.usage.as_dict(),
        note=f"{[c['name'] for c in calls]}",
    )


async def tool_parallel(run: Run) -> None:
    prompt = "Get the records of R1 and R3. Call get_reference once for each ID, in the same turn if you can."
    req = ModelRequest(run.model, [Msg("user", prompt)], SYSTEM_PROMPT, TOOLS)
    res = await run.adapter.generate(req)
    run.add(res.usage)
    ids = sorted(str(c.arguments.get("reference_id")) for c in res.tool_calls if isinstance(c.arguments, dict))
    run.done(
        "tool_parallel",
        ids == ["R1", "R3"],
        calls_in_first_turn=len(res.tool_calls),
        ids=ids,
        usage=res.usage.as_dict(),
        note=f"{len(res.tool_calls)} lời gọi trong lượt đầu: {ids}",
    )


async def loop_structured(run: Run) -> None:
    req = ModelRequest(
        run.model, [Msg("user", LOOP_PROMPT)], SYSTEM_PROMPT, TOOLS, output_schema=output_schema("inline")
    )
    res = await tool_loop(run.adapter, req)
    run.usage = add_usage(run.usage, res.usage)
    data = res.as_dict()
    data.pop("ok")
    run.done(
        "tool_loop_structured",
        res.ok,
        **data,
        note=f"{res.rounds} vòng, {len(res.tool_calls)} tool call, sửa {res.repairs}"
        + (f", lỗi {res.error}" if res.error else ""),
    )


async def stream(run: Run, include_usage: bool, name: str) -> None:
    req = ModelRequest(
        run.model, [Msg("user", "In two sentences, explain why research claims need evidence.")], SYSTEM_PROMPT
    )
    res = await run.adapter.stream_text(req, include_usage=include_usage)
    if not res.usage.no_data:
        run.add(res.usage)
    run.done(
        name,
        res.chunks > 1 and bool(res.text.strip()),
        chunks=res.chunks,
        ttft_s=round(res.ttft_s, 3) if res.ttft_s else None,
        total_s=round(res.total_s, 3),
        usage=res.usage.as_dict(),
        usage_in_stream=not res.usage.no_data,
        events=res.event_types,
        text=res.text[:300],
        note=f"{res.chunks} mảnh, usage trong stream: {'có' if not res.usage.no_data else 'không'}",
    )


BLOCKING = {"timeout", "provider_unavailable", "auth_failed", "network_error", "model_not_found", "permission_denied"}


async def run_variant(variant: str, ev: Evidence, fail_fast: bool = False) -> Run | None:
    provider = provider_of(variant)
    key = read_key(provider)
    if key is None:
        ev.record(variant=variant, blocked=f"Bị chặn — chờ key ({key_names(provider)})")
        say(f"{variant}: Bị chặn — chờ key ({key_names(provider)})")
        return None
    adapter = make_adapter(variant, key, base_url=base_url_for(provider))
    run = Run(variant, adapter, ev)
    ev.record(variant=variant, model=run.model, api=adapter.api, endpoint=endpoint_label(provider))
    say(f"{variant} ({adapter.api}, model {run.model}, {endpoint_label(provider)})")
    await run.scenario("structured_raw", structured(run, "raw"))
    first_error = (run.results["structured_raw"].get("error") or {}).get("code")
    if fail_fast and first_error in BLOCKING:
        # The endpoint or model is not usable (EC01): one failed call is the evidence, the rest would fail the same way.
        ev.record(
            variant=variant, model=run.model, blocked=f"Bị chặn — {first_error}", endpoint=endpoint_label(provider)
        )
        say(f"{variant}: Bị chặn — {first_error}; bỏ các phép thử còn lại (--fail-fast)")
        await adapter.aclose()
        return run
    for schema_variant in SCHEMA_VARIANTS[1:]:
        await run.scenario(f"structured_{schema_variant}", structured(run, schema_variant))
    await run.scenario("structured_tool", structured_tool(run))
    await run.scenario("tool_call", tool_call(run))
    await run.scenario("tool_parallel", tool_parallel(run))
    await run.scenario("tool_loop_structured", loop_structured(run))
    await run.scenario("stream", stream(run, True, "stream"))
    if variant == "openai":
        await run.scenario("stream_no_usage_option", stream(run, False, "stream_no_usage_option"))
    await adapter.aclose()
    cost = estimate_cost_usd(provider, run.model, run.usage.input_tokens, run.usage.output_tokens)
    ev.record(variant=variant, model=run.model, total_usage=run.usage.as_dict(), estimated_cost_usd=cost)
    return run


def matrix(runs: list[Run]) -> str:
    def cell(run: Run, *names: str) -> str:
        found = [run.results[n] for n in names if n in run.results]
        if not found:
            return "—"
        return (
            "đạt" if all(r.get("ok") for r in found) else ("một phần" if any(r.get("ok") for r in found) else "KHÔNG")
        )

    rows = []
    for run in runs:
        usage_non_stream = all(
            isinstance(r.get("usage"), dict) and r["usage"].get("usage") != "no_data"
            for n, r in run.results.items()
            if n.startswith(("structured", "tool_call", "tool_parallel"))
        )
        stream_usage = run.results.get("stream", {}).get("usage_in_stream")
        cost = estimate_cost_usd(run.provider, run.model, run.usage.input_tokens, run.usage.output_tokens)
        rows.append(
            [
                run.variant,
                run.model,
                cell(run, "tool_call"),
                cell(run, "tool_parallel"),
                " / ".join(cell(run, f"structured_{v}") for v in SCHEMA_VARIANTS),
                cell(run, "structured_tool"),
                cell(run, "tool_loop_structured"),
                cell(run, "stream"),
                "có" if usage_non_stream else "không đủ",
                {True: "có", False: "không", None: "—"}[stream_usage],
                f"{run.usage.calls} / {run.usage.input_tokens} / {run.usage.output_tokens}",
                f"{cost:.5f}" if cost is not None else "không có giá",
            ]
        )
    header = [
        "Adapter",
        "Model",
        "Tool calling",
        "Nhiều tool một lượt",
        "Structured raw / inline / typelist",
        "Structured qua tool",
        "Tool + schema (vòng)",
        "Streaming",
        "Usage (không stream)",
        "Usage trong stream",
        "Lời gọi / token vào / ra",
        "Chi phí ước tính (USD)",
    ]
    return md_table(header, rows)


async def list_models() -> None:
    for provider in PROVIDERS:
        key = read_key(provider)
        if key is None:
            say(f"{provider}: chưa có key ({key_names(provider)})")
            continue
        adapter = make_adapter(provider, key, base_url=base_url_for(provider))
        try:
            names = await adapter.list_models()
            say(
                f"{provider}: {len(names)} model; mặc định {model_for(provider)} có trong danh sách: "
                f"{any(model_for(provider) in n for n in names)}"
            )
            say("   " + ", ".join(sorted(names)))
        except GatewayError as exc:
            say(f"{provider}: {exc.code} ({exc.signal})")
        finally:
            await adapter.aclose()


async def main_async(variants: list[str], ev: Evidence, fail_fast: bool) -> list[Run]:
    runs = []
    for variant in variants:
        run = await run_variant(variant, ev, fail_fast)
        if run:
            runs.append(run)
    return runs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=EVIDENCE_ROOT / "capabilities")
    parser.add_argument("--variants", nargs="*", default=list(VARIANTS), choices=VARIANTS)
    parser.add_argument("--list-models", action="store_true")
    parser.add_argument("--fail-fast", action="store_true", help="dừng adapter khi lời gọi đầu đã bị chặn")
    args = parser.parse_args()
    if args.list_models:
        asyncio.run(list_models())
        return
    ev = Evidence(args.out)
    ev.write("environment.json", environment_info())
    runs = asyncio.run(main_async(args.variants, ev, args.fail_fast))
    table = matrix(runs)
    ev.write("summary.md", table)
    ev.close()
    print(table)


if __name__ == "__main__":
    main()
