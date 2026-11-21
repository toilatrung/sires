# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""SPK-05 measurement: gate, extraction quality by document type and field (PID-00028-AC01), N sweep (AC02).

    python -m spikes.spk_05.extract [--data DIR] [--out DIR] [--only ID,...] [--timeout S]

Run fetch and derive first. Four extractions are compared on every readable sample:
  pdfium         pypdfium2 page text in PDFium order (what the gate counts, ADR-15)
  plumber        pdfplumber extract_text() with its defaults (line clustering by height, no column handling)
  layout         pdfplumber words -> column-aware reading order (layout.py), header/footer dropped, hyphens joined
  pdfium_layout  the same reading order built on PDFium character boxes and PDFium's own word spaces
Writes results.json, tables.md and environment.json to --out (default agent/execution/PID-00028/spk05).
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import platform
import statistics
import sys
import time
import unicodedata
from collections import Counter
from collections.abc import Sequence
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any

import pdfplumber
import pypdfium2 as pdfium  # type: ignore[import-untyped]  # no py.typed

from . import layout, truth
from .fetch import data_dir, read_manifest
from .text_layer import MIN_CHARS, MIN_PAGE_RATIO, CheckResult, check_pdf_isolated, has_text_layer

REPO = Path(__file__).resolve().parents[4]
OUT = REPO / "agent" / "execution" / "PID-00028" / "spk05"
VARIANTS = ("pdfium", "plumber", "layout", "pdfium_layout")
WORD_X_TOLERANCE = 1.0  # pdfplumber default 3 glues the words of tightly set lines; 1 scored best in word_split
# Word-split settings compared on the samples with ground truth (pdfplumber extract_words keyword arguments).
WORD_SPLIT: dict[str, dict[str, float]] = {
    "x_tolerance=3": {"x_tolerance": 3},
    "x_tolerance=1.5": {"x_tolerance": 1.5},
    "x_tolerance=1": {"x_tolerance": 1},
    "x_tolerance=0.5": {"x_tolerance": 0.5},
    "x_tolerance_ratio=0.1": {"x_tolerance_ratio": 0.1},
}
N_GRID = [1, 10, 25, 50, 75, 100, 125, 150, 175, 200, 250, 300, 400, 500, 750, 1000, 1500]
FEATURES_VI = {
    "two_column": "hai cột",
    "one_column": "một cột",
    "formula": "công thức",
    "table": "bảng",
    "scanned": "ảnh quét thật (có OCR)",
    "vi": "tiếng Việt",
}


@dataclass(frozen=True)
class Sample:
    id: str
    path: Path
    field: str
    features: tuple[str, ...]
    lang: str
    klass: str  # text (born digital), scan (image only), ocr (scan + OCR layer), broken, limit
    expect: str  # expected gate status under the architecture 7.1 rule
    truth: Path | None
    derived: str  # "" for a downloaded sample, else the derivation kind


def load_samples(data: Path) -> list[Sample]:
    out: list[Sample] = []
    for row in read_manifest():
        path = data / f"{row['id']}.pdf"
        if not path.exists():
            continue
        xml = data / f"{row['id']}.xml"
        klass = "scan" if row["label"] == "scan" else "text"  # a real scan becomes "ocr" once its OCR layer is seen
        features = tuple(f for f in row["features"].split(";") if f)
        out.append(
            Sample(row["id"], path, row["field"], features, row["lang"], klass, "ok", xml if xml.exists() else None, "")
        )
    derived = data / "derived.csv"
    if derived.exists():
        with derived.open(encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                kind = row["kind"]
                klass = (
                    "scan"
                    if kind.startswith("scan")
                    else "ocr"
                    if kind == "ocr"
                    else "limit"
                    if kind.startswith(("pages", "size"))
                    else "broken"
                )
                out.append(
                    Sample(
                        row["id"],
                        data / "derived" / f"{row['id']}.pdf",
                        row["field"],
                        (),
                        row["lang"],
                        klass,
                        row["expect"],
                        None,
                        kind,
                    )
                )
    return out


def _char_stats(text: str) -> dict[str, int]:
    stats: Counter[str] = Counter()
    for c in text:
        if c in "\r\n\t ":
            continue
        cat = unicodedata.category(c)
        stats["chars"] += 1
        if c == "\ufffd":
            stats["fffd"] += 1
        elif cat == "Co":
            stats["private_use"] += 1
        elif cat in ("Cc", "Cf", "Cn", "Cs"):
            stats["control"] += 1
        elif cat == "Mn":
            stats["combining"] += 1
        if "\ufb00" <= c <= "\ufb06":
            stats["ligature"] += 1
    return dict(stats)


def _runs(labels: Sequence[str]) -> int:
    return sum(1 for i, c in enumerate(labels) if i == 0 or labels[i - 1] != c)


COLUMN_AGREEMENT_OK = 0.9


def column_agreement(page: layout.PageLayout, variant_text: str) -> dict[str, Any] | None:
    """How much of a two-column page's column-major order (from `layout`) this variant's text keeps.

    Each column segment of >= 4 words is located in the variant text by its first 4 words (unique on the page);
    agreement = longest run of segments in the same order / segments located. Reading the two columns line by line
    interleaves them and gives about 0.5; a page counts as in column order at >= 0.9, which tolerates a table cell
    or caption the variant places elsewhere.
    """
    if page.columns != 2:
        return None
    index = truth.unique_positions(truth.tokens(variant_text))
    located: list[int] = []
    columns: list[str] = []
    for seg in page.segments:
        toks = truth.tokens(seg.text)
        if seg.column in ("L", "R") and len(toks) >= truth.K and tuple(toks[: truth.K]) in index:
            located.append(index[tuple(toks[: truth.K])])
            columns.append(seg.column)
    if len(located) < 6:
        return None
    by_variant = [c for _, c in sorted(zip(located, columns, strict=True))]
    return {
        "agreement": round(truth.lis(located) / len(located), 3),
        "segments": len(located),
        "column_runs": _runs(by_variant),
    }


def _references(lines: Sequence[str], text_of: Any) -> dict[str, Any]:
    start = layout.references_start(lines)
    if start is None:
        return {"found": False, "line": None, "start_token": None, "heading": None}
    return {
        "found": True,
        "line": start,
        "share": round(start / max(len(lines), 1), 3),
        "start_token": len(truth.tokens(text_of(lines[:start]))),
        "heading": lines[start].strip()[:60],
    }


def _plain(lines: Sequence[str]) -> str:
    return "\n".join(lines)


def extract_doc(sample: Sample) -> dict[str, Any]:
    pages: dict[str, list[str]] = {v: [] for v in VARIANTS}
    layouts: list[layout.PageLayout] = []
    layouts_pdfium: list[layout.PageLayout] = []
    splits: dict[str, list[layout.PageLayout]] = {k: [] for k in WORD_SPLIT}
    t_boxes = 0.0
    t0 = time.perf_counter()
    pdf = pdfium.PdfDocument(sample.path)
    try:
        for index in range(len(pdf)):
            page = pdf[index]
            textpage = page.get_textpage()
            pages["pdfium"].append(layout.clean_pdfium_text(textpage.get_text_range()))
            t1 = time.perf_counter()
            segments, rotated = layout.pdfium_segments(textpage, page.get_height())
            layouts_pdfium.append(layout.layout_from_segments(segments, page.get_width(), rotated))
            t_boxes += time.perf_counter() - t1
            textpage.close()
            page.close()
    finally:
        pdf.close()
    t_pdfium = time.perf_counter() - t0 - t_boxes
    t0 = time.perf_counter()
    with pdfplumber.open(sample.path) as doc:
        for p in doc.pages:
            pages["plumber"].append(p.extract_text() or "")
            words = p.extract_words(x_tolerance=WORD_X_TOLERANCE, keep_blank_chars=False, use_text_flow=False)
            layouts.append(layout.page_layout(words, float(p.width)))
            if sample.truth is not None:
                for key, kwargs in WORD_SPLIT.items():
                    splits[key].append(layout.page_layout(p.extract_words(**kwargs), float(p.width)))
            p.flush_cache()
    t_plumber = time.perf_counter() - t0

    kept, dropped = layout.drop_repeated(layouts)
    kept_pdfium, dropped_pdfium = layout.drop_repeated(layouts_pdfium)
    lines = {
        "pdfium": [line for text in pages["pdfium"] for line in text.split("\n")],
        "plumber": [line for text in pages["plumber"] for line in text.split("\n")],
        "layout": [seg.text for page_segments in kept for seg in page_segments],
        "pdfium_layout": [seg.text for page_segments in kept_pdfium for seg in page_segments],
    }
    text_of = {"pdfium": _plain, "plumber": _plain, "layout": layout.join_lines, "pdfium_layout": layout.join_lines}
    texts = {v: text_of[v](lines[v]) for v in VARIANTS}
    two_col = [i for i, lay in enumerate(layouts) if lay.columns == 2]
    columns: dict[str, Any] = {}
    for variant in ("pdfium", "plumber"):
        checks = [column_agreement(layouts[i], pages[variant][i]) for i in two_col]
        valid = [c for c in checks if c is not None]
        columns[variant] = {
            "pages_checked": len(valid),
            "pages_in_order": sum(c["agreement"] >= COLUMN_AGREEMENT_OK for c in valid),
            "mean_agreement": round(statistics.mean(c["agreement"] for c in valid), 3) if valid else None,
            "detail": valid,
        }
    result: dict[str, Any] = {
        "pages": len(layouts),
        "two_column_pages": len(two_col),
        "two_column_pages_pdfium_layout": sum(lay.columns == 2 for lay in layouts_pdfium),
        "non_upright_words": sum(lay.non_upright_words for lay in layouts),
        "repeated_lines_dropped": {"layout": dropped, "pdfium_layout": dropped_pdfium},
        "seconds": {
            "pdfium": round(t_pdfium, 3),
            "pdfium_boxes": round(t_boxes, 3),
            "plumber_and_layout": round(t_plumber, 3),
        },
        "chars": {v: _char_stats(texts[v]) for v in VARIANTS},
        "cid_tokens": texts["plumber"].count("(cid:"),
        "columns": columns,
        "references": {v: _references(lines[v], text_of[v]) for v in VARIANTS},
        "appendix_lines": layout.appendix_starts(lines["layout"])[:5],
    }
    if sample.truth is not None:
        gt = truth.load_jats(sample.truth)
        extracted = {v: truth.tokens(texts[v]) for v in VARIANTS}
        result["truth"] = {
            "lang": gt.lang,
            "body": {v: asdict(truth.score(gt.body, toks)) for v, toks in extracted.items()},
            "word_split": {
                key: asdict(
                    truth.score(
                        gt.body,
                        truth.tokens(layout.join_lines([s.text for p in layout.drop_repeated(pls)[0] for s in p])),
                    )
                )
                for key, pls in splits.items()
            },
            "region": {
                v: asdict(truth.region_score(gt, extracted[v], result["references"][v]["start_token"]))
                for v in VARIANTS
            },
        }
    return result


def _gate_json(res: CheckResult) -> dict[str, Any]:
    data = res.to_json()
    data["page_info"] = [
        [p["raw_chars"], p["valid_chars"], p["image_cover"], p["invisible_share"]] for p in data["page_info"]
    ]
    return data


def n_sweep(gates: dict[str, CheckResult], samples: Sequence[Sample]) -> dict[str, Any]:
    """Document-level classification per N for text, scan and OCR'd scan classes (architecture 7.1 rule)."""
    classes: dict[str, list[list[int]]] = {"text": [], "scan": [], "ocr": []}
    for s in samples:
        res = gates.get(s.id)
        if s.klass in classes and res is not None and res.page_info and s.id != "gen~pages500":
            classes[s.klass].append([p.valid_chars for p in res.page_info])
    rows = []
    for n in sorted(set(N_GRID) | set(range(1, 2001))):
        fn = sum(not has_text_layer(doc, n) for doc in classes["text"])
        fp = sum(has_text_layer(doc, n) for doc in classes["scan"])
        ocr_text = sum(has_text_layer(doc, n) for doc in classes["ocr"])
        rows.append({"n": n, "text_rejected": fn, "scan_accepted": fp, "ocr_accepted": ocr_text})
    zero = [r["n"] for r in rows if r["text_rejected"] == 0 and r["scan_accepted"] == 0]
    pct = statistics.quantiles

    def pages(k: str) -> dict[str, float]:
        values = sorted(v for doc in classes[k] for v in doc)
        if len(values) < 2:
            return {"pages": len(values)}
        q = pct(values, n=100, method="inclusive")
        return {
            "pages": len(values),
            "min": values[0],
            "p1": q[0],
            "p5": q[4],
            "p50": q[49],
            "p95": q[94],
            "max": values[-1],
        }

    return {
        "documents": {k: len(v) for k, v in classes.items()},
        "page_valid_chars": {k: pages(k) for k in classes},
        "zero_error_range": [min(zero), max(zero)] if zero else None,
        "grid": [r for r in rows if r["n"] in N_GRID or r["n"] == MIN_CHARS],
    }


def _pct(x: float) -> str:
    return f"{100 * x:.1f}".replace(".", ",")


def _num(x: float, digits: int = 0) -> str:
    return f"{x:,.{digits}f}".replace(",", " ").replace(".", ",").replace(" ", ".")


def tables(
    samples: Sequence[Sample],
    gates: dict[str, CheckResult],
    docs: dict[str, dict[str, Any]],
    sweep: dict[str, Any],
    fetch_log: list[dict[str, Any]],
) -> str:
    out: list[str] = []
    w = out.append
    w("# SPK-05 — bảng kết quả (sinh bởi `extract.py`)\n")
    w(
        f"N = {MIN_CHARS} ký tự hợp lệ/trang, tỷ lệ trang {MIN_PAGE_RATIO:.0%}. "
        "Cách trích: `pdfium` = pypdfium2 theo thứ tự PDFium; `plumber` = pdfplumber `extract_text()` mặc định; "
        "`layout` = từ của pdfplumber, thứ tự theo cột (layout.py); `pdfium_layout` = cùng thứ tự theo cột, dựng trên "
        "hộp ký tự và khoảng trắng của PDFium.\n"
    )
    w("## 1. Theo tài liệu\n")
    w(
        "| Mẫu | Lĩnh vực | Đặc điểm | Trang | Cổng | Trang ≥ N | Ký tự/trang (TV) | Ký tự lỗi ‰ | Trang 2 cột "
        "| Đúng thứ tự cột: pdfium / plumber | References (layout) | s/trang (pdfium + plumber) |"
    )
    w("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for s in samples:
        if s.derived or s.id not in docs:
            continue
        g, d = gates[s.id], docs[s.id]
        vc = [p.valid_chars for p in g.page_info]
        st = d["chars"]["pdfium"]
        bad = st.get("fffd", 0) + st.get("private_use", 0) + st.get("control", 0)
        col = d["columns"]
        colstr = " / ".join(f"{col[v]['pages_in_order']}/{col[v]['pages_checked']}" for v in ("pdfium", "plumber"))
        ref = d["references"]["layout"]
        refstr = f"có, {_pct(ref['share'])} %" if ref["found"] else "không thấy"
        secs = (d["seconds"]["pdfium"] + d["seconds"]["plumber_and_layout"]) / max(d["pages"], 1)
        bad_rate = _num(1000 * bad / max(st.get("chars", 1), 1), 2)
        w(
            f"| `{s.id}` | {s.field} | {', '.join(s.features) or '—'} | {g.pages} | {g.status} | "
            f"{g.text_pages}/{g.pages} | {_num(statistics.median(vc))} | {bad_rate} | "
            f"{d['two_column_pages']} | {colstr if d['two_column_pages'] else '—'} | {refstr} | {_num(secs, 3)} |"
        )
    w("\n## 2. So với đáp án JATS (phủ / thứ tự, %)\n")
    w(
        "| Mẫu | Neo | pdfium | plumber | layout | pdfium_layout | References: tham khảo trong vùng loại / thân bài "
        "lọt vào vùng — pdfium / layout / pdfium_layout |"
    )
    w("| --- | --- | --- | --- | --- | --- | --- |")
    for s in samples:
        t = docs.get(s.id, {}).get("truth")
        if not t:
            continue
        body = t["body"]
        cells = [f"{_pct(body[v]['coverage'])} / {_pct(body[v]['order'])}" for v in VARIANTS]
        reg = t["region"]
        regs = " · ".join(
            f"{_pct(reg[v]['ref_after_start'])} / {_pct(reg[v]['body_after_start'])}"
            for v in ("pdfium", "layout", "pdfium_layout")
        )
        w(f"| `{s.id}` | {_num(body['layout']['anchors'])} | " + " | ".join(cells) + f" | {regs} |")
    w("\nTách từ của pdfplumber (`extract_words`) cho cách `layout`, phủ / thứ tự (%):\n")
    keys = list(WORD_SPLIT)
    w("| Mẫu | " + " | ".join(f"`{k}`" for k in keys) + " |")
    w("| --- | " + " | ".join("---" for _ in keys) + " |")
    for s in samples:
        t = docs.get(s.id, {}).get("truth")
        if t:
            ws = t["word_split"]
            w(f"| `{s.id}` | " + " | ".join(f"{_pct(ws[k]['coverage'])} / {_pct(ws[k]['order'])}" for k in keys) + " |")
    w("\n## 3. Theo loại tài liệu và lĩnh vực (AC01)\n")
    w(
        "| Nhóm | Tài liệu | Trang | Cổng ok | Ký tự/trang TV | Ký tự lỗi ‰ "
        "| Trang 2 cột đúng thứ tự: pdfium / plumber "
        "| Phủ đáp án (TB, số bài có đáp án): "
        + " / ".join(VARIANTS)
        + " | Thứ tự (TB): "
        + " / ".join(VARIANTS)
        + " | Thấy References: layout / pdfium_layout |"
    )
    w("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    real = [s for s in samples if not s.derived and s.id in docs]

    def group(name: str, members: list[Sample]) -> None:
        if not members:
            return
        g = [gates[s.id] for s in members]
        d = [docs[s.id] for s in members]
        vc = [p.valid_chars for res in g for p in res.page_info]
        chars = sum(x["chars"]["pdfium"].get("chars", 0) for x in d)
        bad = sum(x["chars"]["pdfium"].get(k, 0) for x in d for k in ("fffd", "private_use", "control"))
        col = {
            v: (sum(x["columns"][v]["pages_in_order"] for x in d), sum(x["columns"][v]["pages_checked"] for x in d))
            for v in ("pdfium", "plumber")
        }
        truths = [x["truth"]["body"] for x in d if "truth" in x]
        cov = (
            (
                " / ".join(_pct(statistics.mean(t[v]["coverage"] for t in truths)) for v in VARIANTS)
                + f" ({len(truths)})"
            )
            if truths
            else "—"
        )
        order = " / ".join(_pct(statistics.mean(t[v]["order"] for t in truths)) for v in VARIANTS) if truths else "—"
        cols = " / ".join(f"{a}/{b}" for a, b in col.values()) if col["pdfium"][1] or col["plumber"][1] else "—"
        refs = " / ".join(str(sum(x["references"][v]["found"] for x in d)) for v in ("layout", "pdfium_layout"))
        passed = sum(r.status == "ok" for r in g)
        w(
            f"| {name} | {len(members)} | {sum(r.pages or 0 for r in g)} | {passed}/{len(g)} | "
            f"{_num(statistics.median(vc))} | {_num(1000 * bad / max(chars, 1), 2)} | {cols} | {cov} | {order} | "
            f"{refs} (/{len(d)}) |"
        )

    for feature, label in FEATURES_VI.items():
        if feature == "one_column":
            members = [s for s in real if "two_column" not in s.features and s.klass == "text"]
        elif feature == "vi":
            members = [s for s in real if s.lang == "vi"]
        else:
            members = [s for s in real if feature in s.features]
        group(f"Loại: {label}", members)
    for field in sorted({s.field for s in real}):
        group(f"Lĩnh vực: {field}", [s for s in real if s.field == field])
    group("Tất cả tài liệu có lớp văn bản gốc", [s for s in real if s.klass == "text"])

    w("\n## 4. Cổng kiểm trên mẫu dẫn xuất (EC01, EC02, AC02)\n")
    w("| Mẫu | Loại | Mong đợi | Kết quả | Lý do | Trang | scan_like | Thời gian (s) |")
    w("| --- | --- | --- | --- | --- | --- | --- | --- |")
    for s in samples:
        if not s.derived:
            continue
        g = gates[s.id]
        mark = "" if g.status == s.expect else " ⚠"
        pages = g.pages if g.pages is not None else "—"
        w(
            f"| `{s.id}` | {s.derived} | {s.expect} | {g.status}{mark} | {g.reason or '—'} | {pages} "
            f"| {'có' if g.scan_like else 'không'} | {_num(g.elapsed_s, 3)} |"
        )
    w("\n## 5. Quét N (AC02)\n")
    docs_n = sweep["documents"]
    w(
        f"Tài liệu: {docs_n['text']} có lớp văn bản gốc, {docs_n['scan']} ảnh quét không lớp văn bản (mô phỏng), "
        f"{docs_n['ocr']} ảnh quét có lớp OCR (3 thật, 3 mô phỏng). Khoảng N không sai tài liệu nào "
        f"(lớp văn bản gốc và ảnh quét không lớp): {sweep['zero_error_range']}.\n"
    )
    w("| N | Lớp văn bản gốc bị từ chối | Ảnh quét được nhận | Ảnh quét có OCR được nhận |")
    w("| --- | --- | --- | --- |")
    for r in sweep["grid"]:
        bold = "**" if r["n"] == MIN_CHARS else ""
        w(
            f"| {bold}{r['n']}{bold} | {r['text_rejected']}/{docs_n['text']} | {r['scan_accepted']}/{docs_n['scan']} | "
            f"{r['ocr_accepted']}/{docs_n['ocr']} |"
        )
    w("\nKý tự hợp lệ mỗi trang:\n")
    w("| Lớp | Trang | min | p1 | p5 | p50 | p95 | max |")
    w("| --- | --- | --- | --- | --- | --- | --- | --- |")
    for k, v in sweep["page_valid_chars"].items():
        w(
            f"| {k} | {v['pages']} | "
            + " | ".join(_num(v.get(q, 0)) for q in ("min", "p1", "p5", "p50", "p95", "max"))
            + " |"
        )
    w("\n## 6. Tải bộ mẫu (EC03)\n")
    w("| Mẫu | File | Trạng thái | Byte | Giây |")
    w("| --- | --- | --- | --- | --- |")
    for r in fetch_log:
        w(f"| `{r['id']}` | {r['kind']} | {r['status']} | {_num(r['bytes'])} | {_num(r['seconds'], 2)} |")
    return "\n".join(out) + "\n"


def license_footer(out_dir: Path) -> str:
    """The Markdown notice of scripts/docs/add-license.mjs, so that a regenerated tables.md keeps it."""
    rel = Path(os.path.relpath(REPO / "LICENSES.md", out_dir.resolve())).as_posix()
    return (
        "\n---\n\n<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->\n"
        "SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. "
        "Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. "
        f"See [LICENSES.md]({rel}).\n"
    )


def environment() -> dict[str, Any]:
    from importlib.metadata import version

    return {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "machine": platform.machine(),
        "cpus": os.cpu_count(),
        "packages": {p: version(p) for p in ("pypdfium2", "pdfplumber", "pdfminer.six", "pillow")},
        "pdfium": str(pdfium.PDFIUM_INFO),
        "min_chars": MIN_CHARS,
        "min_page_ratio": MIN_PAGE_RATIO,
        "word_x_tolerance": WORD_X_TOLERANCE,
        "run_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", help="sample folder (default $SPK05_DATA or ~/.cache/sires-spk05)")
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--only", help="comma-separated sample ids")
    parser.add_argument("--timeout", type=float, default=120.0, help="gate timeout per file, seconds")
    args = parser.parse_args(argv)
    data = data_dir(args.data)
    samples = load_samples(data)
    if args.only:
        wanted = set(args.only.split(","))
        samples = [s for s in samples if s.id in wanted]
    gates: dict[str, CheckResult] = {}
    docs: dict[str, dict[str, Any]] = {}
    for i, s in enumerate(samples):
        gate = gates[s.id] = check_pdf_isolated(s.path, timeout_s=args.timeout)
        line = f"{s.id:40} gate={gate.status:15}"
        if s.klass == "scan" and not s.derived and gate.page_info:
            if statistics.mean(p.invisible_share for p in gate.page_info) >= 0.5:
                samples[i] = s = replace(s, klass="ocr")
        if not s.derived and gate.status == "ok":
            try:
                docs[s.id] = extract_doc(s)
            except Exception as exc:  # one unreadable sample must not stop the run; it is reported
                print(f"{line} extract failed: {type(exc).__name__}: {exc}", flush=True)
                continue
            t = docs[s.id].get("truth", {}).get("body", {})
            line += " " + " ".join(f"{v}={t[v]['coverage']:.3f}/{t[v]['order']:.3f}" for v in t)
        print(line, flush=True)
    sweep = n_sweep(gates, samples)
    log_path = data / "fetch-log-samples.json"
    fetch_log = json.loads(log_path.read_text(encoding="utf-8")) if log_path.exists() else []
    args.out.mkdir(parents=True, exist_ok=True)
    results = {
        "environment": environment(),
        "samples": [
            {
                **{
                    k: (str(v) if isinstance(v, Path) else v)
                    for k, v in asdict(s).items()
                    if k not in ("path", "truth")
                },
                "has_truth": s.truth is not None,
                "gate": _gate_json(gates[s.id]),
                "extract": docs.get(s.id),
            }
            for s in samples
        ],
        "n_sweep": sweep,
    }
    (args.out / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    (args.out / "environment.json").write_text(json.dumps(results["environment"], indent=2), encoding="utf-8")
    report = tables(samples, gates, docs, sweep, fetch_log) + license_footer(args.out)
    (args.out / "tables.md").write_text(report, encoding="utf-8")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
