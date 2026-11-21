# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Ground truth from the publisher's JATS XML and the text-quality scores computed against it.

Body truth: abstract + <body> paragraphs and headings, without tables, figures and formulas (their PDF rendering is
not running text). Reference truth: <ref-list>. Scores use anchors, 4-word shingles that occur once in the truth:
  coverage = share of truth anchors found exactly once in the extraction (missing or garbled text lowers it);
  order    = longest increasing run of their positions / anchors found (column interleaving lowers it).
"""

from __future__ import annotations

import bisect
import re
import unicodedata
import xml.etree.ElementTree as ET
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path

K = 4
_SKIP = {
    "table-wrap",
    "table",
    "fig",
    "disp-formula",
    "inline-formula",
    "math",
    "tex-math",
    "supplementary-material",
    "alternatives",
    "graphic",
    "media",
    "fn-group",
    "ack",
}
_TOKEN = re.compile(r"[^\W_]+")


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _text(elem: ET.Element) -> str:
    parts: list[str] = []

    def walk(e: ET.Element) -> None:
        if _local(e.tag) in _SKIP:
            return
        if e.text:
            parts.append(e.text)
        for child in e:
            walk(child)
            if child.tail:
                parts.append(child.tail)
        if _local(e.tag) in {"p", "title", "label", "ref", "mixed-citation", "element-citation"}:
            parts.append("\n")

    walk(elem)
    return "".join(parts)


@dataclass(frozen=True)
class Truth:
    body: str
    references: str
    lang: str | None


def load_jats(path: Path) -> Truth:
    root = ET.parse(path).getroot()
    by_tag: dict[str, list[ET.Element]] = {}
    for e in root.iter():
        by_tag.setdefault(_local(e.tag), []).append(e)
    abstract = "\n".join(_text(e) for e in by_tag.get("abstract", [])[:1])
    body = "\n".join(_text(e) for e in by_tag.get("body", []))
    refs = "\n".join(_text(e) for e in by_tag.get("ref-list", []))
    lang = root.get("{http://www.w3.org/XML/1998/namespace}lang")
    return Truth(body=f"{abstract}\n{body}", references=refs, lang=lang)


def tokens(text: str) -> list[str]:
    text = unicodedata.normalize("NFKC", text).lower()
    return _TOKEN.findall(text)


def _shingles(toks: Sequence[str]) -> list[tuple[str, ...]]:
    return [tuple(toks[i : i + K]) for i in range(len(toks) - K + 1)]


def unique_positions(toks: Sequence[str]) -> dict[tuple[str, ...], int]:
    shingles = _shingles(toks)
    counts = Counter(shingles)
    return {s: i for i, s in enumerate(shingles) if counts[s] == 1}


def lis(values: Iterable[int]) -> int:
    """Length of the longest strictly increasing subsequence."""
    tails: list[int] = []
    for v in values:
        i = bisect.bisect_left(tails, v)
        if i == len(tails):
            tails.append(v)
        else:
            tails[i] = v
    return len(tails)


@dataclass(frozen=True)
class Score:
    anchors: int
    found: int
    coverage: float
    order: float


def score(truth_text: str, extracted: Sequence[str] | dict[tuple[str, ...], int]) -> Score:
    truth = unique_positions(tokens(truth_text))
    index = extracted if isinstance(extracted, dict) else unique_positions(extracted)
    positions = [index[s] for s, _ in sorted(truth.items(), key=lambda kv: kv[1]) if s in index]
    found = len(positions)
    return Score(
        anchors=len(truth),
        found=found,
        coverage=round(found / len(truth), 4) if truth else 0.0,
        order=round(lis(positions) / found, 4) if found else 0.0,
    )


@dataclass(frozen=True)
class RegionScore:
    """Where truth anchors land relative to the detected References start (a token index of the extraction)."""

    ref_anchors: int
    ref_after_start: float  # share of found reference anchors inside the excluded region (want 1)
    body_anchors: int
    body_after_start: float  # share of found body anchors wrongly inside the excluded region (want 0)


def region_score(truth: Truth, extracted: Sequence[str], start_token: int | None) -> RegionScore:
    body = unique_positions(tokens(truth.body))
    refs = unique_positions(tokens(truth.references))
    shared = body.keys() & refs.keys()
    index = unique_positions(extracted)
    ref_pos = [index[s] for s in refs if s not in shared and s in index]
    body_pos = [index[s] for s in body if s not in shared and s in index]
    if start_token is None:
        return RegionScore(len(ref_pos), 0.0, len(body_pos), 0.0)
    start = start_token

    def after(xs: list[int]) -> float:
        return round(sum(p >= start for p in xs) / len(xs), 4) if xs else 0.0

    return RegionScore(len(ref_pos), after(ref_pos), len(body_pos), after(body_pos))
