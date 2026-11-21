# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Read one CSV file the way Excel writes it, reporting problems by file, row and column.

Rows are numbered like Excel shows them: the header is row 1 and a cell with line breaks stays one row.
Only UTF-8 (with or without BOM) is accepted. The separator is decided per file from the header line: a comma, or
a semicolon when the header split on ";" gives every required column of that file (Excel on a Vietnamese Windows
saves "CSV UTF-8" with ";"; PID-00033 H3). Anything else is reported with how to fix it, never guessed.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from pathlib import Path

from .schema import FileSpec

RESAVE_HINT = 'Mở file bằng Excel, chọn File > Save As, kiểu "CSV UTF-8 (Comma delimited) (*.csv)" rồi lưu lại.'


@dataclass(frozen=True)
class Issue:
    severity: str  # "error" or "warning"
    code: str
    file: str  # path relative to the dataset root; "" for the whole set
    row: int | None
    column: str | None
    message: str
    column_letter: str | None = None

    @property
    def is_error(self) -> bool:
        return self.severity == "error"

    def format(self) -> str:
        where = [self.file or "(bộ dữ liệu)"]
        if self.row is not None:
            where.append(f"dòng {self.row}")
        if self.column is not None:
            where.append(f"cột {self.column}" + (f" ({self.column_letter})" if self.column_letter else ""))
        label = "LỖI " if self.is_error else "CẢNH"
        return f"{label}  {', '.join(where)}: {self.message}"


@dataclass(frozen=True)
class Row:
    number: int  # Excel row number
    values: dict[str, str]


@dataclass
class Table:
    spec: FileSpec
    file: str
    header: list[str] = field(default_factory=list)
    rows: list[Row] = field(default_factory=list)
    issues: list[Issue] = field(default_factory=list)
    # False when the file could not be read at all (encoding, separator, broken quoting).
    readable: bool = True
    # Separator recognised from the header line: "," or ";" (H3).
    delimiter: str = ","

    def letter(self, column: str) -> str | None:
        return excel_letter(self.header.index(column)) if column in self.header else None

    def error(self, code: str, row: int | None, column: str | None, message: str) -> None:
        self.issues.append(Issue("error", code, self.file, row, column, message, self.letter(column or "")))

    def warning(self, code: str, row: int | None, column: str | None, message: str) -> None:
        self.issues.append(Issue("warning", code, self.file, row, column, message, self.letter(column or "")))


def excel_letter(index: int) -> str:
    """0 → A, 25 → Z, 26 → AA."""
    letters = ""
    index += 1
    while index:
        index, rest = divmod(index - 1, 26)
        letters = chr(ord("A") + rest) + letters
    return letters


def _decode(raw: bytes, table: Table) -> str | None:
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        table.error("encoding", None, None, f"File lưu dạng UTF-16 (Unicode Text), không phải CSV UTF-8. {RESAVE_HINT}")
        return None
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        line = raw.count(b"\n", 0, exc.start) + 1
        table.error(
            "encoding",
            None,
            None,
            f"File không phải UTF-8 (byte lạ ở dòng văn bản {line}); có thể Excel đã lưu bằng mã hóa cũ như "
            f"Windows-1258. {RESAVE_HINT}",
        )
        return None


def _names(first_line: str, sep: str) -> set[str]:
    return {p.strip().strip('"').lower() for p in first_line.split(sep)}


def _delimiter(first_line: str, spec: FileSpec, table: Table) -> str | None:
    """Separator of the file from its header line (H3); None after reporting an error when there is none.

    A comma is used whenever the header split on "," has at least one required column: then a misspelt column is
    reported column by column, as before. Otherwise ";" is accepted only when the header split on ";" gives every
    required column of the file (column names are fixed, so this is recognition, not a guess). A ";" or tab header
    with some known names but not the required ones is an error, and no data row of the file is read.
    """
    required = {c.name for c in spec.columns if c.required}
    known = {c.name for c in spec.columns}
    if _names(first_line, ",") & required:
        return ","
    semicolon = _names(first_line, ";")
    if required <= semicolon:
        return ";"
    if len(semicolon & known) >= 2:
        missing = ", ".join(sorted(required - semicolon))
        table.error(
            "header_mismatch",
            1,
            None,
            f"Dòng tiêu đề tách bằng dấu chấm phẩy (;) nhưng không ra đúng tên cột của file (thiếu: {missing}); "
            "trình kiểm chỉ nhận dấu ; khi tiêu đề có đủ cột bắt buộc. Sửa dòng tiêu đề theo eval/datasets/template/.",
        )
        return None
    if len(_names(first_line, "\t") & known) >= 2:
        table.error(
            "separator",
            1,
            None,
            'File dùng dấu tab để ngăn cột (kiểu "Text (Tab delimited)"); chỉ nhận dấu phẩy hoặc dấu chấm phẩy. '
            f"{RESAVE_HINT}",
        )
        return None
    return ","  # neither: read with commas and report the header column by column


def read_table(path: Path, spec: FileSpec, display: str) -> Table:
    """Read ``path`` against ``spec``; ``display`` is the name used in issues (relative to the dataset root)."""
    table = Table(spec, display)
    text = _decode(path.read_bytes(), table)
    if text is None:
        table.readable = False
        return table
    if not text.strip():
        table.error("empty_file", 1, None, "File rỗng, chưa có dòng tiêu đề. Chép lại file từ eval/datasets/template/.")
        table.readable = False
        return table

    # Decide the separator on the header line before parsing: a ";" file can hold quotes that are not valid
    # comma-separated CSV, and must be read (or reported) by its header, not as broken quoting.
    delimiter = _delimiter(text.splitlines()[0], spec, table)
    if delimiter is None:
        table.readable = False
        return table
    table.delimiter = delimiter

    records: list[list[str]] = []
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter, strict=True)
    try:
        for record in reader:
            records.append(record)
    except csv.Error as exc:
        table.error(
            "csv_syntax",
            len(records) + 1,
            None,
            f"Không đọc được theo chuẩn CSV ({exc}); thường do dấu nháy kép không đóng. {RESAVE_HINT}",
        )
        table.readable = False
        return table

    header = [h.strip().lower() for h in records[0]]
    table.header = header
    seen: set[str] = set()
    for index, name in enumerate(header):
        if not name:
            if any(index < len(r) and r[index].strip() for r in records[1:]):
                table.error("unnamed_column", 1, None, f"Cột {excel_letter(index)} có dữ liệu nhưng không có tên.")
            continue
        if name in seen:
            table.error("duplicate_column", 1, name, "Cột bị lặp; mỗi cột chỉ có một lần.")
        seen.add(name)
        if spec.column(name) is None:
            table.warning("unknown_column", 1, name, "Cột không có trong định dạng; harness bỏ qua cột này.")
    for column in spec.columns:
        if column.name not in seen:
            message = "Thiếu cột này ở dòng tiêu đề." + (
                "" if column.required else " Mọi cột của định dạng phải có; cột không bắt buộc để trống được."
            )
            table.error("missing_column", 1, column.name, message)

    for number, record in enumerate(records[1:], start=2):
        cells = [c.replace("\r\n", "\n").replace("\r", "\n").strip() for c in record]
        if not any(cells):
            continue  # blank row left by Excel
        if len(cells) > len(header) and any(cells[len(header) :]):
            table.error(
                "extra_cells",
                number,
                None,
                f"Dòng có dữ liệu ở {len(cells)} ô nhưng tiêu đề chỉ có {len(header)} cột; kiểm tra dấu "
                f"{'chấm phẩy' if delimiter == ';' else 'phẩy'} trong ô chưa có nháy kép.",
            )
        values = {name: (cells[i] if i < len(cells) else "") for i, name in enumerate(header) if name}
        table.rows.append(Row(number, values))
    return table
