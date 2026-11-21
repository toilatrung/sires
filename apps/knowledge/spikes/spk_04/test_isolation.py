# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""PID-00027-AC02: retrieval returns no chunk of another account and no chunk outside the project scope.

For each test query, chunks with exactly the query vector (cosine distance 0) and the query words repeated are
planted where they must never come out:

- another account (whose scope rows even reuse this project's id);
- another account's chunk carrying the reference id of an in-scope reference;
- a Trusted reference not selected in the project;
- a selection Removed;
- a selection Active whose reference is Revoked;
- three Trusted references selected Active whose Source Document is not Indexed with the account's current model
  (`needs_reindex`, another embedding model, no `indexed_at`);
- the `references` / `appendix` regions of an in-scope reference.

One more planted chunk in an in-scope body is the positive control. Every vector plan of the spike is run through the
full hybrid retrieval as `sires_knowledge_app` (RLS on).

`test_isolation` builds the SMALL dataset in a fresh database (Testcontainers, or the server of SPK04_ADMIN_DSN).
`test_isolation_full_scale` runs on the measurement database named by SPK04_SCALE_DB, inside one transaction that is
rolled back, so the measured data stays untouched.
"""

from __future__ import annotations

import hashlib
import os
import secrets
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import asyncpg
import pytest

from sires_common.tenancy import Connection, create_pool, tenant_transaction
from sires_common.testing.fixtures import PostgresServer, ServiceDatabase

from .config import FULL, MODEL_SLUG, SMALL, VECTOR_TABLE, Scale
from .retrieval import Retrieval, VectorPlan, retrieve
from .schema import COPIES, drop_database, register_vector, service_database
from .seed import ACTOR, EXTRACTOR, seed
from .synth import Account, Project, Query, Synth

pytestmark = pytest.mark.anyio

PLANS = [
    VectorPlan.parse(p)
    for p in (
        "exact:vector",
        "exact:halfvec",
        "exact:vector_plain",
        "exact:halfvec_plain",
        "hnsw:vector:40",
        "hnsw:vector:200",
        "hnsw:vector:40:strict_order",
        "hnsw:vector:40:off",
        "hnsw:halfvec:40",
        "auto:vector:40",
    )
]
TRAP_QUERIES = 6
OTHER_ACCOUNT_TRAPS = ("other_account", "other_account_same_ref")

# Source Document states that keep a Trusted reference selected Active out of the scope (architecture 7.4: Indexed with
# the account's current embedding model). Each one gets a reference of its own.
OTHER_MODEL = "spk04_other_model"
INDEXED_AT = datetime(2026, 11, 19, tzinfo=UTC)
UNREADY: dict[str, tuple[str, bool, datetime | None]] = {  # kind → embedding_model, needs_reindex, indexed_at
    "needs_reindex": (MODEL_SLUG, True, INDEXED_AT),
    "other_model": (OTHER_MODEL, False, INDEXED_AT),
    "not_indexed": (MODEL_SLUG, False, None),
}


@dataclass(frozen=True, slots=True)
class Planted:
    query: Query
    traps: dict[str, UUID]  # kind → chunk id that must never come out
    positive: UUID  # in-scope body chunk that must come out first


def _new_id() -> UUID:
    return UUID(bytes=secrets.token_bytes(16), version=4)


async def _insert_chunk(
    conn: asyncpg.Connection[Any],
    account_id: UUID,
    ref_id: UUID,
    document_id: UUID,
    region: str,
    query: Query,
    text: str,
) -> UUID:
    """One chunk with the query's words and exactly the query vector, in the DDL table and every copy."""
    chunk_id = _new_id()
    await conn.execute(
        """INSERT INTO app.chunk (id, account_id, reference_id, source_document_id, chunk_key, page, paragraph,
                                  char_start, char_end, region)
           VALUES ($1, $2, $3, $4, $5, 999, 0, 0, $6, $7)""",
        chunk_id,
        account_id,
        ref_id,
        document_id,
        hashlib.sha256(chunk_id.bytes).digest(),
        len(text),
        region,
    )
    await conn.execute(
        "INSERT INTO app.chunk_text (chunk_id, account_id, reference_id, text) VALUES ($1, $2, $3, $4)",
        chunk_id,
        account_id,
        ref_id,
        text,
    )
    await conn.execute(
        f"INSERT INTO {VECTOR_TABLE} (chunk_id, account_id, reference_id, embedding) VALUES ($1, $2, $3, $4)",
        chunk_id,
        account_id,
        ref_id,
        query.vector,
    )
    for table, column_type, _ in COPIES.values():
        await conn.execute(
            f"""INSERT INTO {table} (chunk_id, account_id, reference_id, embedding)
                VALUES ($1, $2, $3, $4::vector::{column_type})""",
            chunk_id,
            account_id,
            ref_id,
            query.vector,
        )
    return chunk_id


async def _unready_reference(
    conn: asyncpg.Connection[Any], account: Account, project: Project, kind: str
) -> tuple[UUID, UUID]:
    """A Trusted reference selected Active in ``project`` whose Source Document is in state ``UNREADY[kind]``."""
    model, needs_reindex, indexed_at = UNREADY[kind]
    ref_id, document_id = _new_id(), _new_id()
    digest = hashlib.sha256(ref_id.bytes)
    await conn.execute(
        """INSERT INTO replica.reference_state (reference_id, account_id, approval_status, source_version)
           VALUES ($1, $2, 'Trusted', 1)""",
        ref_id,
        account.id,
    )
    await conn.execute(
        """INSERT INTO replica.project_reference_scope (project_id, reference_id, account_id, status, source_version)
           VALUES ($1, $2, $3, 'Active', 1)""",
        project.id,
        ref_id,
        account.id,
    )
    await conn.execute(
        """INSERT INTO app.source_document (id, account_id, reference_id, content_hash, file_ref, page_count,
                                            extracted_text_ref, embedding_model, extractor_version, needs_reindex,
                                            indexed_at, created_by)
           VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8, $9, $10, $11::jsonb)""",
        document_id,
        account.id,
        ref_id,
        digest.digest(),
        f"library/acct/{account.id}/pdf/{digest.hexdigest()}",
        f"knowledge/acct/{account.id}/text/{document_id}/",
        model,
        EXTRACTOR,
        needs_reindex,
        indexed_at,
        ACTOR,
    )
    return ref_id, document_id


async def _plant(
    conn: asyncpg.Connection[Any], synth: Synth, project: Project, query: Query, other: Account
) -> Planted:
    measured = synth.accounts[0]
    not_selected = next(
        j for j in reversed(measured.trusted_order) if j not in set(project.active) | set(project.removed)
    )
    targets: dict[str, tuple[Account, int, str]] = {
        "other_account": (other, other.projects[0].active[0], "body"),  # also listed under this project's id
        "not_selected": (measured, not_selected, "body"),
        "removed": (measured, project.removed[0], "body"),
        "revoked": (measured, project.revoked[0], "body"),
        "references_region": (measured, project.active[1], "references"),
        "appendix_region": (measured, project.active[1], "appendix"),
        "positive": (measured, project.active[0], "body"),
    }
    text = " ".join(query.text.split(" or ") * 5)
    ids: dict[str, UUID] = {}
    for kind, (account, ref, region) in targets.items():
        doc = synth.document(account.index, ref, with_text=False)
        ids[kind] = await _insert_chunk(
            conn, account.id, account.reference_ids[ref], doc.source_document_id, region, query, text
        )
    # Another account's chunk with the reference id of an in-scope reference: the reference filter lets it through,
    # only the account filter (and RLS) keeps it out.
    other_doc = synth.document(other.index, other.projects[0].active[0], with_text=False)
    ids["other_account_same_ref"] = await _insert_chunk(
        conn, other.id, measured.reference_ids[project.active[0]], other_doc.source_document_id, "body", query, text
    )
    await conn.execute(
        """INSERT INTO app.embedding_model_catalog (slug, provider, model, dimensions, table_name)
           VALUES ($1, 'openai', 'spk04-other', 1536, 'emb_spk04_other_model') ON CONFLICT (slug) DO NOTHING""",
        OTHER_MODEL,
    )
    for kind in UNREADY:
        ref_id, document_id = await _unready_reference(conn, measured, project, kind)
        ids[kind] = await _insert_chunk(conn, measured.id, ref_id, document_id, "body", query, text)
    positive = ids.pop("positive")
    return Planted(query, ids, positive)


def allowed_chunks(synth: Synth, project: Project) -> set[UUID]:
    """Body chunks of the project's Active ∩ Trusted ∩ Indexed references, from the generator (not from SQL)."""
    allowed: set[UUID] = set()
    for ref in project.active:
        doc = synth.document(0, ref, with_text=False)
        allowed.update(c for c, region in zip(doc.chunk_ids, doc.regions, strict=True) if region == "body")
    return allowed


def check(result: Retrieval, plan: VectorPlan, planted: Planted, allowed: set[UUID], scope: set[UUID]) -> None:
    returned = {
        "vector": [h.chunk_id for h in result.vector],
        "keyword": [h.chunk_id for h in result.keyword],
        "fused": [h.chunk_id for h in result.fused],
        "evidence": [UUID(str(e["id"])) for e in result.evidence],
    }
    assert set(result.scope) == scope, f"{plan.name}: phạm vi sai"
    for branch, ids in returned.items():
        leaked = set(ids) - allowed - {planted.positive}
        assert not leaked, f"{plan.name}/{branch}: lọt {len(leaked)} chunk ngoài phạm vi"
        for kind, trap in planted.traps.items():
            assert trap not in ids, f"{plan.name}/{branch}: lọt chunk bẫy {kind}"
    assert {h.reference_id for h in result.vector + result.keyword} <= scope
    assert len(returned["evidence"]) == len(returned["fused"])
    # Positive control: the planted in-scope chunk is the best keyword match and reaches the top 8, so the filters do
    # not empty the result. Only an exact scan guarantees it is also the nearest neighbour: HNSW is approximate and,
    # on the FULL dataset, misses this freshly inserted duplicate with `strict_order` (recall, not isolation).
    assert returned["keyword"][0] == planted.positive, f"{plan.name}: đối chứng dương thiếu ở nhánh từ khóa"
    assert planted.positive in returned["fused"], f"{plan.name}: đối chứng dương thiếu ở top 8"
    if plan.method == "exact":
        assert returned["vector"][0] == planted.positive, f"{plan.name}: đối chứng dương không đứng đầu nhánh vector"


async def _control_without_rls(conn: asyncpg.Connection[Any], planted: Planted) -> None:
    """The traps are real neighbours: without RLS and filters (owner, superuser) they come first.

    Exact scan (MATERIALIZED CTE): the HNSW index with default settings does not reliably return freshly inserted
    duplicates on the FULL dataset, which would make this control flaky rather than prove anything.
    """
    rows = await conn.fetch(
        f"""WITH d AS MATERIALIZED (SELECT chunk_id, embedding <=> $1 AS distance FROM {VECTOR_TABLE})
            SELECT chunk_id FROM d ORDER BY distance LIMIT 20""",
        planted.query.vector,
    )
    nearest = {r["chunk_id"] for r in rows}
    assert set(planted.traps.values()) | {planted.positive} <= nearest


async def _rls_only(conn: Connection, account: Account, planted: Planted) -> None:
    """Defense in depth: no account filter in the statement, RLS alone keeps other accounts out."""
    for table, column_type in [(VECTOR_TABLE, "vector"), *((t, c) for t, c, _ in COPIES.values())]:
        rows = await conn.fetch(
            f"SELECT chunk_id, account_id FROM {table} ORDER BY embedding <=> $1::vector::{column_type} LIMIT 50",
            planted.query.vector,
        )
        assert rows and {r["account_id"] for r in rows} == {account.id}
        assert not {planted.traps[kind] for kind in OTHER_ACCOUNT_TRAPS} & {r["chunk_id"] for r in rows}
    hits = await conn.fetch(
        "SELECT account_id FROM app.chunk_text WHERE tsv @@ websearch_to_tsquery('app.sires_simple', $1)",
        planted.query.text,
    )
    assert {r["account_id"] for r in hits} == {account.id}


# -- SMALL dataset in a fresh database ---------------------------------------------------------------------------------


@pytest.fixture(scope="module")
async def small_db(spk04_server: PostgresServer) -> AsyncIterator[ServiceDatabase]:
    db, _ = await seed(SMALL, spk04_server)
    try:
        yield db
    finally:
        await drop_database(spk04_server, db.name)


async def _plant_all(db: ServiceDatabase, synth: Synth, project: Project) -> list[Planted]:
    conn = await asyncpg.connect(db.owner_dsn)
    try:
        await register_vector(conn)
        async with conn.transaction():
            planted = [
                await _plant(conn, synth, project, synth.query(synth.accounts[0], project, 1000 + i), synth.accounts[1])
                for i in range(TRAP_QUERIES)
            ]
        for p in planted:
            await _control_without_rls(conn, p)
    finally:
        await conn.close()
    return planted


async def test_isolation(small_db: ServiceDatabase) -> None:
    """PID-00027-AC02 on the SMALL dataset: every plan, every trap query, nothing leaks."""
    synth = Synth(SMALL)
    measured = synth.accounts[0]
    project = next(p for p in measured.projects if p.size == 20)
    planted = await _plant_all(small_db, synth, project)
    allowed = allowed_chunks(synth, project) | {p.positive for p in planted}  # positives are in-scope body chunks
    scope = {measured.reference_ids[j] for j in project.active}
    pool = await create_pool(small_db.app_dsn, min_size=1, max_size=2, init=register_vector)
    try:
        for plan in PLANS:
            for p in planted:
                async with tenant_transaction(pool, measured.id) as conn:
                    result = await retrieve(conn, project.id, plan, p.query.vector, p.query.text)
                check(result, plan, p, allowed, scope)
        async with tenant_transaction(pool, measured.id) as conn:
            for p in planted:
                await _rls_only(conn, measured, p)
        async with pool.acquire() as conn:  # no app.account_id: RLS returns nothing (fail closed)
            for table in (
                VECTOR_TABLE,
                *(table for table, _, _ in COPIES.values()),
                "app.chunk",
                "app.chunk_text",
                "replica.project_reference_scope",
            ):
                assert await conn.fetchval(f"SELECT count(*) FROM {table}") == 0
    finally:
        await pool.close()


# -- FULL dataset of the measurement database (opt-in) -----------------------------------------------------------------


async def _full_scale(server: PostgresServer, name: str, scale: Scale, plans: Sequence[VectorPlan]) -> int:
    synth = Synth(scale)
    measured = synth.accounts[0]
    project = next(p for p in measured.projects if p.size == 500)
    allowed = allowed_chunks(synth, project)
    scope = {measured.reference_ids[j] for j in project.active}
    db = service_database(server, name)
    conn = await asyncpg.connect(db.owner_dsn)
    checked = 0
    try:
        await register_vector(conn)
        tx = conn.transaction()
        await tx.start()
        try:
            planted = [
                await _plant(conn, synth, project, synth.query(measured, project, 1000 + i), synth.accounts[1])
                for i in range(TRAP_QUERIES)
            ]
            for p in planted:
                await _control_without_rls(conn, p)
            allowed |= {p.positive for p in planted}
            await conn.execute("SET LOCAL ROLE sires_knowledge_app")
            await conn.execute("SELECT set_config('app.account_id', $1, true)", str(measured.id))
            for plan in plans:
                for p in planted:
                    await conn.execute("SAVEPOINT plan")  # SET LOCAL of a plan must not leak into the next one
                    result = await retrieve(conn, project.id, plan, p.query.vector, p.query.text)
                    await conn.execute("ROLLBACK TO SAVEPOINT plan")
                    check(result, plan, p, allowed, scope)
                    checked += 1
            for p in planted:
                await _rls_only(conn, measured, p)
        finally:
            await tx.rollback()
    finally:
        await conn.close()
    return checked


@pytest.mark.skipif(not os.environ.get("SPK04_SCALE_DB"), reason="SPK04_SCALE_DB chưa đặt (cơ sở dữ liệu đo FULL)")
async def test_isolation_full_scale(spk04_server: PostgresServer) -> None:
    """PID-00027-AC02 on the FULL measurement dataset (project of 500 references), rolled back afterwards."""
    checked = await _full_scale(spk04_server, os.environ["SPK04_SCALE_DB"], FULL, PLANS)
    assert checked == len(PLANS) * TRAP_QUERIES
