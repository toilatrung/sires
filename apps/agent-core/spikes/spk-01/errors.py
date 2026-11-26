# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S02 of SPK-01: intentional errors and their mapping to the standard codes of PRD 8.6 / architecture 8.4 (AC04).

    python errors.py [--out DIR] [--variants ...] [--burst 50] [--no-burst] [--only real|proxy]

Real calls (each provider's configured endpoint, else the official one; the connection key never goes to another
endpoint): wrong key, unknown model, client timeout, refused connection, unresolvable host, and a burst of tiny
concurrent calls to provoke HTTP 429. Canned calls (through base_url.py's proxy, nothing reaches
the provider): the documented error format of each provider for rate limit, billing quota, overload, 5xx, gateway
timeout, context too long, permission denied, a slow answer, a refusal, a response without usage, an output that
does not match the schema, and a non-JSON body. Every call uses the official SDK with retries off.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from adapters import GatewayError, ModelRequest, Msg, make_adapter
from base_url import FAULT_HEADER, ProxyServer, proxy_base_url
from common import (
    EVIDENCE_ROOT,
    SYSTEM_PROMPT,
    VARIANTS,
    Evidence,
    base_url_for,
    environment_info,
    md_table,
    model_for,
    output_schema,
    provider_of,
    read_key,
    say,
)
from loop import tool_loop

EXPECTED = {
    "invalid_key": "auth_failed",
    "model_not_found": "model_not_found",
    "timeout_client": "timeout",
    "network_refused": "network_error",
    "network_dns": "network_error",
    "rate_limit_burst": "rate_limited",
    "rate_limit": "rate_limited",
    "quota": "quota_exceeded",
    "overloaded": "provider_unavailable",
    "server_error": "provider_unavailable",
    "gateway_timeout": "timeout",
    "context": "context_too_long",
    "forbidden": "permission_denied",
    "slow": "timeout",
    "refusal": "content_refused",
    "no_usage": "no_data",
    "bad_schema": "invalid_response",
    "malformed": "invalid_response",
}
PROXY_FAULTS = (
    "rate_limit",
    "quota",
    "overloaded",
    "server_error",
    "gateway_timeout",
    "context",
    "forbidden",
    "slow",
    "refusal",
    "no_usage",
    "bad_schema",
    "malformed",
)
BURST_VARIANTS = ("anthropic", "openai", "google")


def tiny(model: str) -> ModelRequest:
    return ModelRequest(model, [Msg("user", "Reply with the single word OK.")], max_output_tokens=5)


def outcome(scenario: str, source: str, *, error: GatewayError | None = None, **extra: Any) -> dict[str, Any]:
    got = error.code if error else extra.pop("code", "ok")
    data: dict[str, Any] = {"scenario": scenario, "source": source, "expected": EXPECTED[scenario], "mapped": got}
    data["match"] = got == EXPECTED[scenario]
    if error:
        data.update(error.as_dict())
    data.update(extra)
    return data


async def call_once(variant: str, key: str, scenario: str, source: str, **adapter_kwargs: Any) -> dict[str, Any]:
    provider = provider_of(variant)
    model = adapter_kwargs.pop("model", model_for(provider))
    adapter = make_adapter(variant, key, **adapter_kwargs)
    try:
        if scenario == "bad_schema":
            req = ModelRequest(model, [Msg("user", "Return the answer.")], SYSTEM_PROMPT, output_schema=output_schema())
            loop = await tool_loop(adapter, req)
            err = loop.error or {}
            return outcome(
                scenario,
                source,
                code=err.get("code", "ok"),
                signal=err.get("signal"),
                calls=loop.usage.calls,
                repairs=loop.repairs,
            )
        result = await adapter.generate(
            tiny(model)
            if scenario != "no_usage"
            else ModelRequest(model, [Msg("user", "Return the answer.")], output_schema=output_schema())
        )
        if result.refusal:
            return outcome(scenario, source, code="content_refused", signal=f"stop_reason={result.raw_stop_reason}")
        if result.usage.no_data:
            return outcome(
                scenario, source, code="no_data", signal="phản hồi không có usage", usage=result.usage.as_dict()
            )
        return outcome(scenario, source, code="ok", signal=f"stop_reason={result.raw_stop_reason}")
    except GatewayError as exc:
        return outcome(scenario, source, error=exc)
    finally:
        await adapter.aclose()


async def burst(variant: str, key: str, n: int, base_url: str | None, source: str) -> dict[str, Any]:
    """n concurrent tiny calls (1 output token); reports the HTTP outcomes and the mapping of the first 429."""
    provider = provider_of(variant)
    model = model_for(provider)
    adapter = make_adapter(variant, key, timeout=60, base_url=base_url)
    req = ModelRequest(model, [Msg("user", "Say OK.")], max_output_tokens=1)
    results = await asyncio.gather(*(adapter.generate(req) for _ in range(n)), return_exceptions=True)
    await adapter.aclose()
    counts: dict[str, int] = {}
    first_429: GatewayError | None = None
    tokens_in = tokens_out = 0
    for r in results:
        if isinstance(r, GatewayError):
            counts[r.code] = counts.get(r.code, 0) + 1
            if r.code in ("rate_limited", "quota_exceeded") and first_429 is None:
                first_429 = r
        elif isinstance(r, BaseException):
            counts[type(r).__name__] = counts.get(type(r).__name__, 0) + 1
        else:
            counts["ok"] = counts.get("ok", 0) + 1
            tokens_in += r.usage.input_tokens or 0
            tokens_out += r.usage.output_tokens or 0
    extra = {"requests": n, "outcomes": counts, "usage": {"input_tokens": tokens_in, "output_tokens": tokens_out}}
    if first_429 is None:
        return outcome("rate_limit_burst", source, code="không gây được 429", **extra)
    return outcome("rate_limit_burst", source, error=first_429, **extra)


async def run_real(variant: str, key: str | None, burst_n: int) -> list[dict[str, Any]]:
    """Real calls. On the official endpoint: wrong key, client timeout, refused connection, DNS (no valid key needed).
    On the configured endpoint (SPK01_BASE_URL_*, the PO's gateway; else the official one): wrong key, unknown model
    and the burst, which need a key that this endpoint accepts."""
    provider = provider_of(variant)
    v1 = "/v1" if provider == "openai" else ""
    # The connection key only goes to the connection's own endpoint (QC G9); elsewhere a placeholder is enough.
    placeholder = "spk01-placeholder-key-0000000000"
    custom = base_url_for(provider)
    source = "gateway" if custom else "real"
    rows = [
        await call_once(variant, "spk01-invalid-key-0000000000", "invalid_key", "real"),
        await call_once(variant, key or placeholder, "timeout_client", source, base_url=custom, timeout=0.01),
        await call_once(
            variant, placeholder, "network_refused", "real", base_url=f"http://127.0.0.1:9{v1}", timeout=10
        ),
        await call_once(
            variant, placeholder, "network_dns", "real", base_url=f"https://spk01-unresolvable.invalid{v1}", timeout=10
        ),
    ]
    if custom:
        rows.append(await call_once(variant, "spk01-invalid-key-0000000000", "invalid_key", source, base_url=custom))
    if key is None:
        rows.append({"scenario": "model_not_found", "source": source, "blocked": "Bị chặn — chờ key"})
        return rows
    rows.append(await call_once(variant, key, "model_not_found", source, model="spk01-no-such-model", base_url=custom))
    if burst_n > 0 and variant in BURST_VARIANTS:
        rows.append(await burst(variant, key, burst_n, custom, source))
    return rows


async def run_proxy(variant: str, key: str, port: int) -> list[dict[str, Any]]:
    rows = []
    for fault in PROXY_FAULTS:
        timeout = 2.0 if fault == "slow" else 30.0
        rows.append(
            await call_once(
                variant,
                key,
                fault,
                "proxy",
                base_url=proxy_base_url(variant, port),
                timeout=timeout,
                headers={FAULT_HEADER: fault},
            )
        )
    return rows


async def main_async(args: argparse.Namespace, ev: Evidence) -> list[list[Any]]:
    table: list[list[Any]] = []
    with ProxyServer() as server:
        for variant in args.variants:
            provider = provider_of(variant)
            key = read_key(provider)
            rows: list[dict[str, Any]] = []
            if args.only in (None, "proxy"):
                # Canned faults never reach the provider, so a placeholder key is enough.
                rows += await run_proxy(variant, key or "spk01-placeholder-key", server.port)
            if args.only in (None, "real"):
                rows += await run_real(variant, key, 0 if args.no_burst else args.burst)
            for row in rows:
                ev.record(variant=variant, model=model_for(provider), **row)
                if "blocked" in row:
                    table.append(
                        [variant, row["scenario"], "real", "—", row["blocked"], "", "", "", "model_not_found, burst"]
                    )
                    continue
                table.append(
                    [
                        variant,
                        row["scenario"],
                        row["source"],
                        row["expected"],
                        row["mapped"],
                        "đúng" if row["match"] else "LỆCH",
                        row.get("retryable", ""),
                        row.get("retry_after_s", ""),
                        row.get("signal", "") or json.dumps(row.get("outcomes", "")),
                    ]
                )
            say(f"{variant}: {sum(1 for r in rows if r.get('match'))}/{len(rows)} khớp mã mong đợi")
    return table


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=EVIDENCE_ROOT / "errors")
    parser.add_argument("--variants", nargs="*", default=list(VARIANTS), choices=VARIANTS)
    parser.add_argument("--burst", type=int, default=50, help="số lời gọi đồng thời để gây 429 (mặc định 50)")
    parser.add_argument("--no-burst", action="store_true")
    parser.add_argument("--only", choices=("real", "proxy"))
    args = parser.parse_args()
    ev = Evidence(args.out)
    ev.write("environment.json", environment_info())
    rows = asyncio.run(main_async(args, ev))
    header = [
        "Adapter",
        "Tình huống",
        "Nguồn",
        "Mã mong đợi",
        "Mã ánh xạ",
        "Khớp",
        "Thử lại",
        "Retry-After (s)",
        "Tín hiệu",
    ]
    table = md_table(header, rows)
    ev.write("summary.md", table)
    ev.close()
    print(table)


if __name__ == "__main__":
    main()
