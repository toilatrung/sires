# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Shared pieces of SPK-01 (PID-00021): settings, the common schema and tools, evidence files, key redaction.

Spike code: it is outside ``src/`` and never part of the agent-core package or image. API keys are read from
environment variables (on Windows also from the user-level variables in the registry, so a key the PO set after the
shell started is seen), else from the Dev machine's keys file (``scripts/development/set-provider-keys.ps1``), and
never printed or written: every string that leaves this process goes through ``redact``.
"""

from __future__ import annotations

import functools
import json
import os
import re
import subprocess
import sys
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, ValidationError

PROVIDERS = ("anthropic", "openai", "google")
# Adapter variants: OpenAI is measured on Chat Completions (what proxies and self-hosted servers implement) and on
# the Responses API.
VARIANTS = ("anthropic", "openai", "openai-responses", "google")
KEY_ENV = {
    "anthropic": ("ANTHROPIC_API_KEY",),
    "openai": ("OPENAI_API_KEY",),
    "google": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
}
# Base URL of the connection whose key is KEY_ENV; SPK01_BASE_URL_* is the name used before 26/11/2026.
BASE_URL_ENV = {p: (f"SIRES_BASE_URL_{p.upper()}", f"SPK01_BASE_URL_{p.upper()}") for p in PROVIDERS}
# A separate key for the official endpoint, used only when the connection above points to a gateway (QC G9).
OFFICIAL_KEY_ENV = {
    "anthropic": ("ANTHROPIC_API_KEY_OFFICIAL",),
    "openai": ("OPENAI_API_KEY_OFFICIAL",),
    "google": ("GEMINI_API_KEY_OFFICIAL",),
}
KEYS_FILE_ENV = "SIRES_PROVIDER_KEYS_FILE"
# Official endpoints, as prefilled in Settings › Provider Connections (PRD AGENT-PROVIDER-002).
OFFICIAL_BASE_URL = {
    "anthropic": "https://api.anthropic.com",
    "openai": "https://api.openai.com/v1",
    "google": "https://generativelanguage.googleapis.com",
}
# Low-cost models (designs/notes.html); override with SPK01_MODEL_<PROVIDER>.
DEFAULT_MODEL = {"anthropic": "claude-haiku-4-5", "openai": "gpt-4.1-nano", "google": "gemini-2.5-flash-lite"}
MAX_OUTPUT_TOKENS = 300
DEFAULT_TIMEOUT_S = 60.0
_HERE = Path(__file__).resolve()
# agent/execution/PID-00021/evidence in the repo; the SPK01_EVIDENCE variable overrides it.
EVIDENCE_ROOT = Path(
    os.environ.get("SPK01_EVIDENCE")
    or (_HERE.parents[4] / "agent" / "execution" / "PID-00021" / "evidence" if len(_HERE.parents) > 4 else "evidence")
)


def provider_of(variant: str) -> str:
    return variant.split("-")[0]


def model_for(provider: str) -> str:
    """SPK01_MODEL_<PROVIDER> from the environment, else from the keys file, else the default low-cost model."""
    name = f"SPK01_MODEL_{provider.upper()}"
    return os.environ.get(name, "").strip() or _file_values().get(name, "") or DEFAULT_MODEL[provider]


def _registry_user_env(name: str) -> str:
    if sys.platform != "win32":
        return ""
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            return str(winreg.QueryValueEx(key, name)[0])
    except OSError:
        return ""


def _env(name: str) -> str:
    return (os.environ.get(name) or _registry_user_env(name)).strip()


@functools.cache
def _main_checkout() -> Path:
    """Root of the main checkout, shared by every git worktree; this repo's root when git cannot tell."""
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            cwd=_HERE.parent,
            capture_output=True,
            text=True,
            timeout=15,
            check=True,
        ).stdout.strip()
        if out:
            return Path(out).parent
    except (OSError, subprocess.SubprocessError):
        pass
    return _HERE.parents[4] if len(_HERE.parents) > 4 else _HERE.parent


def keys_file() -> Path:
    """The Dev machine's keys file: SIRES_PROVIDER_KEYS_FILE, else <main checkout>/.sires/provider-keys.env."""
    custom = _env(KEYS_FILE_ENV)
    return Path(custom).expanduser() if custom else _main_checkout() / ".sires" / "provider-keys.env"


def _file_values() -> dict[str, str]:
    """NAME=value lines of the keys file (dotenv: comments, optional export, optional quotes); empty when absent."""
    try:
        text = keys_file().read_text(encoding="utf-8-sig")
    except OSError:
        return {}
    values: dict[str, str] = {}
    for line in text.splitlines():
        match = re.match(r"\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", line)
        if match:
            value = match.group(2).strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
                value = value[1:-1]
            values[match.group(1)] = value.strip()
    return values


def _first(get: Callable[[str], str], names: Iterable[str]) -> str:
    return next((value for name in names if (value := get(name))), "")


@dataclass(frozen=True)
class Connection:
    """One provider connection: the key is only ever sent to this base URL (SCOPE-13, architecture 8.2; QC G9)."""

    key: str | None
    base_url: str | None  # None: the official endpoint
    source: str  # "môi trường", "file" or "" when there is no key


def connection(provider: str) -> Connection:
    """Key and base URL of the provider, both from one source so a key is never paired with another source's base
    URL: the environment when it has the key, else the keys file. Values are registered for redaction; the base URL's
    host is redacted from every output (the repo is public; the PO's choice of gateway is not part of the result)."""
    file = _file_values()
    sources: list[tuple[str, Callable[[str], str]]] = [("môi trường", _env), ("file", lambda n: file.get(n, ""))]
    for _, get in sources:
        for name in BASE_URL_ENV[provider]:
            host = urlsplit(get(name)).hostname
            if host:
                _HOSTS.add(host)
    for source, get in sources:
        key = _first(get, KEY_ENV[provider])
        if key:
            _SECRETS.add(key)
            base_url = _first(get, BASE_URL_ENV[provider]).rstrip("/")
            official = base_url == OFFICIAL_BASE_URL[provider] or not base_url
            return Connection(key, None if official else base_url, source)
    return Connection(None, None, "")


def read_key(provider: str) -> str | None:
    """Key of the provider's connection, or None; it goes only to ``base_url_for(provider)``."""
    return connection(provider).key


def base_url_for(provider: str) -> str | None:
    """Base URL of the provider's connection (a gateway compatible with the official API), or None for the official
    endpoint."""
    return connection(provider).base_url


def official_key(provider: str) -> str | None:
    """A key that may be sent to the official endpoint: the connection's key when the connection is the official
    endpoint, else only a separate <NAME>_OFFICIAL key. A gateway key is never sent to the official endpoint (G9)."""
    conn = connection(provider)
    if conn.key and conn.base_url is None:
        return conn.key
    file = _file_values()
    for get in (_env, lambda n: file.get(n, "")):
        key = _first(get, OFFICIAL_KEY_ENV[provider])
        if key:
            _SECRETS.add(key)
            return key
    return None


def key_names(provider: str) -> str:
    return " hoặc ".join(KEY_ENV[provider]) + " (biến môi trường hoặc file key của máy Dev)"


def endpoint_label(provider: str) -> str:
    return "cổng trung gian" if base_url_for(provider) else "endpoint chính thức"


# ---------------------------------------------------------------- redaction (NFR-OBS-002, EC04)

_SECRETS: set[str] = set()
KEY_PATTERNS = {
    "anthropic-key": re.compile(r"sk-ant-[A-Za-z0-9_\-]{16,}"),
    "openai-key": re.compile(r"sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_\-]{20,}"),
    "google-key": re.compile(r"AIza[0-9A-Za-z_\-]{30,}"),
}


_HOSTS: set[str] = set()


def redact(text: str) -> str:
    for secret in _SECRETS:
        if len(secret) >= 8:
            text = text.replace(secret, "[REDACTED]")
    for host in _HOSTS:
        text = re.sub(re.escape(host), "[gateway-host]", text, flags=re.IGNORECASE)
    for name, pattern in KEY_PATTERNS.items():
        text = pattern.sub(f"[REDACTED:{name}]", text)
    return text


def redact_obj(value: Any) -> Any:
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, dict):
        return {redact(str(k)): redact_obj(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [redact_obj(v) for v in value]
    return value


def say(*parts: object) -> None:
    print(redact(" ".join(str(p) for p in parts)), flush=True)


# ---------------------------------------------------------------- evidence


@dataclass
class Evidence:
    """Writes one JSON object per line to ``<out>/results.jsonl`` and a summary at the end; all values redacted."""

    out_dir: Path
    rows: list[dict[str, Any]] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self._file = (self.out_dir / "results.jsonl").open("w", encoding="utf-8", newline="\n")

    def record(self, **row: Any) -> dict[str, Any]:
        row = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"), **row}
        clean = redact_obj(json.loads(json.dumps(row, default=str, ensure_ascii=False)))
        self.rows.append(clean)
        self._file.write(json.dumps(clean, ensure_ascii=False) + "\n")
        self._file.flush()
        return clean

    def write(self, name: str, content: str | dict[str, Any] | list[Any]) -> Path:
        path = self.out_dir / name
        text = content if isinstance(content, str) else json.dumps(content, indent=2, ensure_ascii=False, default=str)
        path.write_text(redact(text) + ("" if text.endswith("\n") else "\n"), encoding="utf-8", newline="\n")
        return path

    def close(self) -> None:
        self._file.close()


def md_table(header: list[str], rows: Iterable[list[Any]]) -> str:
    lines = ["| " + " | ".join(header) + " |", "| " + " | ".join("---" for _ in header) + " |"]
    for row in rows:
        lines.append("| " + " | ".join(str(c).replace("|", "\\|").replace("\n", " ") for c in row) + " |")
    return "\n".join(lines) + "\n"


def environment_info() -> dict[str, Any]:
    from importlib.metadata import PackageNotFoundError, version

    info: dict[str, Any] = {"python": sys.version.split()[0], "platform": sys.platform}
    for dist in ("anthropic", "openai", "google-genai", "pydantic", "pydantic-ai-slim", "langgraph", "genai-prices"):
        try:
            info[dist] = version(dist)
        except PackageNotFoundError:
            info[dist] = None
    return info


# ---------------------------------------------------------------- common schema (architecture 8.5)


class Finding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim: str = Field(description="One sentence claim drawn from the references.")
    reference_ids: list[str] = Field(description="IDs of the references that support the claim, such as R1.")
    support: Literal["supported", "partial", "unsupported"] = Field(description="How well the references support it.")


class ResearchAnswer(BaseModel):
    """Output of the measured agent step; the same model is sent to every provider."""

    model_config = ConfigDict(extra="forbid")

    topic: str = Field(description="Short topic of the answer.")
    findings: list[Finding] = Field(description="One to three findings.")
    confidence: float = Field(description="Confidence from 0 to 1.")
    follow_up_question: str | None = Field(description="A follow-up question, or null when none is needed.")


SchemaVariant = Literal["raw", "inline", "inline_typelist"]
SCHEMA_VARIANTS: tuple[SchemaVariant, ...] = ("raw", "inline", "inline_typelist")


def _inline(node: Any, defs: dict[str, Any]) -> Any:
    if isinstance(node, dict):
        if "$ref" in node:
            target = defs[node["$ref"].rsplit("/", 1)[-1]]
            merged = {**_inline(target, defs), **{k: v for k, v in node.items() if k != "$ref"}}
            return _inline(merged, defs)
        return {k: _inline(v, defs) for k, v in node.items() if k not in ("$defs", "title")}
    if isinstance(node, list):
        return [_inline(v, defs) for v in node]
    return node


def _type_list(node: Any) -> Any:
    if isinstance(node, dict):
        options = node.get("anyOf")
        if isinstance(options, list) and len(options) == 2 and {"type": "null"} in options:
            other = next(o for o in options if o != {"type": "null"})
            if set(other) == {"type"} and isinstance(other["type"], str):
                rest = {k: v for k, v in node.items() if k != "anyOf"}
                return {**rest, "type": [other["type"], "null"]}
        return {k: _type_list(v) for k, v in node.items()}
    if isinstance(node, list):
        return [_type_list(v) for v in node]
    return node


def output_schema(variant: SchemaVariant = "inline") -> dict[str, Any]:
    """JSON Schema of ResearchAnswer.

    raw: as Pydantic generates it ($defs/$ref, titles, anyOf for the nullable field).
    inline: $ref inlined, titles removed; additionalProperties false and every property required (already so).
    inline_typelist: inline, and anyOf[T, null] written as type: [T, "null"].
    """
    raw = ResearchAnswer.model_json_schema()
    if variant == "raw":
        return raw
    inlined = _inline(raw, raw.get("$defs", {}))
    return _type_list(inlined) if variant == "inline_typelist" else inlined


def validate_answer(data: Any) -> tuple[ResearchAnswer | None, str | None]:
    try:
        return ResearchAnswer.model_validate(data), None
    except ValidationError as exc:
        first = exc.errors()[0]
        loc = ".".join(str(p) for p in first["loc"]) or "(root)"
        return None, f"{exc.error_count()} lỗi; đầu tiên: {loc}: {first['msg']}"


# ---------------------------------------------------------------- tools of the measured loop (synthetic library)

LIBRARY: dict[str, dict[str, Any]] = {
    "R1": {
        "title": "Synthetic study A: grounding claims in retrieved passages",
        "year": 2024,
        "key_finding": "Linking each claim to a retrieved passage cut unsupported claims from 18% to 6% in 120 drafts.",
    },
    "R2": {
        "title": "Synthetic study B: automatic citation checking",
        "year": 2025,
        "key_finding": "A checker comparing quotes with the cited source caught 91% of mismatched citations.",
    },
    "R3": {
        "title": "Synthetic study C: reviewer time",
        "year": 2023,
        "key_finding": "Reviewers spent 30% less time when each claim showed its evidence passage next to it.",
    },
}


@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]


TOOLS = [
    ToolSpec(
        "search_library",
        "Search the project library. Returns matching reference IDs and titles.",
        {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search words."},
                "limit": {"type": "integer", "description": "Maximum number of results, 1 to 5."},
            },
            "required": ["query", "limit"],
            "additionalProperties": False,
        },
    ),
    ToolSpec(
        "get_reference",
        "Return the library record (title, year, key finding) of one reference by its ID.",
        {
            "type": "object",
            "properties": {"reference_id": {"type": "string", "description": "Reference ID such as R1."}},
            "required": ["reference_id"],
            "additionalProperties": False,
        },
    ),
]


def run_tool(name: str, args: dict[str, Any]) -> str:
    if name == "search_library":
        limit = args.get("limit", 3)
        limit = max(1, min(5, limit if isinstance(limit, int) else 3))
        hits = [{"reference_id": rid, "title": rec["title"]} for rid, rec in LIBRARY.items()][:limit]
        return json.dumps({"results": hits})
    if name == "get_reference":
        rid = str(args.get("reference_id", "")).strip().upper()
        if rid in LIBRARY:
            return json.dumps({"reference_id": rid, **LIBRARY[rid]})
        return json.dumps({"error": f"unknown reference_id {rid!r}"})
    return json.dumps({"error": f"unknown tool {name!r}"})


def tool_args_valid(name: str, args: Any) -> bool:
    spec = next((t for t in TOOLS if t.name == name), None)
    if spec is None or not isinstance(args, dict):
        return False
    props = spec.parameters["properties"]
    if set(args) - set(props) or set(spec.parameters["required"]) - set(args):
        return False
    kinds = {"string": str, "integer": int}
    return all(isinstance(args[k], kinds[props[k]["type"]]) for k in args)


SYSTEM_PROMPT = (
    "You are a research assistant inside a test harness. Answer briefly. Use only the provided tools and records; "
    "never invent reference IDs."
)
RECORDS_TEXT = json.dumps(LIBRARY, ensure_ascii=False)
STRUCTURED_PROMPT = (
    "Library records (JSON): " + RECORDS_TEXT + "\nSummarise what these records say about grounding claims in "
    "evidence. Give one to three findings, each citing reference IDs."
)
LOOP_PROMPT = (
    "Using the project library tools, find the references about citation checking and evidence grounding, read each "
    "relevant one with get_reference, then give the final answer with findings that cite the reference IDs."
)


# ---------------------------------------------------------------- cost (NFR-USAGE-003: always an estimate)

GENAI_PRICES_PROVIDER = {"anthropic": "anthropic", "openai": "openai", "google": "google"}


def estimate_cost_usd(provider: str, model: str, input_tokens: int | None, output_tokens: int | None, **extra: int):
    """Estimated USD cost from the genai-prices snapshot bundled with pydantic-ai-slim, or None when unknown."""
    if input_tokens is None and output_tokens is None:
        return None
    try:
        from genai_prices import Usage, calc_price

        usage = Usage(
            input_tokens=input_tokens or 0,
            output_tokens=output_tokens or 0,
            cache_read_tokens=extra.get("cache_read_tokens") or None,
            cache_write_tokens=extra.get("cache_write_tokens") or None,
        )
        price = calc_price(usage, model, provider_id=GENAI_PRICES_PROVIDER[provider])
        return float(price.total_price)
    except Exception:
        return None
