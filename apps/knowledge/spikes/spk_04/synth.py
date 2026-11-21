# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Deterministic synthetic data: ids, project selections, chunk vectors and texts, queries.

Everything derives from `Scale.seed` through numpy `SeedSequence` namespaces, one generator per account, document or
query, so any document or query can be rebuilt alone and the dataset is identical on every run. No embedding model is
called (scope N3): vectors mimic the structure of text embeddings — a direction shared by every vector (anisotropy),
a topic, a document and the chunk itself — with expected cosine ≈ 0.70 inside a document, ≈ 0.45 inside a topic and
≈ 0.20 between unrelated chunks. Texts draw words from a Zipf vocabulary plus topic words and document-specific words
(proper names), so full-text matches behave like a corpus with common and rare terms.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from functools import cached_property

import numpy as np
import numpy.typing as npt

from .config import LIBRARY, Scale

F32 = npt.NDArray[np.float32]
F64 = npt.NDArray[np.float64]

SHARE_GLOBAL, SHARE_TOPIC, SHARE_DOC, SHARE_CHUNK = 0.20, 0.25, 0.25, 0.30
QUERY_NOISE = 0.30  # share of fresh noise around the target chunk of a query

VOCAB_SIZE = 30_000
ZIPF_WORDS = 20_000  # ranks below follow Zipf; the tail holds topic and document words
TOPIC_WORDS = 300
DOC_WORDS = 8
MIX_TOPIC, MIX_DOC = 0.23, 0.05  # share of topic words and document words in a chunk text
REFERENCES_SHARE, APPENDIX_MIN_CHUNKS = 0.08, 30

QUERY_KINDS = ("specific",) * 6 + ("broad",) * 3 + ("stopword",)

_NS_GLOBAL, _NS_TOPIC, _NS_DOC, _NS_QUERY, _NS_VOCAB, _NS_LAYOUT, _NS_ID = range(1, 8)
_BASE_MS = 1_793_491_200_000  # 2026-11-01T00:00:00Z, base of the UUIDv7 timestamps
_ONSETS = ("b", "c", "d", "g", "h", "k", "l", "m", "n", "p", "r", "s", "t", "v", "x", "ch", "nh", "ph", "th", "tr")
_VOWELS = ("a", "e", "i", "o", "u", "y", "ai", "ao", "eo", "ia", "oa", "ua")
_CODAS = ("", "", "n", "m", "c", "t", "ng", "nh", "p")


def uuid7_from(ms: int, rand: bytes) -> uuid.UUID:
    """UUIDv7 layout (same as `app.uuid_v7()` and `sires_common.tenancy.uuid7`) with caller-provided randomness."""
    bits = int.from_bytes(rand[:10], "big")
    rand_a, rand_b = bits >> 68 & 0xFFF, bits & ((1 << 62) - 1)
    value = (ms & ((1 << 48) - 1)) << 80 | 0x7 << 76 | rand_a << 64 | 0b10 << 62 | rand_b
    return uuid.UUID(int=value)


def _unit_rows(x: F64) -> F64:
    norms: F64 = np.linalg.norm(x, axis=-1, keepdims=True)
    return x / norms


@dataclass(frozen=True, slots=True)
class Project:
    """Selections of one project in replica.project_reference_scope (reference indexes of the account)."""

    id: uuid.UUID
    size: int  # requested size; LIBRARY = every Trusted indexed reference
    active: tuple[int, ...]  # Active ∩ Trusted ∩ Indexed: the retrieval scope
    removed: tuple[int, ...]  # status Removed (Trusted, indexed)
    revoked: tuple[int, ...]  # status Active but reference Revoked (indexed)
    unindexed: tuple[int, ...]  # status Active, Trusted, no Source Document

    @property
    def label(self) -> str:
        return "library" if self.size == LIBRARY else str(self.size)


@dataclass(frozen=True, slots=True)
class Account:
    index: int
    id: uuid.UUID
    reference_ids: tuple[uuid.UUID, ...]
    revoked: frozenset[int]  # indexed references whose reference_state is Revoked
    trusted_order: tuple[int, ...]  # indexed Trusted references in selection order
    projects: tuple[Project, ...]


@dataclass(frozen=True, slots=True)
class Document:
    """One Source Document (one per indexed reference) and its chunks."""

    account: int
    reference: int
    topic: int
    source_document_id: uuid.UUID
    ingested_ms: int
    chunk_ids: tuple[uuid.UUID, ...]
    regions: tuple[str, ...]  # body | references | appendix (architecture 7.2)
    words: tuple[str, ...]  # document-specific words (proper names, acronyms)
    vectors: F32  # (chunks, dim), unit norm
    texts: tuple[str, ...]  # empty when built without text

    @property
    def body(self) -> tuple[int, ...]:
        return tuple(i for i, r in enumerate(self.regions) if r == "body")


@dataclass(frozen=True, slots=True)
class Query:
    index: int
    kind: str  # specific | broad | stopword (see `Synth.query`)
    vector: F32
    text: str  # websearch_to_tsquery syntax, terms joined by "or"
    reference: int  # target reference index
    chunk: int  # target chunk index in that document


class Synth:
    """Deterministic generator for one `Scale`."""

    def __init__(self, scale: Scale) -> None:
        self.scale = scale

    def _rng(self, *key: int) -> np.random.Generator:
        return np.random.default_rng([self.scale.seed, *key])

    # -- shared structure ------------------------------------------------------------------------------------------

    @cached_property
    def anisotropy(self) -> F64:
        return _unit_rows(self._rng(_NS_GLOBAL).standard_normal(self.scale.dim))

    @cached_property
    def topic_centroids(self) -> F64:
        return _unit_rows(self._rng(_NS_TOPIC).standard_normal((self.scale.topics, self.scale.dim)))

    @cached_property
    def vocabulary(self) -> npt.NDArray[np.str_]:
        rng = self._rng(_NS_VOCAB)
        seen: dict[str, None] = {}
        while len(seen) < VOCAB_SIZE:
            parts = rng.integers(0, (len(_ONSETS), len(_VOWELS), len(_CODAS)), size=(3, 3))
            syllables = int(rng.integers(2, 4))
            word = "".join(_ONSETS[o] + _VOWELS[v] + _CODAS[c] for o, v, c in parts[:syllables])
            seen.setdefault(word, None)
        return np.array(list(seen), dtype=np.str_)

    @cached_property
    def _zipf_cdf(self) -> F64:
        weights = 1.0 / (np.arange(ZIPF_WORDS, dtype=np.float64) + 2.7) ** 1.07
        cdf: F64 = np.cumsum(weights / weights.sum())
        cdf[-1] = 1.0
        return cdf

    @cached_property
    def topic_words(self) -> npt.NDArray[np.int64]:
        rng = self._rng(_NS_VOCAB, 1)
        pool = np.arange(2_000, VOCAB_SIZE)
        return np.stack([rng.choice(pool, TOPIC_WORDS, replace=False) for _ in range(self.scale.topics)])

    # -- accounts and projects -------------------------------------------------------------------------------------

    def account(self, index: int) -> Account:
        s = self.scale
        rng = self._rng(_NS_ID, index)
        account_id = uuid7_from(_BASE_MS - 10_000_000 + index, rng.bytes(10))
        reference_ids = tuple(
            uuid7_from(_BASE_MS - 5_000_000 + j, rng.bytes(10)) for j in range(s.references_per_account)
        )
        order = self._rng(_NS_LAYOUT, index).permutation(s.documents_per_account)
        revoked = tuple(int(j) for j in order[-s.revoked_per_account :])
        trusted = tuple(int(j) for j in order[: -s.revoked_per_account])
        sizes = s.project_sizes if index == 0 else (s.other_project_size,)
        projects = []
        for p, size in enumerate(sizes):
            n = s.scope_size(size)
            k = max(2, n // 20)
            projects.append(
                Project(
                    id=uuid7_from(_BASE_MS - 1_000_000 + index * 100 + p, rng.bytes(10)),
                    size=size,
                    active=trusted[:n],
                    removed=trusted[n : n + k],
                    revoked=revoked[: max(1, min(len(revoked), n // 50 + 1))],
                    unindexed=tuple(
                        range(s.documents_per_account, min(s.references_per_account, s.documents_per_account + k))
                    ),
                )
            )
        return Account(index, account_id, reference_ids, frozenset(revoked), trusted, tuple(projects))

    @cached_property
    def accounts(self) -> tuple[Account, ...]:
        return tuple(self.account(a) for a in range(self.scale.accounts))

    # -- documents -------------------------------------------------------------------------------------------------

    def document(self, account: int, reference: int, *, with_text: bool = True) -> Document:
        """Source Document of `reference` (index < documents_per_account). Draw order is fixed: building without text
        gives the same ids and vectors."""
        s = self.scale
        rng = self._rng(_NS_DOC, account, reference)
        topic = int(rng.integers(s.topics))
        lo, hi = s.chunks_measured if account == 0 else s.chunks_other
        n = int(rng.integers(lo, hi + 1))
        words = rng.choice(np.arange(ZIPF_WORDS, VOCAB_SIZE), DOC_WORDS, replace=False)
        ms = _BASE_MS + (account * s.documents_per_account + reference) * 1_000
        sd_id = uuid7_from(ms, rng.bytes(10))
        chunk_ids = tuple(uuid7_from(ms, rng.bytes(10)) for _ in range(n))
        doc_dir = _unit_rows(rng.standard_normal(s.dim))
        noise = _unit_rows(rng.standard_normal((n, s.dim)))
        vectors = _unit_rows(
            np.sqrt(SHARE_GLOBAL) * self.anisotropy
            + np.sqrt(SHARE_TOPIC) * self.topic_centroids[topic]
            + np.sqrt(SHARE_DOC) * doc_dir
            + np.sqrt(SHARE_CHUNK) * noise
        ).astype(np.float32)
        tail = max(1, round(n * REFERENCES_SHARE))
        regions = ["body"] * (n - tail) + ["references"] * tail
        if n >= APPENDIX_MIN_CHUNKS:
            regions[n - tail - 1] = "appendix"
        texts = self._texts(rng, topic, words, n) if with_text else ()
        vocab = self.vocabulary
        return Document(
            account=account,
            reference=reference,
            topic=topic,
            source_document_id=sd_id,
            ingested_ms=ms,
            chunk_ids=chunk_ids,
            regions=tuple(regions),
            words=tuple(str(vocab[w]) for w in words),
            vectors=vectors,
            texts=texts,
        )

    def _texts(self, rng: np.random.Generator, topic: int, words: npt.NDArray[np.int64], n: int) -> tuple[str, ...]:
        lo, hi = self.scale.words_per_chunk
        lengths = rng.integers(lo, hi + 1, n)
        total = int(lengths.sum())
        kind = rng.random(total)
        common = np.searchsorted(self._zipf_cdf, rng.random(total))
        topical = self.topic_words[topic][rng.integers(TOPIC_WORDS, size=total)]
        own = words[rng.integers(DOC_WORDS, size=total)]
        idx = np.where(kind < MIX_TOPIC, topical, np.where(kind < MIX_TOPIC + MIX_DOC, own, common))
        tokens = self.vocabulary[idx]
        bounds = np.cumsum(lengths)[:-1]
        return tuple(" ".join(part.tolist()) for part in np.split(tokens, bounds))

    # -- queries ---------------------------------------------------------------------------------------------------

    def query(self, account: Account, project: Project, index: int) -> Query:
        """Query `index` of a project: a vector near one body chunk of an in-scope document, and a keyword query.

        Keyword kinds (OR semantics, the costlier choice for ranking): `specific` = two topic words + one document
        word; `broad` adds a mid-frequency word (Zipf rank 100-599); `stopword` adds a top-10 word, which matches
        nearly every chunk because the `app.sires_simple` configuration keeps stop words.
        """
        rng = self._rng(_NS_QUERY, account.index, project.size, index)
        reference = project.active[int(rng.integers(len(project.active)))]
        doc = self.document(account.index, reference, with_text=False)
        chunk = doc.body[int(rng.integers(len(doc.body)))]
        noise = _unit_rows(rng.standard_normal(self.scale.dim))
        vector = _unit_rows(np.sqrt(1 - QUERY_NOISE) * doc.vectors[chunk] + np.sqrt(QUERY_NOISE) * noise)
        kind = QUERY_KINDS[index % len(QUERY_KINDS)]
        vocab = self.vocabulary
        terms = [str(vocab[w]) for w in rng.choice(self.topic_words[doc.topic], 2, replace=False)]
        terms.append(doc.words[int(rng.integers(DOC_WORDS))])
        if kind == "broad":
            terms.append(str(vocab[int(rng.integers(100, 600))]))
        elif kind == "stopword":
            terms.append(str(vocab[int(rng.integers(0, 10))]))
        return Query(index, kind, vector.astype(np.float32), " or ".join(terms), reference, chunk)
