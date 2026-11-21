# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Acceptance dataset: CSV format, validator and JSONL converter (PID-00033; PRD 19.14, DEC-39, DEC-45).

Commands for the PO and QA (run from ``eval/``)::

    uv run python -m sires_eval.datasets check datasets/sample
    uv run python -m sires_eval.datasets convert datasets/sample
"""

from .convert import Conversion, DatasetInvalid, convert, load_jsonl
from .reader import Issue
from .schema import CITATION_OUTCOMES, EVIDENCE_RELATIONS, FILES, SUPPORT_LABELS
from .validate import ValidationResult, validate

__all__ = [
    "CITATION_OUTCOMES",
    "EVIDENCE_RELATIONS",
    "FILES",
    "SUPPORT_LABELS",
    "Conversion",
    "DatasetInvalid",
    "Issue",
    "ValidationResult",
    "convert",
    "load_jsonl",
    "validate",
]
