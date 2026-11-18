# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""FakeModelGateway (architecture 8.9): recorded script per (agent, step), error injection by standard code,
attempt counting. No network, no randomness, no clock: the same script gives the same results (NFR-MAINT-004)."""

from __future__ import annotations

import contextvars
import hashlib
from collections import defaultdict, deque
from collections.abc import AsyncIterator, Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Literal

from sires_common.model_gateway import (
    EmbeddingResult,
    GatewayError,
    ModelGateway,
    ModelInfo,
    ModelRequest,
    ModelResponse,
    ProviderConnectionRef,
    ProviderErrorCode,
    StreamEvent,
    ToolCall,
    Usage,
)

ADAPTER_VERSION = "fake-1"

StepKey = tuple[str, str]

_current_step: contextvars.ContextVar[StepKey | None] = contextvars.ContextVar("sires_fake_step", default=None)


class MissingScenarioError(LookupError):
    """No recorded script for the (agent, step) being asked (EC03). No default data is returned."""

    def __init__(self, agent: str | None, step: str | None) -> None:
        if agent is None:
            message = "FakeModelGateway: chưa chọn (agent, bước) — dùng fake.step(agent, bước) hoặc fake.bind(...)"
        else:
            message = f"FakeModelGateway: không có kịch bản cho agent {agent!r}, bước {step!r}"
        super().__init__(message)
        self.agent = agent
        self.step = step


@dataclass(frozen=True, slots=True)
class ScriptedResponse:
    """What the model “answers” for one (agent, step)."""

    text: str = ""
    tool_calls: tuple[ToolCall, ...] = ()
    structured: Mapping[str, Any] | None = None
    stop_reason: str = "end_turn"
    usage: Usage | Literal["no_data"] = field(default_factory=lambda: Usage(input_tokens=10, output_tokens=5, calls=1))


@dataclass(slots=True)
class _Injection:
    code: ProviderErrorCode
    retry_after: float | None


class FakeModelGateway:
    """In-memory ModelGateway.

    Each call for an (agent, step) counts one attempt. Injected errors are raised first, in order; the next call
    returns the scripted response with `attempts` = calls made for this request (failed ones included).
    """

    def __init__(
        self,
        scenarios: Mapping[StepKey, ScriptedResponse] | None = None,
        *,
        models: tuple[ModelInfo, ...] = (ModelInfo("fake-model", "Fake model"),),
        embedding_dimensions: int = 8,
    ) -> None:
        self._scenarios: dict[StepKey, ScriptedResponse] = dict(scenarios or {})
        self._injections: dict[StepKey, deque[_Injection]] = defaultdict(deque)
        self._attempts: dict[StepKey, int] = defaultdict(int)
        self._pending: dict[StepKey, int] = defaultdict(int)
        self._models = models
        self._dimensions = embedding_dimensions
        self.requests: list[tuple[StepKey, ModelRequest]] = []

    # ----- script -----

    def add(self, agent: str, step: str, response: ScriptedResponse) -> None:
        self._scenarios[(agent, step)] = response

    def inject(
        self, agent: str, step: str, code: ProviderErrorCode, *, times: int = 1, retry_after: float | None = None
    ) -> None:
        """Make the next `times` calls of (agent, step) fail with `GatewayError(code)`."""
        for _ in range(times):
            self._injections[(agent, step)].append(_Injection(code, retry_after))

    def attempts(self, agent: str, step: str) -> int:
        """Calls made for (agent, step), failed ones included."""
        return self._attempts[(agent, step)]

    def reset(self) -> None:
        """Forget counters, injections and recorded requests; keep the scripts."""
        self._injections.clear()
        self._attempts.clear()
        self._pending.clear()
        self.requests.clear()

    @contextmanager
    def step(self, agent: str, step: str) -> Iterator[None]:
        """Calls made inside the block belong to (agent, step)."""
        token = _current_step.set((agent, step))
        try:
            yield
        finally:
            _current_step.reset(token)

    def bind(self, agent: str, step: str) -> ModelGateway:
        """A ModelGateway whose calls belong to (agent, step)."""
        return _BoundGateway(self, (agent, step))

    # ----- ModelGateway -----

    def _respond(self, key: StepKey | None, req: ModelRequest) -> ModelResponse:
        if key is None:
            raise MissingScenarioError(None, None)
        scripted = self._scenarios.get(key)
        if scripted is None:
            raise MissingScenarioError(*key)
        self.requests.append((key, req))
        self._attempts[key] += 1
        self._pending[key] += 1
        pending = self._injections[key]
        if pending:
            injection = pending.popleft()
            raise GatewayError(
                injection.code, f"injected for {key[0]}/{key[1]}", retry_after=injection.retry_after
            )
        attempts = self._pending.pop(key)
        return ModelResponse(
            text=scripted.text,
            tool_calls=scripted.tool_calls,
            structured=scripted.structured,
            stop_reason=scripted.stop_reason,
            usage=scripted.usage,
            attempts=attempts,
            adapter_version=ADAPTER_VERSION,
        )

    async def generate(self, req: ModelRequest, conn: ProviderConnectionRef) -> ModelResponse:
        return self._respond(_current_step.get(), req)

    async def stream(self, req: ModelRequest, conn: ProviderConnectionRef) -> AsyncIterator[StreamEvent]:
        async for event in _stream(self._respond(_current_step.get(), req)):
            yield event

    async def embed(self, texts: list[str], model: str, conn: ProviderConnectionRef) -> EmbeddingResult:
        """Deterministic unit vectors derived from SHA-256 of each text."""
        vectors = tuple(_vector(text, self._dimensions) for text in texts)
        usage = Usage(input_tokens=sum(len(t.split()) for t in texts), output_tokens=0, calls=1)
        return EmbeddingResult(vectors=vectors, model=model, dimensions=self._dimensions, usage=usage)

    async def list_models(self, conn: ProviderConnectionRef) -> list[ModelInfo]:
        return list(self._models)


class _BoundGateway:
    def __init__(self, fake: FakeModelGateway, key: StepKey) -> None:
        self._fake = fake
        self._key = key

    async def generate(self, req: ModelRequest, conn: ProviderConnectionRef) -> ModelResponse:
        return self._fake._respond(self._key, req)

    async def stream(self, req: ModelRequest, conn: ProviderConnectionRef) -> AsyncIterator[StreamEvent]:
        async for event in _stream(self._fake._respond(self._key, req)):
            yield event

    async def embed(self, texts: list[str], model: str, conn: ProviderConnectionRef) -> EmbeddingResult:
        return await self._fake.embed(texts, model, conn)

    async def list_models(self, conn: ProviderConnectionRef) -> list[ModelInfo]:
        return await self._fake.list_models(conn)


async def _stream(response: ModelResponse) -> AsyncIterator[StreamEvent]:
    words = response.text.split(" ")
    for index, word in enumerate(words):
        yield StreamEvent("delta", text=word if index == 0 else " " + word)
    yield StreamEvent("done", response=response)


def _vector(text: str, dimensions: int) -> tuple[float, ...]:
    raw: list[float] = []
    counter = 0
    while len(raw) < dimensions:
        digest = hashlib.sha256(f"{counter}:{text}".encode()).digest()
        raw.extend((b - 127.5) / 127.5 for b in digest)
        counter += 1
    values = raw[:dimensions]
    norm = sum(v * v for v in values) ** 0.5 or 1.0
    return tuple(v / norm for v in values)
