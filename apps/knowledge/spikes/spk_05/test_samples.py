# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S01: the committed sample list (samples.csv) covers the scope P1 and records source, licence and hash."""

from __future__ import annotations

import re

from .derive import COVERED, OCRED, STAMPED, TRUNCATED
from .fetch import read_manifest

SHA256 = re.compile(r"^[0-9a-f]{64}$")


def test_manifest_covers_scope() -> None:
    rows = read_manifest()
    ids = [r["id"] for r in rows]
    assert len(ids) == len(set(ids))
    text_fields = {r["field"] for r in rows if r["label"] == "text"}
    assert len(text_fields) >= 3  # P1: at least 3 fields
    features = {f for r in rows for f in r["features"].split(";") if f}
    assert {"formula", "table", "two_column", "scanned"} <= features
    assert {r["lang"] for r in rows} >= {"en", "vi"}
    # Derived samples (derive.py) add simulated scans and damaged files from these rows.
    assert set(STAMPED + COVERED + OCRED + TRUNCATED) <= {r["id"] for r in rows if r["label"] == "text"}


def test_manifest_records_source_licence_and_hash() -> None:
    for r in read_manifest():
        assert r["url"].startswith("https://"), r["id"]
        assert r["source"] and r["license"] and r["license_url"].startswith("https://"), r["id"]
        assert SHA256.match(r["sha256"]) and int(r["bytes"]) > 0, r["id"]
        if r["truth_url"]:
            assert r["truth_url"].startswith("https://") and SHA256.match(r["truth_sha256"]), r["id"]
