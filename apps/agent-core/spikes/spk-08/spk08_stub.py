# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""SPK-08 S02 — HTTP stub of one service for the context-read operations, with a configurable delay.

One process per service (workspace, planning, orchestration, research, manuscript), so the five reads of an
assembly hit five servers as in production. Method and path come from the contract (``spk08_contract``); every
payload is validated against the operation's 200 response schema before the server starts. The delay of each
request is ``median_ms * exp(sigma * N(0, 1))`` (log-normal; ``sigma = 0`` gives a fixed delay) and can be changed at
run time through ``POST /_spike/config`` — a spike-only route outside the contract.

    python apps/agent-core/spikes/spk-08/spk08_stub.py --service planning --port 18102 --agent writing
"""

import argparse
import asyncio
import json
import math
import random
from typing import Any

import spk08_contract as contract
import spk08_synthetic as synthetic
import uvicorn
from fastapi import FastAPI, Request, Response
from starlette.requests import ClientDisconnect


class Delay:
    def __init__(self, median_ms: float = 0.0, sigma: float = 0.0, seed: int = 8) -> None:
        self.configure(median_ms, sigma, seed)

    def configure(self, median_ms: float, sigma: float, seed: int) -> None:
        self.median_ms = median_ms
        self.sigma = sigma
        self._random = random.Random(seed)

    def sample_s(self) -> float:
        if self.median_ms <= 0:
            return 0.0
        return self.median_ms * math.exp(self.sigma * self._random.gauss(0.0, 1.0)) / 1000.0


def build_payloads(agent: str, profile: str) -> dict[str, Any]:
    """Contract-checked 200 payloads of the five operations for ``agent`` (``jsonschema.ValidationError`` if not)."""
    payloads = synthetic.Project(synthetic.load_profile(), profile).payloads(agent)
    for operation_id in contract.CONTEXT_OPERATIONS:
        contract.validate_response(operation_id, payloads[operation_id])
    return payloads


def _dump(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def create_app(service: str, payloads: dict[str, Any], delay: Delay) -> FastAPI:
    app = FastAPI(title=f"SPK-08 stub — {service}")
    operations = [contract.operation(op) for op, (svc, _) in contract.CONTEXT_OPERATIONS.items() if svc == service]
    cache: dict[tuple[str, ...], bytes] = {}

    def research(body: dict[str, Any]) -> bytes:
        ids = tuple(sorted(ref["id"] for ref in body.get("refs", [])))
        if ids not in cache:
            wanted = set(ids)
            entries = payloads["getResearchContextBundle"]["entries"]
            cache[ids] = _dump({"entries": [e for e in entries if e["ref"]["id"] in wanted]})
        return cache[ids]

    def manuscript(body: dict[str, Any]) -> bytes:
        paths = tuple(sorted(body.get("paths") or []))
        key = ("paths", *paths)
        if key not in cache:
            data = dict(payloads["getManuscriptContextBundle"])
            entries = data["bundle"]["entries"]
            data["bundle"] = {"entries": [e for e in entries if not paths or e["content"]["path"] in paths]}
            cache[key] = _dump(data)
        return cache[key]

    static = {op.operation_id: _dump(payloads[op.operation_id]) for op in operations}

    def route(operation_id: str) -> Any:
        async def handler(request: Request) -> Response:
            try:
                body = await request.json() if request.method == "POST" else {}
            except ClientDisconnect:  # the reader gave up (EC03 timeout)
                return Response(status_code=499)
            await asyncio.sleep(delay.sample_s())
            if operation_id == "getResearchContextBundle":
                content = research(body)
            elif operation_id == "getManuscriptContextBundle":
                content = manuscript(body)
            else:
                content = static[operation_id]
            return Response(content=content, media_type="application/json")

        return handler

    for op in operations:
        app.add_api_route(op.path, route(op.operation_id), methods=[op.method], name=op.operation_id)

    @app.post("/_spike/config")
    async def configure(body: dict[str, float]) -> dict[str, Any]:
        delay.configure(body.get("median_ms", 0.0), body.get("sigma", 0.0), int(body.get("seed", 8)))
        return {"service": service, "median_ms": delay.median_ms, "sigma": delay.sigma}

    @app.get("/_spike/ready")
    async def ready() -> dict[str, Any]:
        return {"service": service, "operations": [op.operation_id for op in operations],
                "bytes": {op.operation_id: len(static[op.operation_id]) for op in operations}}

    return app


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SPK-08 contract stub of one service")
    services = sorted({service for service, _ in contract.CONTEXT_OPERATIONS.values()})
    parser.add_argument("--service", required=True, choices=services)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--agent", default="writing", choices=synthetic.AGENTS)
    parser.add_argument("--profile", default="typical", choices=["typical", "ceiling"])
    args = parser.parse_args(argv)
    app = create_app(args.service, build_payloads(args.agent, args.profile), Delay())
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning", access_log=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
