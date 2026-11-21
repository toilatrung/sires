# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Filtered hybrid retrieval as in architecture 7.4 and database 7.5, with interchangeable vector plans.

One call runs, inside the caller's tenant transaction (`app.account_id` set, role `sires_knowledge_app`, RLS on):
scope from the read-only replicas (Active selection ∩ Trusted reference) → keyword branch (full-text top 50) → vector
branch (cosine top 50, plan under test) → Reciprocal Rank Fusion (k = 60), at most 3 chunks per reference, top 8 →
evidence rows (text and position). The scope never comes from the caller's arguments other than the project id.
"""

from __future__ import annotations

import re
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Literal
from uuid import UUID

import numpy as np
import numpy.typing as npt

from sires_common.tenancy import Connection

from .config import DIM, HALFVEC_PLAIN_TABLE, HALFVEC_TABLE, VECTOR_PLAIN_TABLE

Method = Literal["exact", "hnsw", "auto"]
Storage = Literal["vector", "halfvec", "vector_plain", "halfvec_plain"]
Iterative = Literal["off", "relaxed_order", "strict_order"]

VECTOR_TOP, KEYWORD_TOP, RRF_K, PER_REFERENCE_CAP, TOP_K = 50, 50, 60, 3, 8  # RetrievalConfig rc-1 (7.8)
_TABLE = re.compile(r"^emb_[a-z0-9_]+$")
# Stored copies read by the exact variants other than "vector" (the DDL table).
_EXACT_COPIES = {"halfvec": HALFVEC_TABLE, "vector_plain": VECTOR_PLAIN_TABLE, "halfvec_plain": HALFVEC_PLAIN_TABLE}


@dataclass(frozen=True, slots=True)
class VectorPlan:
    """How the vector branch reads the vectors.

    `exact` computes the distance for every in-scope chunk (MATERIALIZED CTE: the HNSW index cannot be used) and sorts;
    `hnsw` forces the HNSW index (sorting is disabled for that statement) with `hnsw.ef_search` and
    `hnsw.iterative_scan`; `auto` sets the same HNSW options and lets the planner choose. `halfvec` reads the stored
    halfvec copy (exact) or the HNSW index on the halfvec expression of the DDL table (hnsw). `vector_plain` and
    `halfvec_plain` (exact only) read copies stored with STORAGE PLAIN, i.e. inline in the heap row instead of TOAST.
    """

    method: Method
    storage: Storage = "vector"
    ef_search: int = 40
    iterative: Iterative = "relaxed_order"
    max_scan_tuples: int = 20_000

    @property
    def name(self) -> str:
        if self.method == "exact":
            return f"exact/{self.storage}"
        mode = {"off": "off", "relaxed_order": "relaxed", "strict_order": "strict"}[self.iterative]
        return f"{self.method}/{self.storage}/ef{self.ef_search}/{mode}"

    @classmethod
    def parse(cls, spec: str) -> VectorPlan:
        """`exact:vector`, `exact:halfvec`, `hnsw:vector:100:relaxed_order`, `auto:vector:100`…"""
        parts = spec.split(":")
        method, storage = parts[0], parts[1] if len(parts) > 1 else "vector"
        if method not in ("exact", "hnsw", "auto") or storage not in (
            "vector",
            "halfvec",
            "vector_plain",
            "halfvec_plain",
        ):
            raise ValueError(f"phương án không hợp lệ: {spec}")
        if method != "exact" and storage.endswith("_plain"):
            raise ValueError(f"{storage} chỉ dùng với exact: {spec}")
        plan = cls(method, storage)  # type: ignore[arg-type]
        if len(parts) > 2:
            plan = cls(plan.method, plan.storage, ef_search=int(parts[2]))
        if len(parts) > 3:
            if parts[3] not in ("off", "relaxed_order", "strict_order"):
                raise ValueError(f"hnsw.iterative_scan không hợp lệ: {parts[3]}")
            plan = cls(plan.method, plan.storage, plan.ef_search, parts[3])  # type: ignore[arg-type]
        return plan


@dataclass(frozen=True, slots=True)
class Hit:
    chunk_id: UUID
    reference_id: UUID
    score: float  # distance (vector), rank (keyword) or RRF score (fused)


@dataclass(slots=True)
class Retrieval:
    scope: list[UUID]
    vector: list[Hit]
    keyword: list[Hit]
    fused: list[Hit]
    evidence: list[dict[str, object]]
    timings_ms: dict[str, float] = field(default_factory=dict)


# Active selection ∩ Trusted reference ∩ indexed with the account's current embedding model (architecture 7.4, 7.7).
SCOPE_SQL = """
SELECT s.reference_id
FROM replica.project_reference_scope s
JOIN replica.reference_state r ON r.reference_id = s.reference_id AND r.account_id = s.account_id
JOIN app.source_document d ON d.reference_id = s.reference_id AND d.account_id = s.account_id
JOIN replica.account_embedding e ON e.account_id = s.account_id AND e.embedding_model = d.embedding_model
WHERE s.account_id = app.current_account_id() AND s.project_id = $1
  AND s.status = 'Active' AND r.approval_status = 'Trusted'
  AND d.indexed_at IS NOT NULL AND NOT d.needs_reindex
"""

MODEL_SQL = """
SELECT c.table_name
FROM replica.account_embedding e JOIN app.embedding_model_catalog c ON c.slug = e.embedding_model
WHERE e.account_id = app.current_account_id() AND c.active
"""

KEYWORD_SQL = """
SELECT t.chunk_id, t.reference_id, ts_rank_cd(t.tsv, q) AS rank
FROM app.chunk_text t
JOIN app.chunk c ON c.id = t.chunk_id,
     websearch_to_tsquery('app.sires_simple', $1) q
WHERE t.account_id = app.current_account_id() AND t.reference_id = ANY($2::uuid[])
  AND c.account_id = app.current_account_id() AND c.reference_id = ANY($2::uuid[])
  AND c.region = 'body' AND t.tsv @@ q
ORDER BY rank DESC, t.chunk_id
LIMIT $3
"""

EVIDENCE_SQL = """
SELECT c.id, c.reference_id, c.source_document_id, c.page, c.paragraph, c.char_start, c.char_end, t.text
FROM app.chunk c JOIN app.chunk_text t ON t.chunk_id = c.id
WHERE c.id = ANY($1::uuid[])
"""


def vector_sql(plan: VectorPlan, table: str) -> str:
    """Vector branch statement. `table` is the vec table of the account's embedding model (validated name)."""
    if not _TABLE.match(table):
        raise ValueError(f"tên bảng vector không hợp lệ: {table}")
    halfvec = plan.storage.startswith("halfvec")
    q = f"($1::vector)::halfvec({DIM})" if halfvec else "$1"
    if plan.method == "exact":
        source, column = _EXACT_COPIES.get(plan.storage, f"vec.{table}"), "v.embedding"
    else:  # HNSW index of the DDL table, on the column or on its halfvec expression
        source, column = f"vec.{table}", f"v.embedding::halfvec({DIM})" if halfvec else "v.embedding"
    # The scope is repeated on app.chunk so the planner can read chunk_scope_idx for the scope only, not the account.
    scoped = f"""
      FROM {source} v JOIN app.chunk c ON c.id = v.chunk_id
      WHERE v.account_id = app.current_account_id() AND v.reference_id = ANY($2::uuid[])
        AND c.account_id = app.current_account_id() AND c.reference_id = ANY($2::uuid[]) AND c.region = 'body'"""
    if plan.method == "exact":
        return f"""
WITH cand AS MATERIALIZED (SELECT v.chunk_id, v.reference_id, {column} <=> {q} AS distance {scoped})
SELECT chunk_id, reference_id, distance FROM cand ORDER BY distance LIMIT $3"""
    # relaxed_order may return rows slightly out of order: re-sort the LIMIT rows (pgvector README).
    return f"""
WITH r AS MATERIALIZED (
  SELECT v.chunk_id, v.reference_id, {column} <=> {q} AS distance {scoped}
  ORDER BY {column} <=> {q} LIMIT $3)
SELECT chunk_id, reference_id, distance FROM r ORDER BY distance"""


def plan_settings(plan: VectorPlan) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """Transaction settings (SET LOCAL): those for the whole retrieval, and those for the vector statement only.

    `plan_cache_mode = force_custom_plan`: asyncpg keeps prepared statements, and after five executions PostgreSQL may
    switch to a generic plan that ignores the scope size and the current `enable_*` settings (seen in this spike: the
    plans sharing one statement text all came back exact). Custom plans are re-planned with the real parameters.
    """
    common = [("plan_cache_mode", "force_custom_plan")]
    if plan.method != "exact":
        common += [
            ("hnsw.ef_search", str(plan.ef_search)),
            ("hnsw.iterative_scan", plan.iterative),
            ("hnsw.max_scan_tuples", str(plan.max_scan_tuples)),
        ]
    vector_only = [("enable_sort", "off")] if plan.method == "hnsw" else []
    return common, vector_only


async def apply_settings(conn: Connection, settings: Sequence[tuple[str, str]]) -> None:
    if settings:
        calls = ", ".join(f"set_config(${2 * i + 1}, ${2 * i + 2}, true)" for i in range(len(settings)))
        await conn.execute(f"SELECT {calls}", *[x for pair in settings for x in pair])


def fuse(
    vector: Sequence[Hit], keyword: Sequence[Hit], *, k: int = RRF_K, cap: int = PER_REFERENCE_CAP, top_k: int = TOP_K
) -> list[Hit]:
    """Reciprocal Rank Fusion, de-duplicated by chunk, at most `cap` chunks per reference, `top_k` results."""
    scores: dict[UUID, float] = {}
    refs: dict[UUID, UUID] = {}
    for hits in (vector, keyword):
        for rank, hit in enumerate(hits, start=1):
            scores[hit.chunk_id] = scores.get(hit.chunk_id, 0.0) + 1.0 / (k + rank)
            refs[hit.chunk_id] = hit.reference_id
    fused: list[Hit] = []
    per_ref: dict[UUID, int] = {}
    for chunk_id in sorted(scores, key=lambda c: (-scores[c], c)):
        ref = refs[chunk_id]
        if per_ref.get(ref, 0) >= cap:
            continue
        per_ref[ref] = per_ref.get(ref, 0) + 1
        fused.append(Hit(chunk_id, ref, scores[chunk_id]))
        if len(fused) == top_k:
            break
    return fused


async def retrieve(
    conn: Connection,
    project_id: UUID,
    plan: VectorPlan,
    vector: npt.NDArray[np.float32],
    text: str,
) -> Retrieval:
    """Hybrid retrieval for one project inside the caller's tenant transaction."""
    timings: dict[str, float] = {}
    common, vector_only = plan_settings(plan)
    t0 = time.perf_counter()
    await apply_settings(conn, common)
    table = await conn.fetchval(MODEL_SQL)
    scope = [r["reference_id"] for r in await conn.fetch(SCOPE_SQL, project_id)]
    t1 = time.perf_counter()
    keyword = [Hit(r[0], r[1], r[2]) for r in await conn.fetch(KEYWORD_SQL, text, scope, KEYWORD_TOP)]
    t2 = time.perf_counter()
    await apply_settings(conn, vector_only)
    hits = [Hit(r[0], r[1], r[2]) for r in await conn.fetch(vector_sql(plan, table), vector, scope, VECTOR_TOP)]
    t3 = time.perf_counter()
    fused = fuse(hits, keyword)
    evidence = [dict(r) for r in await conn.fetch(EVIDENCE_SQL, [h.chunk_id for h in fused])]
    t4 = time.perf_counter()
    timings.update(
        scope=(t1 - t0) * 1e3, keyword=(t2 - t1) * 1e3, vector=(t3 - t2) * 1e3, fuse_evidence=(t4 - t3) * 1e3
    )
    return Retrieval(scope, hits, keyword, fused, evidence, timings)
