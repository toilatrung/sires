# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Validate an acceptance dataset: every problem is collected, none stops the check (PID-00033-AC02).

A dataset root is either one topic folder (it holds ``topic.csv``) or a folder of topic folders.
Errors block the JSONL conversion; warnings (incomplete set, no evidence labels, ...) do not.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

from .reader import Issue, Table, read_table
from .schema import (
    FILE_NAMES,
    FILES,
    LIST_SEPARATOR,
    TARGET_CLAIMS_PER_TOPIC,
    TARGET_DISCIPLINES,
    TARGET_REFERENCES_PER_TOPIC,
    TARGET_TOPICS,
    Column,
    Kind,
)


@dataclass
class Topic:
    folder: Path
    name: str  # folder path relative to the dataset root, "." for a single-topic root
    tables: dict[str, Table] = field(default_factory=dict)
    issues: list[Issue] = field(default_factory=list)

    def _topic_value(self, column: str) -> str | None:
        table = self.tables.get("topic.csv")
        if table is None or not table.rows:
            return None
        return table.rows[0].values.get(column) or None

    @property
    def topic_id(self) -> str | None:
        return self._topic_value("topic_id")

    @property
    def discipline(self) -> str | None:
        return self._topic_value("discipline")

    def count(self, file: str) -> int:
        table = self.tables.get(file)
        return len(table.rows) if table else 0


@dataclass
class ValidationResult:
    root: Path
    topics: list[Topic]
    issues: list[Issue]

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.is_error]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if not i.is_error]

    @property
    def ok(self) -> bool:
        return not self.errors

    def summary(self) -> list[str]:
        lines = []
        for topic in self.topics:
            lines.append(
                f"{topic.topic_id or topic.folder.name}: {topic.count('references.csv')} reference "
                f"(mục tiêu khoảng {TARGET_REFERENCES_PER_TOPIC}), {topic.count('claims.csv')} claim "
                f"(mục tiêu khoảng {TARGET_CLAIMS_PER_TOPIC}), {topic.count('citations.csv')} citation, "
                f"{topic.count('evidence.csv')} evidence"
            )
        lines.append(f"{len(self.errors)} lỗi, {len(self.warnings)} cảnh báo.")
        return lines


def _rel(root: Path, path: Path) -> str:
    rel = path.relative_to(root)
    return str(PurePosixPath(*rel.parts)) if rel.parts else path.name


def discover_topics(root: Path) -> list[Path]:
    """The root itself when it holds a file of the format, otherwise every sub-folder holding at least one CSV file.

    Names come from the folder listing and are compared without case, so a root holding ``Topic.csv`` is a topic
    folder on Windows and on Linux alike (the wrong case is then reported by validate_topic).
    """
    if any(p.is_file() and p.name.lower() in FILE_NAMES for p in root.iterdir()):
        return [root]
    return [
        child
        for child in sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith((".", "_")))
        if any(p.is_file() and p.suffix.lower() == ".csv" for p in child.iterdir())
    ]


def _shown(value: str, limit: int = 40) -> str:
    """Cell value quoted in a message, cut when long (a pasted block of text must not flood the report)."""
    return value if len(value) <= limit else f"{value[: limit - 1]}…"


def _int_problem(value: str) -> str | None:
    """Why ``value`` is not a positive integer the converter can read, or None when it is.

    Only ASCII digits: str.isdigit() also accepts "²" or "①", which int() rejects. int() itself refuses strings longer
    than sys.get_int_max_str_digits() (4300 digits in Python 3.12): reported here, so neither the check nor the
    converter stops on such a cell.
    """
    if not (value.isascii() and value.isdigit()):
        return f'"{_shown(value)}" không phải số nguyên dương.'
    try:
        number = int(value)
    except ValueError:
        return f"Số có {len(value)} chữ số, quá dài để đọc; kiểm tra ô có bị dán nhầm không."
    return None if number > 0 else f'"{_shown(value)}" không phải số nguyên dương.'


def _check_cell(table: Table, row_number: int, column: Column, value: str, topic_dir: Path) -> None:
    if not value:
        if column.required:
            table.error("required", row_number, column.name, "Ô bắt buộc đang trống.")
        return
    shown = _shown(value)
    if column.kind is Kind.LABEL and value not in column.choices:
        hint = next((c for c in column.choices if c.lower() == value.lower()), None)
        extra = f' Có phải "{hint}"? Nhãn phân biệt hoa thường.' if hint else ""
        table.error(
            "label",
            row_number,
            column.name,
            f'Giá trị "{shown}" không thuộc danh sách: {", ".join(column.choices)}.{extra}',
        )
    elif column.kind is Kind.INT and (problem := _int_problem(value)):
        table.error("integer", row_number, column.name, problem)
    elif column.kind is Kind.URL and not value.lower().startswith(("http://", "https://")):
        table.error("url", row_number, column.name, f'"{shown}" không bắt đầu bằng http:// hoặc https://.')
    elif column.kind is Kind.LIST and not any(p.strip() for p in value.split(LIST_SEPARATOR)):
        table.error("required", row_number, column.name, "Danh sách đang trống.")
    elif column.kind is Kind.PATH:
        candidate = PurePosixPath(value.replace("\\", "/"))
        if candidate.is_absolute() or ".." in candidate.parts or ":" in value:
            table.error("path", row_number, column.name, f'"{shown}" phải là đường dẫn tương đối trong thư mục đề tài.')
        elif not _is_file(topic_dir / Path(*candidate.parts)):
            table.error("path", row_number, column.name, f'Không thấy tệp "{shown}" trong thư mục đề tài.')


def _is_file(path: Path) -> bool:
    """Path.is_file() that never raises on a cell value: Python 3.12 lets ENAMETOOLONG through (Linux, a name over 255
    bytes), which would stop the whole check."""
    try:
        return path.is_file()
    except OSError:
        return False


def _check_rows(table: Table, topic_dir: Path) -> None:
    key = table.spec.key
    first_seen: dict[str, int] = {}
    for row in table.rows:
        for column in table.spec.columns:
            if column.name in table.header:
                _check_cell(table, row.number, column, row.values.get(column.name, ""), topic_dir)
        value = row.values.get(key.name, "")
        if value and key.name in table.header:
            if value in first_seen:
                table.error(
                    "duplicate_id", row.number, key.name, f'Mã "{_shown(value)}" đã có ở dòng {first_seen[value]}.'
                )
            else:
                first_seen[value] = row.number


def _check_counts(table: Table) -> None:
    spec = table.spec
    if spec.single_row:
        if not table.rows:
            table.error("no_rows", 2, None, "Chưa có dòng dữ liệu: điền thông tin đề tài ở dòng 2.")
        for row in table.rows[1:]:
            table.error("extra_row", row.number, None, f"{spec.name} chỉ có một dòng dữ liệu (dòng 2).")
    elif not table.rows:
        if spec.name == "citations.csv":
            table.warning("no_rows", 2, None, "Chưa có citation nào; đề tài này không đo được citation không khớp.")
        elif spec.required:
            table.error("no_rows", 2, None, f"Chưa có dòng dữ liệu: {spec.description}")


def _check_refs(topic: Topic) -> None:
    for table in topic.tables.values():
        for column in table.spec.columns:
            if column.kind is not Kind.REF or column.name not in table.header:
                continue
            target_file, target_column = column.target.split(":")
            target = topic.tables.get(target_file)
            if target is None or not target.readable or target_column not in target.header:
                continue  # the target file's own error is already reported
            known = {r.values.get(target_column, "") for r in target.rows}
            for row in table.rows:
                value = row.values.get(column.name, "")
                if value and value not in known:
                    table.error(
                        "unknown_ref",
                        row.number,
                        column.name,
                        f'"{_shown(value)}" không có trong {target_file} (cột {target_column}) của đề tài này.',
                    )


def validate_topic(root: Path, folder: Path) -> Topic:
    topic = Topic(folder, _rel(root, folder) if folder != root else ".")

    def display(name: str) -> str:
        return _rel(root, folder / name) if folder != root else name

    # Match names from the folder listing, not with Path.is_file(): Windows ignores case, Linux does not, and the
    # same dataset must give the same result on the PO's machine and in CI.
    present = sorted(p.name for p in folder.iterdir() if p.is_file() and p.suffix.lower() == ".csv")
    for spec in FILES:
        if spec.name not in present:
            wrong_case = [n for n in present if n.lower() == spec.name]
            if wrong_case:
                message = f"Tên file phải viết thường đúng là {spec.name}; đổi tên rồi chạy lại."
                topic.issues.append(Issue("error", "file_name_case", display(wrong_case[0]), None, None, message))
            elif spec.required:
                message = f"Thiếu file {spec.name}: {spec.description}"
                topic.issues.append(Issue("error", "missing_file", display(spec.name), None, None, message))
            continue
        table = read_table(folder / spec.name, spec, display(spec.name))
        if table.readable:
            _check_rows(table, folder)
            _check_counts(table)
        topic.tables[spec.name] = table
    _check_refs(topic)
    for name in present:
        if name.lower() not in FILE_NAMES:
            message = "File không thuộc định dạng; trình kiểm bỏ qua."
            topic.issues.append(Issue("warning", "unknown_file", display(name), None, None, message))
    for table in topic.tables.values():
        topic.issues.extend(table.issues)
    return topic


def _check_set(topics: list[Topic]) -> list[Issue]:
    issues: list[Issue] = []
    owner: dict[str, str] = {}
    for topic in topics:
        topic_id = topic.topic_id
        if topic_id is None:
            continue
        if topic_id in owner:
            issues.append(
                Issue(
                    "error",
                    "duplicate_topic",
                    f"{topic.name}/topic.csv",
                    2,
                    "topic_id",
                    f'Mã đề tài "{topic_id}" trùng với đề tài ở thư mục {owner[topic_id]}.',
                    topic.tables["topic.csv"].letter("topic_id"),
                )
            )
        else:
            owner[topic_id] = topic.name
    disciplines = {t.discipline.casefold() for t in topics if t.discipline}
    if len(topics) < TARGET_TOPICS or len(disciplines) < TARGET_DISCIPLINES:
        issues.append(
            Issue(
                "warning",
                "incomplete_set",
                "",
                None,
                None,
                f"Bộ có {len(topics)} đề tài, {len(disciplines)} lĩnh vực; bộ nghiệm thu đủ cần {TARGET_TOPICS} đề tài "
                f"thuộc {TARGET_DISCIPLINES} lĩnh vực (DEC-39). Vẫn kiểm và chuyển được.",
            )
        )
    if topics and not any(t.count("evidence.csv") for t in topics):
        issues.append(
            Issue(
                "warning",
                "no_evidence",
                "",
                None,
                None,
                "Chưa đề tài nào có evidence.csv có dữ liệu; cần nhãn evidence ở ít nhất 1 đề tài để đo recall "
                "retrieval (DEC-45, NFR-EVAL-003 (d)).",
            )
        )
    has_mismatch = any(
        r.values.get("expected_outcome") == "mismatch"
        for t in topics
        if "citations.csv" in t.tables
        for r in t.tables["citations.csv"].rows
    )
    if topics and not has_mismatch:
        issues.append(
            Issue(
                "warning",
                "no_mismatch",
                "",
                None,
                None,
                "Chưa có citation nào gán nhãn mismatch; TS-13-09 cần các citation không khớp nguồn đã gán nhãn.",
            )
        )
    return issues


def validate(root: Path | str) -> ValidationResult:
    root = Path(root)
    if not root.is_dir():
        missing = Issue("error", "no_topic", "", None, None, f"Không thấy thư mục {root}.")
        return ValidationResult(root, [], [missing])
    topics = [validate_topic(root, f) for f in discover_topics(root)]
    issues: list[Issue] = []
    if not topics:
        issues.append(
            Issue(
                "error",
                "no_topic",
                "",
                None,
                None,
                f"Không thấy đề tài nào trong {root}: cần một thư mục chứa topic.csv, hoặc các thư mục con như vậy.",
            )
        )
    for topic in topics:
        issues.extend(topic.issues)
    issues.extend(_check_set(topics))
    return ValidationResult(root, topics, issues)
