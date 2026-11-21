# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Builders for CSV datasets in tests: bytes are written the way Excel saves "CSV UTF-8" (BOM, CRLF)."""

from __future__ import annotations

import csv
import io
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parents[1]
SAMPLE = EVAL_DIR / "datasets" / "sample"
TEMPLATE = EVAL_DIR / "datasets" / "template"

HEADERS: dict[str, list[str]] = {
    "topic.csv": ["topic_id", "title", "discipline", "research_question", "note"],
    "references.csv": [
        "reference_id",
        "title",
        "authors",
        "year",
        "venue",
        "publication_type",
        "doi",
        "url",
        "file",
        "note",
    ],
    "claims.csv": ["claim_id", "statement", "support_label", "note"],
    "citations.csv": ["citation_id", "claim_id", "reference_id", "expected_outcome", "note"],
    "evidence.csv": ["evidence_id", "claim_id", "reference_id", "quote", "page", "relation", "note"],
}


def csv_bytes(rows: list[list[str]], *, sep: str = ",", encoding: str = "utf-8-sig") -> bytes:
    buffer = io.StringIO(newline="")
    csv.writer(buffer, delimiter=sep, lineterminator="\r\n").writerows(rows)
    return buffer.getvalue().encode(encoding)


def topic_rows(topic_id: str = "T01", discipline: str = "Khoa học giáo dục") -> dict[str, list[list[str]]]:
    """A small valid topic: 2 references, 3 claims, 3 citations (one mismatch), no evidence."""
    return {
        "topic.csv": [
            HEADERS["topic.csv"],
            [topic_id, f"Đề tài {topic_id}", discipline, "Câu hỏi nghiên cứu thử?", ""],
        ],
        "references.csv": [
            HEADERS["references.csv"],
            ["R01", "Công trình một", "Nguyễn Văn An; Trần Thị Bình", "2021", "", "article", "", "", "", ""],
            ["R02", "Công trình hai", "Lê Minh", "", "", "", "", "https://example.org/r02", "", ""],
        ],
        "claims.csv": [
            HEADERS["claims.csv"],
            ["C001", "Phát biểu một.", "Supported", ""],
            ["C002", "Phát biểu hai.", "Unsupported", ""],
            ["C003", "Phát biểu ba.", "Conflicting", ""],
        ],
        "citations.csv": [
            HEADERS["citations.csv"],
            ["CT001", "C001", "R01", "resolved", ""],
            ["CT002", "C002", "R02", "mismatch", ""],
            ["CT003", "C003", "R01", "resolved", ""],
        ],
    }


def evidence_rows() -> list[list[str]]:
    return [
        HEADERS["evidence.csv"],
        ["E001", "C001", "R01", "Đoạn trích làm căn cứ.", "3", "supports", ""],
    ]


def write_topic(folder: Path, files: dict[str, list[list[str]]], **encoding: str) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    for name, rows in files.items():
        (folder / name).write_bytes(csv_bytes(rows, **encoding))
    return folder
