# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Outbox, relay, inbox, replica upsert, idempotency and audit-emit (architecture 6.4, 5.8; ADR-19, ADR-23).

- Writes: the event (or Audit Event) is inserted into `app.outbox` in the caller's transaction, so a rollback
  leaves no row. `aggregate {type, id, version}` is required (DBQ-04, H3).
- Relay: publishes unpublished rows with publisher confirms, then sets `published_at`; at least once, message id =
  outbox id. Rows not marked (crash, broker error) are published again on the next run.
- Consumer: aio-pika with manual ack; dedup by (`consumer`, `event_id`) in `app.inbox`, in the same transaction as
  the handler. Inbox does not compare versions; `upsert_replica` drops stale versions (H3).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import UUID

import aio_pika
import structlog
from aio_pika.abc import (
    AbstractChannel,
    AbstractConnection,
    AbstractExchange,
    AbstractIncomingMessage,
)
from aio_pika.exceptions import AMQPError, ChannelInvalidStateError, DeliveryError, PublishError
from opentelemetry.trace import SpanKind
from pydantic import ValidationError

from sires_common.errors import FieldErrorCode, ProblemError, validation_failed
from sires_common.schemas import ActorRef, Aggregate, EventEnvelope, ServiceName
from sires_common.telemetry import (
    context_from_headers,
    current_trace_id,
    current_traceparent,
    get_tracer,
    redact_text,
)
from sires_common.tenancy import Connection, Pool, system_transaction, uuid7

EVENTS_EXCHANGE = "sires.events"
AUDIT_RECORDED = "audit.recorded"

_log = structlog.get_logger("sires_common.messaging")


class MissingAggregateError(ValueError):
    """Outbox write without a valid `aggregate {type, id, version}` (EC04). Nothing is written."""


class InvalidActorError(ValueError):
    """Audit actor does not satisfy CTX-AUDIT-001 (`app.is_actor_ref`)."""


class InvalidEnvelopeError(ValueError):
    """Incoming message is not an EventEnvelope."""


def routing_key_for(event_type: str, data: Mapping[str, Any]) -> str:
    """Routing key per events/asyncapi.yaml: the event `type`, plus the target state for state-change events
    (`toState` of StateChange, or `change`), lower-cased with spaces as `_`,
    e.g. `workflow.status_changed.waiting_for_user`.
    """
    target = data.get("toState")
    if not isinstance(target, str):
        target = data.get("change")
    if isinstance(target, str) and target:
        return f"{event_type}.{target.lower().replace(' ', '_')}"
    return event_type


def _require_aggregate(aggregate: Aggregate | Mapping[str, Any] | None) -> Aggregate:
    if aggregate is None:
        raise MissingAggregateError("aggregate {type, id, version} là bắt buộc (EventEnvelope, DBQ-04)")
    if isinstance(aggregate, Aggregate):
        return aggregate
    try:
        return Aggregate.model_validate(aggregate)
    except ValidationError as exc:
        raise MissingAggregateError(f"aggregate không hợp lệ: {exc.errors(include_url=False)}") from exc


_INSERT_OUTBOX = """
INSERT INTO app.outbox (id, account_id, kind, routing_key, aggregate_type, aggregate_id, aggregate_version,
                        payload, traceparent)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text::jsonb, $9)
"""


class Outbox:
    """Writes events and Audit Events of one producer service into `app.outbox`."""

    def __init__(self, producer: ServiceName) -> None:
        self.producer: ServiceName = producer

    async def emit_event(
        self,
        conn: Connection,
        *,
        event_type: str,
        aggregate: Aggregate | Mapping[str, Any] | None,
        account_id: UUID,
        data: Mapping[str, Any],
        project_id: UUID | None = None,
        actor: ActorRef | None = None,
        schema_version: int = 1,
    ) -> EventEnvelope:
        """Insert one domain event in the current transaction and return its envelope."""
        agg = _require_aggregate(aggregate)
        envelope = self._envelope(event_type, agg, account_id, dict(data), project_id, actor, schema_version)
        await self._insert(conn, "event", routing_key_for(event_type, data), envelope)
        return envelope

    async def emit_audit(
        self,
        conn: Connection,
        *,
        account_id: UUID,
        actor: ActorRef,
        action: str,
        object_type: str,
        object_id: UUID,
        object_version: int | None = None,
        from_state: str | None = None,
        to_state: str | None = None,
        apr: str | None = None,
        summary: str | None = None,
        project_id: UUID | None = None,
    ) -> EventEnvelope:
        """Insert one Audit Event (`audit.recorded`) in the current transaction (ADR-23, CTX-AUDIT-001).

        `aggregate` is the Audit Event itself (`audit_event`, id, version 1) as the contract requires; the audited
        object is `data.objectType` / `data.objectId`. Key-like strings in `summary` are redacted.
        """
        if not actor.is_complete():
            raise InvalidActorError(
                "actor phải có accountId (researcher), agent + agentRunId (agent) hoặc component (system)"
            )
        audit_id = uuid7()
        audit: dict[str, Any] = {
            "id": str(audit_id),
            "accountId": str(account_id),
            "projectId": str(project_id) if project_id else None,
            "actor": actor.as_json(),
            "action": action,
            "objectType": object_type,
            "objectId": str(object_id),
            "objectVersion": object_version,
            "fromState": from_state,
            "toState": to_state,
            "apr": apr,
            "summary": redact_text(summary) if summary is not None else None,
            "correlationId": current_trace_id(),
            "at": datetime.now(UTC).isoformat(),
        }
        data = {k: v for k, v in audit.items() if v is not None}
        agg = Aggregate(type="audit_event", id=audit_id, version=1)
        envelope = self._envelope(AUDIT_RECORDED, agg, account_id, data, project_id, actor, 1, event_id=audit_id)
        await self._insert(conn, "audit", AUDIT_RECORDED, envelope)
        return envelope

    def _envelope(
        self,
        event_type: str,
        aggregate: Aggregate,
        account_id: UUID,
        data: dict[str, Any],
        project_id: UUID | None,
        actor: ActorRef | None,
        schema_version: int,
        *,
        event_id: UUID | None = None,
    ) -> EventEnvelope:
        return EventEnvelope(
            id=event_id or uuid7(),
            type=event_type,
            schemaVersion=schema_version,
            producer=self.producer,
            occurredAt=datetime.now(UTC),
            accountId=account_id,
            projectId=project_id,
            actor=actor,
            aggregate=aggregate,
            traceparent=current_traceparent(),
            data=data,
        )

    async def _insert(self, conn: Connection, kind: str, routing_key: str, envelope: EventEnvelope) -> None:
        await conn.execute(
            _INSERT_OUTBOX,
            envelope.id,
            envelope.accountId,
            kind,
            routing_key,
            envelope.aggregate.type,
            envelope.aggregate.id,
            envelope.aggregate.version,
            json.dumps(envelope.as_json(), ensure_ascii=False),
            envelope.traceparent,
        )


# ---------- Leader lease (app.job_lock) ----------


async def acquire_lease(conn: Connection, name: str, owner: str, ttl_seconds: float) -> bool:
    """Take or renew the lease `name` for `owner`; False when another owner holds an unexpired lease."""
    row = await conn.fetchrow(
        """
        INSERT INTO app.job_lock (name, owner, lease_until)
        VALUES ($1, $2, now() + make_interval(secs => $3))
        ON CONFLICT (name) DO UPDATE SET owner = EXCLUDED.owner, lease_until = EXCLUDED.lease_until
        WHERE app.job_lock.lease_until < now() OR app.job_lock.owner = EXCLUDED.owner
        RETURNING owner
        """,
        name,
        owner,
        float(ttl_seconds),
    )
    return row is not None


# ---------- Relay ----------


class OutboxRelay:
    """Publishes `app.outbox` rows to RabbitMQ (role `_system`). Events and audit go to `sires.events`, commands to
    the queue named by their routing key (default exchange)."""

    def __init__(
        self,
        pool: Pool,
        connection: AbstractConnection,
        *,
        owner: str,
        lease_name: str = "outbox_relay",
        lease_seconds: float = 30.0,
        batch_size: int = 100,
    ) -> None:
        self._pool = pool
        self._connection = connection
        self._owner = owner
        self._lease_name = lease_name
        self._lease_seconds = lease_seconds
        self._batch_size = batch_size
        self._channel: AbstractChannel | None = None
        self._exchange: AbstractExchange | None = None

    async def _ensure_channel(self) -> tuple[AbstractChannel, AbstractExchange]:
        if self._channel is None or self._channel.is_closed or self._exchange is None:
            self._channel = await self._connection.channel(publisher_confirms=True, on_return_raises=True)
            self._exchange = await self._channel.declare_exchange(
                EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
            )
        return self._channel, self._exchange

    async def _publish(self, row: Mapping[str, Any]) -> None:
        channel, exchange = await self._ensure_channel()
        message_id = str(row["id"])
        headers: dict[str, Any] = {"message_id": message_id}
        if row["traceparent"]:
            headers["traceparent"] = row["traceparent"]
        message = aio_pika.Message(
            body=str(row["payload"]).encode(),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            message_id=message_id,
            headers=headers,
        )
        if row["kind"] == "command":
            # A command must reach its queue: an unroutable command stays unpublished and is retried.
            await channel.default_exchange.publish(message, routing_key=row["routing_key"], mandatory=True)
        else:
            await exchange.publish(message, routing_key=row["routing_key"], mandatory=False)

    async def run_once(self) -> int:
        """Publish one batch in order of creation; return how many rows were confirmed and marked."""
        published: list[UUID] = []
        async with system_transaction(self._pool) as conn:
            rows = await conn.fetch(
                """
                SELECT id, kind, routing_key, payload::text AS payload, traceparent
                FROM app.outbox WHERE published_at IS NULL
                ORDER BY created_at, id LIMIT $1 FOR UPDATE SKIP LOCKED
                """,
                self._batch_size,
            )
            for row in rows:
                try:
                    await self._publish(row)
                except PublishError:
                    # Returned by the broker (command without its queue): keep the row for the next run, go on.
                    _log.warning("outbox_message_returned", outbox_id=str(row["id"]), routing_key=row["routing_key"])
                    continue
                except (AMQPError, DeliveryError, ConnectionError, ChannelInvalidStateError) as exc:
                    # Broker or connection failure: stop the batch; unmarked rows are published on the next run.
                    _log.warning("outbox_publish_failed", error=type(exc).__name__, published=len(published))
                    self._channel = None
                    break
                published.append(row["id"])
            if published:
                await conn.execute(
                    "UPDATE app.outbox SET published_at = now() WHERE id = ANY($1::uuid[])", published
                )
        return len(published)

    async def run(self, stop: asyncio.Event, *, idle_seconds: float = 1.0) -> None:
        """Loop until `stop` is set: hold the leader lease, publish batches, sleep when idle."""
        while not stop.is_set():
            async with system_transaction(self._pool) as conn:
                leader = await acquire_lease(conn, self._lease_name, self._owner, self._lease_seconds)
            sent = await self.run_once() if leader else 0
            if sent == 0:
                try:
                    await asyncio.wait_for(stop.wait(), timeout=idle_seconds)
                except TimeoutError:
                    pass


# ---------- Inbox and consumer ----------


class InboxOutcome(Enum):
    PROCESSED = "processed"
    DUPLICATE = "duplicate"
    IGNORED = "ignored"


EventHandler = Callable[[Connection, EventEnvelope], Awaitable[None]]


async def record_inbox(conn: Connection, consumer: str, envelope: EventEnvelope, routing_key: str) -> bool:
    """Insert (`consumer`, `event_id`) into `app.inbox`; False when the event was already processed."""
    inserted = await conn.fetchval(
        """
        INSERT INTO app.inbox (consumer, event_id, account_id, routing_key) VALUES ($1, $2, $3, $4)
        ON CONFLICT (consumer, event_id) DO NOTHING RETURNING true
        """,
        consumer,
        envelope.id,
        envelope.accountId,
        routing_key,
    )
    return bool(inserted)


def parse_envelope(body: bytes | str) -> EventEnvelope:
    try:
        return EventEnvelope.model_validate_json(body)
    except ValidationError as exc:
        raise InvalidEnvelopeError(str(exc.errors(include_url=False))) from exc


class EventConsumer:
    """Consumer of `sires.events` for one service: queue `<service>.events`, manual ack, idempotent by inbox."""

    def __init__(
        self,
        consumer: str,
        pool: Pool,
        *,
        queue_name: str | None = None,
        queue_arguments: Mapping[str, Any] | None = None,
        prefetch_count: int = 10,
    ) -> None:
        self.consumer = consumer
        self._pool = pool
        self.queue_name = queue_name or f"{consumer}.events"
        self._queue_arguments = dict(queue_arguments) if queue_arguments else None
        self._prefetch = prefetch_count
        self._handlers: dict[str, EventHandler] = {}
        self._bindings: list[str] = []

    def on(self, event_type: str, handler: EventHandler, *, routing_keys: Sequence[str] | None = None) -> None:
        """Handle `event_type`; binds `<event_type>.#` (the type with or without a target-state suffix) unless
        `routing_keys` narrows it (e.g. `project.lifecycle_changed.archived`)."""
        self._handlers[event_type] = handler
        self._bindings.extend(routing_keys or [f"{event_type}.#"])

    async def handle(self, body: bytes | str, routing_key: str) -> InboxOutcome:
        """Process one delivery: parse, dedup in `app.inbox`, run the handler in the same transaction."""
        envelope = parse_envelope(body)
        handler = self._handlers.get(envelope.type)
        if handler is None:
            return InboxOutcome.IGNORED
        async with system_transaction(self._pool) as conn:
            if not await record_inbox(conn, self.consumer, envelope, routing_key):
                return InboxOutcome.DUPLICATE
            await handler(conn, envelope)
        return InboxOutcome.PROCESSED

    async def start(self, connection: AbstractConnection) -> AbstractChannel:
        """Declare queue and bindings, start consuming; returns the channel (close it to stop)."""
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=self._prefetch)
        exchange = await channel.declare_exchange(EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True)
        queue = await channel.declare_queue(self.queue_name, durable=True, arguments=self._queue_arguments)
        for key in self._bindings:
            await queue.bind(exchange, routing_key=key)
        await queue.consume(self._on_message, no_ack=False)
        return channel

    async def _on_message(self, message: AbstractIncomingMessage) -> None:
        parent = context_from_headers(message.headers)
        with get_tracer().start_as_current_span(
            f"consume {message.routing_key}", context=parent, kind=SpanKind.CONSUMER
        ):
            tokens = structlog.contextvars.bind_contextvars(
                consumer=self.consumer, event_id=message.message_id, trace_id=current_trace_id()
            )
            try:
                outcome = await self.handle(message.body, message.routing_key or "")
            except InvalidEnvelopeError:
                _log.error("event_envelope_invalid", routing_key=message.routing_key)
                await message.nack(requeue=False)
                return
            except Exception:
                _log.exception("event_handler_failed", routing_key=message.routing_key)
                await message.nack(requeue=True)
                return
            finally:
                structlog.contextvars.reset_contextvars(**tokens)
            await message.ack()
            _log.debug("event_consumed", outcome=outcome.value)


# ---------- Replica ----------


def _ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _table(name: str) -> str:
    parts = name.split(".")
    if len(parts) != 2 or not all(parts):
        raise ValueError(f"tên bảng phải có schema, ví dụ replica.project_state: {name!r}")
    return ".".join(_ident(p) for p in parts)


async def upsert_replica(
    conn: Connection,
    table: str,
    *,
    key: Mapping[str, Any],
    values: Mapping[str, Any],
    version: int,
) -> bool:
    """Insert or update a read-only copy, only when `version` > `source_version` of the stored row (H3).

    Equal or older versions (redelivery, out-of-order) change nothing. Returns True when the row was written.
    """
    if isinstance(version, bool) or not isinstance(version, int) or version < 1:
        raise ValueError("version phải là số nguyên ≥ 1 (aggregate.version)")
    if not key:
        raise ValueError("key không được rỗng")
    target = _table(table)
    columns = [*key, *values, "source_version"]
    params = [*key.values(), *values.values(), version]
    placeholders = ", ".join(f"${i}" for i in range(1, len(params) + 1))
    updates = ", ".join(f"{_ident(c)} = EXCLUDED.{_ident(c)}" for c in [*values, "source_version"])
    sql = (
        f"INSERT INTO {target} ({', '.join(_ident(c) for c in columns)}) VALUES ({placeholders}) "
        f"ON CONFLICT ({', '.join(_ident(c) for c in key)}) DO UPDATE SET {updates} "
        f"WHERE {target}.source_version < EXCLUDED.source_version RETURNING true"
    )
    return bool(await conn.fetchval(sql, *params))


async def apply_replica_event(
    conn: Connection,
    table: str,
    envelope: EventEnvelope,
    *,
    key: Mapping[str, Any],
    values: Mapping[str, Any],
) -> bool:
    """`upsert_replica` with `source_version = envelope.aggregate.version`."""
    return await upsert_replica(conn, table, key=key, values=values, version=envelope.aggregate.version)


# ---------- Idempotency-Key (DATA-IDEMP-001) ----------

IDEMPOTENCY_HEADER = "Idempotency-Key"
IDEMPOTENCY_KEY_MIN = 8
IDEMPOTENCY_KEY_MAX = 128


def require_idempotency_key(value: str | None) -> str:
    """Header check per components/parameters.yaml: missing or outside 8–128 → `400 validation_failed`."""
    if value is None or value == "":
        raise validation_failed(
            [{"field": IDEMPOTENCY_HEADER, "code": "required", "message": "Thiếu header Idempotency-Key"}]
        )
    if not IDEMPOTENCY_KEY_MIN <= len(value) <= IDEMPOTENCY_KEY_MAX:
        code: FieldErrorCode = "too_small" if len(value) < IDEMPOTENCY_KEY_MIN else "too_big"
        raise validation_failed(
            [{"field": IDEMPOTENCY_HEADER, "code": code, "message": "Idempotency-Key dài 8–128 ký tự"}]
        )
    return value


def request_hash(operation: str, body: Any) -> bytes:
    """SHA-256 of the operationId and the canonical JSON of the request body."""
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(f"{operation}\n{canonical}".encode()).digest()


@dataclass(frozen=True, slots=True)
class StoredResponse:
    status: int
    body: Any


def idempotency_key_reused() -> ProblemError:
    return ProblemError(422, "idempotency_key_reused", "Idempotency-Key đã dùng cho yêu cầu khác")


async def claim_idempotency_key(
    conn: Connection, *, account_id: UUID, key: str, operation: str, body: Any
) -> StoredResponse | None:
    """Run at the start of the command's tenant transaction.

    Returns None when this request owns the key (new, or the old row expired) — run the handler, then call
    `store_idempotent_response` before commit. Returns the stored response for a repeat of the same request.
    Raises `422 idempotency_key_reused` when the key was used with another operation or body. A concurrent request
    with the same key waits on the primary key until the first one commits or rolls back.
    """
    digest = request_hash(operation, body)
    owned = await conn.fetchval(
        """
        INSERT INTO app.idempotency_key (account_id, key, operation, request_hash) VALUES ($1, $2, $3, $4)
        ON CONFLICT (account_id, key) DO UPDATE
          SET operation = EXCLUDED.operation, request_hash = EXCLUDED.request_hash, response_status = NULL,
              response_body = NULL, created_at = now(), expires_at = now() + interval '24 hours'
          WHERE app.idempotency_key.expires_at <= now()
        RETURNING true
        """,
        account_id,
        key,
        operation,
        digest,
    )
    if owned:
        return None
    row = await conn.fetchrow(
        """
        SELECT operation, request_hash, response_status, response_body::text AS response_body
        FROM app.idempotency_key WHERE account_id = $1 AND key = $2
        """,
        account_id,
        key,
    )
    if row is None or row["operation"] != operation or bytes(row["request_hash"]) != digest:
        raise idempotency_key_reused()
    if row["response_status"] is None:
        raise RuntimeError("Idempotency-Key đã được ghi mà không có phản hồi (thiếu store_idempotent_response)")
    body_text = row["response_body"]
    return StoredResponse(int(row["response_status"]), json.loads(body_text) if body_text is not None else None)


async def store_idempotent_response(conn: Connection, *, account_id: UUID, key: str, status: int, body: Any) -> None:
    """Save the response of the request that owns the key, in the same transaction (committed with the effect)."""
    await conn.execute(
        """
        UPDATE app.idempotency_key SET response_status = $3, response_body = $4::text::jsonb
        WHERE account_id = $1 AND key = $2
        """,
        account_id,
        key,
        status,
        json.dumps(body, ensure_ascii=False, default=str) if body is not None else None,
    )
