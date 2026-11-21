# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S02 of SPK-01: custom base URL through a local proxy that forwards to the official endpoints (ASM-03, AC03).

    python base_url.py serve [--port 8787]             run the proxy only (Ctrl+C to stop)
    python base_url.py compare [--out DIR] [--variants anthropic openai openai-responses google]

``compare`` starts the proxy in-process, runs the same probes against the official endpoint and through the proxy,
and checks the normalised results match. The proxy logs method, path, status, duration and byte count only — never
headers (they carry the API key), query strings or bodies.

The proxy also answers with canned provider responses when a request carries the header ``x-spk01-fault`` (used by
errors.py): error bodies follow each provider's documented error format; the header is never forwarded upstream.
In the product, base URLs must be https:// and loopback/private addresses are blocked (architecture 8.2, 10.5); this
spike uses http://127.0.0.1 only to observe how each SDK composes and sends requests to a custom base URL.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
import uvicorn
from adapters import GatewayError, ModelRequest, Msg, make_adapter
from common import (
    EVIDENCE_ROOT,
    OFFICIAL_BASE_URL,
    STRUCTURED_PROMPT,
    SYSTEM_PROMPT,
    TOOLS,
    VARIANTS,
    Evidence,
    base_url_for,
    environment_info,
    md_table,
    model_for,
    provider_of,
    read_key,
    say,
    tool_args_valid,
    validate_answer,
)
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response, StreamingResponse
from starlette.routing import Route

UPSTREAM = {
    "anthropic": "https://api.anthropic.com",
    "openai": "https://api.openai.com",
    "google": "https://generativelanguage.googleapis.com",
}
FAULT_HEADER = "x-spk01-fault"
SLOW_S = 5.0
HOP_BY_HOP = {
    "host",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "content-length",
    FAULT_HEADER,
}


def proxy_base_url(variant: str, port: int) -> str:
    provider = provider_of(variant)
    suffix = "/v1" if provider == "openai" else ""
    return f"http://127.0.0.1:{port}/{provider}{suffix}"


# ---------------------------------------------------------------- canned faults (documented error formats)


def _google_429(quota_id: str) -> dict[str, Any]:
    return {
        "error": {
            "code": 429,
            "message": "You exceeded your current quota, please check your plan and billing details.",
            "status": "RESOURCE_EXHAUSTED",
            "details": [
                {
                    "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                    "violations": [
                        {
                            "quotaMetric": "generativelanguage.googleapis.com/generate_content_requests",
                            "quotaId": quota_id,
                        }
                    ],
                },
                {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "7s"},
            ],
        }
    }


def _anthropic_error(kind: str, message: str) -> dict[str, Any]:
    return {"type": "error", "error": {"type": kind, "message": message}}


def _openai_error(message: str, kind: str, code: str | None) -> dict[str, Any]:
    return {"error": {"message": message, "type": kind, "param": None, "code": code}}


def _google_error(status_code: int, status: str, message: str) -> dict[str, Any]:
    return {"error": {"code": status_code, "message": message, "status": status}}


ERROR_FAULTS: dict[str, dict[str, tuple[int, dict[str, Any], dict[str, str]]]] = {
    "rate_limit": {
        "anthropic": (
            429,
            _anthropic_error("rate_limit_error", "Request would exceed your rate limit."),
            {"retry-after": "7"},
        ),
        "openai": (
            429,
            _openai_error("Rate limit reached for requests per min (RPM).", "requests", "rate_limit_exceeded"),
            {"retry-after": "7"},
        ),
        "google": (429, _google_429("GenerateRequestsPerMinutePerProjectPerModel"), {}),
    },
    "quota": {
        "anthropic": (402, _anthropic_error("billing_error", "Your credit balance is too low."), {}),
        "openai": (
            429,
            _openai_error("You exceeded your current quota.", "insufficient_quota", "insufficient_quota"),
            {},
        ),
        "google": (429, _google_429("GenerateRequestsPerDayPerProjectPerModel"), {}),
    },
    "overloaded": {
        "anthropic": (529, _anthropic_error("overloaded_error", "Overloaded"), {}),
        "openai": (503, _openai_error("The server is overloaded, please try again later.", "server_error", None), {}),
        "google": (503, _google_error(503, "UNAVAILABLE", "The model is overloaded. Please try again later."), {}),
    },
    "server_error": {
        "anthropic": (500, _anthropic_error("api_error", "Internal server error"), {}),
        "openai": (
            500,
            _openai_error("The server had an error while processing your request.", "server_error", None),
            {},
        ),
        "google": (500, _google_error(500, "INTERNAL", "An internal error has occurred."), {}),
    },
    "gateway_timeout": {
        "anthropic": (504, _anthropic_error("timeout_error", "Request timed out"), {}),
        "openai": (504, _openai_error("Gateway timeout.", "server_error", None), {}),
        "google": (504, _google_error(504, "DEADLINE_EXCEEDED", "Deadline exceeded."), {}),
    },
    "context": {
        "anthropic": (
            400,
            _anthropic_error("invalid_request_error", "prompt is too long: 215000 tokens > 200000 maximum"),
            {},
        ),
        "openai": (
            400,
            _openai_error(
                "This model's maximum context length is 1047576 tokens. Your messages resulted in 1100000 tokens.",
                "invalid_request_error",
                "context_length_exceeded",
            ),
            {},
        ),
        "google": (
            400,
            _google_error(
                400, "INVALID_ARGUMENT", "The input token count (1100000) exceeds the maximum number of tokens allowed."
            ),
            {},
        ),
    },
    "forbidden": {
        "anthropic": (403, _anthropic_error("permission_error", "Your API key does not have permission."), {}),
        "openai": (
            403,
            _openai_error("Country, region, or territory not supported", "request_forbidden", "unsupported_country"),
            {},
        ),
        "google": (403, _google_error(403, "PERMISSION_DENIED", "Permission denied."), {}),
    },
}
VALID_ANSWER = {
    "topic": "evidence grounding",
    "findings": [
        {"claim": "Grounding claims reduces unsupported claims.", "reference_ids": ["R1"], "support": "supported"}
    ],
    "confidence": 0.8,
    "follow_up_question": None,
}
BAD_ANSWER = {"topic": 1, "findings": "none"}
SUCCESS_FAULTS = ("bad_schema", "refusal", "no_usage", "malformed")


def _success_body(provider: str, path: str, text: str | None, *, usage: bool) -> dict[str, Any]:
    """A 200 response in the provider's format; text None means a refusal."""
    if provider == "anthropic":
        body: dict[str, Any] = {
            "id": "msg_spk01",
            "type": "message",
            "role": "assistant",
            "model": "spk01-fake",
            "content": [] if text is None else [{"type": "text", "text": text}],
            "stop_reason": "refusal" if text is None else "end_turn",
            "stop_sequence": None,
        }
        if usage:
            body["usage"] = {"input_tokens": 11, "output_tokens": 7}
        return body
    if provider == "openai" and path.endswith("responses"):
        content = (
            [{"type": "refusal", "refusal": "I can't help with that."}]
            if text is None
            else [{"type": "output_text", "text": text, "annotations": []}]
        )
        body = {
            "id": "resp_spk01",
            "object": "response",
            "created_at": 0,
            "status": "completed",
            "model": "spk01-fake",
            "output": [
                {"type": "message", "id": "msg_spk01", "status": "completed", "role": "assistant", "content": content}
            ],
        }
        if usage:
            body["usage"] = {
                "input_tokens": 11,
                "output_tokens": 7,
                "total_tokens": 18,
                "input_tokens_details": {"cached_tokens": 0},
                "output_tokens_details": {"reasoning_tokens": 0},
            }
        return body
    if provider == "openai":
        message = {
            "role": "assistant",
            "content": text,
            "refusal": None if text is not None else "I can't help with that.",
        }
        body = {
            "id": "chatcmpl-spk01",
            "object": "chat.completion",
            "created": 0,
            "model": "spk01-fake",
            "choices": [{"index": 0, "message": message, "finish_reason": "stop", "logprobs": None}],
        }
        if usage:
            body["usage"] = {"prompt_tokens": 11, "completion_tokens": 7, "total_tokens": 18}
        return body
    candidate: dict[str, Any] = (
        {"finishReason": "SAFETY", "index": 0}
        if text is None
        else {"content": {"role": "model", "parts": [{"text": text}]}, "finishReason": "STOP", "index": 0}
    )
    body = {"candidates": [candidate], "modelVersion": "spk01-fake"}
    if usage:
        body["usageMetadata"] = {"promptTokenCount": 11, "candidatesTokenCount": 7, "totalTokenCount": 18}
    return body


def fault_response(provider: str, fault: str, path: str) -> Response:
    if fault in ERROR_FAULTS:
        status, body, headers = ERROR_FAULTS[fault][provider]
        return JSONResponse(body, status_code=status, headers=headers)
    if fault == "malformed":
        return Response("<html><body>upstream error page</body></html>", status_code=200, media_type="text/html")
    if fault == "bad_schema":
        return JSONResponse(_success_body(provider, path, json.dumps(BAD_ANSWER), usage=True))
    if fault == "refusal":
        return JSONResponse(_success_body(provider, path, None, usage=True))
    if fault == "no_usage":
        return JSONResponse(_success_body(provider, path, json.dumps(VALID_ANSWER), usage=False))
    return JSONResponse({"error": f"unknown fault {fault}"}, status_code=418)


# ---------------------------------------------------------------- proxy app


class Proxy:
    def __init__(self, upstream: dict[str, str] | None = None) -> None:
        self.upstream = upstream or UPSTREAM
        self.log: list[dict[str, Any]] = []
        self.client: httpx.AsyncClient | None = None

        @asynccontextmanager
        async def lifespan(_app: Starlette):  # type: ignore[no-untyped-def]
            self.client = httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=15.0))
            try:
                yield
            finally:
                await self.client.aclose()

        methods = ["GET", "POST", "PUT", "PATCH", "DELETE"]
        self.app = Starlette(routes=[Route("/{provider}/{path:path}", self.handle, methods=methods)], lifespan=lifespan)

    def _log(self, provider: str, method: str, path: str, status: int, start: float, size: int, mode: str) -> None:
        self.log.append(
            {
                "provider": provider,
                "method": method,
                "path": "/" + path,
                "status": status,
                "ms": round((time.perf_counter() - start) * 1000),
                "bytes": size,
                "mode": mode,
            }
        )

    async def handle(self, request: Request) -> Response:
        provider = request.path_params["provider"]
        path = request.path_params["path"]
        start = time.perf_counter()
        if provider not in self.upstream:
            return JSONResponse({"error": "unknown provider prefix"}, status_code=404)
        fault = request.headers.get(FAULT_HEADER)
        await request.body()
        if fault:
            if fault == "slow":  # answer late without calling upstream, so a client timeout costs nothing
                await asyncio.sleep(SLOW_S)
                response = JSONResponse(_success_body(provider, path, json.dumps(VALID_ANSWER), usage=True))
            else:
                response = fault_response(provider, fault, path)
            self._log(provider, request.method, path, response.status_code, start, len(response.body), f"fault:{fault}")
            return response
        assert self.client is not None
        headers = [(k, v) for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP]
        upstream_request = self.client.build_request(
            request.method,
            f"{self.upstream[provider]}/{path}",
            params=list(request.query_params.multi_items()),
            headers=headers,
            content=await request.body(),
        )
        try:
            upstream = await self.client.send(upstream_request, stream=True)
        except httpx.HTTPError as exc:
            self._log(provider, request.method, path, 502, start, 0, f"upstream-error:{type(exc).__name__}")
            return JSONResponse({"error": "upstream unreachable"}, status_code=502)
        out_headers = [(k, v) for k, v in upstream.headers.multi_items() if k.lower() not in HOP_BY_HOP]

        async def body() -> Any:
            size = 0
            try:
                async for chunk in upstream.aiter_raw():
                    size += len(chunk)
                    yield chunk
            finally:
                await upstream.aclose()
                self._log(provider, request.method, path, upstream.status_code, start, size, "forward")

        response = StreamingResponse(body(), status_code=upstream.status_code)
        response.raw_headers = [(k.encode("latin-1"), v.encode("latin-1")) for k, v in out_headers]
        return response


class ProxyServer:
    """The proxy on 127.0.0.1 in a background thread (its own event loop)."""

    def __init__(self, port: int = 0, upstream: dict[str, str] | None = None) -> None:
        self.proxy = Proxy(upstream)
        config = uvicorn.Config(self.proxy.app, host="127.0.0.1", port=port, log_level="warning", access_log=False)
        self.server = uvicorn.Server(config)
        self.thread = threading.Thread(target=self.server.run, daemon=True)
        self.port = port

    def __enter__(self) -> ProxyServer:
        self.thread.start()
        deadline = time.time() + 15
        while not self.server.started:
            if time.time() > deadline or not self.thread.is_alive():
                raise RuntimeError("proxy không khởi động được")
            time.sleep(0.05)
        self.port = self.server.servers[0].sockets[0].getsockname()[1]
        return self

    def __exit__(self, *exc: object) -> None:
        self.server.should_exit = True
        self.thread.join(timeout=10)


# ---------------------------------------------------------------- compare: official endpoint vs proxy


async def probe(variant: str, key: str, base_url: str | None) -> dict[str, Any]:
    """Same probes as capabilities.py, reduced to the comparable outcome of each."""
    provider = provider_of(variant)
    model = model_for(provider)
    adapter = make_adapter(variant, key, base_url=base_url)
    out: dict[str, Any] = {}
    from common import output_schema

    async def one(name: str, coro: Any) -> None:
        try:
            out[name] = await coro
        except GatewayError as exc:
            out[name] = {"ok": False, "error": exc.as_dict()}

    async def structured() -> dict[str, Any]:
        req = ModelRequest(
            model, [Msg("user", STRUCTURED_PROMPT)], SYSTEM_PROMPT, output_schema=output_schema("inline")
        )
        res = await adapter.generate(req)
        answer, problem = (
            validate_answer(res.structured) if res.structured is not None else (None, res.structured_error)
        )
        return {
            "ok": answer is not None,
            "problem": problem,
            "usage_fields": sorted(res.usage.raw),
            "stop": res.stop_reason,
        }

    async def tool_call() -> dict[str, Any]:
        req = ModelRequest(model, [Msg("user", "Look up reference R2 with get_reference.")], SYSTEM_PROMPT, tools=TOOLS)
        res = await adapter.generate(req)
        names = [c.name for c in res.tool_calls]
        valid = all(tool_args_valid(c.name, c.arguments) for c in res.tool_calls)
        return {
            "ok": bool(names) and valid,
            "tools": names,
            "usage_fields": sorted(res.usage.raw),
            "stop": res.stop_reason,
        }

    async def stream() -> dict[str, Any]:
        req = ModelRequest(model, [Msg("user", "In one sentence, why do claims need evidence?")], SYSTEM_PROMPT)
        res = await adapter.stream_text(req)
        return {
            "ok": res.chunks > 0 and bool(res.text.strip()),
            "chunks": res.chunks,
            "usage_present": not res.usage.no_data,
        }

    async def models() -> dict[str, Any]:
        names = await adapter.list_models()
        return {"ok": bool(names), "count": len(names), "has_model": any(model in n for n in names)}

    await one("structured", structured())
    await one("tool_call", tool_call())
    await one("stream", stream())
    await one("list_models", models())
    await adapter.aclose()
    return out


def comparable(result: dict[str, Any]) -> dict[str, Any]:
    keep = ("ok", "tools", "usage_fields", "usage_present", "has_model")
    return {probe: {k: v for k, v in data.items() if k in keep} for probe, data in result.items()}


def upstream_of(provider: str) -> str:
    """Where the local proxy forwards: the configured endpoint (SPK01_BASE_URL_*) or the official one, without the
    path the SDK adds itself (OpenAI's /v1)."""
    custom = base_url_for(provider)
    if not custom:
        return UPSTREAM[provider]
    return custom[: -len("/v1")] if provider == "openai" and custom.endswith("/v1") else custom


def mark(data: dict[str, Any] | None) -> str:
    if data is None:
        return "—"
    if data.get("ok"):
        return "đạt"
    error = data.get("error") or {}
    return f"không ({error.get('code')})" if error else "không"


async def compare(variants: list[str], ev: Evidence) -> list[list[Any]]:
    """Official endpoint, configured custom endpoint (when set) and the local proxy in front of the custom endpoint
    (or of the official one). Equivalence is checked between the endpoint the proxy forwards to and the proxy."""
    rows: list[list[Any]] = []
    upstream = {p: upstream_of(p) for p in UPSTREAM}
    with ProxyServer(upstream=upstream) as server:
        say(f"proxy http://127.0.0.1:{server.port}")
        for variant in variants:
            provider = provider_of(variant)
            key = read_key(provider)
            if key is None:
                ev.record(variant=variant, blocked="chờ key")
                rows.append([variant, "Bị chặn — chờ key", "", "", "", ""])
                continue
            custom = base_url_for(provider)
            official = await probe(variant, key, None)
            direct = await probe(variant, key, custom) if custom else official
            via_proxy_url = proxy_base_url(variant, server.port)
            before = len(server.proxy.log)
            proxied = await probe(variant, key, via_proxy_url)
            seen = server.proxy.log[before:]
            same = comparable(direct) == comparable(proxied)
            ev.record(
                variant=variant,
                model=model_for(provider),
                official_base_url=OFFICIAL_BASE_URL[provider],
                custom_base_url=custom,
                proxy_base_url=via_proxy_url.replace(str(server.port), "<port>"),
                official=official,
                custom=direct if custom else None,
                proxy=proxied,
                equivalent=same,
                proxy_requests=seen,
            )
            for name in official:
                rows.append(
                    [
                        variant,
                        name,
                        mark(official.get(name)),
                        mark(direct.get(name)) if custom else "—",
                        mark(proxied.get(name)),
                        "tương đương"
                        if comparable({name: direct.get(name, {})}) == comparable({name: proxied.get(name, {})})
                        else "KHÁC",
                    ]
                )
            paths = sorted({f"{r['method']} {r['path']} → {r['status']}" for r in seen})
            say(f"{variant}: tương đương={same}; proxy thấy {len(seen)} request: {paths}")
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    serve = sub.add_parser("serve")
    serve.add_argument("--port", type=int, default=8787)
    cmp_ = sub.add_parser("compare")
    cmp_.add_argument("--out", type=Path, default=EVIDENCE_ROOT / "base_url")
    cmp_.add_argument("--variants", nargs="*", default=list(VARIANTS), choices=VARIANTS)
    args = parser.parse_args()
    if args.cmd == "serve":
        say(f"proxy http://127.0.0.1:{args.port}/<anthropic|openai|google>/... → endpoint chính thức")
        uvicorn.run(Proxy().app, host="127.0.0.1", port=args.port, log_level="warning", access_log=False)
        return
    ev = Evidence(args.out)
    ev.write("environment.json", environment_info())
    rows = asyncio.run(compare(args.variants, ev))
    header = ["Adapter", "Phép thử", "Endpoint chính thức", "Cổng trung gian", "Proxy cục bộ", "So sánh (đích ↔ proxy)"]
    table = md_table(header, rows)
    ev.write("summary.md", table)
    ev.close()
    print(table)


if __name__ == "__main__":
    main()
