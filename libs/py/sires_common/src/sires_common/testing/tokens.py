# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Service keys and tokens for tests: one in-memory ES256 key per service (kid = service name)."""

from __future__ import annotations

import time
from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID

from sires_common.schemas import AgentName, ServiceName
from sires_common.service_auth import (
    AGENT_CORE,
    MAX_TOKEN_TTL_SECONDS,
    SERVICE_TOKEN_ISSUER,
    LocalKeySigner,
    PublicKeySet,
    TokenSigner,
    sign_token,
)


def make_service_keys(*services: str) -> tuple[dict[str, LocalKeySigner], PublicKeySet]:
    """Signers for `services` and the public key set every service of the test environment loads."""
    signers = {name: LocalKeySigner.generate(name) for name in services}
    return signers, PublicKeySet({name: signer.public_key() for name, signer in signers.items()})


async def sign_agent_run_token(
    orchestration: TokenSigner,
    *,
    aud: Sequence[ServiceName],
    agent_run_id: UUID,
    agent: AgentName,
    account_id: UUID,
    agent_scope: Mapping[str, Any] | None,
    project_id: UUID | None = None,
    ttl_seconds: int = MAX_TOKEN_TTL_SECONDS,
    now: float | None = None,
    overrides: Mapping[str, Any] | None = None,
) -> str:
    """Agent Run token as orchestration issues it (H2, H4): act.type = agent, sub = agent-core, aud array.

    `overrides` replaces claims to build invalid tokens in tests; a None value removes the claim.
    """
    issued = int(time.time() if now is None else now)
    claims: dict[str, Any] = {
        "iss": SERVICE_TOKEN_ISSUER,
        "sub": AGENT_CORE,
        "aud": list(aud),
        "exp": issued + ttl_seconds,
        "act": {"type": "agent", "agent": agent, "agentRunId": str(agent_run_id)},
        "accountId": str(account_id),
        "agentRunId": str(agent_run_id),
    }
    if agent_scope is not None:
        claims["agentScope"] = dict(agent_scope)
    if project_id is not None:
        claims["projectId"] = str(project_id)
    for name, value in (overrides or {}).items():
        if value is None:
            claims.pop(name, None)
        else:
            claims[name] = value
    return await sign_token(orchestration, claims)
