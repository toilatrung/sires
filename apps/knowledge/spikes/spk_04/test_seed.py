# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S01: the synthetic dataset has the required scale and is identical on every run; RRF fusion rules (no database)."""

from __future__ import annotations

from uuid import UUID

import numpy as np

from .config import FULL, LIBRARY, SMALL
from .retrieval import Hit, VectorPlan, fuse
from .synth import QUERY_KINDS, Synth


def test_layout_full_scale() -> None:
    """NFR-SCALE-002 / NFR-SCALE-001: 5,000 references and 2,000 Source Documents per account, 500-reference project."""
    synth = Synth(FULL)
    assert len(synth.accounts) == 3
    for account in synth.accounts:
        assert len(account.reference_ids) == 5_000 == len(set(account.reference_ids))
        assert len(account.revoked) == 40 and len(account.trusted_order) == 1_960
        assert not account.revoked & set(account.trusted_order)
        assert all(j < 2_000 for j in account.trusted_order)
    measured = synth.accounts[0]
    assert [len(p.active) for p in measured.projects] == [10, 50, 100, 250, 500, 1_000, 1_960]
    assert measured.projects[-1].size == LIBRARY
    for project in measured.projects:
        active = set(project.active)
        assert not active & set(project.removed)
        assert set(project.revoked) <= measured.revoked
        assert all(j >= 2_000 for j in project.unindexed)
    ids = [a.id for a in synth.accounts] + [p.id for a in synth.accounts for p in a.projects]
    assert len(ids) == len(set(ids))


def test_deterministic() -> None:
    """Same seed → same ids, vectors and texts; building without text gives the same vectors."""
    first, second = Synth(SMALL), Synth(SMALL)
    a = first.document(0, 7)
    b = second.document(0, 7)
    c = second.document(0, 7, with_text=False)
    assert a.chunk_ids == b.chunk_ids == c.chunk_ids and a.source_document_id == b.source_document_id
    assert np.array_equal(a.vectors, b.vectors) and np.array_equal(a.vectors, c.vectors)
    assert a.texts == b.texts and len(a.texts) == len(a.chunk_ids) and c.texts == ()
    assert first.accounts[0].reference_ids == second.accounts[0].reference_ids
    q1 = first.query(first.accounts[0], first.accounts[0].projects[0], 3)
    q2 = second.query(second.accounts[0], second.accounts[0].projects[0], 3)
    assert q1.text == q2.text and np.array_equal(q1.vector, q2.vector)
    assert first.document(0, 8).chunk_ids != a.chunk_ids


def test_vector_structure() -> None:
    """Unit vectors with document > topic > unrelated similarity (shape of text embeddings, 1,536 dimensions)."""
    synth = Synth(SMALL)
    doc = synth.document(0, 0)
    assert doc.vectors.shape == (len(doc.chunk_ids), 1536) and doc.vectors.dtype == np.float32
    assert np.allclose(np.linalg.norm(doc.vectors, axis=1), 1.0, atol=1e-5)
    inside = doc.vectors[0] @ doc.vectors[1]
    other = next(
        synth.document(1, j) for j in range(SMALL.documents_per_account) if synth.document(1, j).topic != doc.topic
    )
    unrelated = doc.vectors[0] @ other.vectors[0]
    assert 0.6 < inside < 0.8 and 0.1 < unrelated < 0.3
    assert set(doc.regions) <= {"body", "references", "appendix"} and doc.regions[0] == "body"


def test_queries() -> None:
    synth = Synth(SMALL)
    account = synth.accounts[0]
    project = account.projects[0]
    kinds = [synth.query(account, project, i).kind for i in range(len(QUERY_KINDS))]
    assert kinds.count("specific") == 6 and kinds.count("broad") == 3 and kinds.count("stopword") == 1
    for i in range(10):
        q = synth.query(account, project, i)
        assert q.reference in project.active
        assert 3 <= len(q.text.split(" or ")) <= 4
        doc = synth.document(0, q.reference, with_text=False)
        assert doc.regions[q.chunk] == "body" and float(q.vector @ doc.vectors[q.chunk]) > 0.7


def _hit(n: int, ref: int) -> Hit:
    return Hit(UUID(int=n), UUID(int=10_000 + ref), 0.0)


def test_fuse_rrf_and_cap() -> None:
    """RRF k = 60 sums both branches; at most 3 chunks per reference; top 8 (architecture 7.4, 7.8 rc-1)."""
    vector = [_hit(i, ref=0) for i in range(5)] + [_hit(100 + i, ref=i + 1) for i in range(10)]
    keyword = [_hit(100, ref=1), _hit(4, ref=0)]
    fused = fuse(vector, keyword)
    assert len(fused) == 8
    assert fused[0].chunk_id == UUID(int=100)  # rank 6 + rank 1 beats rank 1 alone
    assert sum(1 for h in fused if h.reference_id == UUID(int=10_000)) == 3
    assert abs(fused[0].score - (1 / 66 + 1 / 61)) < 1e-12


def test_plan_names() -> None:
    assert VectorPlan.parse("exact:halfvec").name == "exact/halfvec"
    assert VectorPlan.parse("hnsw:vector:100:strict_order").name == "hnsw/vector/ef100/strict"
    assert VectorPlan.parse("auto:vector:40").name == "auto/vector/ef40/relaxed"
