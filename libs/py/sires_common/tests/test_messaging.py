# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S02 — outbox, relay, inbox, replica upsert, idempotency, audit-emit on real PostgreSQL and RabbitMQ.

Payloads are checked with the JSON Schemas of docs/api-design (EventEnvelope, AuditEvent), not with the TS library.
"""

from __future__ import annotations

import asyncio
import json
import secrets
from collections.abc import AsyncIterator, Mapping
from typing import Any
from uuid import UUID

import aio_pika
import asyncpg
import pytest
from aio_pika.abc import AbstractConnection, AbstractQueue
from support import INTERNAL_SCHEMAS, ORCHESTRATION_SCHEMAS, common_ddl, contract_errors

from sires_common.errors import ProblemError
from sires_common.messaging import (
    EVENTS_EXCHANGE,
    EventConsumer,
    InboxOutcome,
    MissingAggregateError,
    Outbox,
    OutboxRelay,
    StoredResponse,
    acquire_lease,
    apply_replica_event,
    claim_idempotency_key,
    parse_envelope,
    require_idempotency_key,
    routing_key_for,
    store_idempotent_response,
    upsert_replica,
)
from sires_common.schemas import ActorRef, Aggregate, EventEnvelope
from sires_common.telemetry import get_tracer
from sires_common.tenancy import Connection, create_pool, system_transaction, tenant_transaction, uuid7
from sires_common.testing.fixtures import PostgresServer, RabbitMqServer, ServiceDatabase, create_service_database

pytestmark = pytest.mark.anyio

EFFECT_TABLE = """
CREATE TABLE app.effect (
  id          uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  event_id    uuid NOT NULL,
  account_id  uuid NOT NULL
);
SELECT app.create_replica_project_state();
"""

ACCOUNT = UUID("0193a000-0000-7000-8000-00000000000a")
EXPIRE_KEY = "UPDATE app.idempotency_key SET expires_at = now() - interval '1 second' WHERE key = $1"
STATE_QUERY = "SELECT status, source_version FROM replica.project_state WHERE project_id = $1"
PROJECT = UUID("0193a000-0000-7000-8000-0000000000aa")
RESEARCHER = ActorRef(type="researcher", accountId=ACCOUNT)


@pytest.fixture
async def db(sires_postgres: PostgresServer) -> ServiceDatabase:
    return await create_service_database(sires_postgres, "knowledge", [common_ddl(), EFFECT_TABLE])


@pytest.fixture
async def app_pool(db: ServiceDatabase) -> AsyncIterator[asyncpg.Pool]:
    pool = await create_pool(db.app_dsn)
    yield pool
    await pool.close()


@pytest.fixture
async def system_pool(db: ServiceDatabase) -> AsyncIterator[asyncpg.Pool]:
    pool = await create_pool(db.system_dsn)
    yield pool
    await pool.close()


@pytest.fixture
async def amqp(sires_rabbitmq: RabbitMqServer) -> AsyncIterator[AbstractConnection]:
    connection = await aio_pika.connect(sires_rabbitmq.url)
    yield connection
    await connection.close()


def _suffix() -> str:
    return secrets.token_hex(4)


async def _emit(
    pool: asyncpg.Pool, outbox: Outbox, event_type: str, *, version: int = 1, data: Mapping[str, Any] | None = None
) -> EventEnvelope:
    async with tenant_transaction(pool, ACCOUNT) as conn:
        return await outbox.emit_event(
            conn,
            event_type=event_type,
            aggregate=Aggregate(type="reference", id=uuid7(), version=version),
            account_id=ACCOUNT,
            data=dict(data or {"note": "x"}),
        )


async def _outbox_rows(pool: asyncpg.Pool) -> list[asyncpg.Record]:
    async with system_transaction(pool) as conn:
        return await conn.fetch(
            "SELECT id, kind, routing_key, aggregate_type, aggregate_id, aggregate_version, payload::text AS payload,"
            " traceparent, published_at FROM app.outbox ORDER BY created_at, id"
        )


async def _test_queue(connection: AbstractConnection, *routing_keys: str) -> AbstractQueue:
    channel = await connection.channel()
    exchange = await channel.declare_exchange(EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True)
    queue = await channel.declare_queue(f"test.{_suffix()}", exclusive=True, auto_delete=True)
    for key in routing_keys:
        await queue.bind(exchange, routing_key=key)
    return queue


async def _drain(queue: AbstractQueue, expected: int, timeout: float = 10.0) -> list[aio_pika.abc.AbstractMessage]:
    messages: list[aio_pika.abc.AbstractMessage] = []
    deadline = asyncio.get_running_loop().time() + timeout
    while len(messages) < expected and asyncio.get_running_loop().time() < deadline:
        message = await queue.get(no_ack=True, fail=False)
        if message is None:
            await asyncio.sleep(0.05)
        else:
            messages.append(message)
    return messages


async def _count_effects(pool: asyncpg.Pool, event_id: UUID | None = None) -> int:
    async with system_transaction(pool) as conn:
        if event_id is None:
            return int(await conn.fetchval("SELECT count(*) FROM app.effect"))
        return int(await conn.fetchval("SELECT count(*) FROM app.effect WHERE event_id = $1", event_id))


async def _record_effect(conn: Connection, envelope: EventEnvelope) -> None:
    await conn.execute("INSERT INTO app.effect (event_id, account_id) VALUES ($1, $2)", envelope.id, envelope.accountId)


class RecordingConsumer(EventConsumer):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.outcomes: list[InboxOutcome] = []

    async def handle(self, body: bytes | str, routing_key: str) -> InboxOutcome:
        outcome = await super().handle(body, routing_key)
        self.outcomes.append(outcome)
        return outcome


async def _wait_for(predicate: Any, timeout: float = 10.0) -> None:
    deadline = asyncio.get_running_loop().time() + timeout
    while not predicate():
        if asyncio.get_running_loop().time() > deadline:
            raise AssertionError("timeout")
        await asyncio.sleep(0.05)


def test_routing_key_for() -> None:
    assert routing_key_for("workflow.status_changed", {"toState": "Waiting for User"}) == (
        "workflow.status_changed.waiting_for_user"
    )
    assert routing_key_for("project.lifecycle_changed", {"change": "archived"}) == "project.lifecycle_changed.archived"
    assert routing_key_for("usage.recorded", {"source": "embedding"}) == "usage.recorded"


async def test_envelope_and_rollback(
    app_pool: asyncpg.Pool, system_pool: asyncpg.Pool, amqp: AbstractConnection
) -> None:
    """PID-00005-AC03: events emitted by the library validate against EventEnvelope (aggregate required);
    a rolled-back transaction leaves no outbox row."""
    outbox = Outbox("knowledge")
    reference_id = uuid7()
    with get_tracer().start_as_current_span("command"):
        async with tenant_transaction(app_pool, ACCOUNT) as conn:
            event = await outbox.emit_event(
                conn,
                event_type="reference.indexing_status_changed",
                aggregate={"type": "reference", "id": str(reference_id), "version": 3},
                account_id=ACCOUNT,
                project_id=PROJECT,
                actor=ActorRef(type="system", component="indexer"),
                data={
                    "objectType": "reference",
                    "objectId": str(reference_id),
                    "fromState": "Indexing",
                    "toState": "Indexed",
                    "referenceId": str(reference_id),
                },
            )
            audit = await outbox.emit_audit(
                conn,
                account_id=ACCOUNT,
                project_id=PROJECT,
                actor=RESEARCHER,
                action="reference.indexed",
                object_type="reference",
                object_id=reference_id,
                object_version=3,
                from_state="Indexing",
                to_state="Indexed",
                summary="indexed with key sk-ant-api03-Zq3xV9mLp2Rt7Yw4Hk8Jd1Fs6Gb0Nc5Ue-AbCdEf",
            )

    rows = await _outbox_rows(system_pool)
    assert [r["kind"] for r in rows] == ["event", "audit"]
    event_row, audit_row = rows
    assert event_row["routing_key"] == "reference.indexing_status_changed.indexed"
    assert (event_row["aggregate_type"], event_row["aggregate_id"], event_row["aggregate_version"]) == (
        "reference",
        reference_id,
        3,
    )
    for row in rows:
        payload = json.loads(row["payload"])
        assert contract_errors(INTERNAL_SCHEMAS, "EventEnvelope", payload) == []
        assert payload["id"] == str(row["id"])
        assert payload["traceparent"] == row["traceparent"] is not None
    assert event.id == event_row["id"]

    audit_payload = json.loads(audit_row["payload"])
    assert audit_row["routing_key"] == "audit.recorded"
    assert audit_payload["aggregate"] == {"type": "audit_event", "id": str(audit.id), "version": 1}
    assert audit_payload["data"]["id"] == str(audit.id) and audit_payload["data"]["objectId"] == str(reference_id)
    assert contract_errors(ORCHESTRATION_SCHEMAS, "AuditEvent", audit_payload["data"]) == []
    assert "sk-ant-" not in audit_payload["data"]["summary"]
    assert (audit_row["aggregate_type"], audit_row["aggregate_id"], audit_row["aggregate_version"]) == (
        "audit_event",
        audit.id,
        1,
    )

    # Rollback: the event disappears with the transaction.
    rolled_back: EventEnvelope | None = None
    with pytest.raises(RuntimeError):
        async with tenant_transaction(app_pool, ACCOUNT) as conn:
            rolled_back = await outbox.emit_event(
                conn,
                event_type="reference.indexing_status_changed",
                aggregate=Aggregate(type="reference", id=reference_id, version=4),
                account_id=ACCOUNT,
                data={"objectType": "reference", "objectId": str(reference_id), "toState": "Failed"},
            )
            raise RuntimeError("change failed after the event was written")
    assert rolled_back is not None
    assert [r["id"] for r in await _outbox_rows(system_pool)] == [event_row["id"], audit_row["id"]]

    # What the relay publishes is the same envelope, with message_id and traceparent headers.
    queue = await _test_queue(amqp, "reference.indexing_status_changed.#", "audit.recorded")
    relay = OutboxRelay(system_pool, amqp, owner="test")
    assert await relay.run_once() == 2
    messages = await _drain(queue, 2)
    assert [m.message_id for m in messages] == [str(event_row["id"]), str(audit_row["id"])]
    for message in messages:
        body = json.loads(message.body)
        assert contract_errors(INTERNAL_SCHEMAS, "EventEnvelope", body) == []
        assert message.headers["message_id"] == message.message_id
        assert message.headers["traceparent"] == body["traceparent"]
        assert message.delivery_mode == aio_pika.DeliveryMode.PERSISTENT
    assert all(r["published_at"] is not None for r in await _outbox_rows(system_pool))
    assert await relay.run_once() == 0


async def test_missing_aggregate(app_pool: asyncpg.Pool, system_pool: asyncpg.Pool) -> None:
    """EC04: writing an event without aggregate fails immediately and writes nothing."""
    outbox = Outbox("knowledge")
    async with tenant_transaction(app_pool, ACCOUNT) as conn:
        with pytest.raises(MissingAggregateError):
            await outbox.emit_event(conn, event_type="x.happened", aggregate=None, account_id=ACCOUNT, data={})
        for invalid in (
            {"type": "reference", "id": str(uuid7())},
            {"type": "", "id": str(uuid7()), "version": 1},
            {"type": "reference", "id": str(uuid7()), "version": 0},
            {"type": "reference", "id": "not-a-uuid", "version": 1},
        ):
            with pytest.raises(MissingAggregateError):
                await outbox.emit_event(conn, event_type="x.happened", aggregate=invalid, account_id=ACCOUNT, data={})
        with pytest.raises(TypeError):
            await outbox.emit_event(conn, event_type="x.happened", account_id=ACCOUNT, data={})  # type: ignore[call-arg]
    assert await _outbox_rows(system_pool) == []


async def test_inbox(system_pool: asyncpg.Pool, amqp: AbstractConnection) -> None:
    """PID-00005-AC04 (dedup): the same event id delivered twice has its effect applied exactly once."""
    event_type = f"test.{_suffix()}.happened"
    consumer = RecordingConsumer(f"inbox_{_suffix()}", system_pool)
    consumer.on(event_type, _record_effect)
    envelope = EventEnvelope(
        id=uuid7(),
        type=event_type,
        schemaVersion=1,
        producer="library",
        occurredAt="2026-11-11T08:00:00Z",  # type: ignore[arg-type]
        accountId=ACCOUNT,
        aggregate=Aggregate(type="reference", id=uuid7(), version=1),
        data={},
    )
    body = json.dumps(envelope.as_json()).encode()

    # Direct calls, same transaction as the effect.
    assert await consumer.handle(body, event_type) is InboxOutcome.PROCESSED
    assert await consumer.handle(body, event_type) is InboxOutcome.DUPLICATE
    assert await _count_effects(system_pool, envelope.id) == 1

    # Through RabbitMQ: two deliveries of one new event, manual ack.
    second = envelope.model_copy(update={"id": uuid7()})
    second_body = json.dumps(second.as_json()).encode()
    channel = await consumer.start(amqp)
    publisher = await amqp.channel()
    exchange = await publisher.get_exchange(EVENTS_EXCHANGE)
    for _ in range(2):
        await exchange.publish(aio_pika.Message(second_body, message_id=str(second.id)), routing_key=event_type)
    await _wait_for(lambda: len(consumer.outcomes) >= 4)
    assert consumer.outcomes[2:] == [InboxOutcome.PROCESSED, InboxOutcome.DUPLICATE]
    assert await _count_effects(system_pool, second.id) == 1
    await channel.close()

    async with system_transaction(system_pool) as conn:
        inbox = await conn.fetch("SELECT consumer, event_id FROM app.inbox ORDER BY processed_at")
    assert [(r["consumer"], r["event_id"]) for r in inbox] == [
        (consumer.consumer, envelope.id),
        (consumer.consumer, second.id),
    ]


async def test_handler_failure_is_redelivered(system_pool: asyncpg.Pool) -> None:
    """A failing handler rolls back its inbox row, so the redelivery is processed (once)."""
    event_type = f"test.{_suffix()}.happened"
    calls = 0

    async def flaky(conn: Connection, envelope: EventEnvelope) -> None:
        nonlocal calls
        calls += 1
        await _record_effect(conn, envelope)
        if calls == 1:
            raise RuntimeError("transient")

    consumer = EventConsumer(f"flaky_{_suffix()}", system_pool)
    consumer.on(event_type, flaky)
    envelope = EventEnvelope(
        id=uuid7(),
        type=event_type,
        schemaVersion=1,
        producer="library",
        occurredAt="2026-11-11T08:00:00Z",  # type: ignore[arg-type]
        accountId=ACCOUNT,
        aggregate=Aggregate(type="reference", id=uuid7(), version=1),
        data={},
    )
    body = json.dumps(envelope.as_json())
    with pytest.raises(RuntimeError):
        await consumer.handle(body, event_type)
    assert await _count_effects(system_pool, envelope.id) == 0
    assert await consumer.handle(body, event_type) is InboxOutcome.PROCESSED
    assert await consumer.handle(body, event_type) is InboxOutcome.DUPLICATE
    assert await _count_effects(system_pool, envelope.id) == 1


async def test_invalid_envelope_is_rejected(system_pool: asyncpg.Pool) -> None:
    consumer = EventConsumer(f"bad_{_suffix()}", system_pool)
    consumer.on("x.happened", _record_effect)
    no_aggregate = {
        "id": str(uuid7()),
        "type": "x.happened",
        "schemaVersion": 1,
        "producer": "library",
        "occurredAt": "2026-11-11T08:00:00Z",
        "accountId": str(ACCOUNT),
        "data": {},
    }
    from sires_common.messaging import InvalidEnvelopeError

    with pytest.raises(InvalidEnvelopeError):
        await consumer.handle(json.dumps(no_aggregate), "x.happened")
    with pytest.raises(InvalidEnvelopeError):
        parse_envelope(b"not json")
    assert await _count_effects(system_pool) == 0


async def test_replica_upsert(system_pool: asyncpg.Pool) -> None:
    """PID-00005-AC04 (versions), EC05: with source_version = 5, versions 4 and 5 are dropped; 6 is written."""
    project_id = uuid7()
    table = "replica.project_state"
    key = {"project_id": project_id}
    async with system_transaction(system_pool) as conn:
        assert await upsert_replica(conn, table, key=key, values={"account_id": ACCOUNT, "status": "Active"}, version=5)
        assert not await upsert_replica(
            conn, table, key=key, values={"account_id": ACCOUNT, "status": "Archived"}, version=4
        )
        assert not await upsert_replica(
            conn, table, key=key, values={"account_id": ACCOUNT, "status": "Archived"}, version=5
        )
        row = await conn.fetchrow(STATE_QUERY, project_id)
        assert (row["status"], row["source_version"]) == ("Active", 5)

        newer = EventEnvelope(
            id=uuid7(),
            type="project.lifecycle_changed",
            schemaVersion=1,
            producer="workspace",
            occurredAt="2026-11-11T08:00:00Z",  # type: ignore[arg-type]
            accountId=ACCOUNT,
            aggregate=Aggregate(type="project", id=project_id, version=6),
            data={"change": "archived"},
        )
        assert await apply_replica_event(
            conn, table, newer, key=key, values={"account_id": ACCOUNT, "status": "Archived"}
        )
        row = await conn.fetchrow(STATE_QUERY, project_id)
        assert (row["status"], row["source_version"]) == ("Archived", 6)

        with pytest.raises(ValueError):
            await upsert_replica(conn, "project_state", key=key, values={}, version=7)
        with pytest.raises(ValueError):
            await upsert_replica(conn, table, key=key, values={}, version=0)


async def test_relay_restart(
    app_pool: asyncpg.Pool, system_pool: asyncpg.Pool, amqp: AbstractConnection
) -> None:
    """EC01: the relay dies mid-batch; on restart the unmarked rows are published again and the consumer
    applies each event once."""
    event_type = f"test.{_suffix()}.happened"
    outbox = Outbox("knowledge")
    events = [await _emit(app_pool, outbox, event_type) for _ in range(3)]

    consumer = RecordingConsumer(f"restart_{_suffix()}", system_pool)
    consumer.on(event_type, _record_effect)
    channel = await consumer.start(amqp)

    class DyingRelay(OutboxRelay):
        published = 0

        async def _publish(self, row: Mapping[str, Any]) -> None:
            if self.published == 2:
                raise RuntimeError("relay process killed")
            await super()._publish(row)
            self.published += 1

    with pytest.raises(RuntimeError):
        await DyingRelay(system_pool, amqp, owner="pod-1").run_once()
    assert all(r["published_at"] is None for r in await _outbox_rows(system_pool))

    assert await OutboxRelay(system_pool, amqp, owner="pod-2").run_once() == 3
    await _wait_for(lambda: len(consumer.outcomes) >= 5)
    await channel.close()
    assert consumer.outcomes.count(InboxOutcome.PROCESSED) == 3
    assert consumer.outcomes.count(InboxOutcome.DUPLICATE) == 2
    for event in events:
        assert await _count_effects(system_pool, event.id) == 1
    assert all(r["published_at"] is not None for r in await _outbox_rows(system_pool))


async def test_relay_lease(system_pool: asyncpg.Pool) -> None:
    async with system_transaction(system_pool) as conn:
        assert await acquire_lease(conn, "outbox_relay", "pod-1", 30)
        assert await acquire_lease(conn, "outbox_relay", "pod-1", 30)  # renew
        assert not await acquire_lease(conn, "outbox_relay", "pod-2", 30)
        await conn.execute("UPDATE app.job_lock SET lease_until = now() - interval '1 second'")
        assert await acquire_lease(conn, "outbox_relay", "pod-2", 30)


async def test_relay_loop_only_leader_publishes(
    app_pool: asyncpg.Pool, system_pool: asyncpg.Pool, amqp: AbstractConnection
) -> None:
    """`run` publishes while it holds the lease; a second relay without the lease publishes nothing."""
    event_type = f"test.{_suffix()}.happened"
    queue = await _test_queue(amqp, event_type)
    await _emit(app_pool, Outbox("knowledge"), event_type)
    async with system_transaction(system_pool) as conn:
        assert await acquire_lease(conn, "outbox_relay", "pod-1", 30)

    stop = asyncio.Event()
    follower = asyncio.create_task(OutboxRelay(system_pool, amqp, owner="pod-2").run(stop, idle_seconds=0.05))
    await asyncio.sleep(0.3)
    assert all(r["published_at"] is None for r in await _outbox_rows(system_pool))

    leader = asyncio.create_task(OutboxRelay(system_pool, amqp, owner="pod-1").run(stop, idle_seconds=0.05))
    assert len(await _drain(queue, 1)) == 1
    stop.set()
    await asyncio.wait_for(asyncio.gather(follower, leader), timeout=5)
    assert all(r["published_at"] is not None for r in await _outbox_rows(system_pool))


async def test_relay_routes_commands(system_pool: asyncpg.Pool, amqp: AbstractConnection) -> None:
    """Commands go to the queue named by their routing key; an unroutable command stays unpublished and does not
    block the rows after it."""
    channel = await amqp.channel()
    queue_name = f"cmd.{_suffix()}"
    queue = await channel.declare_queue(queue_name, exclusive=True, auto_delete=True)
    event_type = f"test.{_suffix()}.happened"
    events_queue = await _test_queue(amqp, event_type)
    missing, routed, event = uuid7(), uuid7(), uuid7()
    async with system_transaction(system_pool) as conn:
        for row_id, kind, key in (
            (missing, "command", f"cmd.{_suffix()}.nobody"),
            (routed, "command", queue_name),
            (event, "event", event_type),
        ):
            await conn.execute(
                "INSERT INTO app.outbox (id, account_id, kind, routing_key, payload) VALUES ($1, $2, $3, $4, '{}')",
                row_id,
                ACCOUNT,
                kind,
                key,
            )
    relay = OutboxRelay(system_pool, amqp, owner="pod-1")
    assert await relay.run_once() == 2
    [command] = await _drain(queue, 1)
    assert command.message_id == str(routed)
    [published_event] = await _drain(events_queue, 1)
    assert published_event.message_id == str(event)
    unpublished = [r["id"] for r in await _outbox_rows(system_pool) if r["published_at"] is None]
    assert unpublished == [missing]


async def test_idempotency(app_pool: asyncpg.Pool) -> None:
    """Idempotency-Key (DATA-IDEMP-001): repeat → stored response; other body → 422; failure → key not kept."""
    key = require_idempotency_key("key-" + _suffix())
    body = {"title": "A"}
    async with tenant_transaction(app_pool, ACCOUNT) as conn:
        claimed = await claim_idempotency_key(conn, account_id=ACCOUNT, key=key, operation="createThing", body=body)
        assert claimed is None
        await store_idempotent_response(conn, account_id=ACCOUNT, key=key, status=201, body={"id": "t-1"})
    async with tenant_transaction(app_pool, ACCOUNT) as conn:
        stored = await claim_idempotency_key(conn, account_id=ACCOUNT, key=key, operation="createThing", body=body)
    assert stored == StoredResponse(201, {"id": "t-1"})

    for operation, other_body in (("createThing", {"title": "B"}), ("deleteThing", body)):
        with pytest.raises(ProblemError) as reused:
            async with tenant_transaction(app_pool, ACCOUNT) as conn:
                await claim_idempotency_key(conn, account_id=ACCOUNT, key=key, operation=operation, body=other_body)
        assert (reused.value.status, reused.value.code) == (422, "idempotency_key_reused")

    # The first attempt fails: nothing is kept, the retry runs the handler.
    retry_key = "key-" + _suffix()
    with pytest.raises(RuntimeError):
        async with tenant_transaction(app_pool, ACCOUNT) as conn:
            await claim_idempotency_key(conn, account_id=ACCOUNT, key=retry_key, operation="createThing", body=body)
            raise RuntimeError("handler failed")
    async with tenant_transaction(app_pool, ACCOUNT) as conn:
        assert (
            await claim_idempotency_key(conn, account_id=ACCOUNT, key=retry_key, operation="createThing", body=body)
            is None
        )
        await store_idempotent_response(conn, account_id=ACCOUNT, key=retry_key, status=201, body=None)

    # An expired key counts as new, even with another body.
    async with tenant_transaction(app_pool, ACCOUNT) as conn:
        await conn.execute(EXPIRE_KEY, key)
        assert (
            await claim_idempotency_key(conn, account_id=ACCOUNT, key=key, operation="createThing", body={"t": 2})
            is None
        )

    for header, code in ((None, "required"), ("short", "length"), ("x" * 129, "length")):
        with pytest.raises(ProblemError) as invalid:
            require_idempotency_key(header)
        assert (invalid.value.status, invalid.value.code) == (400, "validation_failed")
        assert invalid.value.errors == [
            {"field": "Idempotency-Key", "code": code, "message": invalid.value.errors[0]["message"]}
        ]


async def test_audit_actor_rules(app_pool: asyncpg.Pool) -> None:
    """CTX-AUDIT-001: an actor without its identifying fields is refused before anything is written."""
    from sires_common.messaging import InvalidActorError

    outbox = Outbox("knowledge")
    async with tenant_transaction(app_pool, ACCOUNT) as conn:
        for actor in (
            ActorRef(type="researcher"),
            ActorRef(type="agent", agent="synthesis"),
            ActorRef(type="agent", agent="analysis", agentRunId=uuid7()),
            ActorRef(type="system"),
        ):
            with pytest.raises(InvalidActorError):
                await outbox.emit_audit(
                    conn, account_id=ACCOUNT, actor=actor, action="x", object_type="reference", object_id=uuid7()
                )
