# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S04 — behaviour of the DDL as sires_knowledge_app (and _system for case 4), on a database built by the revisions,
with pgvector (PID-00026-AC02).

Expectations come from knowledge.sql (RLS through app.enable_tenant_rls on app, replica and vec; trigger
chunk_text_tsv with app.sires_simple; indexing_job_natural_uq; REVOKE on embedding_model_catalog; ON DELETE CASCADE
of chunk, chunk_text and the vector table; vector(1536) with HNSW vector_cosine_ops) and from 00-common.sql
(grant_standard). Each group has a valid control case that goes through.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import asyncpg
import pytest
from migration_support import SERVICE_DB, upgrade

from sires_common.tenancy import Connection, Pool, create_pool, system_transaction, tenant_transaction, uuid7
from sires_common.testing.fixtures import PostgresServer, ServiceDatabase, create_service_database

pytestmark = pytest.mark.anyio

MODEL = "openai_text_embedding_3_small"
VECTORS = f"vec.emb_{MODEL}"
DIMENSIONS = 1536  # the sample row of the DDL catalog (DBQ-05 open); not a new number
ACTOR = json.dumps({"type": "system", "component": "knowledge"})

# Every table of knowledge.sql with an account_id, plus replica.project_state (app.create_replica_project_state()).
TENANT_TABLES = (
    "app.source_document",
    "app.indexing_job",
    "app.chunk",
    "app.chunk_text",
    "app.embedding_usage",
    "replica.project_state",
    "replica.reference_state",
    "replica.project_reference_scope",
    "replica.account_embedding",
    VECTORS,
)


def _index_scans(node: dict[str, Any]) -> list[str]:
    """Index names of every Index Scan node of an EXPLAIN (FORMAT JSON) plan."""
    found = [str(node["Index Name"])] if node.get("Node Type") == "Index Scan" else []
    for child in node.get("Plans", []):
        found += _index_scans(child)
    return found


def vector_text(seed: int) -> str:
    """A 1536-dimension vector in pgvector's text form; values are exact in float4, never all zero."""
    return "[" + ",".join(str(((i * 7 + seed) % 16 + 1) / 16) for i in range(DIMENSIONS)) + "]"


@dataclass(frozen=True, slots=True)
class Account:
    id: UUID
    project_id: UUID
    reference_id: UUID
    content_hash: bytes
    source_document_id: UUID
    chunk_id: UUID
    job_id: UUID


@dataclass(frozen=True, slots=True)
class Seeded:
    db: ServiceDatabase
    app: Pool
    system: Pool
    a: Account
    b: Account


def _account(name: str) -> Account:
    return Account(
        id=uuid7(),
        project_id=uuid7(),
        reference_id=uuid7(),
        content_hash=hashlib.sha256(name.encode()).digest(),
        source_document_id=uuid7(),
        chunk_id=uuid7(),
        job_id=uuid7(),
    )


async def _insert_chunk(conn: Connection, account: Account, chunk_id: UUID, text: str, vector: str) -> None:
    await conn.execute(
        "INSERT INTO app.chunk (id, account_id, reference_id, source_document_id, chunk_key, page, paragraph,"
        " char_start, char_end) VALUES ($1, $2, $3, $4, $5, 1, 0, 0, $6)",
        chunk_id, account.id, account.reference_id, account.source_document_id,
        hashlib.sha256(chunk_id.bytes).digest(), len(text),
    )
    await conn.execute(
        "INSERT INTO app.chunk_text (chunk_id, account_id, reference_id, text) VALUES ($1, $2, $3, $4)",
        chunk_id, account.id, account.reference_id, text,
    )
    await conn.execute(
        f"INSERT INTO {VECTORS} (chunk_id, account_id, reference_id, embedding) VALUES ($1, $2, $3, $4::text::vector)",
        chunk_id, account.id, account.reference_id, vector,
    )


async def _seed(app: Pool, system: Pool, account: Account, seed: int) -> None:
    # replica.* is written by consumers (_system); _app only reads it (grant_standard).
    async with system_transaction(system) as conn:
        await conn.execute(
            "INSERT INTO replica.project_state (project_id, account_id, status, source_version)"
            " VALUES ($1, $2, 'Active', 1)", account.project_id, account.id,
        )
        await conn.execute(
            "INSERT INTO replica.reference_state (reference_id, account_id, approval_status, source_version)"
            " VALUES ($1, $2, 'Trusted', 1)", account.reference_id, account.id,
        )
        await conn.execute(
            "INSERT INTO replica.project_reference_scope (project_id, reference_id, account_id, status,"
            " source_version) VALUES ($1, $2, $3, 'Active', 1)", account.project_id, account.reference_id, account.id,
        )
        await conn.execute(
            "INSERT INTO replica.account_embedding (account_id, provider_connection_id, embedding_model,"
            " source_version) VALUES ($1, $2, $3, 1)", account.id, uuid7(), MODEL,
        )
    # The account's own rows, written by _app in a transaction with app.account_id set to that account.
    async with tenant_transaction(app, account.id) as conn:
        await conn.execute(
            "INSERT INTO app.source_document (id, account_id, reference_id, content_hash, file_ref, page_count,"
            " embedding_model, extractor_version, created_by) VALUES ($1, $2, $3, $4, $5, 3, $6, 'test', $7::jsonb)",
            account.source_document_id, account.id, account.reference_id, account.content_hash,
            f"library/acct/{account.id}/pdf/{account.content_hash.hex()}", MODEL, ACTOR,
        )
        await conn.execute(
            "INSERT INTO app.indexing_job (id, account_id, reference_id, content_hash, embedding_model)"
            " VALUES ($1, $2, $3, $4, $5)",
            account.job_id, account.id, account.reference_id, account.content_hash, MODEL,
        )
        await conn.execute(
            "INSERT INTO app.embedding_usage (account_id, indexing_job_id, provider_connection_id, model,"
            " input_tokens, calls) VALUES ($1, $2, $3, 'text-embedding-3-small', 12, 1)",
            account.id, account.job_id, uuid7(),
        )
        await _insert_chunk(conn, account, account.chunk_id, "Phương pháp nghiên cứu định tính", vector_text(seed))


@pytest.fixture
async def seeded(sires_postgres: PostgresServer) -> AsyncIterator[Seeded]:
    """Database from the revisions (S01, S02), roles from the fixture (D4); one row per tenant table for each of
    the accounts A and B."""
    db = await create_service_database(sires_postgres, SERVICE_DB, [], finalize=False)
    await upgrade(db.owner_dsn)
    app = await create_pool(db.app_dsn)
    system = await create_pool(db.system_dsn)
    try:
        a, b = _account("A"), _account("B")
        await _seed(app, system, a, 1)
        await _seed(app, system, b, 2)
        yield Seeded(db, app, system, a, b)
    finally:
        await app.close()
        await system.close()


async def test_rls_blocks_cross_account(seeded: Seeded) -> None:
    """Case 1: with app.account_id = B, _app sees no row of A in app, replica and vec."""
    a, b = seeded.a, seeded.b
    async with tenant_transaction(seeded.app, b.id) as conn:
        for table in TENANT_TABLES:
            # Control: B sees exactly its own row.
            assert await conn.fetchval(f"SELECT count(*) FROM {table}") == 1, table
            assert await conn.fetchval(f"SELECT count(*) FROM {table} WHERE account_id = $1", b.id) == 1, table
            # A's row is invisible, even when asked for by account.
            assert await conn.fetchval(f"SELECT count(*) FROM {table} WHERE account_id = $1", a.id) == 0, table
        # Asked for by key as well.
        assert await conn.fetchval("SELECT count(*) FROM app.chunk_text WHERE chunk_id = $1", a.chunk_id) == 0
        assert await conn.fetchval(f"SELECT count(*) FROM {VECTORS} WHERE chunk_id = $1", a.chunk_id) == 0

    # Without app.account_id _app sees nothing at all.
    async with seeded.app.acquire() as conn:
        for table in TENANT_TABLES:
            assert await conn.fetchval(f"SELECT count(*) FROM {table}") == 0, table

    # A's rows are there (checked with BYPASSRLS).
    async with system_transaction(seeded.system) as conn:
        for table in TENANT_TABLES:
            assert await conn.fetchval(f"SELECT count(*) FROM {table} WHERE account_id = $1", a.id) == 1, table


async def test_chunk_text_tsv(seeded: Seeded) -> None:
    """Case 2: writing chunk_text.text computes tsv with app.sires_simple (unaccent + simple), on INSERT and on an
    UPDATE of text; a tsv sent by the writer is replaced."""
    a = seeded.a
    async with tenant_transaction(seeded.app, a.id) as conn:
        # Control: the seeded row has the tsv of its text; the accent-free query matches the accented text.
        row = await conn.fetchrow(
            "SELECT tsv = to_tsvector('app.sires_simple', text) AS same,"
            " tsv @@ to_tsquery('app.sires_simple', 'phuong & nghien & dinh') AS hit"
            " FROM app.chunk_text WHERE chunk_id = $1", a.chunk_id,
        )
        assert row is not None and row["same"] and row["hit"]

        chunk_id = uuid7()
        await conn.execute(
            "INSERT INTO app.chunk (id, account_id, reference_id, source_document_id, chunk_key, page, paragraph,"
            " char_start, char_end) VALUES ($1, $2, $3, $4, $5, 2, 1, 0, 40)",
            chunk_id, a.id, a.reference_id, a.source_document_id, hashlib.sha256(chunk_id.bytes).digest(),
        )
        await conn.execute(
            "INSERT INTO app.chunk_text (chunk_id, account_id, reference_id, text, tsv)"
            " VALUES ($1, $2, $3, 'Kết quả thực nghiệm', to_tsvector('simple', 'sai'))",
            chunk_id, a.id, a.reference_id,
        )
        assert await conn.fetchval("SELECT tsv::text FROM app.chunk_text WHERE chunk_id = $1", chunk_id) == (
            await conn.fetchval("SELECT to_tsvector('app.sires_simple', 'Kết quả thực nghiệm')::text")
        )
        assert await conn.fetchval("SELECT tsv::text FROM app.chunk_text WHERE chunk_id = $1", chunk_id) == (
            "'ket':1 'nghiem':4 'qua':2 'thuc':3"
        )

        await conn.execute("UPDATE app.chunk_text SET text = 'Thảo luận' WHERE chunk_id = $1", chunk_id)
        assert await conn.fetchval("SELECT tsv::text FROM app.chunk_text WHERE chunk_id = $1", chunk_id) == (
            "'luan':2 'thao':1"
        )


async def test_duplicate_indexing_job_rejected(seeded: Seeded) -> None:
    """Case 3 (DATA-IDEMP-005): a second job with the same (reference_id, content_hash, embedding_model, kind) is
    refused by indexing_job_natural_uq."""
    a = seeded.a
    with pytest.raises(asyncpg.UniqueViolationError) as refused:
        async with tenant_transaction(seeded.app, a.id) as conn:
            await conn.execute(
                "INSERT INTO app.indexing_job (account_id, reference_id, content_hash, embedding_model, kind)"
                " VALUES ($1, $2, $3, $4, 'index')", a.id, a.reference_id, a.content_hash, MODEL,
            )
    assert refused.value.constraint_name == "indexing_job_natural_uq"

    # Control: another kind, or another content hash, is another job.
    async with tenant_transaction(seeded.app, a.id) as conn:
        await conn.execute(
            "INSERT INTO app.indexing_job (account_id, reference_id, content_hash, embedding_model, kind)"
            " VALUES ($1, $2, $3, $4, 'reembed')", a.id, a.reference_id, a.content_hash, MODEL,
        )
        await conn.execute(
            "INSERT INTO app.indexing_job (account_id, reference_id, content_hash, embedding_model)"
            " VALUES ($1, $2, $3, $4)", a.id, a.reference_id, hashlib.sha256(b"A v2").digest(), MODEL,
        )
        assert await conn.fetchval("SELECT count(*) FROM app.indexing_job WHERE reference_id = $1", a.reference_id) == 3


async def test_catalog_read_only(seeded: Seeded) -> None:
    """Case 4: _app and _system cannot INSERT, UPDATE or DELETE app.embedding_model_catalog; both read it."""
    writes = (
        "INSERT INTO app.embedding_model_catalog (slug, provider, model, dimensions, table_name)"
        " VALUES ('google_text_embedding_005', 'google', 'text-embedding-005', 768, 'emb_google_text_embedding_005')",
        f"UPDATE app.embedding_model_catalog SET active = false WHERE slug = '{MODEL}'",
        f"DELETE FROM app.embedding_model_catalog WHERE slug = '{MODEL}'",
    )
    for role in ("app", "system"):
        for statement in writes:
            with pytest.raises(asyncpg.InsufficientPrivilegeError, match="permission denied"):
                if role == "app":
                    async with tenant_transaction(seeded.app, seeded.a.id) as conn:
                        await conn.execute(statement)
                else:
                    async with system_transaction(seeded.system) as conn:
                        await conn.execute(statement)

    # Control: both roles read the one sample row, unchanged.
    async with tenant_transaction(seeded.app, seeded.a.id) as conn:
        rows = await conn.fetch("SELECT slug, dimensions, table_name, active FROM app.embedding_model_catalog")
    assert [tuple(r.values()) for r in rows] == [(MODEL, DIMENSIONS, f"emb_{MODEL}", True)]
    async with system_transaction(seeded.system) as conn:
        assert await conn.fetchval("SELECT count(*) FROM app.embedding_model_catalog") == 1


async def test_source_document_delete_cascades(seeded: Seeded) -> None:
    """Case 5: deleting a source_document deletes its chunks, their chunk_text and their vectors."""
    a, b = seeded.a, seeded.b
    second_chunk = uuid7()
    async with tenant_transaction(seeded.app, a.id) as conn:
        await _insert_chunk(conn, a, second_chunk, "Đoạn thứ hai", vector_text(3))
        assert await conn.execute(
            "DELETE FROM app.source_document WHERE id = $1", a.source_document_id
        ) == "DELETE 1"

    async with system_transaction(seeded.system) as conn:
        for table, column, value in (
            ("app.chunk", "source_document_id", a.source_document_id),
            ("app.chunk_text", "chunk_id", a.chunk_id),
            ("app.chunk_text", "chunk_id", second_chunk),
            (VECTORS, "chunk_id", a.chunk_id),
            (VECTORS, "chunk_id", second_chunk),
        ):
            assert await conn.fetchval(f"SELECT count(*) FROM {table} WHERE {column} = $1", value) == 0, table
        # Control: B's document and everything under it are untouched.
        assert await conn.fetchval("SELECT count(*) FROM app.source_document WHERE id = $1", b.source_document_id) == 1
        assert await conn.fetchval("SELECT count(*) FROM app.chunk WHERE source_document_id = $1",
                                   b.source_document_id) == 1
        assert await conn.fetchval("SELECT count(*) FROM app.chunk_text WHERE chunk_id = $1", b.chunk_id) == 1
        assert await conn.fetchval(f"SELECT count(*) FROM {VECTORS} WHERE chunk_id = $1", b.chunk_id) == 1


async def test_vector_roundtrip_hnsw(seeded: Seeded) -> None:
    """Case 6: a 1536-dimension vector written by _app is read back by a cosine-distance query through the HNSW
    index (vector_cosine_ops)."""
    a = seeded.a
    chunk_id = uuid7()
    probe = vector_text(5)
    query = (
        f"SELECT chunk_id, embedding <=> $1::text::vector AS distance FROM {VECTORS}"
        " ORDER BY embedding <=> $1::text::vector LIMIT 1"
    )
    async with tenant_transaction(seeded.app, a.id) as conn:
        await _insert_chunk(conn, a, chunk_id, "Vector thử", probe)
        assert await conn.fetchval(
            f"SELECT vector_dims(embedding) FROM {VECTORS} WHERE chunk_id = $1", chunk_id
        ) == DIMENSIONS
        assert await conn.fetchval(
            f"SELECT embedding = $2::text::vector FROM {VECTORS} WHERE chunk_id = $1", chunk_id, probe
        )

        # With three rows the planner prefers a scan of the table, or of the (account_id, reference_id) index that the
        # RLS policy makes usable, followed by a sort; turning those off for this transaction leaves the ordered scan
        # of the HNSW index, which is the path being checked.
        for setting in ("enable_seqscan", "enable_bitmapscan", "enable_sort"):
            await conn.execute(f"SET LOCAL {setting} = off")
        plan = json.loads(await conn.fetchval(f"EXPLAIN (FORMAT JSON) {query}", probe))
        scans = _index_scans(plan[0]["Plan"])
        assert scans == [f"emb_{MODEL}_hnsw_idx"], scans
        row = await conn.fetchrow(query, probe)
    assert row is not None and row["chunk_id"] == chunk_id and row["distance"] == pytest.approx(0.0, abs=1e-6)

    # Control on the type: a vector of another dimension is refused by vector(1536).
    with pytest.raises(asyncpg.DataError, match="expected 1536 dimensions"):
        async with tenant_transaction(seeded.app, a.id) as conn:
            await _insert_chunk(conn, a, uuid7(), "Sai số chiều", "[1,2,3]")
