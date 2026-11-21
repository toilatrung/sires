# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Reading order from word boxes (pdfplumber, ADR-15): lines, column gutter, column-major order, References region.

Coordinates are pdfplumber's: x from the left edge, `top` from the top edge, in points. A page has one column or two;
a two-column page is read band by band, where a band ends at a segment that spans the gutter (a title, a wide figure
caption): left column top to bottom, then right column. Cleaning follows architecture 7.2: repeated header/footer
lines on >= 50 % of pages are dropped and words hyphenated at a line end are joined.
"""

from __future__ import annotations

import re
import statistics
import unicodedata
from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Any

Word = Mapping[str, Any]  # a pdfplumber word: text, x0, x1, top, bottom, upright

REFERENCES_HEADING = re.compile(
    r"^\s*(?:[0-9]{1,2}\.?|[ivxIVX]{1,4}\.)?\s*"
    r"(references?(?: and notes| cited| list)?|bibliography|literature cited|works cited|cited literature"
    r"|tài liệu tham khảo|danh mục tài liệu tham khảo)\s*:?\s*$",
    re.IGNORECASE,
)
APPENDIX_HEADING = re.compile(r"^\s*(?:[A-Z0-9]{1,2}\.?\s*)?(appendix|appendices|phụ lục)\b", re.IGNORECASE)
_FIRST_ENTRY = re.compile(r"^\s*\[1\]\s*\S")
_SECOND_ENTRY = re.compile(r"^\s*\[2\]\s*\S")
_HYPHEN_END = re.compile(r"[^\W\d_]-$")
_DIGITS = re.compile(r"\d+")
PDFIUM_HYPHEN = "\ufffe"  # what PDFium returns for a hyphen at a line break (the break itself is dropped)


def clean_pdfium_text(text: str) -> str:
    """PDFium page text with its line-break hyphen marker removed (the two halves are already adjacent)."""
    return text.replace("\r\n", "\n").replace("\r", "\n").replace(PDFIUM_HYPHEN, "")


@dataclass(frozen=True)
class Segment:
    """Words on one visual line with no gap wider than the split threshold."""

    x0: float
    x1: float
    top: float
    bottom: float
    text: str
    column: str = "S"  # "L", "R", or "S" (single column page, or spanning the gutter)

    @property
    def chars(self) -> int:
        return len(self.text)


@dataclass(frozen=True)
class PageLayout:
    columns: int
    gutter: float | None
    segments: tuple[Segment, ...]  # in reading order
    bands: int  # column bands on a two-column page (1 when nothing spans the gutter mid-page)
    non_upright_words: int  # rotated words left out, e.g. the arXiv identifier in the margin


def _lines(words: Sequence[Word]) -> list[list[Word]]:
    """Cluster words into visual lines by vertical overlap of their boxes."""
    lines: list[list[Word]] = []
    for word in sorted(words, key=lambda w: (round(float(w["top"]), 1), float(w["x0"]))):
        top, bottom = float(word["top"]), float(word["bottom"])
        mid = (top + bottom) / 2
        for line in reversed(lines[-6:]):
            l_top = min(float(w["top"]) for w in line)
            l_bottom = max(float(w["bottom"]) for w in line)
            if l_top - 0.5 <= mid <= l_bottom + 0.5:
                line.append(word)
                break
        else:
            lines.append([word])
    return lines


def _segments(line: list[Word], gap: float) -> list[Segment]:
    out: list[Segment] = []
    current: list[Word] = []
    for word in sorted(line, key=lambda w: float(w["x0"])):
        if current and float(word["x0"]) - float(current[-1]["x1"]) > gap:
            out.append(_segment(current))
            current = []
        current.append(word)
    if current:
        out.append(_segment(current))
    return out


def _segment(words: list[Word]) -> Segment:
    return Segment(
        x0=min(float(w["x0"]) for w in words),
        x1=max(float(w["x1"]) for w in words),
        top=min(float(w["top"]) for w in words),
        bottom=max(float(w["bottom"]) for w in words),
        text=" ".join(str(w["text"]) for w in words),
    )


def find_gutter(segments: Sequence[Segment], width: float) -> float | None:
    """The x of a vertical gap between two text columns, or None for a single-column page."""
    total = sum(s.chars for s in segments)
    if total < 400 or len(segments) < 16:
        return None
    # Only positions with >= 20 % of the characters on each side: the margin next to a text block is not a gutter.
    candidates = [
        x
        for x in (width * 0.3 + i for i in range(int(width * 0.4)))
        if sum(s.chars for s in segments if s.x1 <= x) >= 0.2 * total
        and sum(s.chars for s in segments if s.x0 >= x) >= 0.2 * total
    ]
    if not candidates:
        return None
    crossing = [sum(s.chars for s in segments if s.x0 < x < s.x1) for x in candidates]
    low = min(crossing)
    # Middle of the widest run of candidates with the lowest crossing count, nearest the page centre on ties.
    runs: list[tuple[float, float]] = []
    start: float | None = None
    for x, c in zip(candidates, crossing, strict=True):
        if c == low and start is None:
            start = x
        if c != low and start is not None:
            runs.append((start, x - 1))
            start = None
    if start is not None:
        runs.append((start, candidates[-1]))
    a, b = max(runs, key=lambda r: (r[1] - r[0], -abs((r[0] + r[1]) / 2 - width / 2)))
    gutter = (a + b) / 2
    left = sum(s.chars for s in segments if s.x1 <= gutter)
    right = sum(s.chars for s in segments if s.x0 >= gutter)
    n_left = sum(1 for s in segments if s.x1 <= gutter)
    n_right = sum(1 for s in segments if s.x0 >= gutter)
    if low > 0.25 * total or left < 0.2 * total or right < 0.2 * total or n_left < 8 or n_right < 8:
        return None
    if _aligned_share([s for s in segments if s.x0 >= gutter]) < 0.5:
        return None  # word gaps lining up by chance (OCR layers, ragged tables), not a column edge
    return gutter


def _aligned_share(segments: Sequence[Segment], tolerance: float = 4.0) -> float:
    """Share of text lines whose first segment starts within `tolerance` of the most common start (a column edge)."""
    starts: dict[int, float] = {}
    for seg in segments:
        row = round(seg.top)
        starts[row] = min(starts.get(row, seg.x0), seg.x0)
    if not starts:
        return 0.0
    bins = Counter(round(x / 2) for x in starts.values())
    edge = bins.most_common(1)[0][0] * 2
    return sum(abs(x - edge) <= tolerance for x in starts.values()) / len(starts)


def _column_major(segments: Sequence[Segment], gutter: float) -> tuple[list[Segment], int]:
    labelled = [replace(s, column="L" if s.x1 <= gutter + 2 else "R" if s.x0 >= gutter - 2 else "S") for s in segments]
    out: list[Segment] = []
    left: list[Segment] = []
    right: list[Segment] = []
    bands = 0

    def flush() -> None:
        nonlocal bands
        if left or right:
            bands += 1
        out.extend(sorted(left, key=lambda s: (s.top, s.x0)))
        out.extend(sorted(right, key=lambda s: (s.top, s.x0)))
        left.clear()
        right.clear()

    for seg in sorted(labelled, key=lambda s: (s.top, s.x0)):
        if seg.column == "S":
            flush()
            out.append(seg)
        else:
            (left if seg.column == "L" else right).append(seg)
    flush()
    return out, max(bands, 1)


def _same_line_tops(segments: Sequence[Segment]) -> list[Segment]:
    """Give segments of one visual line the same top, so that sorting by (top, x0) reads the line left to right."""
    out: list[Segment] = []
    line: list[Segment] = []
    for seg in sorted(segments, key=lambda s: (s.top, s.x0)):
        mid = (seg.top + seg.bottom) / 2
        # Compare with the first segment of the line only, so offset lines of two columns do not chain together.
        if line and not (line[0].top <= mid <= line[0].bottom):
            top = min(s.top for s in line)
            out.extend(replace(s, top=top) for s in line)
            line = []
        line.append(seg)
    if line:
        top = min(s.top for s in line)
        out.extend(replace(s, top=top) for s in line)
    return out


def layout_from_segments(segments: Sequence[Segment], width: float, non_upright: int = 0) -> PageLayout:
    segments = _same_line_tops(segments)
    gutter = find_gutter(segments, width)
    if gutter is None:
        ordered = sorted(segments, key=lambda s: (round(s.top), s.x0))
        return PageLayout(1, None, tuple(ordered), 1, non_upright)
    ordered, bands = _column_major(segments, gutter)
    return PageLayout(2, gutter, tuple(ordered), bands, non_upright)


def page_layout(words: Iterable[Word], width: float, *, gap: float | None = None) -> PageLayout:
    """Layout from pdfplumber words (ADR-15)."""
    words = list(words)
    upright = [w for w in words if w.get("upright", True)]
    heights = [float(w["bottom"]) - float(w["top"]) for w in upright] or [10.0]
    split = gap if gap is not None else max(6.0, 0.9 * statistics.median(heights))
    segments = [seg for line in _lines(upright) for seg in _segments(line, split)]
    return layout_from_segments(segments, width, len(words) - len(upright))


def pdfium_segments(textpage: Any, page_height: float) -> tuple[list[Segment], int]:
    """Segments from PDFium characters: its own line breaks and generated spaces, split again at wide x gaps.

    Characters on a rotated baseline (the arXiv margin stamp) are dropped and counted, like non-upright words.
    """
    import pypdfium2.raw as pdfium_c  # type: ignore[import-untyped]

    out: list[Segment] = []
    rotated = 0
    text: list[str] = []
    box: list[float] = []  # x0, x1, top, bottom of the current segment
    last_right = 0.0

    def close() -> None:
        if text and box and "".join(text).strip():
            out.append(Segment(box[0], box[1], box[2], box[3], "".join(text).strip()))
        text.clear()
        box.clear()

    for index in range(textpage.count_chars()):
        code = pdfium_c.FPDFText_GetUnicode(textpage, index)
        char = chr(code) if 0 < code <= 0x10FFFF else "\ufffd"
        if char in "\r\n":
            close()
            continue
        if char == PDFIUM_HYPHEN or code == 2:
            # PDFium marks "word-<line break>" as a hyphen character (code 2 here, U+FFFE in get_text_range) and
            # drops the break; keep a plain hyphen so that join_lines joins the two halves.
            if text:
                text.append("-")
            close()
            continue
        if char.isspace():
            if text:
                text.append(" ")
            continue
        angle = pdfium_c.FPDFText_GetCharAngle(textpage, index)  # radians; -1 on error
        if 0.1 < angle < 6.18:
            rotated += 1
            continue
        # Loose boxes use the font ascent and descent, so words of one line share a top (tight boxes do not).
        left, bottom, right, top = textpage.get_charbox(index, loose=True)
        y0, y1 = page_height - top, page_height - bottom
        height = max(y1 - y0, 1.0)
        # A wide gap or a jump back to the left starts a new segment; a superscript next to its word does not.
        if box and (left - last_right > max(6.0, 0.9 * height) or left < box[0] - height):
            close()
        if not box:
            box.extend([left, right, y0, y1])
        else:
            box[0], box[1] = min(box[0], left), max(box[1], right)
            box[2], box[3] = min(box[2], y0), max(box[3], y1)
        text.append(char)
        last_right = right
    close()
    return out, rotated


def _furniture_key(seg: Segment) -> tuple[int, str]:
    return round(seg.top / 4), _DIGITS.sub("#", seg.text.strip().lower())


def drop_repeated(pages: Sequence[PageLayout], min_share: float = 0.5) -> tuple[list[list[Segment]], int]:
    """Remove header/footer lines found at the same height on >= `min_share` of pages (architecture 7.2)."""
    if len(pages) < 3:
        return [list(p.segments) for p in pages], 0
    seen = Counter(key for p in pages for key in {_furniture_key(s) for s in p.segments})
    repeated = {key for key, n in seen.items() if n >= min_share * len(pages)}
    kept = [[s for s in p.segments if _furniture_key(s) not in repeated] for p in pages]
    return kept, sum(len(p.segments) for p in pages) - sum(len(k) for k in kept)


def join_lines(lines: Iterable[str]) -> str:
    """Lines to text; a word hyphenated at a line end is joined when the next line starts in lower case."""
    out = ""
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if out and _HYPHEN_END.search(out) and line[:1].islower():
            out = out[:-1] + line
        else:
            out = f"{out}\n{line}" if out else line
    return out


def references_start(lines: Sequence[str], min_position: float = 0.4) -> int | None:
    """Index of the References/Bibliography heading line, searched in the last part of the document.

    Without a heading (REVTeX prints the bibliography with none), the start of a numbered list "[1] … [2] …" after
    the first fifth of the document is used instead (arXiv papers often put supplementary pages after it).
    """
    hits = [i for i, line in enumerate(lines) if REFERENCES_HEADING.match(unicodedata.normalize("NFC", line))]
    if hits:
        late = [i for i in hits if i >= min_position * len(lines)]
        return late[0] if late else hits[-1]
    for i in range(int(0.2 * len(lines)), len(lines)):
        if _FIRST_ENTRY.match(lines[i]) and any(_SECOND_ENTRY.match(x) for x in lines[i + 1 : i + 15]):
            return i
    return None


def appendix_starts(lines: Sequence[str]) -> list[int]:
    return [i for i, line in enumerate(lines) if len(line) < 80 and APPENDIX_HEADING.match(line)]
