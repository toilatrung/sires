# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Hand-written subset of the shared contract schemas the library itself needs.

Source of truth: docs/api-design/internal/schemas.yaml (ServiceName, ServiceTokenClaims, EventEnvelope) and
docs/api-design/components/schemas/common.yaml (ActorRef, AgentName). Generated clients belong to PID-00007; tests
check what this library emits against the YAML schemas themselves.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, Strict

ServiceName = Literal[
    "gateway",
    "identity",
    "workspace",
    "planning",
    "orchestration",
    "library",
    "research",
    "manuscript",
    "audit",
    "sandbox-runner",
    "agent-core",
    "knowledge",
]

AgentName = Literal[
    "orchestrator",
    "discovery",
    "reference_processing",
    "evidence_retrieval",
    "synthesis",
    "writing",
    "verification",
    "diagram",
    "analysis",
]


class ActorRef(BaseModel):
    """ActorRef (PRD 18.1). Only `type` is required by the schema; see `is_complete`."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    type: Literal["researcher", "agent", "system"]
    accountId: UUID | None = None
    agent: AgentName | None = None
    instance: Literal["A", "B"] | None = None
    agentRunId: UUID | None = None
    component: str | None = None

    def is_complete(self) -> bool:
        """Same rule as `app.is_actor_ref` in docs/database/ddl/00-common.sql (CTX-AUDIT-001)."""
        if self.type == "researcher":
            return self.accountId is not None
        if self.type == "agent":
            return (
                self.agent is not None
                and self.agentRunId is not None
                and (self.agent == "analysis") == (self.instance in ("A", "B"))
            )
        return bool(self.component)

    def as_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json", exclude_none=True)


class Aggregate(BaseModel):
    """`EventEnvelope.aggregate`: required on every event (DBQ-04, PO 11/11/2026)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    type: str = Field(min_length=1)
    id: UUID
    version: Annotated[int, Strict(), Field(ge=1)]


class EventEnvelope(BaseModel):
    """Envelope of every event on `sires.events`; `id` = id of the producer's outbox row."""

    model_config = ConfigDict(frozen=True)

    id: UUID
    type: str = Field(min_length=1)
    schemaVersion: Annotated[int, Field(ge=1)]
    producer: ServiceName
    occurredAt: datetime
    accountId: UUID
    projectId: UUID | None = None
    actor: ActorRef | None = None
    aggregate: Aggregate
    traceparent: str | None = None
    data: dict[str, Any]

    def as_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json", exclude_none=True)


class AgentScope(BaseModel):
    model_config = ConfigDict(frozen=True)

    read: list[str] | None = None
    taskIds: list[UUID] | None = None


class ServiceTokenClaims(BaseModel):
    """Claims of the internal JWT (ADR-20, architecture 10.4). Unknown claims (iat, jti…) are ignored."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    iss: str
    sub: ServiceName
    aud: ServiceName | Annotated[list[ServiceName], Field(min_length=1)]
    exp: Annotated[int, Strict()]
    act: ActorRef
    accountId: UUID | None = None
    projectId: UUID | None = None
    agentRunId: UUID | None = None
    agentScope: AgentScope | None = None
