# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""PID-00033 S01, S02 — CSV format, validator and JSONL converter (AC01–AC03, EC01–EC04)."""

from __future__ import annotations

import csv
import json
import os
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

import pytest
from eval_support import (
    EVAL_DIR,
    HEADERS,
    SAMPLE,
    TEMPLATE,
    csv_bytes,
    evidence_rows,
    topic_rows,
    write_topic,
)

from sires_eval.datasets import (
    CITATION_OUTCOMES,
    EVIDENCE_RELATIONS,
    FILES,
    SUPPORT_LABELS,
    DatasetInvalid,
    Issue,
    convert,
    load_jsonl,
    validate,
)
from sires_eval.datasets.__main__ import main as cli

EXCEL_CLAIMS = Path(__file__).parent / "fixtures" / "excel-vi-VN-claims.csv"


def where(issues: list[Issue]) -> set[tuple[str, int | None, str | None, str]]:
    return {(i.file, i.row, i.column, i.code) for i in issues}


def codes(issues: list[Issue]) -> set[str]:
    return {i.code for i in issues}


# --- S01: format ---------------------------------------------------------------------------------------------------


def test_template_matches_format() -> None:
    """eval/datasets/template/ has every file with exactly the defined columns, in order, saved as Excel does."""
    for spec in FILES:
        raw = (TEMPLATE / spec.name).read_bytes()
        assert raw.startswith(b"\xef\xbb\xbf"), f"{spec.name} must start with the UTF-8 BOM for Excel"
        assert raw.endswith(b"\r\n")
        header = next(csv.reader(raw.decode("utf-8-sig").splitlines()))
        assert header == [c.name for c in spec.columns] == HEADERS[spec.name]


def test_labels_follow_contract() -> None:
    """Label values come from docs/api-design/components/schemas/evidence.yaml."""
    assert SUPPORT_LABELS == ("Supported", "Partially Supported", "Unsupported", "Conflicting")
    assert CITATION_OUTCOMES == ("resolved", "mismatch")
    assert EVIDENCE_RELATIONS == ("supports", "contradicts", "context")


def test_template_reports_missing_data() -> None:
    """O1: the empty template fails exactly where data is missing, and nowhere else."""
    result = validate(TEMPLATE)
    assert where(result.errors) == {
        ("topic.csv", 2, None, "no_rows"),
        ("references.csv", 2, None, "no_rows"),
        ("claims.csv", 2, None, "no_rows"),
    }
    assert ("citations.csv", 2, None, "no_rows") in where(result.warnings)


# --- S02: validator and converter ----------------------------------------------------------------------------------


def test_sample_ok(tmp_path: Path) -> None:
    """PID-00033-AC01: eval/datasets/sample/ passes and converts to JSONL."""
    result = validate(SAMPLE)
    assert result.errors == []
    assert codes(result.warnings) == {"incomplete_set"}  # one sample topic, not the full 5-topic set

    out = tmp_path / "out"
    conversion = convert(SAMPLE, out)
    assert sorted(p.name for p in out.iterdir()) == [
        "citations.jsonl",
        "claims.jsonl",
        "evidence.jsonl",
        "manifest.json",
        "references.jsonl",
        "topics.jsonl",
    ]
    data = load_jsonl(out)
    assert conversion.counts == {"topics": 1, "references": 4, "claims": 6, "citations": 7, "evidence": 6}
    assert {k: len(v) for k, v in data.items() if k != "manifest"} == conversion.counts

    topic = data["topics"][0]
    assert topic["topic_id"] == "T01-MAU"
    assert topic["title"] == "Học tập kết hợp và kết quả học tập của sinh viên năm nhất"
    assert {c["support_label"] for c in data["claims"]} == set(SUPPORT_LABELS)
    assert all(c["topic_id"] == "T01-MAU" for c in data["claims"])
    reference = next(r for r in data["references"] if r["reference_id"] == "R01")
    assert reference["authors"] == ["Nguyễn Văn An", "Trần Thị Bình"]
    assert reference["year"] == 2021 and reference["doi"] is None
    mismatch = [c for c in data["citations"] if c["expected_outcome"] == "mismatch"]
    assert [c["citation_id"] for c in mismatch] == ["CT006"]
    claim = next(c for c in data["claims"] if c["claim_id"] == "C002")
    assert claim["source"] == {"file": "T01-hoc-tap-ket-hop/claims.csv", "row": 3}
    assert data["manifest"]["topics"][0]["has_evidence"] is True
    assert data["manifest"]["format_version"] == 1

    # Same CSV, same bytes: the JSONL is reproducible and holds no machine-specific path.
    again = tmp_path / "again"
    convert(SAMPLE, again)
    for name in ("claims.jsonl", "manifest.json"):
        assert (out / name).read_bytes() == (again / name).read_bytes()
    assert str(EVAL_DIR) not in (out / "manifest.json").read_text(encoding="utf-8")


def test_errors_by_row(tmp_path: Path) -> None:
    """PID-00033-AC02: unknown reference, label off the list, missing column — all reported by file, row, column."""
    files = topic_rows()
    files["claims.csv"][2][2] = "Supportted"  # row 3, column C
    files["claims.csv"].append(["C004", "", "partially supported", ""])  # row 5: empty statement, wrong case
    files["citations.csv"][1][2] = "R99"  # row 2: claim C001 points to a reference that does not exist
    files["citations.csv"].append(["CT004", "C404", "R01", "resolved", ""])  # row 5: unknown claim
    files["citations.csv"].append(["CT001", "C003", "R02", "maybe", ""])  # row 6: duplicate id, bad outcome
    files["evidence.csv"] = [
        ["evidence_id", "claim_id", "reference_id", "quote", "page", "note"],  # no "relation" column
        ["E001", "C001", "R02", "Đoạn trích.", "trang 3", ""],
    ]
    root = write_topic(tmp_path / "T01", files)

    result = validate(root)
    assert where(result.errors) == {
        ("claims.csv", 3, "support_label", "label"),
        ("claims.csv", 5, "statement", "required"),
        ("claims.csv", 5, "support_label", "label"),
        ("citations.csv", 2, "reference_id", "unknown_ref"),
        ("citations.csv", 5, "claim_id", "unknown_ref"),
        ("citations.csv", 6, "citation_id", "duplicate_id"),
        ("citations.csv", 6, "expected_outcome", "label"),
        ("evidence.csv", 1, "relation", "missing_column"),
        ("evidence.csv", 2, "page", "integer"),
    }
    messages = [i.format() for i in result.errors]
    assert (
        'LỖI   claims.csv, dòng 3, cột support_label (C): Giá trị "Supportted" không thuộc danh sách: '
        "Supported, Partially Supported, Unsupported, Conflicting." in messages
    )
    assert any("dòng 2, cột reference_id (C)" in m and '"R99" không có trong references.csv' in m for m in messages)
    assert any('Có phải "Partially Supported"?' in m for m in messages)
    assert any("dòng 6, cột citation_id (A)" in m and "đã có ở dòng 2" in m for m in messages)

    with pytest.raises(DatasetInvalid):
        convert(root, tmp_path / "out")
    assert not (tmp_path / "out").exists()


def test_other_errors_by_row(tmp_path: Path) -> None:
    """The remaining checks also point at file, row and column, and are all collected in one run."""
    files = topic_rows()
    del files["citations.csv"]
    files["references.csv"] = [row[:2] + row[3:] for row in files["references.csv"]]  # drop "authors"
    files["references.csv"][1][7] = "files/R01.pdf"  # row 2, column "file" (H): not in the topic folder
    files["references.csv"][2][6] = "www.example.org"  # row 3, column "url" (G): no scheme
    files["references.csv"].append(["R03", "Ba", "1999", "", "magazine", "", "", "../x.pdf", ""])  # row 4
    files["references.csv"][2][2] = "2021²"  # row 3, column "year" (C): str.isdigit() is true, int() fails (G1)
    # Row 5: a pasted block in "year" (over the 4300-digit limit of int(), QC Lần 2 G7) and a file name too long for
    # the file system (Linux raises ENAMETOOLONG from Path.is_file()). Both are cell errors, never a traceback.
    long_file = "a" * 300 + ".pdf"
    files["references.csv"].append(["R05", "Năm", "9" * 5000, "", "", "", "", long_file, ""])
    files["topic.csv"].append(["T02", "Thừa", "Giáo dục", "?", ""])  # topic.csv holds one data row
    files["topic.csv"] = [row[:4] for row in files["topic.csv"]]  # drop the optional "note" column
    files["evidence.csv"] = evidence_rows()
    files["evidence.csv"][1][4] = "①"  # row 2, column "page" (E)
    files["claims.csv"].append(["C009", "Có ô thừa.", "Supported", "", "ô lạc"])  # row 5: one cell too many
    files["claims.csv"].append(["", "", "", ""])  # blank row left by Excel: ignored
    root = write_topic(tmp_path / "T01", files)
    (root / "claim.csv").write_bytes(csv_bytes([["claim_id"]]))  # misspelt file name

    result = validate(root)
    assert where(result.errors) == {
        ("citations.csv", None, None, "missing_file"),
        ("references.csv", 1, "authors", "missing_column"),
        ("references.csv", 2, "file", "path"),
        ("references.csv", 3, "url", "url"),
        ("references.csv", 4, "publication_type", "label"),
        ("references.csv", 4, "file", "path"),
        ("references.csv", 3, "year", "integer"),
        ("references.csv", 5, "year", "integer"),
        ("references.csv", 5, "file", "path"),
        ("evidence.csv", 2, "page", "integer"),
        ("topic.csv", 1, "note", "missing_column"),
        ("topic.csv", 3, None, "extra_row"),
        ("claims.csv", 5, None, "extra_cells"),
    }
    row5 = {i.column: i.message for i in result.errors if i.file == "references.csv" and i.row == 5}
    assert "5000 chữ số" in row5["year"] and "9999" not in row5["year"]
    assert len(row5["file"]) < 120 and "…" in row5["file"]  # long values are cut in messages
    optional = next(i for i in result.errors if i.code == "missing_column" and i.column == "note")
    assert "cột không bắt buộc để trống được" in optional.message
    letters = {(i.file, i.column): i.column_letter for i in result.errors if i.column}
    assert letters[("references.csv", "file")] == "H" and letters[("references.csv", "url")] == "G"
    assert ("claim.csv", None, None, "unknown_file") in where(result.warnings)
    assert result.topics[0].count("claims.csv") == 4

    (root / "files").mkdir()
    (root / "files" / "R01.pdf").write_bytes(b"%PDF-1.4")
    assert ("references.csv", 2, "file", "path") not in where(validate(root).errors)


def test_file_name_case(tmp_path: Path) -> None:
    """Claims.csv is reported the same way on Windows (case-insensitive) and on Linux CI."""
    root = write_topic(tmp_path / "T01", topic_rows())
    (root / "claims.csv").rename(root / "Claims.csv")
    result = validate(root)
    assert ("Claims.csv", None, None, "file_name_case") in where(result.errors)
    assert "claims.csv" not in result.topics[0].tables
    assert not {i for i in where(result.errors) if i[0] == "claims.csv"}
    assert "unknown_file" not in codes(result.warnings)

    # Pointed straight at one topic folder holding Topic.csv: the same error on Windows and Linux (G5).
    (root / "Claims.csv").rename(root / "claims.csv")
    (root / "topic.csv").rename(root / "Topic.csv")
    result = validate(root)
    assert where(result.errors) == {("Topic.csv", None, None, "file_name_case")}


def test_excel_bom(tmp_path: Path) -> None:
    """PID-00033-AC03: a file Excel saved as "CSV UTF-8" (BOM) reads Vietnamese correctly."""
    files = topic_rows()
    title = "Ảnh hưởng của học tập kết hợp — Đà Lạt, Huế, Cần Thơ"
    files["topic.csv"][1][1] = title
    files["claims.csv"][1][1] = "Sinh viên năm nhất đạt điểm cao hơn ở môn Toán cao cấp."
    root = write_topic(tmp_path / "T01", files)
    raw = (root / "topic.csv").read_bytes()
    assert raw.startswith(b"\xef\xbb\xbf")

    result = validate(root)
    assert result.errors == []
    assert result.topics[0].topic_id == "T01"  # the BOM is not part of the first column name
    data = load_jsonl(convert(root, tmp_path / "out").out)
    assert data["topics"][0]["title"] == title
    assert data["claims"][0]["statement"] == "Sinh viên năm nhất đạt điểm cao hơn ở môn Toán cao cấp."

    # UTF-8 without BOM (another editor) is read the same way.
    plain = write_topic(tmp_path / "plain", topic_rows(), encoding="utf-8")
    assert validate(plain).errors == []


def test_excel_saved_file(tmp_path: Path) -> None:
    """AC03, H3 with a file Excel itself saved: Excel 16 on a Vietnamese Windows (list separator ";"), File > Save As
    "CSV UTF-8", from the sample claims (eval/tests/fixtures/excel-vi-VN-claims.csv, 19/11/2026). It checks and
    converts without saving again, and gives the same claims as the comma-separated sample."""
    raw = EXCEL_CLAIMS.read_bytes()
    assert raw.startswith(b"\xef\xbb\xbfclaim_id;statement;support_label;note\r\n")  # BOM, ";", CRLF
    root = tmp_path / "set"
    shutil.copytree(SAMPLE, root)
    topic = root / "T01-hoc-tap-ket-hop"
    shutil.copyfile(EXCEL_CLAIMS, topic / "claims.csv")

    result = validate(root)
    assert result.errors == []
    assert result.topics[0].tables["claims.csv"].delimiter == ";"
    excel = load_jsonl(convert(root, tmp_path / "out-excel").out)["claims"]
    sample = load_jsonl(convert(SAMPLE, tmp_path / "out-sample").out)["claims"]
    assert excel == sample
    assert excel[1]["statement"].startswith("Học tập kết hợp làm tăng tỷ lệ sinh viên năm nhất")
    assert "\n" in excel[1]["statement"]  # the line break inside the cell survives Excel


def test_wrong_encoding(tmp_path: Path) -> None:
    """EC01: an old encoding (or a tab separator) is reported with how to save again, never guessed."""
    files = topic_rows()
    root = write_topic(tmp_path / "T01", files)
    # "CSV (Comma delimited)" on a Vietnamese Windows uses code page 1258, with "," or with ";" (H3 accepts ";" only
    # in UTF-8).
    legacy = [
        HEADERS["references.csv"],
        ["R01", unicodedata.normalize("NFD", "Đà Lạt"), "Lê Minh", "", "", "", "", "", "", ""],
    ]
    (root / "references.csv").write_bytes(csv_bytes(legacy, encoding="cp1258"))
    claims = [HEADERS["claims.csv"], ["C001", unicodedata.normalize("NFD", "Đà Lạt"), "Supported", ""]]
    (root / "claims.csv").write_bytes(csv_bytes(claims, sep=";", encoding="cp1258"))
    # "Unicode Text" is UTF-16.
    (root / "citations.csv").write_bytes(csv_bytes(files["citations.csv"], encoding="utf-16"))
    # "Text (Tab delimited)" renamed to .csv.
    (root / "evidence.csv").write_bytes(csv_bytes(evidence_rows(), sep="\t"))

    result = validate(root)
    assert where(result.errors) == {
        ("references.csv", None, None, "encoding"),
        ("claims.csv", None, None, "encoding"),
        ("citations.csv", None, None, "encoding"),
        ("evidence.csv", 1, None, "separator"),
    }
    by_file = {i.file: i.message for i in result.errors}
    for name in ("references.csv", "claims.csv"):
        assert "không phải UTF-8" in by_file[name] and "CSV UTF-8" in by_file[name]
    assert "UTF-16" in by_file["citations.csv"] and "CSV UTF-8" in by_file["citations.csv"]
    assert "dấu tab" in by_file["evidence.csv"] and "CSV UTF-8" in by_file["evidence.csv"]
    # Unreadable files are not guessed at: no row is read from them and no cross-reference error cascades.
    assert [result.topics[0].count(n) for n in ("references.csv", "claims.csv", "citations.csv")] == [0, 0, 0]


def test_semicolon_header(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """EC01, H3: a set saved with ";" (Excel "CSV UTF-8" on a Vietnamese Windows) checks and converts exactly like
    the same set saved with ","; the separator is recognised per file, and a ";" header with wrong names is an error."""
    files = topic_rows()
    files["claims.csv"][1][1] = 'Theo,"mô hình" mới; tăng 0,6 điểm'  # ",", ";" and quotes inside one cell
    files["claims.csv"][2][1] = "Hai dòng,\nmột ô"
    files["evidence.csv"] = evidence_rows()
    comma = write_topic(tmp_path / "comma" / "set" / "T01", files)
    semicolon = write_topic(tmp_path / "semicolon" / "set" / "T01", files, sep=";")
    head = (semicolon / "claims.csv").read_bytes()
    assert head.startswith(b"\xef\xbb\xbfclaim_id;statement;support_label;note\r\n")

    by_comma, by_semicolon = validate(comma.parent), validate(semicolon.parent)
    assert by_comma.errors == [] and by_semicolon.errors == []
    assert where(by_semicolon.warnings) == where(by_comma.warnings) == {("", None, None, "incomplete_set")}
    assert {t.delimiter for t in by_semicolon.topics[0].tables.values()} == {";"}
    out_comma = convert(comma.parent, tmp_path / "out-comma").out
    out_semicolon = convert(semicolon.parent, tmp_path / "out-semicolon").out
    for name in sorted(p.name for p in out_comma.iterdir()):
        assert (out_semicolon / name).read_bytes() == (out_comma / name).read_bytes(), name
    assert load_jsonl(out_semicolon)["claims"][0]["statement"] == 'Theo,"mô hình" mới; tăng 0,6 điểm'
    assert cli(["check", str(semicolon.parent)]) == 0
    assert "0 lỗi, 1 cảnh báo." in capsys.readouterr().out

    # Recognised per file: one ";" file among "," files reads the same.
    mixed = write_topic(tmp_path / "mixed" / "set" / "T01", files)
    write_topic(mixed, {"claims.csv": files["claims.csv"]}, sep=";")
    assert validate(mixed.parent).errors == []
    out_mixed = convert(mixed.parent, tmp_path / "out-mixed").out
    assert (out_mixed / "claims.jsonl").read_bytes() == (out_comma / "claims.jsonl").read_bytes()

    # A ";" header that does not give the file's required columns is still an error, and no row of it is read.
    wrong = write_topic(tmp_path / "wrong" / "T01", files, sep=";")
    claims = [["claim_idd", *HEADERS["claims.csv"][1:]], *files["claims.csv"][1:]]
    (wrong / "claims.csv").write_bytes(csv_bytes(claims, sep=";"))
    result = validate(wrong)
    assert where(result.errors) == {("claims.csv", 1, None, "header_mismatch")}
    assert "thiếu: claim_id" in result.errors[0].message
    assert result.topics[0].count("claims.csv") == 0
    # With every required column but a missing optional one, ";" is accepted and the header is checked as usual.
    (wrong / "claims.csv").write_bytes(csv_bytes([row[:3] for row in files["claims.csv"]], sep=";"))
    result = validate(wrong)
    assert where(result.errors) == {("claims.csv", 1, "note", "missing_column")}
    assert result.topics[0].count("claims.csv") == 3


def _set(root: Path, disciplines: list[str], evidence_in: set[int]) -> Path:
    for index, discipline in enumerate(disciplines, start=1):
        files = topic_rows(f"T0{index}", discipline)
        if index in evidence_in:
            files["evidence.csv"] = evidence_rows()
        write_topic(root / f"T0{index}", files)
    return root


def test_incomplete_set(tmp_path: Path) -> None:
    """EC02: fewer than 5 topics or 3 disciplines warns but does not block."""
    small = _set(tmp_path / "small", ["Giáo dục", "giáo dục"], {1})
    result = validate(small)
    assert result.ok
    assert codes(result.warnings) == {"incomplete_set"}
    assert "2 đề tài, 1 lĩnh vực" in result.warnings[0].message
    assert convert(small, tmp_path / "out").counts["topics"] == 2

    full = _set(tmp_path / "full", ["Giáo dục", "Y sinh", "Kinh tế", "Giáo dục", "Y sinh"], {2})
    result = validate(full)
    assert result.ok and result.warnings == []

    files = topic_rows("T01")
    write_topic(tmp_path / "dup" / "A", files)
    files["topic.csv"] = [[row[1], row[0], *row[2:]] for row in files["topic.csv"]]  # topic_id in column B
    write_topic(tmp_path / "dup" / "B", files)
    duplicate = validate(tmp_path / "dup").errors
    assert where(duplicate) == {("B/topic.csv", 2, "topic_id", "duplicate_topic")}
    assert duplicate[0].column_letter == "B"  # read from the header, not fixed (G4)


def test_evidence_optional(tmp_path: Path) -> None:
    """EC03: evidence.csv on one topic is valid (DEC-45); on none it warns."""
    one = _set(tmp_path / "one", ["Giáo dục", "Y sinh", "Kinh tế", "Giáo dục", "Y sinh"], {3})
    result = validate(one)
    assert result.ok and result.warnings == []
    assert [t.count("evidence.csv") for t in result.topics] == [0, 0, 1, 0, 0]
    manifest = load_jsonl(convert(one, tmp_path / "out-one").out)["manifest"]
    assert [t["topic_id"] for t in manifest["topics"] if t["has_evidence"]] == ["T03"]

    none = _set(tmp_path / "none", ["Giáo dục", "Y sinh", "Kinh tế", "Giáo dục", "Y sinh"], set())
    result = validate(none)
    assert result.ok
    assert codes(result.warnings) == {"no_evidence"}
    assert (convert(none, tmp_path / "out-none").out / "evidence.jsonl").read_text(encoding="utf-8") == ""


def test_quoted_cells(tmp_path: Path) -> None:
    """EC04: line breaks, commas and quotes inside a cell are read per RFC 4180; rows keep Excel numbering."""
    files = topic_rows()
    statement = 'Học tập kết hợp, theo "mô hình 70:30", làm tăng điểm;\nnhưng không đều giữa các ngành.'
    files["claims.csv"][1][1] = statement
    files["claims.csv"][2][2] = "Wrong"  # the row after the multi-line cell is Excel row 3
    root = write_topic(tmp_path / "T01", files)
    raw = (root / "claims.csv").read_bytes()
    assert b'""m' in raw  # quoted cell with escaped quotes, as Excel writes it
    # A Windows checkout with core.autocrlf turns the line break inside the cell into CRLF as well.
    (root / "claims.csv").write_bytes(raw.replace(b";\n", b";\r\n"))

    result = validate(root)
    assert where(result.errors) == {("claims.csv", 3, "support_label", "label")}
    files["claims.csv"][2][2] = "Unsupported"
    write_topic(root, {"claims.csv": files["claims.csv"]})
    data = load_jsonl(convert(root, tmp_path / "out").out)
    assert data["claims"][0]["statement"] == statement
    assert data["claims"][1]["source"]["row"] == 3


def test_cli(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert cli(["check", str(SAMPLE)]) == 0
    assert "0 lỗi, 1 cảnh báo." in capsys.readouterr().out
    assert cli(["check", str(TEMPLATE)]) == 1
    assert "LỖI   claims.csv, dòng 2" in capsys.readouterr().out
    out = tmp_path / "jsonl"
    assert cli(["convert", str(SAMPLE), "--out", str(out)]) == 0
    assert "Đã ghi JSONL" in capsys.readouterr().out
    assert json.loads((out / "manifest.json").read_text(encoding="utf-8"))["source_dir"] == "sample"
    assert cli(["convert", str(TEMPLATE), "--out", str(tmp_path / "x")]) == 1
    assert cli(["convert", str(SAMPLE), "--out", str(SAMPLE / "build")]) == 2  # never inside the CSV set
    assert cli(["check", str(tmp_path / "nowhere")]) == 1


def test_output_not_committed() -> None:
    """P3: the default JSONL folder is build/ under eval/, ignored by eval/.gitignore."""
    from sires_eval.datasets.convert import default_out

    assert default_out(SAMPLE).parts[:2] == ("build", "datasets")
    lines = (EVAL_DIR / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert "/build/" in lines


def test_runs_without_dependencies(tmp_path: Path) -> None:
    """The PO can run the tools with a bare Python (no site-packages): only the standard library is imported."""
    code = "import sires_eval.datasets.__main__, sires_eval.report; print('ok')"
    env = {**os.environ, "PYTHONPATH": str(EVAL_DIR / "src")}
    done = subprocess.run([sys.executable, "-S", "-c", code], env=env, capture_output=True, text=True, check=False)
    assert done.returncode == 0, done.stderr
    assert done.stdout.strip() == "ok"


def test_readme_documents_format() -> None:
    """eval/datasets/README.md (guide for PO, QA) names every file, column and label value."""
    readme = (EVAL_DIR / "datasets" / "README.md").read_text(encoding="utf-8")
    for spec in FILES:
        assert f"### {spec.name}" in readme
        for column in spec.columns:
            assert f"`{column.name}`" in readme, column.name
            for choice in column.choices:
                assert f"`{choice}`" in readme, choice
