# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Read the internal OpenAPI contracts directly from docs/api-design (read only).

The stub of S02 takes method and path of each context-read operation from the contract and validates every payload it
serves against the contract's 200 response schema, so a payload that drifts from the contract fails at stub start-up.
S01 uses ``inline_schema`` to measure the output-format part of layer 1 from the real output schemas.
"""

import json
import os
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any
from urllib.parse import urldefrag, urlparse
from urllib.request import url2pathname

import yaml
from jsonschema import Draft202012Validator  # type: ignore[import-untyped]
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

REPO = Path(__file__).resolve().parents[4]
API = REPO / "docs" / "api-design"
SCHEMAS = API / "components" / "schemas"

# The five context-read operations of spec section 2.3: operationId -> (service, contract file).
CONTEXT_OPERATIONS: dict[str, tuple[str, str]] = {
    "getProjectContextBundle": ("workspace", "internal/workspace.yaml"),
    "getTaskContextBundle": ("planning", "internal/planning.yaml"),
    "listContextItemsForAssembly": ("orchestration", "internal/orchestration.yaml"),
    "getResearchContextBundle": ("research", "internal/research.yaml"),
    "getManuscriptContextBundle": ("manuscript", "internal/manuscript.yaml"),
}


@dataclass(frozen=True)
class Operation:
    operation_id: str
    service: str
    method: str
    path: str
    schema_uri: str


@cache
def _load(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def _retrieve(uri: str) -> Resource[Any]:
    return DRAFT202012.create_resource(_load(Path(url2pathname(urlparse(uri).path))))


def _pointer(token: str) -> str:
    return token.replace("~", "~0").replace("/", "~1")


def operation(operation_id: str) -> Operation:
    """Method, path and response-schema URI of a context-read operation, as written in its contract."""
    service, relative = CONTEXT_OPERATIONS[operation_id]
    path = API / relative
    for route, item in _load(path)["paths"].items():
        for method, spec in item.items():
            if isinstance(spec, dict) and spec.get("operationId") == operation_id:
                pointer = "/".join(
                    ["", "paths", _pointer(route), method, "responses", "200", "content",
                     _pointer("application/json"), "schema"]
                )
                return Operation(operation_id, service, method.upper(), route, f"{path.as_uri()}#{pointer}")
    raise LookupError(f"{operation_id} not found in {relative}")


@cache
def _registry() -> Registry[Any]:
    return Registry(retrieve=_retrieve)  # type: ignore[call-arg]  # attrs alias of `_retrieve`


def validate_response(operation_id: str, payload: Any) -> None:
    """Raise ``jsonschema.ValidationError`` when ``payload`` does not match the operation's 200 response schema."""
    op = operation(operation_id)
    validator = Draft202012Validator(
        {"$ref": op.schema_uri}, registry=_registry(), format_checker=Draft202012Validator.FORMAT_CHECKER
    )
    validator.validate(payload)


def inline_schema(ref: str, depth: int = 6) -> Any:
    """Schema ``file.yaml#/Name`` of components/schemas with ``$ref`` inlined (recursion cut at ``depth``)."""

    def resolve(node: Any, base: Path, level: int, seen: tuple[str, ...]) -> Any:
        if isinstance(node, list):
            return [resolve(item, base, level, seen) for item in node]
        if not isinstance(node, dict):
            return node
        target = node.get("$ref")
        if isinstance(target, str):
            file_part, fragment = urldefrag(target)
            file = (base.parent / file_part).resolve() if file_part else base
            key = f"{file.name}#{fragment}"
            if key in seen or level >= depth:
                return {"$ref": key}
            value: Any = _load(file)
            for token in fragment.strip("/").split("/"):
                value = value[token.replace("~1", "/").replace("~0", "~")]
            return resolve(value, file, level + 1, (*seen, key))
        return {name: resolve(value, base, level, seen) for name, value in node.items()}

    file_name, name = ref.split("#/")
    return resolve({"$ref": f"{file_name}#/{name}"}, SCHEMAS / file_name, 0, ())


def markdown_footer(directory: Path) -> str:
    """License notice of scripts/docs/add-license.mjs for a Markdown file written into ``directory``."""
    licenses = Path(os.path.relpath(REPO / "LICENSES.md", directory.resolve())).as_posix()
    return (
        "\n---\n\n<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->\n"
        "SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh "
        "Quang Trung. Non-commercial use only; commercial use in any form is prohibited. "
        f"See [LICENSES.md]({licenses}).\n"
    )


def schema_text(refs: list[str]) -> str:
    """Compact JSON of the inlined output schemas, as they would be given to a model in layer 1."""
    return json.dumps({ref: inline_schema(ref) for ref in refs}, ensure_ascii=False, separators=(",", ":"))
