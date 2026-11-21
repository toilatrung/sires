# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Gate before extraction (architecture 7.1 step 2): PDF magic bytes, <= 50 MB, <= 500 pages, text layer.

Text layer (architecture 7.1): >= N characters on >= 80 % of pages, counted on pypdfium2 page text (ADR-15).
Failure codes are those of architecture 7.1: no_text_layer, too_large, too_many_pages, corrupt.
`check_pdf_isolated` runs the gate in a child process with a timeout, so a damaged file never hangs the caller (EC01).
"""

from __future__ import annotations

import multiprocessing
import os
import time
import unicodedata
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass, field
from multiprocessing.connection import Connection
from pathlib import Path
from typing import Any, Literal

import pypdfium2 as pdfium  # type: ignore[import-untyped]  # no py.typed
import pypdfium2.raw as pdfium_c  # type: ignore[import-untyped]

Status = Literal["ok", "no_text_layer", "too_large", "too_many_pages", "corrupt"]

MAX_BYTES = 50 * 1024 * 1024  # INT-DOC-001 "50 MB"; the unit (MiB or 10^6) is not stated, see report.md section 6
MAX_PAGES = 500  # INT-DOC-001 (technical assumption)
MIN_PAGE_RATIO = 0.8  # architecture 7.1
MIN_CHARS = 200  # N proposed by this spike (PID-00028 report.md 3.7), measured on the sample set
HEADER_WINDOW = 1024  # "%PDF-" must start within the first KiB, as PDF readers accept

_ERRORS = {
    pdfium_c.FPDF_ERR_FILE: "file",
    pdfium_c.FPDF_ERR_FORMAT: "format",
    pdfium_c.FPDF_ERR_PASSWORD: "password",
    pdfium_c.FPDF_ERR_SECURITY: "security",
    pdfium_c.FPDF_ERR_PAGE: "page",
}
_INVALID_CATEGORIES = {"Cc", "Cf", "Cs", "Co", "Cn"}  # control, format, surrogate, private use, unassigned


@dataclass(frozen=True)
class PageInfo:
    raw_chars: int  # FPDFText_CountChars, includes characters PDFium generates (spaces, line breaks)
    valid_chars: int  # non-space characters that are not U+FFFD, control, private use or unassigned
    image_cover: float  # largest image object area / page area (0 when the page has no image)
    invisible_share: float  # share of valid characters drawn with text render mode 3 (an OCR layer)


@dataclass(frozen=True)
class CheckResult:
    status: Status
    reason: str = ""
    size: int = 0
    header_offset: int | None = None
    pages: int | None = None  # None: rejected before the page count was read
    text_pages: int | None = None
    page_info: tuple[PageInfo, ...] = field(default_factory=tuple)
    elapsed_s: float = 0.0

    @property
    def scan_like(self) -> bool:
        """>= 80 % of pages are one near-full-page image (a scan), whatever text layer it carries."""
        if not self.page_info:
            return False
        return sum(p.image_cover >= 0.85 for p in self.page_info) >= MIN_PAGE_RATIO * len(self.page_info)

    def to_json(self) -> dict[str, Any]:
        data = asdict(self)
        data["scan_like"] = self.scan_like
        return data


def count_valid_chars(text: str) -> int:
    text = unicodedata.normalize("NFC", text)
    return sum(
        1 for c in text if not c.isspace() and c != "\ufffd" and unicodedata.category(c) not in _INVALID_CATEGORIES
    )


def has_text_layer(valid_chars: Sequence[int], min_chars: int = MIN_CHARS, min_ratio: float = MIN_PAGE_RATIO) -> bool:
    if not valid_chars:
        return False
    return sum(n >= min_chars for n in valid_chars) >= min_ratio * len(valid_chars)


def _image_cover(page: pdfium.PdfPage) -> float:
    width, height = page.get_size()
    area = max(width * height, 1.0)
    best = 0.0
    for obj in page.get_objects(filter=[pdfium_c.FPDF_PAGEOBJ_IMAGE], max_depth=3):
        left, bottom, right, top = obj.get_bounds()
        w = max(0.0, min(right, width) - max(left, 0.0))
        h = max(0.0, min(top, height) - max(bottom, 0.0))
        best = max(best, w * h / area)
    return round(best, 3)


def _invisible_share(textpage: pdfium.PdfTextPage, count: int) -> float:
    valid = invisible = 0
    for index in range(count):
        code = pdfium_c.FPDFText_GetUnicode(textpage, index)
        char = chr(code) if 0 < code <= 0x10FFFF else "\ufffd"
        if char.isspace() or char == "\ufffd" or unicodedata.category(char) in _INVALID_CATEGORIES:
            continue
        valid += 1
        obj = pdfium_c.FPDFText_GetTextObject(textpage, index)
        if obj and pdfium_c.FPDFTextObj_GetTextRenderMode(obj) == pdfium_c.FPDF_TEXTRENDERMODE_INVISIBLE:
            invisible += 1
    return round(invisible / valid, 3) if valid else 0.0


def page_info(page: pdfium.PdfPage) -> tuple[PageInfo, str]:
    """Counts for one page and its text in PDFium order."""
    textpage = page.get_textpage()
    try:
        raw = textpage.count_chars()
        text = textpage.get_text_range(0, raw) if raw > 0 else ""
        cover = _image_cover(page)
        # The OCR-layer share is only needed on scan-like pages; skip the per-character walk elsewhere.
        share = _invisible_share(textpage, raw) if cover >= 0.5 else 0.0
        return PageInfo(raw, count_valid_chars(text), cover, share), text
    finally:
        textpage.close()


def _header_offset(path: Path) -> int | None:
    with path.open("rb") as f:
        head = f.read(HEADER_WINDOW)
    offset = head.find(b"%PDF-")
    return offset if offset >= 0 else None


def check_pdf(
    path: str | os.PathLike[str],
    *,
    min_chars: int = MIN_CHARS,
    min_ratio: float = MIN_PAGE_RATIO,
    max_bytes: int = MAX_BYTES,
    max_pages: int = MAX_PAGES,
) -> CheckResult:
    """The gate of architecture 7.1 step 2. Limits are read before any page content (EC02)."""
    start = time.perf_counter()
    path = Path(path)

    def done(status: Status, reason: str = "", **kw: Any) -> CheckResult:
        return CheckResult(status, reason, elapsed_s=round(time.perf_counter() - start, 4), **kw)

    try:
        size = path.stat().st_size
        offset = _header_offset(path)
    except OSError as exc:
        return done("corrupt", f"unreadable: {exc.strerror}")
    if offset is None:
        return done("corrupt", "no %PDF- header in the first 1 KiB", size=size)
    if size > max_bytes:
        return done("too_large", f"{size} bytes > {max_bytes}", size=size, header_offset=offset)
    try:
        pdf = pdfium.PdfDocument(path)
    except pdfium.PdfiumError as exc:
        code = _ERRORS.get(exc.err_code, "unknown") if exc.err_code is not None else "unknown"
        return done("corrupt", f"pdfium: {code}", size=size, header_offset=offset)
    try:
        pages = len(pdf)
        if pages == 0:
            return done("corrupt", "no pages", size=size, header_offset=offset, pages=0)
        if pages > max_pages:
            return done("too_many_pages", f"{pages} pages > {max_pages}", size=size, header_offset=offset, pages=pages)
        infos: list[PageInfo] = []
        for index in range(pages):
            try:
                page = pdf[index]
            except pdfium.PdfiumError:
                return done("corrupt", f"page {index + 1} does not load", size=size, header_offset=offset, pages=pages)
            try:
                infos.append(page_info(page)[0])
            finally:
                page.close()
    finally:
        pdf.close()
    text_pages = sum(p.valid_chars >= min_chars for p in infos)
    status: Status = "ok" if has_text_layer([p.valid_chars for p in infos], min_chars, min_ratio) else "no_text_layer"
    reason = "" if status == "ok" else f"{text_pages}/{pages} pages with >= {min_chars} characters"
    return done(
        status, reason, size=size, header_offset=offset, pages=pages, text_pages=text_pages, page_info=tuple(infos)
    )


def _child(conn: Connection, path: str, kwargs: dict[str, Any]) -> None:
    conn.send(check_pdf(path, **kwargs))
    conn.close()


def check_pdf_isolated(
    path: str | os.PathLike[str],
    *,
    timeout_s: float = 60.0,
    _worker: Callable[[Connection, str, dict[str, Any]], None] = _child,
    **kwargs: Any,
) -> CheckResult:
    """`check_pdf` in a child process: a crash or a run past `timeout_s` returns corrupt instead of hanging.

    `_worker` replaces the child's function in tests (a worker that hangs or dies).
    """
    ctx = multiprocessing.get_context("spawn")
    parent, child = ctx.Pipe(duplex=False)
    start = time.perf_counter()
    proc = ctx.Process(target=_worker, args=(child, os.fspath(path), kwargs), daemon=True)
    proc.start()
    child.close()
    try:
        if parent.poll(timeout_s):
            try:
                result: CheckResult = parent.recv()
                return result
            except EOFError:
                pass  # the child died before sending: handled below
        reason = "timeout" if proc.is_alive() else f"worker exited with code {proc.exitcode}"
        return CheckResult("corrupt", reason, elapsed_s=round(time.perf_counter() - start, 4))
    finally:
        parent.close()
        if proc.is_alive():
            proc.kill()
        proc.join(5)
