# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""PID-00028-AC02, EC01, EC02: the gate of architecture 7.1 (text_layer.py) on PDFs generated here.

The downloaded sample set is checked too when it is present ($SPK05_DATA, see README.md); without it that test skips.
"""

from __future__ import annotations

import csv
import os
import time
from multiprocessing.connection import Connection
from pathlib import Path
from typing import Any

import pypdfium2 as pdfium  # type: ignore[import-untyped]  # no py.typed
import pytest

from . import pdfgen
from .text_layer import (
    MAX_BYTES,
    MAX_PAGES,
    MIN_CHARS,
    MIN_PAGE_RATIO,
    check_pdf,
    check_pdf_isolated,
    count_valid_chars,
    has_text_layer,
)

STAMP = (
    "This content downloaded from 203.0.113.7 on Sat, 21 Nov 2026 10:00:00 UTC. All use subject to the terms of use."
)


def _lines(n: int, width: int = 90) -> list[str]:
    words = "the boundary layer stability analysis shows that monetary policy affects risk taking in banks".split()
    out = []
    for i in range(n):
        line = " ".join(words[(i + j) % len(words)] for j in range(14))
        out.append(line[:width])
    return out


def _write(tmp_path: Path, name: str, data: bytes) -> Path:
    path = tmp_path / name
    path.write_bytes(data)
    return path


def _born_digital(pages: int = 10, figure_pages: int = 2) -> bytes:
    """Text pages plus `figure_pages` pages that carry only a short caption, as figure pages do."""
    body = [pdfgen.text_page(_lines(45)) for _ in range(pages - figure_pages)]
    figures = [pdfgen.text_page(["Fig. 3. Pressure spectra at three stations."]) for _ in range(figure_pages)]
    return pdfgen.build(body[:2] + figures + body[2:])


def _scan(pages: int = 10, *, stamp: str | None = None, cover: bool = False, ocr: bool = False) -> bytes:
    image = pdfgen.gray_image(170, 240, seed=11)
    runs = [pdfgen.Run(72, 760 - i * 13, line, invisible=True) for i, line in enumerate(_lines(45))] if ocr else []
    scanned = [pdfgen.scan_page(image, stamp=stamp, ocr=runs) for _ in range(pages)]
    return pdfgen.build(([pdfgen.text_page(_lines(18))] if cover else []) + scanned)


def test_text_layer(tmp_path: Path) -> None:
    """AC02: at the proposed N, PDFs with a text layer pass and image-only scans are rejected as no_text_layer."""
    cases = {
        "born_digital.pdf": (_born_digital(), "ok"),
        "scan.pdf": (_scan(), "no_text_layer"),
        "scan_stamp.pdf": (_scan(stamp=STAMP), "no_text_layer"),
        "scan_cover.pdf": (_scan(stamp=STAMP, cover=True), "no_text_layer"),
    }
    for name, (data, expected) in cases.items():
        result = check_pdf(_write(tmp_path, name, data))
        assert result.status == expected, (name, result.reason)
    born = check_pdf(tmp_path / "born_digital.pdf")
    assert born.pages == 10 and born.text_pages == 8  # the two figure pages are below N, 8/10 >= 80 %
    stamp = check_pdf(tmp_path / "scan_stamp.pdf")
    assert all(0 < p.valid_chars < MIN_CHARS for p in stamp.page_info)  # a banner alone never reaches N
    assert all(p.image_cover >= 0.85 for p in stamp.page_info) and stamp.scan_like


def test_text_layer_ocr_scan_is_accepted_and_flagged(tmp_path: Path) -> None:
    """An OCR'd scan has a text layer, so the 7.1 rule accepts it; scan_like tells it apart (report.md 3.6)."""
    result = check_pdf(_write(tmp_path, "ocr.pdf", _scan(ocr=True)))
    assert result.status == "ok"
    assert result.scan_like
    assert all(p.invisible_share == 1.0 for p in result.page_info)
    born = check_pdf(_write(tmp_path, "born.pdf", _born_digital()))
    assert not born.scan_like


def test_text_layer_rule_boundaries() -> None:
    """>= N characters on >= 80 % of pages (architecture 7.1); both bounds are inclusive."""
    assert MIN_PAGE_RATIO == 0.8
    assert has_text_layer([MIN_CHARS] * 8 + [0, 0])
    assert not has_text_layer([MIN_CHARS] * 7 + [0, 0, 0])
    assert not has_text_layer([MIN_CHARS - 1] * 10)
    assert not has_text_layer([])
    # Spaces, U+FFFD, private-use and control characters are not counted; NFC composes Vietnamese diacritics.
    assert count_valid_chars("a b\u00a0c\n\ufffd\ue000\x02") == 3
    assert count_valid_chars("Vie\u0302\u0323t") == count_valid_chars("Việt") == 4


def _truncated(fraction: float) -> bytes:
    data = pdfgen.build([pdfgen.text_page(_lines(40)) for _ in range(3)])
    return data[: int(len(data) * fraction)]


def test_corrupt(tmp_path: Path) -> None:
    """EC01: damaged or password-protected PDFs return corrupt, in a child process with a timeout, without hanging."""
    cases = {
        "empty.pdf": b"",
        "html.pdf": b"<!DOCTYPE html><html><body>403 Forbidden</body></html>",
        "garbage.pdf": b"%PDF-1.7\n" + bytes((i * 37 + 11) % 256 for i in range(50_000)),
        "truncated50.pdf": _truncated(0.5),
        "truncated90.pdf": _truncated(0.9),
        "prefix2k.pdf": b"\x00junk" * 410 + pdfgen.build([pdfgen.text_page(_lines(40))]),
        "encrypted.pdf": pdfgen.build([pdfgen.text_page(_lines(40))], user_password="spk05"),
    }
    for name, data in cases.items():
        start = time.monotonic()
        result = check_pdf_isolated(_write(tmp_path, name, data), timeout_s=30)
        assert result.status == "corrupt", (name, result)
        assert time.monotonic() - start < 30, name
    assert check_pdf(tmp_path / "encrypted.pdf").reason == "pdfium: password"
    # The encrypted fixture is a real one: the right password opens it.
    pdf = pdfium.PdfDocument(tmp_path / "encrypted.pdf", password="spk05")
    assert len(pdf) == 1
    pdf.close()


def _hang(conn: Connection, path: str, kwargs: dict[str, Any]) -> None:
    time.sleep(600)


def _die(conn: Connection, path: str, kwargs: dict[str, Any]) -> None:
    os._exit(3)


def test_corrupt_never_hangs(tmp_path: Path) -> None:
    """EC01 "không treo": a worker that hangs is killed at the timeout, one that dies is reported; both corrupt."""
    path = _write(tmp_path, "any.pdf", _born_digital())
    start = time.monotonic()
    hung = check_pdf_isolated(path, timeout_s=2, _worker=_hang)
    assert hung.status == "corrupt" and hung.reason == "timeout"
    assert time.monotonic() - start < 20
    died = check_pdf_isolated(path, timeout_s=30, _worker=_die)
    assert died.status == "corrupt" and "exited" in died.reason
    assert check_pdf_isolated(path, timeout_s=60).status == "ok"


def test_limits(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """EC02: > 50 MB and > 500 pages are recognised before any page content is read."""
    # Size: a file one byte over the limit that is not otherwise a readable PDF; it is never opened.
    big = tmp_path / "big.pdf"
    with big.open("wb") as f:
        f.write(b"%PDF-1.7\n")
        f.truncate(MAX_BYTES + 1)
    result = check_pdf(big)
    assert (result.status, result.pages, result.size) == ("too_large", None, MAX_BYTES + 1)
    # Inclusive bound, checked with a small limit on a valid file.
    small = _write(tmp_path, "small.pdf", _born_digital())
    size = small.stat().st_size
    assert check_pdf(small, max_bytes=size).status == "ok"
    assert check_pdf(small, max_bytes=size - 1).status == "too_large"

    # Pages: no page may be loaded once the count is over the limit.
    def no_page(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("a page was loaded")

    many = _write(tmp_path, "many.pdf", pdfgen.build([pdfgen.text_page(["x"])] * (MAX_PAGES + 1)))
    with monkeypatch.context() as m:
        m.setattr(pdfium.PdfDocument, "get_page", no_page)
        m.setattr(pdfium.PdfDocument, "__getitem__", no_page)
        result = check_pdf(many)
    assert (result.status, result.pages, result.page_info) == ("too_many_pages", MAX_PAGES + 1, ())
    six = _write(tmp_path, "six.pdf", pdfgen.build([pdfgen.text_page(_lines(40))] * 6))
    assert check_pdf(six, max_pages=6).status == "ok"
    assert check_pdf(six, max_pages=5).status == "too_many_pages"


def _data() -> Path | None:
    path = Path(os.environ.get("SPK05_DATA") or Path.home() / ".cache" / "sires-spk05")
    return path if (path / "derived.csv").exists() else None


@pytest.mark.skipif(_data() is None, reason="sample set not downloaded (python -m spikes.spk_05.fetch, derive)")
def test_text_layer_samples() -> None:
    """AC02 on the downloaded and derived sample set: every sample gets its expected gate status at N."""
    data = _data()
    assert data is not None
    manifest = Path(__file__).with_name("samples.csv")
    with manifest.open(encoding="utf-8", newline="") as f:
        expected = {r["id"]: (data / f"{r['id']}.pdf", "ok") for r in csv.DictReader(f)}  # OCR'd scans pass 7.1
    with (data / "derived.csv").open(encoding="utf-8", newline="") as f:
        expected |= {r["id"]: (data / "derived" / f"{r['id']}.pdf", r["expect"]) for r in csv.DictReader(f)}
    wrong = {}
    for sample, (path, status) in expected.items():
        if not path.exists():
            continue
        got = check_pdf_isolated(path, timeout_s=120).status
        if got != status:
            wrong[sample] = (status, got)
    assert not wrong
