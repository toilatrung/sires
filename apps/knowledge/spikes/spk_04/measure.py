# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Measure filtered hybrid retrieval latency (p50/p95/p99) and recall for each vector plan and scope size.

    python -m spikes.spk_04.measure --manifest seed-manifest.json --projects 500 \\
        --plans exact:vector,hnsw:vector:100,hnsw:halfvec:100 --queries 100 --warmup 10 --out results.json

Each retrieval is one tenant transaction of role `sires_knowledge_app` (RLS on), timed end to end on the client
(BEGIN … COMMIT, asyncpg, query embedding excluded as in NFR-PERF-006). Plans are interleaved per query in rotating
order so cache warm-up and background load hit every plan alike. Recall@50 of the vector branch and the overlap of the
fused top 8 are computed against `exact:vector` on the same query. `--concurrency N` runs N clients per plan.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import platform
import re
import sys
import time
from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import asyncpg
import numpy as np

from sires_common.tenancy import create_pool, tenant_transaction
from sires_common.testing.fixtures import ServiceDatabase

from .config import SCALES, VECTOR_TABLE
from .retrieval import KEYWORD_SQL, VectorPlan, apply_settings, plan_settings, retrieve, vector_sql
from .schema import RELATIONS_SQL, register_vector, server_from_dsn, service_database
from .synth import Account, Project, Query, Synth

log = logging.getLogger("spk04.measure")

TRUTH = VectorPlan("exact", "vector")
SETTINGS = (
    "server_version",
    "shared_buffers",
    "effective_cache_size",
    "work_mem",
    "maintenance_work_mem",
    "jit",
    "max_parallel_workers_per_gather",
    "max_parallel_workers",
    "random_page_cost",
    "effective_io_concurrency",
    "hnsw.ef_search",
    "hnsw.iterative_scan",
    "hnsw.max_scan_tuples",
    "hnsw.scan_mem_multiplier",
)


def stats(values: Sequence[float]) -> dict[str, float]:
    a = np.asarray(values, dtype=np.float64)
    if a.size == 0:
        return {}
    p50, p95, p99 = np.percentile(a, [50, 95, 99])
    return {
        "n": int(a.size),
        "mean": float(a.mean()),
        "p50": float(p50),
        "p95": float(p95),
        "p99": float(p99),
        "max": float(a.max()),
    }


def machine() -> dict[str, Any]:
    info: dict[str, Any] = {"python": platform.python_version(), "kernel": platform.release(), "cpus": os.cpu_count()}
    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.startswith("model name"):
                info["cpu"] = line.split(":", 1)[1].strip()
                break
        mem = Path("/proc/meminfo").read_text().splitlines()[0].split()[1]
        info["mem_total_gib"] = round(int(mem) / 2**20, 1)
    except OSError:
        pass
    return info


def loadavg() -> str:
    try:
        return Path("/proc/loadavg").read_text().strip()
    except OSError:
        return "n/a"


async def environment(db: ServiceDatabase) -> dict[str, Any]:
    conn = await asyncpg.connect(db.owner_dsn)
    try:
        await conn.execute("SELECT '[1]'::vector")  # load pgvector so its settings exist
        env: dict[str, Any] = {
            "version": await conn.fetchval("SELECT version()"),
            "pgvector": await conn.fetchval("SELECT extversion FROM pg_extension WHERE extname = 'vector'"),
            "settings": {s: await conn.fetchval("SELECT current_setting($1, true)", s) for s in SETTINGS},
            "relations_mb": {r["name"]: round(r["bytes"] / 2**20, 1) for r in await conn.fetch(RELATIONS_SQL)},
        }
    finally:
        await conn.close()
    return env


def recall(found: Sequence[UUID], truth: Sequence[UUID]) -> float:
    return len(set(found) & set(truth)) / len(truth) if truth else 1.0


async def explain(db: ServiceDatabase, account: Account, project: Project, plan: VectorPlan, query: Query) -> str:
    """EXPLAIN (ANALYZE, BUFFERS) of the keyword and vector statements, same transaction settings as `retrieve`."""
    pool = await create_pool(db.app_dsn, min_size=1, max_size=1, init=register_vector)
    lines = [f"-- plan {plan.name}, project {project.label}, query {query.index} ({query.kind}): {query.text}"]
    common, vector_only = plan_settings(plan)
    try:
        async with tenant_transaction(pool, account.id) as conn:
            scope = [account.reference_ids[j] for j in project.active]
            await apply_settings(conn, common)
            lines.append("-- keyword branch")
            lines += [
                r[0] for r in await conn.fetch(f"EXPLAIN (ANALYZE, BUFFERS) {KEYWORD_SQL}", query.text, scope, 50)
            ]
            await apply_settings(conn, vector_only)
            lines.append("-- vector branch")
            sql = f"EXPLAIN (ANALYZE, BUFFERS) {vector_sql(plan, VECTOR_TABLE.split('.')[1])}"
            lines += [r[0] for r in await conn.fetch(sql, query.vector, scope, 50)]
    finally:
        await pool.close()
    return compact_plan("\n".join(lines))


_VECTOR_LITERAL = re.compile(r"'\[[-0-9.,e+]+\]'")
_UUID_ARRAY = re.compile(r"'\{[0-9a-f,-]+\}'")


def compact_plan(text: str) -> str:
    """Replace the inlined query vector and scope array of a custom plan by their size (keeps plans readable)."""
    text = _VECTOR_LITERAL.sub(lambda m: f"'[{m.group(0).count(',') + 1} số]'", text)
    return _UUID_ARRAY.sub(lambda m: f"'{{{m.group(0).count(',') + 1} uuid}}'", text)


async def run_project(
    db: ServiceDatabase,
    synth: Synth,
    project: Project,
    plans: Sequence[VectorPlan],
    queries: int,
    warmup: int,
    concurrency: int,
    first_query: int = 0,
) -> dict[str, Any]:
    account = synth.accounts[0]
    qs = [synth.query(account, project, first_query + i) for i in range(warmup + queries)]
    measured = qs[warmup:]
    pool = await create_pool(db.app_dsn, min_size=concurrency, max_size=concurrency, init=register_vector)
    samples: dict[str, list[dict[str, Any]]] = defaultdict(list)
    started_load = loadavg()
    started = time.perf_counter()
    try:

        async def one(plan: VectorPlan, q: Query) -> dict[str, Any]:
            t0 = time.perf_counter()
            async with tenant_transaction(pool, account.id) as conn:
                r = await retrieve(conn, project.id, plan, q.vector, q.text)
            total = (time.perf_counter() - t0) * 1e3
            return {
                "q": q.index,
                "kind": q.kind,
                "total": total,
                **r.timings_ms,
                "scope_n": len(r.scope),
                "vector_ids": [h.chunk_id for h in r.vector],
                "fused_ids": [h.chunk_id for h in r.fused],
                "vector_n": len(r.vector),
                "keyword_n": len(r.keyword),
            }

        for plan in plans:  # warm-up, not recorded
            for q in qs[:warmup]:
                await one(plan, q)
        truth: dict[int, dict[str, Any]] = {}
        if concurrency == 1:
            for i, q in enumerate(measured):
                for k in range(len(plans)):
                    plan = plans[(i + k) % len(plans)]
                    samples[plan.name].append(await one(plan, q))
                if TRUTH not in plans:
                    truth[q.index] = await one(TRUTH, q)
        else:
            for plan in plans:
                queue: asyncio.Queue[Query] = asyncio.Queue()
                for q in measured:
                    queue.put_nowait(q)

                async def worker(p: VectorPlan = plan, qq: asyncio.Queue[Query] = queue) -> None:
                    while not qq.empty():
                        samples[p.name].append(await one(p, qq.get_nowait()))

                t0 = time.perf_counter()
                await asyncio.gather(*(worker() for _ in range(concurrency)))
                samples[plan.name + "#wall"] = [{"total": (time.perf_counter() - t0) * 1e3}]
            for q in measured:
                truth[q.index] = await one(TRUTH, q)
    finally:
        await pool.close()
    for s in samples.get(TRUTH.name, []):
        truth.setdefault(s["q"], s)

    result: dict[str, Any] = {
        "project": project.label,
        "references": len(project.active),
        "load_before": started_load,
        "load_after": loadavg(),
        "elapsed_s": round(time.perf_counter() - started, 1),
        "plans": {},
    }
    for name, rows in samples.items():
        if name.endswith("#wall"):
            continue
        plan_result: dict[str, Any] = {
            stage: stats([r[stage] for r in rows]) for stage in ("total", "scope", "keyword", "vector", "fuse_evidence")
        }
        plan_result["total_by_kind"] = {
            kind: stats([r["total"] for r in rows if r["kind"] == kind]) for kind in sorted({r["kind"] for r in rows})
        }
        plan_result["keyword_by_kind"] = {
            kind: stats([r["keyword"] for r in rows if r["kind"] == kind]) for kind in sorted({r["kind"] for r in rows})
        }
        recalls = [recall(r["vector_ids"], truth[r["q"]]["vector_ids"]) for r in rows]
        overlaps = [recall(r["fused_ids"], truth[r["q"]]["fused_ids"]) for r in rows]
        plan_result["recall_at_50"] = {
            "mean": float(np.mean(recalls)),
            "min": float(np.min(recalls)),
            "p5": float(np.percentile(recalls, 5)),
        }
        plan_result["top8_overlap"] = {"mean": float(np.mean(overlaps)), "min": float(np.min(overlaps))}
        plan_result["underfilled"] = sum(1 for r in rows if r["vector_n"] < 50)
        plan_result["scope_references"] = rows[0]["scope_n"]
        plan_result["samples_total_ms"] = [round(r["total"], 2) for r in rows]
        if name + "#wall" in samples:
            wall = samples[name + "#wall"][0]["total"] / 1e3
            plan_result["throughput_qps"] = round(len(rows) / wall, 2)
        result["plans"][name] = plan_result
    return result


def markdown(results: list[dict[str, Any]], chunks: dict[str, int]) -> str:
    out = [
        "| Project (ref / chunk body) | Phương án | p50 ms | p95 ms | p99 ms | max ms | vector p95 | keyword p95 |"
        " recall@50 (TB / min) | top-8 trùng | thiếu < 50 |",
        "|" + " --- |" * 11,
    ]
    for res in results:
        for name, p in res["plans"].items():
            t, v, k = p["total"], p["vector"], p["keyword"]
            out.append(
                f"| {res['project']} ({res['references']} / {chunks.get(res['project'], '?')}) | `{name}` "
                f"| {t['p50']:.0f} | {t['p95']:.0f} | {t['p99']:.0f} | {t['max']:.0f} "
                f"| {v['p95']:.0f} | {k['p95']:.0f} "
                f"| {p['recall_at_50']['mean']:.3f} / {p['recall_at_50']['min']:.2f} | {p['top8_overlap']['mean']:.3f} "
                f"| {p['underfilled']} |"
            )
    return "\n".join(out) + "\n"


async def main_async(args: argparse.Namespace) -> None:
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    synth = Synth(SCALES[manifest["scale"]])
    db = service_database(server_from_dsn(args.admin_dsn), manifest["database"])
    plans = [VectorPlan.parse(p) for p in args.plans.split(",")]
    wanted = args.projects.split(",")
    projects = [p for p in synth.accounts[0].projects if p.label in wanted]
    report: dict[str, Any] = {
        "started": datetime.now(UTC).isoformat(timespec="seconds"),
        "note": args.note,
        "machine": machine(),
        "environment": await environment(db),
        "parameters": {
            "queries": args.queries,
            "warmup": args.warmup,
            "concurrency": args.concurrency,
            "plans": [p.name for p in plans],
            "scale": manifest["scale"],
            "seed": manifest["seed"],
        },
        "results": [],
    }
    plans_text: list[str] = []
    for project in projects:
        log.info("project %s: %d plans × %d queries", project.label, len(plans), args.queries)
        res = await run_project(
            db, synth, project, plans, args.queries, args.warmup, args.concurrency, args.first_query
        )
        report["results"].append(res)
        if args.explain:
            query = synth.query(synth.accounts[0], project, 0)
            for plan in plans:
                plans_text.append(await explain(db, synth.accounts[0], project, plan, query))
        log.info("project %s done in %.0f s (load %s)", project.label, res["elapsed_s"], res["load_after"])
    report["finished"] = datetime.now(UTC).isoformat(timespec="seconds")
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
    chunks = {p["label"]: p["body_chunks"] for p in manifest.get("projects", [])}
    table = markdown(report["results"], chunks)
    args.out.with_suffix(".md").write_text(table, encoding="utf-8")
    if plans_text:
        args.out.with_suffix(".explain.txt").write_text("\n\n".join(plans_text) + "\n", encoding="utf-8")
    sys.stdout.write(table)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--admin-dsn", default=os.environ.get("SPK04_ADMIN_DSN"), help="default: $SPK04_ADMIN_DSN")
    parser.add_argument("--plans", default="exact:vector,exact:halfvec,hnsw:vector:100,hnsw:halfvec:100")
    parser.add_argument("--projects", default="500")
    parser.add_argument("--queries", type=int, default=100)
    parser.add_argument("--warmup", type=int, default=10)
    parser.add_argument("--concurrency", type=int, default=1)
    parser.add_argument("--first-query", type=int, default=0, help="index of the first query (cold runs)")
    parser.add_argument("--note", default="")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--explain", action="store_true", help="EXPLAIN ANALYZE of query 0 → <out>.explain.txt")
    args = parser.parse_args()
    if not args.admin_dsn:
        parser.error("cần --admin-dsn hoặc SPK04_ADMIN_DSN")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
