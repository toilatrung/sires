# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Helpers shared by the tests: DDL and contract schemas read from docs/ (read only)."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import url2pathname

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

REPO_ROOT = Path(__file__).resolve().parents[4]
DDL_COMMON = REPO_ROOT / "docs" / "database" / "ddl" / "00-common.sql"
INTERNAL_SCHEMAS = REPO_ROOT / "docs" / "api-design" / "internal" / "schemas.yaml"
ORCHESTRATION_SCHEMAS = REPO_ROOT / "docs" / "api-design" / "components" / "schemas" / "orchestration.yaml"
COMMON_SCHEMAS = REPO_ROOT / "docs" / "api-design" / "components" / "schemas" / "common.yaml"


def common_ddl() -> str:
    return DDL_COMMON.read_text(encoding="utf-8")


def _retrieve(uri: str) -> Resource[Any]:
    path = Path(url2pathname(urlparse(uri).path))
    contents = yaml.safe_load(path.read_text(encoding="utf-8"))
    return Resource.from_contents(contents, default_specification=DRAFT202012)


def contract_validator(schema_file: Path, name: str) -> Draft202012Validator:
    """JSON Schema validator for `name` in a docs/api-design YAML file, resolving cross-file `$ref`."""
    registry: Registry[Any] = Registry(retrieve=_retrieve)  # type: ignore[call-arg]
    schema = {"$ref": f"{schema_file.as_uri()}#/{name}"}
    return Draft202012Validator(schema, registry=registry, format_checker=FormatChecker())


def contract_errors(schema_file: Path, name: str, instance: Any) -> list[str]:
    validator = contract_validator(schema_file, name)
    return [f"{list(e.absolute_path)}: {e.message}" for e in validator.iter_errors(instance)]
