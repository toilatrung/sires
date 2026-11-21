# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Dataset scales and fixed names of the SPK-04 spike.

`FULL` follows the MVP scale: NFR-SCALE-002 (5,000 references and 2,000 indexed Source Documents per account),
NFR-SCALE-001 (500 selected references per project) and architecture 7.4 (~100 chunks per reference, 1,536-dim
`vec.emb_openai_text_embedding_3_small`). `SMALL` keeps the same shape for the isolation test in CI.
"""

from __future__ import annotations

from dataclasses import dataclass

# The only vector table of docs/database/ddl/knowledge.sql (EC03: no table with another dimension exists).
MODEL_SLUG = "openai_text_embedding_3_small"
VECTOR_TABLE = "vec.emb_openai_text_embedding_3_small"
DIM = 1536

# Spike-only objects, outside the reference DDL: a stored halfvec copy (exact scan on halfvec) and an HNSW index on
# the halfvec expression of the DDL table (no schema change). Both exist only in the measurement database.
HALFVEC_TABLE = "spk04.emb_halfvec"
VECTOR_PLAIN_TABLE = "spk04.emb_vector_plain"  # STORAGE PLAIN copies (vector inline in the heap row)
HALFVEC_PLAIN_TABLE = "spk04.emb_halfvec_plain"
HALFVEC_HNSW_INDEX = "spk04_emb_halfvec_expr_hnsw_idx"

LIBRARY = 0  # project size meaning "every Trusted indexed reference of the account" (library-wide scope)


@dataclass(frozen=True, slots=True)
class Scale:
    name: str
    accounts: int  # account 0 is the measured account, the others hold foreign data for isolation
    references_per_account: int  # replica.reference_state rows (NFR-SCALE-002: 5,000)
    documents_per_account: int  # indexed Source Documents (NFR-SCALE-002: 2,000)
    chunks_measured: tuple[int, int]  # chunks per document, inclusive range, measured account
    chunks_other: tuple[int, int]  # chunks per document, other accounts
    project_sizes: tuple[int, ...]  # Active ∩ Trusted ∩ Indexed references per project of account 0; LIBRARY = all
    other_project_size: int  # one project per other account
    words_per_chunk: tuple[int, int]  # 500-800 tokens per chunk (architecture 7.2) ≈ 320-440 words
    topics: int
    seed: int = 20261119
    dim: int = DIM

    @property
    def revoked_per_account(self) -> int:
        """Indexed references whose reference_state is Revoked (excluded from every project scope)."""
        return max(2, self.documents_per_account // 50)

    @property
    def trusted_indexed(self) -> int:
        return self.documents_per_account - self.revoked_per_account

    def scope_size(self, project_size: int) -> int:
        return self.trusted_indexed if project_size == LIBRARY else project_size


FULL = Scale(
    name="full",
    accounts=3,
    references_per_account=5_000,
    documents_per_account=2_000,
    chunks_measured=(60, 140),
    chunks_other=(10, 40),
    project_sizes=(10, 50, 100, 250, 500, 1_000, LIBRARY),
    other_project_size=500,
    words_per_chunk=(320, 440),
    topics=256,
)

SMALL = Scale(
    name="small",
    accounts=3,
    references_per_account=120,
    documents_per_account=60,
    chunks_measured=(8, 16),
    chunks_other=(4, 8),
    project_sizes=(20, LIBRARY),
    other_project_size=20,
    words_per_chunk=(40, 60),
    topics=12,
)

SCALES = {s.name: s for s in (FULL, SMALL)}
