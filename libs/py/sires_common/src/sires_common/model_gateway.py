# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Model Gateway interface (architecture 8.1, 8.4). No provider SDK is imported here: real adapters live in
agent-core (PID-00070); knowledge uses the same interface for `embed`; tests use FakeModelGateway (8.9)."""

from __future__ import annotations

from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol, runtime_checkable
from uuid import UUID

ProviderErrorCode = Literal[
    "auth_failed",
    "permission_denied",
    "model_not_found",
    "rate_limited",
    "quota_exceeded",
    "context_too_long",
    "content_refused",
    "timeout",
    "provider_unavailable",
    "invalid_response",
    "network_error",
    "interrupted",
]

#: Transient codes retried inside an Agent Run (ProviderErrorCode in components/schemas/common.yaml).
RETRYABLE_CODES: frozenset[str] = frozenset({"rate_limited", "timeout", "provider_unavailable", "network_error"})

NO_DATA: Literal["no_data"] = "no_data"


class GatewayError(Exception):
    """Normalised provider error: `code` from the standard set, `retryable`, optional `retry_after` seconds."""

    def __init__(
        self,
        code: ProviderErrorCode,
        message: str = "",
        *,
        retryable: bool | None = None,
        retry_after: float | None = None,
    ) -> None:
        super().__init__(f"{code}: {message}" if message else code)
        self.code: ProviderErrorCode = code
        self.message = message
        self.retryable = code in RETRYABLE_CODES if retryable is None else retryable
        self.retry_after = retry_after


@dataclass(frozen=True, slots=True)
class ProviderConnectionRef:
    """Only the id: adapters fetch and decrypt the key themselves, right before the call (NFR-SECRETS-001)."""

    id: UUID


@dataclass(frozen=True, slots=True)
class ChatMessage:
    role: Literal["system", "user", "assistant", "tool_result"]
    content: str
    tool_call_id: str | None = None


@dataclass(frozen=True, slots=True)
class ToolSpec:
    name: str
    description: str
    input_schema: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class RequestMetadata:
    agent_run_id: UUID | None = None
    traceparent: str | None = None


@dataclass(frozen=True, slots=True)
class ModelRequest:
    model: str
    messages: tuple[ChatMessage, ...]
    tools: tuple[ToolSpec, ...] = ()
    output_schema: Mapping[str, Any] | None = None
    stream: bool = False
    max_output_tokens: int | None = None
    metadata: RequestMetadata = field(default_factory=RequestMetadata)


@dataclass(frozen=True, slots=True)
class ToolCall:
    id: str
    name: str
    arguments: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class Usage:
    input_tokens: int
    output_tokens: int
    calls: int
    extra: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ModelResponse:
    text: str
    tool_calls: tuple[ToolCall, ...]
    structured: Mapping[str, Any] | None
    stop_reason: str
    usage: Usage | Literal["no_data"]
    attempts: int
    adapter_version: str


@dataclass(frozen=True, slots=True)
class StreamEvent:
    """`delta` carries text; `done` carries the final response (usage, attempts)."""

    kind: Literal["delta", "done"]
    text: str = ""
    response: ModelResponse | None = None


@dataclass(frozen=True, slots=True)
class EmbeddingResult:
    vectors: tuple[tuple[float, ...], ...]
    model: str
    dimensions: int
    usage: Usage | Literal["no_data"]


@dataclass(frozen=True, slots=True)
class ModelInfo:
    id: str
    display_name: str | None = None


@runtime_checkable
class ModelGateway(Protocol):
    async def generate(self, req: ModelRequest, conn: ProviderConnectionRef) -> ModelResponse: ...

    def stream(self, req: ModelRequest, conn: ProviderConnectionRef) -> AsyncIterator[StreamEvent]: ...

    async def embed(self, texts: list[str], model: str, conn: ProviderConnectionRef) -> EmbeddingResult: ...

    async def list_models(self, conn: ProviderConnectionRef) -> list[ModelInfo]:
        """Used by “kiểm tra kết nối”."""
        ...
