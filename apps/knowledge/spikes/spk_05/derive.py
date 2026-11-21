# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Derive the generated part of the sample set from the downloaded PDFs (deterministic; nothing is committed).

    python -m spikes.spk_05.derive [--data DIR]

Kinds and the gate status each must get:
  scan        pages rasterised at 150 dpi into an image-only PDF                         -> no_text_layer
  scan_stamp  scan + one visible download banner per page (~120 characters)             -> no_text_layer
  scan_cover  scan_stamp + a text cover page (~1,500 characters), as some archives add  -> no_text_layer
  ocr         scan + the original text as an invisible layer (an OCR'd scan)            -> ok, scan_like
  trunc50/90  the first 50 % / 90 % of the file's bytes                                 -> corrupt (EC01)
  prefix2k    2 KiB of junk before the %PDF- header                                     -> corrupt
  garbage, html, empty, encrypted                                                       -> corrupt (EC01)
  pages500 / pages501                                                                   -> ok / too_many_pages
  size_limit / size_over (exactly 50 MiB / one byte more)                               -> ok / too_large
"""

from __future__ import annotations

import argparse
import csv
import io
import random
import sys
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import pypdfium2 as pdfium  # type: ignore[import-untyped]  # no py.typed

from . import pdfgen
from .fetch import data_dir, read_manifest
from .text_layer import MAX_BYTES, MAX_PAGES

SCAN_DPI = 150
SCAN_PAGES = 10  # first pages of each born-digital sample
JPEG_QUALITY = 60
STAMP = (
    "This content downloaded from 203.0.113.7 on Sat, 21 Nov 2026 10:00:00 UTC. All use subject to the terms of use."
)
COVER = (
    "Digitised copy supplied by the repository for private research and study only. The digitised copy reproduces "
    "the printed original page by page; the pages that follow are images of the printed pages and carry no "
    "searchable text of their own. Citation details, persistent identifier, collection, shelfmark, date of "
    "digitisation and the terms of use are listed below so that the copy can be cited and traced. "
)
# One per field group for the stamped scans, three for the cover, three for the OCR layer, three of each truncation.
STAMPED = ["med-bmc-creatine", "econ-plos-monetary", "math-arxiv-harmonic", "cs-acl-unicoder", "vi-ssh-tayson"]
COVERED = ["psy-front-anxiety", "phys-arxiv-backflow", "vi-ssh-cuchi"]
OCRED = ["econ-heliyon-remittance", "math-arxiv-fracture", "vi-ssh-cuchi"]
TRUNCATED = ["phys-scirep-taviscummings", "cs-acl-usersim", "vi-ssh-tayson"]


@dataclass(frozen=True)
class Derived:
    id: str
    base: str
    kind: str
    expect: str  # expected gate status
    field: str
    lang: str


def _render(page: pdfium.PdfPage) -> pdfgen.Image:
    bitmap = page.render(scale=SCAN_DPI / 72)
    image = bitmap.to_pil().convert("L")
    buf = io.BytesIO()
    image.save(buf, "JPEG", quality=JPEG_QUALITY)
    return pdfgen.Image(buf.getvalue(), image.width, image.height, "DCTDecode")


def _ocr_runs(page: pdfium.PdfPage) -> list[pdfgen.Run]:
    """The page text as invisible lines at the left margin (position is irrelevant to the gate)."""
    textpage = page.get_textpage()
    try:
        lines = [line for line in textpage.get_text_range().splitlines() if line.strip()]
    finally:
        textpage.close()
    _, height = page.get_size()
    return [pdfgen.Run(36, height - 36 - i * 9, line, 8, invisible=True) for i, line in enumerate(lines)]


def _scans(source: Path, kinds: set[str]) -> dict[str, bytes]:
    pdf = pdfium.PdfDocument(source)
    try:
        plain: list[pdfgen.Page] = []
        stamped: list[pdfgen.Page] = []
        ocr: list[pdfgen.Page] = []
        for index in range(min(len(pdf), SCAN_PAGES)):
            page = pdf[index]
            try:
                size = page.get_size()
                image = _render(page)
                plain.append(pdfgen.scan_page(image, size=size))
                stamped.append(pdfgen.scan_page(image, stamp=STAMP, size=size))
                if "ocr" in kinds:
                    ocr.append(pdfgen.scan_page(image, ocr=_ocr_runs(page), size=size))
            finally:
                page.close()
    finally:
        pdf.close()
    text = COVER * 4
    cover = pdfgen.text_page([text[i : i + 95] for i in range(0, len(text), 95)])
    out = {"scan": pdfgen.build(plain)}
    if "scan_stamp" in kinds:
        out["scan_stamp"] = pdfgen.build(stamped)
    if "scan_cover" in kinds:
        out["scan_cover"] = pdfgen.build([cover, *stamped])
    if "ocr" in kinds:
        out["ocr"] = pdfgen.build(ocr)
    return out


def _sized(target: int) -> bytes:
    """A valid one-page PDF of exactly `target` bytes, padded with an unused stream."""
    page = [pdfgen.text_page(_lines(40))]
    padding = target - len(pdfgen.build(page))
    for _ in range(4):
        data = pdfgen.build(page, padding=max(padding, 0))
        padding += target - len(data)
        if len(data) == target:
            return data
    raise RuntimeError(f"could not hit {target} bytes")


def _lines(n: int) -> list[str]:
    return [f"Generated line {i} with enough ordinary words to look like running text on a page." for i in range(n)]


def derive(data: Path) -> Iterator[Derived]:
    out = data / "derived"
    out.mkdir(exist_ok=True)
    for row in read_manifest():
        if row["label"] != "text" or not (data / f"{row['id']}.pdf").exists():
            continue
        base, src = row["id"], data / f"{row['id']}.pdf"
        kinds = {"scan"}
        kinds |= {"scan_stamp"} if base in STAMPED else set()
        kinds |= {"scan_stamp", "scan_cover"} if base in COVERED else set()
        kinds |= {"ocr"} if base in OCRED else set()
        for kind, pdf in _scans(src, kinds).items():
            (out / f"{base}~{kind}.pdf").write_bytes(pdf)
            yield Derived(
                f"{base}~{kind}", base, kind, "ok" if kind == "ocr" else "no_text_layer", row["field"], row["lang"]
            )
        if base in TRUNCATED:
            raw = src.read_bytes()
            for share in (50, 90):
                (out / f"{base}~trunc{share}.pdf").write_bytes(raw[: len(raw) * share // 100])
                yield Derived(f"{base}~trunc{share}", base, f"trunc{share}", "corrupt", row["field"], row["lang"])
        if base == "math-arxiv-harmonic":
            junk = bytes(random.Random(5).randrange(256) for _ in range(2048)).replace(b"%PDF-", b"%PDX-")
            (out / f"{base}~prefix2k.pdf").write_bytes(junk + src.read_bytes())
            yield Derived(f"{base}~prefix2k", base, "prefix2k", "corrupt", row["field"], row["lang"])
    rnd = random.Random(7)
    generated = {
        "gen~garbage": (b"%PDF-1.7\n" + bytes(rnd.randrange(256) for _ in range(200_000)), "corrupt"),
        "gen~html": (b"<!DOCTYPE html><html><body><h1>403 Forbidden</h1></body></html>\n", "corrupt"),
        "gen~empty": (b"", "corrupt"),
        "gen~encrypted": (pdfgen.build([pdfgen.text_page(_lines(50))] * 3, user_password="spk05"), "corrupt"),
        "gen~pages500": (pdfgen.build([pdfgen.text_page(_lines(20))] * MAX_PAGES), "ok"),
        "gen~pages501": (pdfgen.build([pdfgen.text_page(_lines(20))] * (MAX_PAGES + 1)), "too_many_pages"),
        "gen~size_limit": (_sized(MAX_BYTES), "ok"),
        "gen~size_over": (_sized(MAX_BYTES + 1), "too_large"),
    }
    for name, (pdf, expect) in generated.items():
        (out / f"{name}.pdf").write_bytes(pdf)
        yield Derived(name, "", name.split("~")[1], expect, "", "")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", help="sample folder (default $SPK05_DATA or ~/.cache/sires-spk05)")
    args = parser.parse_args(argv)
    data = data_dir(args.data)
    rows = list(derive(data))
    with (data / "derived.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(Derived.__dataclass_fields__), lineterminator="\n")
        writer.writeheader()
        writer.writerows(r.__dict__ for r in rows)
    print(f"{len(rows)} derived samples in {data / 'derived'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
