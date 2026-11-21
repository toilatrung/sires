# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Load the synthetic dataset into a fresh knowledge database, then build indexes and statistics.

    python -m spikes.spk_04.seed --scale full --admin-dsn postgresql://postgres:…@127.0.0.1:5432/postgres \\
        --manifest seed-manifest.json

Rows follow docs/database/ddl/knowledge.sql: replica.reference_state, replica.project_reference_scope,
replica.project_state, replica.account_embedding, app.source_document, app.chunk, app.chunk_text (tsvector filled by
the DDL trigger) and vec.emb_openai_text_embedding_3_small, plus the spike-only halfvec copy.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import os
import time
from collections.abc import Iterable, Sequence
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import asyncpg

from sires_common.testing.fixtures import PostgresServer, ServiceDatabase

from .config import HALFVEC_HNSW_INDEX, MODEL_SLUG, SCALES, Scale
from .schema import (
    COPIES,
    DEFERRED_INDEXES,
    HALFVEC_HNSW,
    RELATIONS_SQL,
    copy_table_sql,
    create_database,
    ddl_index_statement,
    fill_copy_sql,
    register_vector,
    server_from_dsn,
    service_database,
)
from .synth import Account, Document, Synth

log = logging.getLogger("spk04.seed")

ACTOR = json.dumps({"type": "system", "component": "spk04-seed"})
EXTRACTOR = "pdfium+plumber@1"
BATCH_DOCUMENTS = 100


@dataclass(slots=True)
class SeedResult:
    database: str
    scale: str
    seed: int
    timings_s: dict[str, float] = field(default_factory=dict)
    counts: dict[str, Any] = field(default_factory=dict)
    sizes_mb: dict[str, float] = field(default_factory=dict)
    projects: list[dict[str, Any]] = field(default_factory=list)


def _scope_rows(account: Account, cross: Sequence[Account]) -> list[tuple[Any, ...]]:
    rows: list[tuple[Any, ...]] = []
    for project in account.projects:
        refs = account.reference_ids
        for status, indexes in (
            ("Active", project.active),
            ("Removed", project.removed),
            ("Active", project.revoked),
            ("Active", project.unindexed),
        ):
            rows.extend((project.id, refs[j], account.id, status, 1) for j in indexes)
    # Adversarial rows: another account lists its own references under this account's project ids. Neither RLS nor
    # the account filter of the scope query may let them in.
    for other in cross:
        own = other.projects[0].active[:3]
        for project in account.projects:
            rows.extend((project.id, other.reference_ids[j], other.id, "Active", 1) for j in own)
    return rows


def _document_rows(account: Account, doc: Document) -> tuple[list[tuple[Any, ...]], ...]:
    ref_id = account.reference_ids[doc.reference]
    sd = (
        doc.source_document_id,
        account.id,
        ref_id,
        hashlib.sha256(ref_id.bytes).digest(),
        f"library/acct/{account.id}/pdf/{hashlib.sha256(ref_id.bytes).hexdigest()}",
        max(1, len(doc.chunk_ids) // 2),
        f"knowledge/acct/{account.id}/text/{doc.source_document_id}/",
        MODEL_SLUG,
        EXTRACTOR,
        datetime.fromtimestamp(doc.ingested_ms / 1000, tz=UTC),
        ACTOR,
    )
    chunks, texts, vectors = [], [], []
    for i, chunk_id in enumerate(doc.chunk_ids):
        page, paragraph, start = 1 + i // 3, i % 3, (i % 3) * 4_000
        text = doc.texts[i] if doc.texts else ""
        key = hashlib.sha256(f"{doc.source_document_id}|{page}|{paragraph}|{start}".encode()).digest()
        chunks.append(
            (
                chunk_id,
                account.id,
                ref_id,
                doc.source_document_id,
                key,
                page,
                paragraph,
                start,
                start + max(1, len(text)),
                doc.regions[i],
                int(len(text.split()) * 1.3),
            )
        )
        texts.append((chunk_id, account.id, ref_id, text))
        vectors.append((chunk_id, account.id, ref_id, doc.vectors[i]))
    return [sd], chunks, texts, vectors


async def _copy(conn: asyncpg.Connection[Any], table: str, columns: Sequence[str], rows: Iterable[Any]) -> None:
    schema, name = table.split(".")
    await conn.copy_records_to_table(name, schema_name=schema, columns=list(columns), records=rows)


SD_COLUMNS = (
    "id",
    "account_id",
    "reference_id",
    "content_hash",
    "file_ref",
    "page_count",
    "extracted_text_ref",
    "embedding_model",
    "extractor_version",
    "indexed_at",
    "created_by",
)
CHUNK_COLUMNS = (
    "id",
    "account_id",
    "reference_id",
    "source_document_id",
    "chunk_key",
    "page",
    "paragraph",
    "char_start",
    "char_end",
    "region",
    "token_count",
)


async def load(conn: asyncpg.Connection[Any], synth: Synth) -> dict[str, float]:
    timings: dict[str, float] = {}
    accounts = synth.accounts
    started = time.perf_counter()
    async with conn.transaction():
        await _copy(
            conn,
            "replica.account_embedding",
            ("account_id", "embedding_model", "source_version"),
            [(a.id, MODEL_SLUG, 1) for a in accounts],
        )
        await _copy(
            conn,
            "replica.reference_state",
            ("reference_id", "account_id", "approval_status", "source_version"),
            [
                (ref, a.id, "Revoked" if j in a.revoked else "Trusted", 1)
                for a in accounts
                for j, ref in enumerate(a.reference_ids)
            ],
        )
        await _copy(
            conn,
            "replica.project_state",
            ("project_id", "account_id", "status", "source_version"),
            [(p.id, a.id, "Active", 1) for a in accounts for p in a.projects],
        )
        await _copy(
            conn,
            "replica.project_reference_scope",
            ("project_id", "reference_id", "account_id", "status", "source_version"),
            [row for a in accounts for row in _scope_rows(a, [b for b in accounts if b is not a])],
        )
    timings["replica"] = time.perf_counter() - started

    started = time.perf_counter()
    for account in accounts:
        for first in range(0, synth.scale.documents_per_account, BATCH_DOCUMENTS):
            last = min(first + BATCH_DOCUMENTS, synth.scale.documents_per_account)
            batch = [_document_rows(account, synth.document(account.index, j)) for j in range(first, last)]
            async with conn.transaction():
                await _copy(conn, "app.source_document", SD_COLUMNS, [r for b in batch for r in b[0]])
                await _copy(conn, "app.chunk", CHUNK_COLUMNS, [r for b in batch for r in b[1]])
                await _copy(
                    conn,
                    "app.chunk_text",
                    ("chunk_id", "account_id", "reference_id", "text"),
                    [r for b in batch for r in b[2]],
                )
                await _copy(
                    conn,
                    "vec.emb_openai_text_embedding_3_small",
                    ("chunk_id", "account_id", "reference_id", "embedding"),
                    [r for b in batch for r in b[3]],
                )
            log.info("account %d: %d/%d documents", account.index, last, synth.scale.documents_per_account)
    timings["documents"] = time.perf_counter() - started
    return timings


async def build_indexes(conn: asyncpg.Connection[Any], maintenance_work_mem: str) -> dict[str, float]:
    timings: dict[str, float] = {}
    await conn.execute(f"SET maintenance_work_mem = '{maintenance_work_mem}'")
    await conn.execute("SET max_parallel_maintenance_workers = 7")
    steps = [(f"copy_{kind}", fill_copy_sql(table, column_type)) for kind, (table, column_type, _) in COPIES.items()]
    steps += [(name, ddl_index_statement(name)) for name in DEFERRED_INDEXES]
    steps.append((HALFVEC_HNSW_INDEX, HALFVEC_HNSW))
    for name, sql in steps:
        started = time.perf_counter()
        await conn.execute(sql)
        timings[name] = time.perf_counter() - started
        log.info("%s: %.1f s", name, timings[name])
    started = time.perf_counter()
    await conn.execute("VACUUM (ANALYZE)")
    await conn.execute("CHECKPOINT")
    timings["vacuum_analyze"] = time.perf_counter() - started
    return timings


async def describe(conn: asyncpg.Connection[Any], synth: Synth, result: SeedResult) -> None:
    for table in (
        "replica.reference_state",
        "replica.project_reference_scope",
        "app.source_document",
        "app.chunk",
        "app.chunk_text",
        "vec.emb_openai_text_embedding_3_small",
        *(table for table, _, _ in COPIES.values()),
    ):
        result.counts[table] = await conn.fetchval(f"SELECT count(*) FROM {table}")
    result.counts["chunks_per_account"] = {
        str(r["account_id"]): r["n"]
        for r in await conn.fetch("SELECT account_id, count(*) AS n FROM app.chunk GROUP BY 1 ORDER BY 1")
    }
    for r in await conn.fetch(RELATIONS_SQL):
        result.sizes_mb[r["name"]] = round(r["bytes"] / 2**20, 1)
    measured = synth.accounts[0]
    for project in measured.projects:
        refs = [measured.reference_ids[j] for j in project.active]
        chunks = await conn.fetchval(
            """SELECT count(*) FROM vec.emb_openai_text_embedding_3_small v JOIN app.chunk c ON c.id = v.chunk_id
               WHERE v.account_id = $1 AND v.reference_id = ANY($2::uuid[]) AND c.region = 'body'""",
            measured.id,
            refs,
        )
        result.projects.append(
            {
                "label": project.label,
                "id": str(project.id),
                "references": len(project.active),
                "body_chunks": chunks,
                "removed": len(project.removed),
                "revoked": len(project.revoked),
                "unindexed": len(project.unindexed),
            }
        )


async def seed(
    scale: Scale, server: PostgresServer, *, maintenance_work_mem: str = "512MB"
) -> tuple[ServiceDatabase, SeedResult]:
    synth = Synth(scale)
    db = await create_database(server)
    result = SeedResult(database=db.name, scale=scale.name, seed=scale.seed)
    conn = await asyncpg.connect(db.owner_dsn)
    try:
        await register_vector(conn)
        result.timings_s.update(await load(conn, synth))
        result.timings_s.update(await build_indexes(conn, maintenance_work_mem))
        await describe(conn, synth, result)
    finally:
        await conn.close()
    return db, result


async def extend(server: PostgresServer, manifest: dict[str, Any]) -> dict[str, Any]:
    """Add the copies missing from an existing measurement database (seeded before they existed), then describe it
    again. The DDL tables and their data are not touched."""
    synth = Synth(SCALES[manifest["scale"]])
    db = service_database(server, manifest["database"])
    result = SeedResult(database=db.name, scale=manifest["scale"], seed=manifest["seed"])
    result.timings_s.update(manifest.get("timings_s", {}))
    conn = await asyncpg.connect(db.owner_dsn)
    try:
        for kind, (table, column_type, storage) in COPIES.items():
            if await conn.fetchval("SELECT to_regclass($1) IS NOT NULL", table):
                continue
            started = time.perf_counter()
            await conn.execute(copy_table_sql(table, column_type, storage) + fill_copy_sql(table, column_type))
            await conn.execute(f"VACUUM (ANALYZE) {table}")
            result.timings_s[f"copy_{kind}"] = time.perf_counter() - started
            log.info("copy_%s: %.1f s", kind, result.timings_s[f"copy_{kind}"])
        await conn.execute("CHECKPOINT")
        await describe(conn, synth, result)
    finally:
        await conn.close()
    return asdict(result)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--scale", choices=sorted(SCALES), default="full")
    parser.add_argument("--admin-dsn", default=os.environ.get("SPK04_ADMIN_DSN"), help="default: $SPK04_ADMIN_DSN")
    parser.add_argument("--maintenance-work-mem", default="2560MB", help="for the index builds (HNSW in memory)")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--extend", action="store_true", help="add missing spike copies to the manifest database")
    args = parser.parse_args()
    if not args.admin_dsn:
        parser.error("cần --admin-dsn hoặc SPK04_ADMIN_DSN")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    server = server_from_dsn(args.admin_dsn)
    if args.extend:
        data = asyncio.run(extend(server, json.loads(args.manifest.read_text(encoding="utf-8"))))
    else:
        _, result = asyncio.run(seed(SCALES[args.scale], server, maintenance_work_mem=args.maintenance_work_mem))
        data = asdict(result)
    args.manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log.info("database %s ready; manifest %s", data["database"], args.manifest)


if __name__ == "__main__":
    main()
