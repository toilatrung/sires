# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
"""Validate a JSON payload against a message in the SIRes AsyncAPI contract."""

import argparse
import json
import sys
from pathlib import Path

import yaml
from jsonschema import Draft7Validator, FormatChecker
from referencing import Registry
from referencing.jsonschema import DRAFT7

SPEC_ROOT = Path(__file__).resolve().parents[2] / "docs" / "api-design"
ASYNCAPI = SPEC_ROOT / "events" / "asyncapi.yaml"


def message_errors(message: str, payload: object) -> list[str]:
    document = yaml.safe_load(ASYNCAPI.read_text(encoding="utf-8"))
    messages = document["components"]["messages"]
    if message not in messages:
        raise ValueError(f"Không có message {message!r} trong components.messages")

    roots = [ASYNCAPI, *SPEC_ROOT.glob("internal/*.yaml"), *SPEC_ROOT.glob("components/schemas/*.yaml")]
    registry = Registry().with_resources(
        (path.as_uri(), DRAFT7.create_resource(yaml.safe_load(path.read_text(encoding="utf-8"))))
        for path in roots
    )
    ref = f"{ASYNCAPI.as_uri()}#/components/messages/{message}/payload"
    validator = Draft7Validator({"$ref": ref}, registry=registry, format_checker=FormatChecker())
    return [
        f"{message} {error.json_path}: {error.message}"
        for error in validator.iter_errors(payload)
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("message")
    parser.add_argument("payload", type=Path)
    args = parser.parse_args()
    try:
        errors = message_errors(args.message, json.loads(args.payload.read_text(encoding="utf-8")))
    except (OSError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1
    for error in errors:
        print(error, file=sys.stderr)
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
