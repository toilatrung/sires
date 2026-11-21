# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Column definitions of the acceptance-dataset CSV files (PRD 19.14, DEC-39, DEC-45).

One topic is one folder with ``topic.csv``, ``references.csv``, ``claims.csv``, ``citations.csv`` and, optionally,
``evidence.csv``. The PO edits these files in Excel; the JSONL produced by :mod:`sires_eval.datasets.convert` is
generated and never edited by hand.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

# Expert support labels: docs/api-design/components/schemas/evidence.yaml, SupportStatusOverride.supportStatus
# (SupportStatus without "Not Assessed", which is not an expert judgement).
SUPPORT_LABELS: tuple[str, ...] = ("Supported", "Partially Supported", "Unsupported", "Conflicting")
# Expected citation-check outcome: evidence.yaml, VerificationResult.outcome for targetType = citation.
# "unresolved" is left out: a citation in the dataset always points to a reference of the same topic.
CITATION_OUTCOMES: tuple[str, ...] = ("resolved", "mismatch")
# Role of a labelled passage for its claim: evidence.yaml, ClaimEvidenceLink.relation.
EVIDENCE_RELATIONS: tuple[str, ...] = ("supports", "contradicts", "context")
# docs/api-design/components/schemas/library.yaml, ReferenceMetadata.publicationType.
PUBLICATION_TYPES: tuple[str, ...] = (
    "article",
    "conference",
    "thesis",
    "book",
    "chapter",
    "preprint",
    "report",
    "other",
)

# Separator inside one cell holding several values (authors). The file itself is separated by "," or ";" (H3); in a
# ";" file the authors cell must be quoted, which Excel does when it saves.
LIST_SEPARATOR = ";"


class Kind(StrEnum):
    ID = "id"  # primary key of the file: required, unique within the file
    TEXT = "text"
    LIST = "list"  # several values separated by LIST_SEPARATOR
    LABEL = "label"  # one value of Column.choices, exact spelling
    INT = "int"  # positive integer
    URL = "url"  # http:// or https://
    PATH = "path"  # file relative to the topic folder, must exist
    REF = "ref"  # value of Column.target ("file:column") in the same topic


@dataclass(frozen=True)
class Column:
    name: str
    kind: Kind
    required: bool
    description: str
    choices: tuple[str, ...] = ()
    target: str = ""


@dataclass(frozen=True)
class FileSpec:
    name: str
    required: bool
    description: str
    columns: tuple[Column, ...]
    # topic.csv holds exactly one data row; the other files hold one row per record.
    single_row: bool = False

    @property
    def key(self) -> Column:
        return next(c for c in self.columns if c.kind is Kind.ID)

    def column(self, name: str) -> Column | None:
        return next((c for c in self.columns if c.name == name), None)


def _note() -> Column:
    return Column("note", Kind.TEXT, False, "Ghi chú tự do của người gán nhãn; harness không dùng.")


TOPIC = FileSpec(
    "topic.csv",
    True,
    "Một dòng mô tả đề tài.",
    (
        Column("topic_id", Kind.ID, True, "Mã đề tài, duy nhất trong cả bộ, ví dụ T01."),
        Column("title", Kind.TEXT, True, "Tên đề tài, dùng làm tên project khi harness chạy."),
        Column("discipline", Kind.TEXT, True, "Lĩnh vực; bộ đủ cần 3 lĩnh vực khác nhau (DEC-39)."),
        Column("research_question", Kind.TEXT, True, "Câu hỏi nghiên cứu của project."),
        _note(),
    ),
    single_row=True,
)

REFERENCES = FileSpec(
    "references.csv",
    True,
    "Mỗi dòng một reference của đề tài (khoảng 30, DEC-39).",
    (
        Column("reference_id", Kind.ID, True, "Mã reference, duy nhất trong đề tài, ví dụ R01."),
        Column("title", Kind.TEXT, True, "Tên công trình."),
        Column("authors", Kind.LIST, True, "Tác giả, cách nhau bằng dấu ; (ví dụ: Nguyễn Văn A; Trần Thị B)."),
        Column("year", Kind.INT, False, "Năm xuất bản."),
        Column("venue", Kind.TEXT, False, "Tạp chí, hội nghị hoặc nhà xuất bản."),
        Column("publication_type", Kind.LABEL, False, "Loại công trình.", choices=PUBLICATION_TYPES),
        Column("doi", Kind.TEXT, False, "DOI, không kèm https://doi.org/."),
        Column("url", Kind.URL, False, "Đường dẫn http(s) tới trang công trình."),
        Column(
            "file", Kind.PATH, False, "Tệp toàn văn đặt trong thư mục đề tài, ví dụ files/R01.pdf; trống nếu không có."
        ),
        _note(),
    ),
)

CLAIMS = FileSpec(
    "claims.csv",
    True,
    "Mỗi dòng một claim kèm nhãn chuyên gia về mức hỗ trợ (khoảng 100, DEC-39).",
    (
        Column("claim_id", Kind.ID, True, "Mã claim, duy nhất trong đề tài, ví dụ C001."),
        Column("statement", Kind.TEXT, True, "Phát biểu của claim; được xuống dòng, có dấu phẩy."),
        Column("support_label", Kind.LABEL, True, "Nhãn chuyên gia về mức hỗ trợ.", choices=SUPPORT_LABELS),
        _note(),
    ),
)

CITATIONS = FileSpec(
    "citations.csv",
    True,
    "Mỗi dòng một citation từ claim tới reference, kèm nhãn khớp hay không khớp nguồn (TS-13-09).",
    (
        Column("citation_id", Kind.ID, True, "Mã citation, duy nhất trong đề tài, ví dụ CT001."),
        Column("claim_id", Kind.REF, True, "Claim chứa citation.", target="claims.csv:claim_id"),
        Column("reference_id", Kind.REF, True, "Reference được trích.", target="references.csv:reference_id"),
        Column(
            "expected_outcome",
            Kind.LABEL,
            True,
            "Kết quả kiểm tra citation đúng theo chuyên gia: resolved (khớp nguồn) hoặc mismatch (không khớp).",
            choices=CITATION_OUTCOMES,
        ),
        _note(),
    ),
)

EVIDENCE = FileSpec(
    "evidence.csv",
    False,
    "Tùy chọn: nhãn evidence cho từng claim, chỉ cần ở 1 trong 5 đề tài (DEC-45).",
    (
        Column("evidence_id", Kind.ID, True, "Mã evidence, duy nhất trong đề tài, ví dụ E001."),
        Column("claim_id", Kind.REF, True, "Claim mà đoạn này làm căn cứ.", target="claims.csv:claim_id"),
        Column("reference_id", Kind.REF, True, "Reference chứa đoạn.", target="references.csv:reference_id"),
        Column("quote", Kind.TEXT, True, "Đoạn trích nguyên văn trong reference."),
        Column("page", Kind.INT, False, "Trang chứa đoạn trích."),
        Column("relation", Kind.LABEL, True, "Vai trò của đoạn đối với claim.", choices=EVIDENCE_RELATIONS),
        _note(),
    ),
)

FILES: tuple[FileSpec, ...] = (TOPIC, REFERENCES, CLAIMS, CITATIONS, EVIDENCE)
FILE_NAMES: frozenset[str] = frozenset(f.name for f in FILES)


def spec_of(name: str) -> FileSpec:
    return next(f for f in FILES if f.name == name)


# Targets of a full acceptance dataset (PRD 19.14, DEC-39, DEC-45). Shortfalls are warnings, never errors.
TARGET_TOPICS = 5
TARGET_DISCIPLINES = 3
TARGET_REFERENCES_PER_TOPIC = 30  # "khoảng": shown in the summary, not checked
TARGET_CLAIMS_PER_TOPIC = 100  # "khoảng": shown in the summary, not checked
