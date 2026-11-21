# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""SPK-08 S02 — latency of reading context from five internal APIs in parallel (PID-00022-AC02, EC03).

Run from the repository root on Linux or WSL2 (spec 2.5), with the generated clients present
(``pnpm nx run @sires/contracts:generate-python``):

    python apps/agent-core/spikes/spk-08/read_latency.py --out agent/execution/PID-00022/data

Five stub processes (``spk08_stub``) serve the contract payloads of one agent's context. For each assumed delay
level the reader assembles the context ``--iterations`` times with the clients generated from the contracts
(``sires_common.generated``, PID-00007) and records the wall time of the whole read and of each operation:

* ``parallel``  — the five reads at once (research refs known from the work order);
* ``two_wave``  — planning, workspace, orchestration, manuscript at once, then research with the refs planning
  returned (prerequisite outputs), the dependency the contracts imply;
* ``sequential`` — one after another, for comparison.

``--ec03`` makes one service slower than the per-operation timeout and checks that the assembly fails as a whole
with the operation named, without returning a partial context (scope EC03). No threshold is asserted: the PO sets
latency targets after reading the numbers (ticket "Không gồm").
"""

import argparse
import asyncio
import csv
import io
import json
import os
import platform
import socket
import statistics
import subprocess
import sys
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from importlib import metadata
from pathlib import Path
from typing import Any
from uuid import UUID

import httpx
import spk08_contract as contract
import spk08_synthetic as synthetic

try:
    from sires_common.generated.manuscript import Client as ManuscriptClient
    from sires_common.generated.manuscript.api.manuscript_context import get_manuscript_context_bundle
    from sires_common.generated.manuscript.models import GetManuscriptContextBundleBody
    from sires_common.generated.orchestration import Client as OrchestrationClient
    from sires_common.generated.orchestration.api.shared_context import list_context_items_for_assembly
    from sires_common.generated.planning import Client as PlanningClient
    from sires_common.generated.planning.api.task_context import get_task_context_bundle
    from sires_common.generated.research import Client as ResearchClient
    from sires_common.generated.research.api.research_context import get_research_context_bundle
    from sires_common.generated.research.models import ContextBundleRequest
    from sires_common.generated.research.models import TypedRef as ResearchRef
    from sires_common.generated.workspace import Client as WorkspaceClient
    from sires_common.generated.workspace.api.project_context import get_project_context_bundle
except ImportError as error:  # pragma: no cover - message for a checkout without generated clients
    raise SystemExit(
        f"{error}: run `pnpm nx run @sires/contracts:generate-python` first (sires_common.generated, PID-00007)"
    ) from error

HERE = Path(__file__).resolve().parent
SERVICES = ["workspace", "planning", "orchestration", "research", "manuscript"]
# Layers each operation contributes to (spec 2.3; layers 1–3 are mandatory, PRD 14.2).
LAYERS = {"workspace": [6], "planning": [2, 3, 4], "orchestration": [3, 7], "research": [4, 5], "manuscript": [4]}


class ContextReadTimeout(Exception):
    def __init__(self, service: str, timeout_s: float) -> None:
        mandatory = any(layer <= 3 for layer in LAYERS[service])
        super().__init__(f"{service} did not answer within {timeout_s * 1000:.0f} ms (layers {LAYERS[service]}, "
                         f"{'mandatory' if mandatory else 'trimmable'})")
        self.service = service
        self.mandatory = mandatory


class ContextAssemblyFailed(Exception):
    """The whole read failed: no partial context is returned (EC03 expected behaviour)."""

    def __init__(self, causes: list[BaseException]) -> None:
        super().__init__("; ".join(str(cause) for cause in causes))
        self.causes = causes


@dataclass
class Reading:
    total_ms: float
    op_ms: dict[str, float]
    bytes: dict[str, int]
    entries: int


@dataclass
class Reader:
    """Reads the context of one Agent Run through the generated clients."""

    ports: dict[str, int]
    work: dict[str, Any]
    timeout_s: float
    clients: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        kinds = {"workspace": WorkspaceClient, "planning": PlanningClient, "orchestration": OrchestrationClient,
                 "research": ResearchClient, "manuscript": ManuscriptClient}
        for service, cls in kinds.items():
            self.clients[service] = cls(base_url=f"http://127.0.0.1:{self.ports[service]}",
                                        timeout=httpx.Timeout(60.0), raise_on_unexpected_status=True)
            # Build the httpx client now: done lazily it would load TLS settings inside the first timed read.
            self.clients[service].get_async_httpx_client()

    async def close(self) -> None:
        for client in self.clients.values():
            await client.get_async_httpx_client().aclose()

    async def _timed(self, service: str, call: Callable[[], Awaitable[Any]], reading: Reading) -> Any:
        started = time.perf_counter()
        try:
            async with asyncio.timeout(self.timeout_s):
                response = await call()
        except TimeoutError as error:
            raise ContextReadTimeout(service, self.timeout_s) from error
        if response.status_code != 200 or response.parsed is None:
            raise RuntimeError(f"{service}: HTTP {response.status_code}")
        reading.op_ms[service] = (time.perf_counter() - started) * 1000
        reading.bytes[service] = reading.bytes.get(service, 0) + len(response.content)
        reading.entries += len(getattr(getattr(response.parsed, "bundle", response.parsed), "entries", []))
        return response.parsed

    def _call(self, service: str, research_refs: list[dict[str, Any]] | None = None) -> Callable[[], Awaitable[Any]]:
        project = UUID(self.work["project_id"])
        client = self.clients[service]
        if service == "workspace":
            return lambda: get_project_context_bundle.asyncio_detailed(project, client=client)
        if service == "planning":
            task = UUID(self.work["task_id"])
            return lambda: get_task_context_bundle.asyncio_detailed(task, client=client)
        if service == "orchestration":
            task = UUID(self.work["task_id"])
            return lambda: list_context_items_for_assembly.asyncio_detailed(project, client=client, task_id=task)
        if service == "manuscript":
            body = GetManuscriptContextBundleBody(paths=self.work["manuscript_paths"])
            return lambda: get_manuscript_context_bundle.asyncio_detailed(project, client=client, body=body)
        refs = research_refs if research_refs is not None else self.work["research_refs"]
        batches = [refs[i:i + synthetic.RESEARCH_REFS_PER_CALL]
                   for i in range(0, len(refs), synthetic.RESEARCH_REFS_PER_CALL)]

        async def research() -> Any:
            responses = await asyncio.gather(*(
                get_research_context_bundle.asyncio_detailed(
                    project, client=client,
                    body=ContextBundleRequest(refs=[ResearchRef.from_dict(ref) for ref in batch]))
                for batch in batches))
            return _Merged(responses)

        return research

    async def _group(self, services: list[str], reading: Reading,
                     research_refs: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        tasks: dict[str, asyncio.Task[Any]] = {}
        try:
            async with asyncio.TaskGroup() as group:
                for service in services:
                    tasks[service] = group.create_task(self._timed(service, self._call(service, research_refs),
                                                                   reading))
        except ExceptionGroup as failure:  # TaskGroup cancelled the other reads: nothing partial is kept
            raise ContextAssemblyFailed(list(failure.exceptions)) from None
        return {service: task.result() for service, task in tasks.items()}

    async def read(self, mode: str) -> Reading:
        reading = Reading(0.0, {}, {}, 0)
        started = time.perf_counter()
        if mode == "parallel":
            await self._group(SERVICES, reading)
        elif mode == "two_wave":
            first = await self._group([s for s in SERVICES if s != "research"], reading)
            prerequisite = [ref.to_dict() for ref in first["planning"].prerequisite_outputs or []]
            known = {ref["id"] for ref in prerequisite}
            refs = prerequisite + [ref for ref in self.work["research_refs"] if ref["id"] not in known]
            await self._group(["research"], reading, refs)
        else:
            for service in SERVICES:
                await self._group([service], reading)
        reading.total_ms = (time.perf_counter() - started) * 1000
        return reading


class _Merged:
    """Research responses of several batches seen as one (status of the worst, content summed)."""

    def __init__(self, responses: list[Any]) -> None:
        self.status_code = max(r.status_code for r in responses)
        self.content = b"".join(r.content for r in responses)
        self.parsed = None if any(r.parsed is None for r in responses) else _Entries(responses)


class _Entries:
    def __init__(self, responses: list[Any]) -> None:
        self.entries = [entry for r in responses for entry in r.parsed.entries]


# -- stub processes -------------------------------------------------------------------------------------------


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port: int = sock.getsockname()[1]
        return port


class Stubs:
    """Starts one ``spk08_stub`` process per service and configures their delay."""

    def __init__(self, agent: str, profile: str) -> None:
        self.ports = {service: _free_port() for service in SERVICES}
        env = {**os.environ, "PYTHONPATH": os.pathsep.join(p for p in sys.path if p)}
        self.processes = [
            subprocess.Popen([sys.executable, str(HERE / "spk08_stub.py"), "--service", service, "--port", str(port),
                              "--agent", agent, "--profile", profile], env=env)
            for service, port in self.ports.items()
        ]
        self.http = httpx.Client(timeout=5.0)
        self.ready = self._wait()

    def _wait(self, timeout_s: float = 120.0) -> dict[str, Any]:
        deadline = time.monotonic() + timeout_s
        ready: dict[str, Any] = {}
        while len(ready) < len(SERVICES):
            for process in self.processes:
                if process.poll() is not None:
                    raise RuntimeError(f"stub exited with code {process.returncode}")
            for service, port in self.ports.items():
                if service not in ready:
                    try:
                        ready[service] = self.http.get(f"http://127.0.0.1:{port}/_spike/ready").json()
                    except httpx.HTTPError:
                        pass
            if time.monotonic() > deadline:
                raise TimeoutError(f"stubs not ready: {sorted(set(SERVICES) - set(ready))}")
            time.sleep(0.2)
        return ready

    def configure(self, median_ms: float, sigma: float, only: dict[str, float] | None = None) -> None:
        for index, (service, port) in enumerate(self.ports.items()):
            median = only.get(service, median_ms) if only is not None else median_ms
            self.http.post(f"http://127.0.0.1:{port}/_spike/config",
                           json={"median_ms": median, "sigma": sigma, "seed": 8 + index}).raise_for_status()

    def close(self) -> None:
        self.http.close()
        for process in self.processes:
            process.terminate()
        for process in self.processes:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()


# -- measurement ----------------------------------------------------------------------------------------------


def percentile(values: list[float], q: int) -> float:
    """Percentile ``q`` (1–99) by ``statistics.quantiles(method="inclusive")``."""
    if len(values) == 1:
        return values[0]
    return statistics.quantiles(values, n=100, method="inclusive")[q - 1]


def summarize(values: list[float]) -> dict[str, float]:
    return {"n": len(values), "min": min(values), "p50": statistics.median(values), "p95": percentile(values, 95),
            "p99": percentile(values, 99), "max": max(values), "mean": statistics.fmean(values)}


def work_order(agent: str, profile: str) -> dict[str, Any]:
    project = synthetic.Project(synthetic.load_profile(), profile)
    payloads = project.payloads(agent)
    return {"project_id": project.project_id, "task_id": project.task_id,
            "research_refs": payloads["_researchRefs"], "manuscript_paths": payloads["_manuscriptPaths"]}


async def scenario(stubs: Stubs, work: dict[str, Any], mode: str, median_ms: float, sigma: float,
                   iterations: int, warmup: int, timeout_s: float) -> list[Reading]:
    stubs.configure(median_ms, sigma)
    reader = Reader(stubs.ports, work, timeout_s)
    try:
        for _ in range(warmup):
            await reader.read(mode)
        return [await reader.read(mode) for _ in range(iterations)]
    finally:
        await reader.close()


async def ec03(stubs: Stubs, work: dict[str, Any], timeout_s: float, attempts: int) -> list[dict[str, Any]]:
    """One service answers after 3 × timeout; the assembly must fail as a whole and name it (EC03)."""
    rows = []
    for slow in SERVICES:
        stubs.configure(20.0, 0.0)
        reader = Reader(stubs.ports, work, timeout_s)
        await reader.read("parallel")  # warm connections before the slow service is configured
        stubs.configure(20.0, 0.0, only={slow: timeout_s * 3000})
        try:
            for attempt in range(attempts):
                started = time.perf_counter()
                outcome, partial, named = "succeeded", True, False
                try:
                    await reader.read("parallel")
                except ContextAssemblyFailed as failure:
                    outcome, partial = "failed", False
                    named = any(isinstance(c, ContextReadTimeout) and c.service == slow for c in failure.causes)
                    message = str(failure)
                else:
                    message = "no failure"
                rows.append({"slow_service": slow, "attempt": attempt + 1, "outcome": outcome,
                             "elapsed_ms": (time.perf_counter() - started) * 1000, "timeout_ms": timeout_s * 1000,
                             "partial_context_returned": partial, "service_named": named,
                             "mandatory": any(layer <= 3 for layer in LAYERS[slow]), "message": message})
        finally:
            await reader.close()
    stubs.configure(0.0, 0.0)
    return rows


def environment() -> dict[str, Any]:
    cpu = platform.processor()
    try:
        with open("/proc/cpuinfo", encoding="utf-8") as handle:
            cpu = next(line.split(":", 1)[1].strip() for line in handle if line.startswith("model name"))
    except (OSError, StopIteration):
        pass
    packages: dict[str, str | None] = {}
    for name in ("httpx", "fastapi", "uvicorn", "uvloop", "httptools", "attrs"):
        try:
            packages[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            packages[name] = None
    return {"date": time.strftime("%Y-%m-%d %H:%M:%S %z"), "platform": platform.platform(),
            "python": platform.python_version(), "cpu": cpu, "cpu_count": os.cpu_count(), "packages": packages,
            "transport": "HTTP/1.1 keep-alive over 127.0.0.1, one stub process per service"}


def markdown(summary: dict[str, Any]) -> str:
    env = summary["environment"]
    lines = [f"Môi trường: {env['platform']}, Python {env['python']}, {env['cpu']} ({env['cpu_count']} luồng); "
             f"{env['transport']}; httpx {env['packages']['httpx']}, uvicorn {env['packages']['uvicorn']}, "
             f"uvloop {env['packages']['uvloop']}. {summary['iterations']} lượt đo + {summary['warmup']} lượt khởi "
             f"động mỗi ô; percentile theo statistics.quantiles(method='inclusive').", ""]
    for payload in summary["payload_bytes"]:
        sizes = ", ".join(f"{k} {v / 1024:,.0f} KB" for k, v in summary["payload_bytes"][payload].items())
        lines.append(f"- Payload `{payload}` (agent {summary['agent']}): {sizes}")
    lines += ["", "| Payload | Cách đọc | σ | Trễ giả định (trung vị/API, ms) | p50 (ms) | p95 (ms) | p99 (ms) "
              "| max (ms) |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for row in summary["rows"]:
        s = row["total"]
        lines.append(f"| {row['payload']} | {row['mode']} | {row['sigma']} | {row['median_ms']:g} | {s['p50']:.1f} | "
                     f"{s['p95']:.1f} | {s['p99']:.1f} | {s['max']:.1f} |")
    lines += ["", "p95 theo operation ở chế độ `parallel` (ms):", "",
              "| Payload | σ | Trễ (ms) | " + " | ".join(SERVICES) + " |",
              "| --- | ---: | ---: | " + " | ".join(["---:"] * len(SERVICES)) + " |"]
    for row in summary["rows"]:
        if row["mode"] == "parallel":
            cells = [f"{row['ops'][s]['p95']:.1f}" for s in SERVICES]
            lines.append(f"| {row['payload']} | {row['sigma']} | {row['median_ms']:g} | " + " | ".join(cells) + " |")
    if summary.get("ec03"):
        lines += ["", f"EC03 — một service trả lời sau 3 × timeout ({summary['timeout_ms']:g} ms/operation):", "",
                  "| Service chậm | Lớp bắt buộc? | Lượt | Kết quả | Có context thiếu lớp? | Nêu đúng service? | "
                  "Thời gian tới lỗi (ms, trung vị) |", "| --- | --- | ---: | --- | --- | --- | ---: |"]
        for service in SERVICES:
            rows = [r for r in summary["ec03"] if r["slow_service"] == service]
            outcomes = ", ".join(sorted({r["outcome"] for r in rows}))
            partial = "có" if any(r["partial_context_returned"] for r in rows) else "không"
            named = "có" if all(r["service_named"] for r in rows) else "không"
            mandatory = "có" if rows[0]["mandatory"] else "không"
            elapsed = statistics.median(r["elapsed_ms"] for r in rows)
            cells = [service, mandatory, str(len(rows)), outcomes, partial, named, f"{elapsed:.1f}"]
            lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SPK-08 parallel context-read latency")
    parser.add_argument("--agent", default="writing", choices=synthetic.AGENTS,
                        help="whose context the stubs serve (writing uses all five operations)")
    parser.add_argument("--payloads", default="typical,ceiling")
    parser.add_argument("--modes", default="parallel,two_wave,sequential")
    parser.add_argument("--delays-ms", default="0,10,25,50,100", help="assumed median delay per API")
    parser.add_argument("--sigmas", default="0,0.5", help="log-normal spread of the delay (0 = fixed)")
    parser.add_argument("--iterations", type=int, default=200)
    parser.add_argument("--warmup", type=int, default=10)
    parser.add_argument("--timeout-ms", type=float, default=2000.0, help="per-operation timeout of the reader")
    parser.add_argument("--ec03", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--ec03-timeout-ms", type=float, default=500.0)
    parser.add_argument("--ec03-attempts", type=int, default=5)
    parser.add_argument("--out", type=Path, help="write read_latency.json, read_latency_raw.csv, read_latency.md here")
    args = parser.parse_args(argv)
    if isinstance(sys.stdout, io.TextIOWrapper):
        sys.stdout.reconfigure(encoding="utf-8")

    summary: dict[str, Any] = {"environment": environment(), "agent": args.agent, "iterations": args.iterations,
                               "warmup": args.warmup, "timeout_ms": args.ec03_timeout_ms, "payload_bytes": {},
                               "rows": [], "ec03": []}
    raw: list[dict[str, Any]] = []
    for payload in args.payloads.split(","):
        stubs = Stubs(args.agent, payload)
        try:
            summary["payload_bytes"][payload] = {
                op: size for info in stubs.ready.values() for op, size in info["bytes"].items()}
            work = work_order(args.agent, payload)
            for mode in args.modes.split(","):
                for sigma in (float(s) for s in args.sigmas.split(",")):
                    for median in (float(d) for d in args.delays_ms.split(",")):
                        readings = asyncio.run(scenario(stubs, work, mode, median, sigma, args.iterations,
                                                        args.warmup, args.timeout_ms / 1000))
                        row = {"payload": payload, "mode": mode, "sigma": sigma, "median_ms": median,
                               "total": summarize([r.total_ms for r in readings]),
                               "ops": {s: summarize([r.op_ms[s] for r in readings]) for s in SERVICES},
                               "entries": readings[0].entries}
                        summary["rows"].append(row)
                        sys.stderr.write(f"{payload} {mode} σ={sigma} d={median:g}: p50 {row['total']['p50']:.1f} "
                                         f"p95 {row['total']['p95']:.1f} ms\n")
                        raw += [{"payload": payload, "mode": mode, "sigma": sigma, "median_ms": median,
                                 "iteration": i, "total_ms": round(r.total_ms, 3),
                                 **{f"{s}_ms": round(r.op_ms[s], 3) for s in SERVICES},
                                 "bytes": sum(r.bytes.values())} for i, r in enumerate(readings)]
            if args.ec03 and payload == args.payloads.split(",")[0]:
                summary["ec03"] = asyncio.run(ec03(stubs, work, args.ec03_timeout_ms / 1000, args.ec03_attempts))
        finally:
            stubs.close()

    text = markdown(summary)
    if args.out:
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "read_latency.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), "utf-8")
        (args.out / "read_latency.md").write_text(text + "\n" + contract.markdown_footer(args.out), "utf-8")
        with (args.out / "read_latency_raw.csv").open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(raw[0]))
            writer.writeheader()
            writer.writerows(raw)
    sys.stdout.write(text + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
