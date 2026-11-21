# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Reading order, References region and text scores used by extract.py (PID-00028-AC01 measurement code)."""

from __future__ import annotations

from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium  # type: ignore[import-untyped]  # no py.typed

from . import layout, pdfgen, truth
from .extract import column_agreement


def _column(prefix: str, n: int) -> list[str]:
    return [f"{prefix} line {i} carries words alpha{i} beta{i} gamma{i}" for i in range(n)]


def _two_column_pdf(tmp_path: Path, *, row_major: bool) -> Path:
    left, right = _column("Left", 30), _column("Right", 30)
    path = tmp_path / f"two_col_{row_major}.pdf"
    path.write_bytes(pdfgen.build([pdfgen.two_column_page(left, right, row_major=row_major)]))
    return path


def _layouts(path: Path) -> tuple[layout.PageLayout, layout.PageLayout, str]:
    with pdfplumber.open(path) as doc:
        page = doc.pages[0]
        plumber = layout.page_layout(page.extract_words(x_tolerance=1), float(page.width))
    pdf = pdfium.PdfDocument(path)
    try:
        p = pdf[0]
        textpage = p.get_textpage()
        raw = layout.clean_pdfium_text(textpage.get_text_range())
        segments, rotated = layout.pdfium_segments(textpage, p.get_height())
        boxes = layout.layout_from_segments(segments, p.get_width(), rotated)
        textpage.close()
        p.close()
    finally:
        pdf.close()
    return plumber, boxes, raw


def _column_major(page: layout.PageLayout) -> bool:
    texts = [s.text for s in page.segments]
    return texts == _column("Left", 30) + _column("Right", 30)


def test_column_order_when_the_stream_interleaves_columns(tmp_path: Path) -> None:
    """Content stream L1 R1 L2 R2 …: PDFium order interleaves; both layouts read left column, then right."""
    plumber, boxes, raw = _layouts(_two_column_pdf(tmp_path, row_major=True))
    assert plumber.columns == boxes.columns == 2
    assert _column_major(plumber) and _column_major(boxes)
    agreement = column_agreement(plumber, raw)
    assert agreement is not None and agreement["agreement"] < 0.9  # interleaved, about half
    assert column_agreement(plumber, "\n".join(s.text for s in plumber.segments)) == {
        "agreement": 1.0,
        "segments": 60,
        "column_runs": 2,
    }


def test_column_order_kept_when_the_stream_is_column_major(tmp_path: Path) -> None:
    plumber, boxes, raw = _layouts(_two_column_pdf(tmp_path, row_major=False))
    assert _column_major(plumber) and _column_major(boxes)
    agreement = column_agreement(plumber, raw)
    assert agreement is not None and agreement["agreement"] == 1.0


def test_single_column_page_is_not_split(tmp_path: Path) -> None:
    path = tmp_path / "one.pdf"
    path.write_bytes(pdfgen.build([pdfgen.text_page([f"Line {i} " + "word " * 15 for i in range(40)])]))
    plumber, boxes, _ = _layouts(path)
    assert plumber.columns == boxes.columns == 1


def test_references_start() -> None:
    body = [f"body line {i}" for i in range(20)]
    assert layout.references_start([*body, "References", "[1] A. Author."]) == 20
    assert layout.references_start([*body, "7. REFERENCES", "1. Smith"]) == 20
    assert layout.references_start([*body, "TÀI LIỆU THAM KHẢO", "1. Nguyễn"]) == 20
    # A "References" line in the opening part (a table of contents) is skipped for the late one.
    assert layout.references_start(["References", *body, "References"]) == 21
    # No heading: a numbered list "[1] … [2] …" (REVTeX) after the first fifth of the document.
    assert layout.references_start([*body, "[1] A. Author, Title.", "continued", "[2] B. Author."]) == 20
    assert layout.references_start([*body, "see [1] for details"]) is None


def test_join_lines_and_repeated_lines() -> None:
    assert layout.join_lines(["the trans-", "mission channel", "COVID-", "19 cases"]) == (
        "the transmission channel\nCOVID-\n19 cases"
    )
    # A running head that differs only by its page number is one repeated line; distinct body lines stay.
    pages = [
        layout.PageLayout(
            1,
            None,
            (
                layout.Segment(50, 300, 30, 40, f"Journal of Tests 2026, 9(1): {12 + i}"),
                layout.Segment(50, 300, 100, 110, f"body text {word}"),
            ),
            1,
            0,
        )
        for i, word in enumerate(["alpha", "beta", "gamma", "delta"])
    ]
    kept, dropped = layout.drop_repeated(pages)
    assert dropped == 4 and [p[0].text for p in kept] == [
        "body text alpha",
        "body text beta",
        "body text gamma",
        "body text delta",
    ]


def test_truth_scores(tmp_path: Path) -> None:
    text = " ".join(f"w{i}" for i in range(200))
    toks = truth.tokens(text)
    assert truth.score(text, toks) == truth.Score(anchors=197, found=197, coverage=1.0, order=1.0)
    half = toks[100:] + toks[:100]  # two blocks swapped: order drops, coverage stays
    swapped = truth.score(text, half)
    assert swapped.coverage > 0.98 and 0.4 < swapped.order < 0.6
    assert truth.score(text, toks[:100]).coverage < 0.5
    xml = tmp_path / "a.xml"
    xml.write_text(
        "<article xml:lang='vi'><front><article-meta><abstract><p>Tóm tắt ngắn.</p></abstract></article-meta></front>"
        "<body><sec><title>Mở đầu</title><p>Thân bài <xref>[1]</xref> có chữ.</p>"
        "<table-wrap><table><tr><td>ô bảng</td></tr></table></table-wrap></sec></body>"
        "<back><ref-list><ref><mixed-citation>Nguyễn A. Tên bài. 2020.</mixed-citation></ref></ref-list></back>"
        "</article>",
        encoding="utf-8",
    )
    gt = truth.load_jats(xml)
    assert gt.lang == "vi" and "Thân bài [1] có chữ." in gt.body and "ô bảng" not in gt.body
    assert "Tên bài" in gt.references and "Tên bài" not in gt.body
