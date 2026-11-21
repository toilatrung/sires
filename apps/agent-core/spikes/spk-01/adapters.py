# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Three provider adapters on the official SDKs (ADR-08), shaped after the Model Gateway contract (architecture 8.1).

A trimmed, measurable version of what PID-00070 will build: normalised request/response, tool calls, structured
output (native or forced tool), text streaming, usage, and the error mapping to the standard codes of PRD 8.6 /
architecture 8.4. SDK retries are off (max_retries=0) so each measured call is one HTTP attempt.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any, Literal

from common import MAX_OUTPUT_TOKENS, ToolSpec, redact

ADAPTER_VERSION = "spk01-0.1"
STANDARD_CODES = (
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
)
RETRYABLE = {"rate_limited", "timeout", "provider_unavailable", "network_error"}


# ---------------------------------------------------------------- neutral types


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: Any  # dict when the provider sent valid JSON; the raw string otherwise


@dataclass
class Msg:
    role: Literal["user", "assistant", "tool"]
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_call_id: str = ""
    tool_name: str = ""
    # Provider content to send back unchanged on the next turn (Gemini thought signatures, Anthropic blocks).
    provider_parts: Any = None


@dataclass
class ModelRequest:
    model: str
    messages: list[Msg]
    system: str = ""
    tools: list[ToolSpec] = field(default_factory=list)
    output_schema: dict[str, Any] | None = None
    output_name: str = "research_answer"
    output_mode: Literal["native", "tool"] = "native"
    tool_choice: Literal["auto", "required"] = "auto"
    max_output_tokens: int = MAX_OUTPUT_TOKENS


@dataclass
class Usage:
    input_tokens: int | None
    output_tokens: int | None
    calls: int = 1
    extra: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def no_data(self) -> bool:
        return self.input_tokens is None and self.output_tokens is None

    def as_dict(self) -> dict[str, Any]:
        if self.no_data:
            return {"usage": "no_data", "calls": self.calls, "raw": self.raw}
        return {
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "calls": self.calls,
            "extra": self.extra,
            "raw": self.raw,
        }


@dataclass
class ModelResult:
    text: str
    tool_calls: list[ToolCall]
    structured: Any  # parsed JSON of the structured output (validated by the caller), or None
    structured_error: str | None
    stop_reason: str  # end_turn | tool_use | max_tokens | refusal | other:<raw>
    raw_stop_reason: str
    refusal: bool
    usage: Usage
    latency_s: float
    assistant: Msg


@dataclass
class StreamResult:
    text: str
    chunks: int
    ttft_s: float | None
    total_s: float
    usage: Usage
    event_types: dict[str, int]


class GatewayError(Exception):
    def __init__(
        self,
        code: str,
        *,
        signal: str,
        sdk_exception: str,
        retry_after: float | None = None,
        http_status: int | None = None,
        message: str = "",
    ) -> None:
        self.code = code
        self.retryable = code in RETRYABLE
        self.signal = signal
        self.sdk_exception = sdk_exception
        self.retry_after = retry_after
        self.http_status = http_status
        self.message = redact(message)[:240]
        super().__init__(f"{code} ({signal})")

    def as_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "retryable": self.retryable,
            "retry_after_s": self.retry_after,
            "http_status": self.http_status,
            "signal": self.signal,
            "sdk_exception": self.sdk_exception,
            "message": self.message,
        }


def _parse_json(text: str) -> tuple[Any, str | None]:
    if not text.strip():
        return None, "không có nội dung"
    try:
        return json.loads(text), None
    except json.JSONDecodeError as exc:
        return None, f"JSON không hợp lệ: {exc.msg} (cột {exc.colno})"


def _args(raw: Any) -> Any:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw or "{}")
        except json.JSONDecodeError:
            return raw
    return raw


def _retry_after(headers: Any) -> float | None:
    if headers is None:
        return None
    value = headers.get("retry-after")
    try:
        return float(value) if value is not None else None
    except ValueError:
        return None


_CONTEXT_WORDS = (
    "too long",
    "context length",
    "context window",
    "maximum context",
    "exceeds the maximum",
    "too many tokens",
)


def _mentions_context(message: str | None) -> bool:
    text = (message or "").lower()
    return any(w in text for w in _CONTEXT_WORDS)


def _transport_error(exc: BaseException) -> str | None:
    names = [c.__name__ for c in type(exc).__mro__]
    if any("Timeout" in n for n in names):
        return "timeout"
    if any(
        n in ("ConnectError", "NetworkError", "RemoteProtocolError", "ReadError", "APIConnectionError") for n in names
    ):
        return "network_error"
    return None


def _unreadable(exc: BaseException) -> bool:
    """The provider answered but the body could not be read (not JSON, wrong shape)."""
    names = [c.__name__ for c in type(exc).__mro__]
    return isinstance(exc, ValueError) or any("Validation" in n or "UnknownApiResponse" in n for n in names)


def map_exception(provider: str, exc: BaseException) -> GatewayError:
    """Map an SDK exception to a standard code (architecture 8.4). Unknown signals become ``unmapped``."""
    if isinstance(exc, GatewayError):
        return exc
    name = type(exc).__name__
    status = getattr(exc, "status_code", None)
    message = str(getattr(exc, "message", "") or exc)
    if provider == "google":
        return _map_google(exc, name, message)
    if status is None:
        code = _transport_error(exc) or ("invalid_response" if _unreadable(exc) else "unmapped")
        return GatewayError(code, signal=f"transport {name}", sdk_exception=name, message=message)
    headers = getattr(getattr(exc, "response", None), "headers", None)
    retry_after = _retry_after(headers)
    if provider == "anthropic":
        etype = getattr(exc, "type", None)
        ecode = getattr(exc, "error_code", None)
        api_message = getattr(exc, "api_message", None) or message
        signal = f"HTTP {status} {etype}" + (f"/{ecode}" if ecode else "")
        if status == 401 or etype == "authentication_error":
            code = "auth_failed"
        elif status == 403 or etype == "permission_error":
            code = "permission_denied"
        elif status == 404 or etype == "not_found_error":
            code = "model_not_found"
        elif status == 402 or etype == "billing_error" or (ecode and "spend_limit" in ecode):
            code = "quota_exceeded"
        elif status == 429 or etype == "rate_limit_error":
            code = "rate_limited"
        elif status == 413 or (status == 400 and _mentions_context(api_message)):
            code = "context_too_long"
        elif status in (408, 504) or etype == "timeout_error":
            code = "timeout"
        elif status >= 500 or etype in ("api_error", "overloaded_error"):
            code = "provider_unavailable"
        else:
            code = "unmapped"
        return GatewayError(
            code, signal=signal, sdk_exception=name, retry_after=retry_after, http_status=status, message=api_message
        )
    # openai (Chat Completions and Responses share the error format)
    ecode = getattr(exc, "code", None)
    etype = getattr(exc, "type", None)
    signal = f"HTTP {status} {etype}" + (f"/{ecode}" if ecode else "")
    if status == 401:
        code = "auth_failed"
    elif status == 403:
        code = "permission_denied"
    elif status == 404:
        code = "model_not_found"
    elif status == 429 and (ecode == "insufficient_quota" or etype == "insufficient_quota"):
        code = "quota_exceeded"
    elif status == 429:
        code = "rate_limited"
    elif status == 400 and (ecode == "context_length_exceeded" or _mentions_context(message)):
        code = "context_too_long"
    elif status in (408, 504):
        code = "timeout"
    elif status >= 500:
        code = "provider_unavailable"
    else:
        code = "unmapped"
    return GatewayError(
        code, signal=signal, sdk_exception=name, retry_after=retry_after, http_status=status, message=message
    )


def _google_reason_and_retry(details: Any) -> tuple[str | None, str | None, float | None]:
    error = details.get("error", details) if isinstance(details, dict) else {}
    reason = quota_id = None
    retry = None
    for item in error.get("details", []) if isinstance(error, dict) else []:
        if not isinstance(item, dict):
            continue
        reason = reason or item.get("reason")
        for violation in item.get("violations", []) or []:
            quota_id = quota_id or violation.get("quotaId")
        delay = item.get("retryDelay")
        if isinstance(delay, str) and delay.endswith("s"):
            try:
                retry = float(delay[:-1])
            except ValueError:
                pass
    return reason, quota_id, retry


def _map_google(exc: BaseException, name: str, message: str) -> GatewayError:
    status_code = getattr(exc, "code", None)
    if not isinstance(status_code, int):
        code = _transport_error(exc) or ("invalid_response" if _unreadable(exc) else "unmapped")
        return GatewayError(code, signal=f"transport {name}", sdk_exception=name, message=message)
    status = getattr(exc, "status", None)
    msg = getattr(exc, "message", None) or message
    reason, quota_id, retry = _google_reason_and_retry(getattr(exc, "details", None))
    signal = (
        f"HTTP {status_code} {status}" + (f"/{reason}" if reason else "") + (f" quotaId={quota_id}" if quota_id else "")
    )
    if status_code == 401 or status == "UNAUTHENTICATED" or reason in ("API_KEY_INVALID", "API_KEY_EXPIRED"):
        code = "auth_failed"
    elif status_code == 403 or status == "PERMISSION_DENIED":
        code = "permission_denied"
    elif status_code == 404 or status == "NOT_FOUND":
        code = "model_not_found"
    elif status_code == 429 or status == "RESOURCE_EXHAUSTED":
        code = "quota_exceeded" if quota_id and "PerDay" in quota_id else "rate_limited"
    elif status_code == 400 and _mentions_context(msg):
        code = "context_too_long"
    elif status_code == 504 or status == "DEADLINE_EXCEEDED":
        code = "timeout"
    elif status_code >= 500:
        code = "provider_unavailable"
    else:
        code = "unmapped"
    return GatewayError(
        code, signal=signal, sdk_exception=name, retry_after=retry, http_status=status_code, message=msg
    )


# ---------------------------------------------------------------- adapters


class Adapter:
    provider = ""
    api = ""
    version = ADAPTER_VERSION

    async def generate(self, req: ModelRequest) -> ModelResult:
        raise NotImplementedError

    async def stream_text(self, req: ModelRequest, *, include_usage: bool = True) -> StreamResult:
        raise NotImplementedError

    async def list_models(self) -> list[str]:
        raise NotImplementedError

    async def aclose(self) -> None:
        return None

    def _fail(self, exc: BaseException) -> GatewayError:
        return map_exception(self.provider, exc)

    @staticmethod
    def _parsed(build: Any, resp: Any, req: ModelRequest, latency: float) -> ModelResult:
        """Normalise a response; one that cannot be read becomes ``invalid_response`` (PRD AGENT-PROVIDER-001)."""
        try:
            return build(resp, req, latency)  # type: ignore[no-any-return]
        except GatewayError:
            raise
        except Exception as exc:
            name = type(exc).__name__
            raise GatewayError(
                "invalid_response", signal=f"phản hồi không đọc được ({name})", sdk_exception=name, message=str(exc)
            ) from exc


def _structured_from(text: str, calls: list[ToolCall], req: ModelRequest) -> tuple[Any, str | None, list[ToolCall]]:
    if req.output_schema is None:
        return None, None, calls
    if req.output_mode == "tool":
        out = [c for c in calls if c.name == req.output_name]
        rest = [c for c in calls if c.name != req.output_name]
        if not out:
            return None, "model không gọi tool đầu ra", rest
        args = out[0].arguments
        return (args, None, rest) if isinstance(args, dict) else (None, "tham số tool đầu ra không phải JSON", rest)
    if calls:
        return None, None, calls
    data, error = _parse_json(text)
    return data, error, calls


class AnthropicAdapter(Adapter):
    provider = "anthropic"
    api = "messages"

    def __init__(self, key: str, *, base_url: str | None, timeout: float, headers: dict[str, str] | None) -> None:
        import anthropic

        self.client = anthropic.AsyncAnthropic(
            api_key=key, base_url=base_url, timeout=timeout, max_retries=0, default_headers=headers or None
        )

    def _messages(self, req: ModelRequest) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for m in req.messages:
            if m.role == "user":
                out.append({"role": "user", "content": m.text})
            elif m.role == "assistant":
                blocks = m.provider_parts or (
                    ([{"type": "text", "text": m.text}] if m.text else [])
                    + [{"type": "tool_use", "id": c.id, "name": c.name, "input": c.arguments} for c in m.tool_calls]
                )
                out.append({"role": "assistant", "content": blocks})
            else:
                block = {"type": "tool_result", "tool_use_id": m.tool_call_id, "content": m.text}
                last = out[-1] if out else None
                if last and last["role"] == "user" and isinstance(last["content"], list):
                    last["content"].append(block)
                else:
                    out.append({"role": "user", "content": [block]})
        return out

    def _kwargs(self, req: ModelRequest) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "model": req.model,
            "max_tokens": req.max_output_tokens,
            "messages": self._messages(req),
        }
        if req.system:
            kwargs["system"] = req.system
        tools = [{"name": t.name, "description": t.description, "input_schema": t.parameters} for t in req.tools]
        if req.output_schema is not None and req.output_mode == "native":
            kwargs["output_config"] = {"format": {"type": "json_schema", "schema": req.output_schema}}
        elif req.output_schema is not None:
            tools.append(
                {"name": req.output_name, "description": "Return the final answer.", "input_schema": req.output_schema}
            )
        if tools:
            kwargs["tools"] = tools
            if req.output_mode == "tool" and req.output_schema is not None and not req.tools:
                kwargs["tool_choice"] = {"type": "tool", "name": req.output_name}
            elif req.tool_choice == "required":
                kwargs["tool_choice"] = {"type": "any"}
        return kwargs

    @staticmethod
    def _usage(u: Any, calls: int = 1) -> Usage:
        if u is None:
            return Usage(None, None, calls)
        raw = u.model_dump(exclude_none=True)
        extra = {
            k: raw[k] for k in ("cache_read_input_tokens", "cache_creation_input_tokens") if raw.get(k) is not None
        }
        return Usage(u.input_tokens, u.output_tokens, calls, extra, raw)

    async def generate(self, req: ModelRequest) -> ModelResult:
        start = time.perf_counter()
        try:
            resp = await self.client.messages.create(**self._kwargs(req))
        except Exception as exc:
            raise self._fail(exc) from exc
        return self._parsed(self._result, resp, req, time.perf_counter() - start)

    def _result(self, resp: Any, req: ModelRequest, latency: float) -> ModelResult:
        text = "".join(b.text for b in resp.content if b.type == "text")
        calls = [ToolCall(b.id, b.name, b.input) for b in resp.content if b.type == "tool_use"]
        structured, error, rest = _structured_from(text, calls, req)
        raw_stop = str(resp.stop_reason)
        stop = {"end_turn": "end_turn", "tool_use": "tool_use", "max_tokens": "max_tokens", "refusal": "refusal"}
        assistant = Msg(
            "assistant",
            text=text,
            tool_calls=calls,
            provider_parts=[b.model_dump(exclude_none=True) for b in resp.content],
        )
        return ModelResult(
            text=text,
            tool_calls=rest,
            structured=structured,
            structured_error=error,
            stop_reason=stop.get(raw_stop, f"other:{raw_stop}"),
            raw_stop_reason=raw_stop,
            refusal=raw_stop == "refusal",
            usage=self._usage(getattr(resp, "usage", None)),
            latency_s=latency,
            assistant=assistant,
        )

    async def stream_text(self, req: ModelRequest, *, include_usage: bool = True) -> StreamResult:
        start = time.perf_counter()
        first: float | None = None
        text, chunks, events = "", 0, {}
        usage_in: Any = None
        usage_out: Any = None
        try:
            stream = await self.client.messages.create(**self._kwargs(req), stream=True)
            async for ev in stream:
                events[ev.type] = events.get(ev.type, 0) + 1
                if ev.type == "message_start":
                    usage_in = ev.message.usage
                elif ev.type == "content_block_delta" and getattr(ev.delta, "type", "") == "text_delta":
                    first = first or time.perf_counter()
                    chunks += 1
                    text += ev.delta.text
                elif ev.type == "message_delta":
                    usage_out = ev.usage
        except Exception as exc:
            raise self._fail(exc) from exc
        raw = {
            "message_start.usage": usage_in.model_dump(exclude_none=True) if usage_in else None,
            "message_delta.usage": usage_out.model_dump(exclude_none=True) if usage_out else None,
        }
        usage = Usage(
            getattr(usage_in, "input_tokens", None),
            getattr(usage_out, "output_tokens", None),
            1,
            {},
            raw,
        )
        return StreamResult(
            text, chunks, (first - start) if first else None, time.perf_counter() - start, usage, events
        )

    async def list_models(self) -> list[str]:
        try:
            return [m.id async for m in self.client.models.list(limit=100)]
        except Exception as exc:
            raise self._fail(exc) from exc

    async def aclose(self) -> None:
        await self.client.close()


class OpenAIChatAdapter(Adapter):
    provider = "openai"
    api = "chat.completions"

    def __init__(self, key: str, *, base_url: str | None, timeout: float, headers: dict[str, str] | None) -> None:
        import openai

        self.client = openai.AsyncOpenAI(
            api_key=key, base_url=base_url, timeout=timeout, max_retries=0, default_headers=headers or None
        )

    def _messages(self, req: ModelRequest) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = [{"role": "system", "content": req.system}] if req.system else []
        for m in req.messages:
            if m.role == "user":
                out.append({"role": "user", "content": m.text})
            elif m.role == "assistant":
                msg: dict[str, Any] = {"role": "assistant", "content": m.text or None}
                if m.tool_calls:
                    msg["tool_calls"] = [
                        {
                            "id": c.id,
                            "type": "function",
                            "function": {
                                "name": c.name,
                                "arguments": c.arguments if isinstance(c.arguments, str) else json.dumps(c.arguments),
                            },
                        }
                        for c in m.tool_calls
                    ]
                out.append(msg)
            else:
                out.append({"role": "tool", "tool_call_id": m.tool_call_id, "content": m.text})
        return out

    def _kwargs(self, req: ModelRequest) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "model": req.model,
            "messages": self._messages(req),
            "max_completion_tokens": req.max_output_tokens,
        }
        tools = [
            {
                "type": "function",
                "function": {"name": t.name, "description": t.description, "parameters": t.parameters, "strict": True},
            }
            for t in req.tools
        ]
        if req.output_schema is not None and req.output_mode == "native":
            kwargs["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": req.output_name, "schema": req.output_schema, "strict": True},
            }
        elif req.output_schema is not None:
            tools.append(
                {
                    "type": "function",
                    "function": {
                        "name": req.output_name,
                        "description": "Return the final answer.",
                        "parameters": req.output_schema,
                        "strict": True,
                    },
                }
            )
        if tools:
            kwargs["tools"] = tools
            if req.output_mode == "tool" and req.output_schema is not None and not req.tools:
                kwargs["tool_choice"] = {"type": "function", "function": {"name": req.output_name}}
            elif req.tool_choice == "required":
                kwargs["tool_choice"] = "required"
        return kwargs

    @staticmethod
    def _usage(u: Any) -> Usage:
        if u is None:
            return Usage(None, None)
        raw = u.model_dump(exclude_none=True)
        extra: dict[str, Any] = {}
        cached = getattr(getattr(u, "prompt_tokens_details", None), "cached_tokens", None)
        reasoning = getattr(getattr(u, "completion_tokens_details", None), "reasoning_tokens", None)
        if cached is not None:
            extra["cached_tokens"] = cached
        if reasoning is not None:
            extra["reasoning_tokens"] = reasoning
        return Usage(u.prompt_tokens, u.completion_tokens, 1, extra, raw)

    async def generate(self, req: ModelRequest) -> ModelResult:
        start = time.perf_counter()
        try:
            resp = await self.client.chat.completions.create(**self._kwargs(req))
        except Exception as exc:
            raise self._fail(exc) from exc
        return self._parsed(self._result, resp, req, time.perf_counter() - start)

    def _result(self, resp: Any, req: ModelRequest, latency: float) -> ModelResult:
        if not resp.choices:
            raise GatewayError("invalid_response", signal="HTTP 200 không có choices", sdk_exception="-")
        choice = resp.choices[0]
        msg = choice.message
        text = msg.content or ""
        calls = [ToolCall(tc.id, tc.function.name, _args(tc.function.arguments)) for tc in msg.tool_calls or []]
        structured, error, rest = _structured_from(text, calls, req)
        raw_stop = str(choice.finish_reason)
        refusal = bool(getattr(msg, "refusal", None)) or raw_stop == "content_filter"
        stop = {"stop": "end_turn", "tool_calls": "tool_use", "length": "max_tokens", "content_filter": "refusal"}
        return ModelResult(
            text=text,
            tool_calls=rest,
            structured=structured,
            structured_error=error,
            stop_reason="refusal" if refusal else stop.get(raw_stop, f"other:{raw_stop}"),
            raw_stop_reason=raw_stop,
            refusal=refusal,
            usage=self._usage(resp.usage),
            latency_s=latency,
            assistant=Msg("assistant", text=text, tool_calls=calls),
        )

    async def stream_text(self, req: ModelRequest, *, include_usage: bool = True) -> StreamResult:
        start = time.perf_counter()
        first: float | None = None
        text, chunks, events = "", 0, {"chunk": 0, "chunk_with_usage": 0}
        usage = Usage(None, None)
        kwargs = self._kwargs(req)
        if include_usage:
            kwargs["stream_options"] = {"include_usage": True}
        try:
            stream = await self.client.chat.completions.create(**kwargs, stream=True)
            async for chunk in stream:
                events["chunk"] += 1
                if chunk.usage is not None:
                    events["chunk_with_usage"] += 1
                    usage = self._usage(chunk.usage)
                for choice in chunk.choices:
                    if choice.delta and choice.delta.content:
                        first = first or time.perf_counter()
                        chunks += 1
                        text += choice.delta.content
        except Exception as exc:
            raise self._fail(exc) from exc
        return StreamResult(
            text, chunks, (first - start) if first else None, time.perf_counter() - start, usage, events
        )

    async def list_models(self) -> list[str]:
        try:
            return [m.id async for m in self.client.models.list()]
        except Exception as exc:
            raise self._fail(exc) from exc

    async def aclose(self) -> None:
        await self.client.close()


class OpenAIResponsesAdapter(OpenAIChatAdapter):
    api = "responses"

    def _input(self, req: ModelRequest) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for m in req.messages:
            if m.role == "user":
                items.append({"role": "user", "content": m.text})
            elif m.role == "assistant":
                if m.text:
                    items.append({"role": "assistant", "content": m.text})
                for c in m.tool_calls:
                    arguments = c.arguments if isinstance(c.arguments, str) else json.dumps(c.arguments)
                    items.append({"type": "function_call", "call_id": c.id, "name": c.name, "arguments": arguments})
            else:
                items.append({"type": "function_call_output", "call_id": m.tool_call_id, "output": m.text})
        return items

    def _rkwargs(self, req: ModelRequest) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "model": req.model,
            "input": self._input(req),
            "max_output_tokens": max(req.max_output_tokens, 16),
            "store": False,
        }
        if req.system:
            kwargs["instructions"] = req.system
        tools = [
            {
                "type": "function",
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters,
                "strict": True,
            }
            for t in req.tools
        ]
        if req.output_schema is not None and req.output_mode == "native":
            kwargs["text"] = {
                "format": {"type": "json_schema", "name": req.output_name, "schema": req.output_schema, "strict": True}
            }
        elif req.output_schema is not None:
            tools.append(
                {
                    "type": "function",
                    "name": req.output_name,
                    "description": "Return the final answer.",
                    "parameters": req.output_schema,
                    "strict": True,
                }
            )
        if tools:
            kwargs["tools"] = tools
            if req.output_mode == "tool" and req.output_schema is not None and not req.tools:
                kwargs["tool_choice"] = {"type": "function", "name": req.output_name}
            elif req.tool_choice == "required":
                kwargs["tool_choice"] = "required"
        return kwargs

    @staticmethod
    def _rusage(u: Any) -> Usage:
        if u is None:
            return Usage(None, None)
        raw = u.model_dump(exclude_none=True)
        extra: dict[str, Any] = {}
        cached = getattr(getattr(u, "input_tokens_details", None), "cached_tokens", None)
        reasoning = getattr(getattr(u, "output_tokens_details", None), "reasoning_tokens", None)
        if cached is not None:
            extra["cached_tokens"] = cached
        if reasoning is not None:
            extra["reasoning_tokens"] = reasoning
        return Usage(u.input_tokens, u.output_tokens, 1, extra, raw)

    async def generate(self, req: ModelRequest) -> ModelResult:
        start = time.perf_counter()
        try:
            resp = await self.client.responses.create(**self._rkwargs(req))
        except Exception as exc:
            raise self._fail(exc) from exc
        return self._parsed(self._result, resp, req, time.perf_counter() - start)

    def _result(self, resp: Any, req: ModelRequest, latency: float) -> ModelResult:
        text, calls, refusal = "", [], False
        for item in resp.output or []:
            if item.type == "message":
                for part in item.content or []:
                    if part.type == "output_text":
                        text += part.text
                    elif part.type == "refusal":
                        refusal = True
            elif item.type == "function_call":
                calls.append(ToolCall(item.call_id, item.name, _args(item.arguments)))
        structured, error, rest = _structured_from(text, calls, req)
        incomplete = getattr(getattr(resp, "incomplete_details", None), "reason", None)
        raw_stop = f"{resp.status}" + (f"/{incomplete}" if incomplete else "")
        if refusal:
            stop = "refusal"
        elif incomplete == "max_output_tokens":
            stop = "max_tokens"
        elif calls:
            stop = "tool_use"
        elif resp.status == "completed":
            stop = "end_turn"
        else:
            stop = f"other:{raw_stop}"
        return ModelResult(
            text=text,
            tool_calls=rest,
            structured=structured,
            structured_error=error,
            stop_reason=stop,
            raw_stop_reason=raw_stop,
            refusal=refusal,
            usage=self._rusage(resp.usage),
            latency_s=latency,
            assistant=Msg("assistant", text=text, tool_calls=calls),
        )

    async def stream_text(self, req: ModelRequest, *, include_usage: bool = True) -> StreamResult:
        start = time.perf_counter()
        first: float | None = None
        text, chunks, events = "", 0, {}
        usage = Usage(None, None)
        try:
            stream = await self.client.responses.create(**self._rkwargs(req), stream=True)
            async for ev in stream:
                events[ev.type] = events.get(ev.type, 0) + 1
                if ev.type == "response.output_text.delta":
                    first = first or time.perf_counter()
                    chunks += 1
                    text += ev.delta
                elif ev.type in ("response.completed", "response.incomplete"):
                    usage = self._rusage(ev.response.usage)
        except Exception as exc:
            raise self._fail(exc) from exc
        return StreamResult(
            text, chunks, (first - start) if first else None, time.perf_counter() - start, usage, events
        )


GOOGLE_REFUSAL = {"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"}


class GoogleAdapter(Adapter):
    provider = "google"
    api = "generateContent"

    def __init__(self, key: str, *, base_url: str | None, timeout: float, headers: dict[str, str] | None) -> None:
        from google import genai
        from google.genai import types

        self.types = types
        options = types.HttpOptions(base_url=base_url, timeout=int(timeout * 1000), headers=headers or None)
        self.client = genai.Client(api_key=key, http_options=options)

    def _contents(self, req: ModelRequest) -> list[Any]:
        t = self.types
        out: list[Any] = []
        for m in req.messages:
            if m.role == "user":
                out.append(t.Content(role="user", parts=[t.Part(text=m.text)]))
            elif m.role == "assistant":
                if m.provider_parts is not None:
                    out.append(m.provider_parts)
                    continue
                parts = [t.Part(text=m.text)] if m.text else []
                parts += [
                    t.Part(function_call=t.FunctionCall(id=c.id, name=c.name, args=c.arguments)) for c in m.tool_calls
                ]
                out.append(t.Content(role="model", parts=parts))
            else:
                result, _ = _parse_json(m.text)
                response = result if isinstance(result, dict) else {"result": m.text}
                part = t.Part(
                    function_response=t.FunctionResponse(id=m.tool_call_id, name=m.tool_name, response=response)
                )
                last = out[-1] if out else None
                if last is not None and last.role == "user" and last.parts and last.parts[0].function_response:
                    last.parts.append(part)
                else:
                    out.append(t.Content(role="user", parts=[part]))
        return out

    def _config(self, req: ModelRequest) -> Any:
        t = self.types
        declarations = [
            t.FunctionDeclaration(name=s.name, description=s.description, parameters_json_schema=s.parameters)
            for s in req.tools
        ]
        config: dict[str, Any] = {
            "max_output_tokens": req.max_output_tokens,
            "automatic_function_calling": t.AutomaticFunctionCallingConfig(disable=True),
        }
        if req.system:
            config["system_instruction"] = req.system
        if req.output_schema is not None and req.output_mode == "native":
            config["response_mime_type"] = "application/json"
            config["response_json_schema"] = req.output_schema
        elif req.output_schema is not None:
            declarations.append(
                t.FunctionDeclaration(
                    name=req.output_name,
                    description="Return the final answer.",
                    parameters_json_schema=req.output_schema,
                )
            )
        if declarations:
            config["tools"] = [t.Tool(function_declarations=declarations)]
            if req.output_mode == "tool" and req.output_schema is not None and not req.tools:
                config["tool_config"] = t.ToolConfig(
                    function_calling_config=t.FunctionCallingConfig(
                        mode="ANY", allowed_function_names=[req.output_name]
                    )
                )
            elif req.tool_choice == "required":
                config["tool_config"] = t.ToolConfig(function_calling_config=t.FunctionCallingConfig(mode="ANY"))
        return t.GenerateContentConfig(**config)

    @staticmethod
    def _usage(u: Any) -> Usage:
        if u is None:
            return Usage(None, None)
        raw = u.model_dump(exclude_none=True, mode="json")
        extra = {
            k: raw[k]
            for k in ("thoughts_token_count", "cached_content_token_count", "tool_use_prompt_token_count")
            if raw.get(k) is not None
        }
        if u.prompt_token_count is None and u.candidates_token_count is None:
            return Usage(None, None, 1, extra, raw)
        return Usage(u.prompt_token_count, u.candidates_token_count or 0, 1, extra, raw)

    async def generate(self, req: ModelRequest) -> ModelResult:
        start = time.perf_counter()
        try:
            resp = await self.client.aio.models.generate_content(
                model=req.model, contents=self._contents(req), config=self._config(req)
            )
        except Exception as exc:
            raise self._fail(exc) from exc
        return self._parsed(self._result, resp, req, time.perf_counter() - start)

    def _result(self, resp: Any, req: ModelRequest, latency: float) -> ModelResult:
        candidate = resp.candidates[0] if resp.candidates else None
        block = getattr(getattr(resp, "prompt_feedback", None), "block_reason", None)
        parts = list(candidate.content.parts or []) if candidate and candidate.content else []
        text = "".join(p.text for p in parts if p.text and not p.thought)
        calls = [
            ToolCall(p.function_call.id or f"call_{i}", p.function_call.name or "", dict(p.function_call.args or {}))
            for i, p in enumerate(parts)
            if p.function_call
        ]
        structured, error, rest = _structured_from(text, calls, req)
        finish = str(getattr(candidate, "finish_reason", None) or "").split(".")[-1] if candidate else ""
        raw_stop = finish or (f"blocked:{block}" if block else "no_candidate")
        refusal = finish in GOOGLE_REFUSAL or block is not None or candidate is None
        if refusal:
            stop = "refusal"
        elif calls:
            stop = "tool_use"
        elif finish == "STOP":
            stop = "end_turn"
        elif finish == "MAX_TOKENS":
            stop = "max_tokens"
        else:
            stop = f"other:{raw_stop}"
        assistant = Msg(
            "assistant", text=text, tool_calls=calls, provider_parts=candidate.content if candidate else None
        )
        return ModelResult(
            text=text,
            tool_calls=rest,
            structured=structured,
            structured_error=error,
            stop_reason=stop,
            raw_stop_reason=raw_stop,
            refusal=refusal,
            usage=self._usage(resp.usage_metadata),
            latency_s=latency,
            assistant=assistant,
        )

    async def stream_text(self, req: ModelRequest, *, include_usage: bool = True) -> StreamResult:
        start = time.perf_counter()
        first: float | None = None
        text, chunks, events = "", 0, {"chunk": 0, "chunk_with_usage": 0}
        usage = Usage(None, None)
        try:
            stream = await self.client.aio.models.generate_content_stream(
                model=req.model, contents=self._contents(req), config=self._config(req)
            )
            async for chunk in stream:
                events["chunk"] += 1
                if chunk.usage_metadata is not None:
                    events["chunk_with_usage"] += 1
                    usage = self._usage(chunk.usage_metadata)
                piece = "".join(
                    p.text
                    for c in chunk.candidates or []
                    if c.content
                    for p in c.content.parts or []
                    if p.text and not p.thought
                )
                if piece:
                    first = first or time.perf_counter()
                    chunks += 1
                    text += piece
        except Exception as exc:
            raise self._fail(exc) from exc
        return StreamResult(
            text, chunks, (first - start) if first else None, time.perf_counter() - start, usage, events
        )

    async def list_models(self) -> list[str]:
        try:
            pager = await self.client.aio.models.list(config={"page_size": 100})
            return [m.name async for m in pager if "generateContent" in (m.supported_actions or [])]
        except Exception as exc:
            raise self._fail(exc) from exc

    async def aclose(self) -> None:
        await self.client.aio.aclose()


ADAPTERS: dict[str, type[Adapter]] = {
    "anthropic": AnthropicAdapter,
    "openai": OpenAIChatAdapter,
    "openai-responses": OpenAIResponsesAdapter,
    "google": GoogleAdapter,
}


def make_adapter(
    variant: str,
    key: str,
    *,
    base_url: str | None = None,
    timeout: float = 60.0,
    headers: dict[str, str] | None = None,
) -> Adapter:
    return ADAPTERS[variant](key, base_url=base_url, timeout=timeout, headers=headers)  # type: ignore[call-arg]
