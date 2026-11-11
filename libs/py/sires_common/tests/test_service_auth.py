# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S03 — internal tokens (ES256, kid = service), FastAPI guard, outgoing client (H2, H4; PID-00003 I3)."""

import time
from typing import Annotated, Any
from uuid import UUID

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from support import COMMON_SCHEMAS, INTERNAL_SCHEMAS, contract_errors

from sires_common.errors import PROBLEM_JSON, install_problem_handlers
from sires_common.schemas import ActorRef
from sires_common.service_auth import (
    SERVICE_TOKEN_ISSUER,
    InvalidServiceToken,
    KmsTokenSigner,
    LocalKeySigner,
    PublicKeySet,
    ServiceAuth,
    ServiceCaller,
    ServiceTokenIssuer,
    TokenVerifier,
    sign_token,
)
from sires_common.tenancy import uuid7
from sires_common.testing import LocalKms, make_service_keys, sign_agent_run_token

pytestmark = pytest.mark.anyio

SERVICES = ("knowledge", "agent-core", "orchestration", "research", "gateway", "planning", "identity")
SIGNERS, KEYS = make_service_keys(*SERVICES)
ACCOUNT = UUID("0193a000-0000-7000-8000-00000000000a")
RUN_ID = UUID("0193a000-0000-7000-8000-0000000000a1")
SCOPE = {"read": ["evidence", "artifact:Accepted"], "taskIds": [str(UUID("0193a000-0000-7000-8000-0000000000b1"))]}
RESEARCHER = ActorRef(type="researcher", accountId=ACCOUNT)


def _claims(sub: str = "agent-core", aud: Any = "knowledge", **extra: Any) -> dict[str, Any]:
    claims: dict[str, Any] = {
        "iss": SERVICE_TOKEN_ISSUER,
        "sub": sub,
        "aud": aud,
        "exp": int(time.time()) + 120,
        "act": RESEARCHER.as_json(),
        "accountId": str(ACCOUNT),
    }
    for name, value in extra.items():
        if value is None:
            claims.pop(name, None)
        else:
            claims[name] = value
    return claims


async def _token(signer: str = "agent-core", **claims: Any) -> str:
    return await sign_token(SIGNERS[signer], _claims(**claims))


async def _agent_token(signer: str = "orchestration", aud: Any = ("knowledge", "research"), **overrides: Any) -> str:
    return await sign_agent_run_token(
        SIGNERS[signer],
        aud=list(aud),
        agent_run_id=RUN_ID,
        agent="synthesis",
        account_id=ACCOUNT,
        agent_scope=SCOPE,
        overrides=overrides,
    )


def _knowledge_app(service: str = "knowledge") -> FastAPI:
    app = FastAPI()
    install_problem_handlers(app)
    auth = ServiceAuth(TokenVerifier(service, KEYS))  # type: ignore[arg-type]

    @app.post("/internal/retrieve")
    async def retrieve(
        caller: Annotated[ServiceCaller, Depends(auth.require(["agent-core", "research"]))],
    ) -> dict[str, Any]:
        return {
            "sub": caller.service,
            "kid": caller.kid,
            "actor": caller.actor.as_json(),
            "accountId": str(caller.account_id),
            "agentRunId": str(caller.agent_run_id) if caller.agent_run_id else None,
        }

    return app


def _call(app: FastAPI, token: str | None, scheme: str = "Bearer") -> Any:
    headers = {"Authorization": f"{scheme} {token}"} if token is not None else {}
    return TestClient(app).post("/internal/retrieve", headers=headers)


def _assert_rejected(response: Any, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    assert response.headers["content-type"] == PROBLEM_JSON
    body = response.json()
    assert (body["status"], body["code"]) == (status, code)
    assert body["type"] == f"https://sires.etroy.local/problems/{code}"
    assert contract_errors(COMMON_SCHEMAS, "Problem", body) == []


async def test_guard() -> None:
    """PID-00005-AC05: expired, wrong signature, aud of another service, TTL > 5 min, wrong iss → 401
    invalid_service_token; caller outside x-callers → 403 caller_not_allowed."""
    app = _knowledge_app()
    ok = _call(app, await _token())
    assert ok.status_code == 200, ok.text
    assert ok.json()["sub"] == "agent-core" and ok.json()["accountId"] == str(ACCOUNT)

    impostor = LocalKeySigner.generate("agent-core")  # right kid, key not in the environment key set
    rejected_tokens = {
        "expired": await _token(exp=int(time.time()) - 1),
        "wrong signature": await sign_token(impostor, _claims()),
        "aud of another service": await _token(aud="research"),
        "ttl over 5 minutes": await _token(exp=int(time.time()) + 301 + 5),
        "wrong issuer": await _token(iss="someone-else"),
        "sub not a service": await _token(sub="hacker", signer="agent-core"),
        "no act": await _token(act=None),
        "exp not an integer": await _token(exp="soon"),
    }
    for reason, token in rejected_tokens.items():
        response = _call(app, token)
        assert response.status_code == 401, reason
        _assert_rejected(response, 401, "invalid_service_token")

    _assert_rejected(_call(app, None), 401, "invalid_service_token")
    _assert_rejected(_call(app, await _token(), scheme="Basic"), 401, "invalid_service_token")
    _assert_rejected(_call(app, "not.a.jwt"), 401, "invalid_service_token")

    # Valid token of a service not listed in x-callers.
    _assert_rejected(_call(app, await _token(signer="planning", sub="planning")), 403, "caller_not_allowed")


async def test_signer_rules() -> None:
    """PID-00005-AC05 (signer rules, H2): sub must equal kid; an agent token must be signed by orchestration
    with sub = agent-core."""
    app = _knowledge_app()
    _assert_rejected(_call(app, await _token(signer="research", sub="agent-core")), 401, "invalid_service_token")
    _assert_rejected(_call(app, await _agent_token(signer="agent-core")), 401, "invalid_service_token")
    _assert_rejected(_call(app, await _agent_token(sub="orchestration")), 401, "invalid_service_token")
    _assert_rejected(_call(app, await _agent_token(signer="gateway")), 401, "invalid_service_token")

    accepted = _call(app, await _agent_token())
    assert accepted.status_code == 200, accepted.text
    assert accepted.json() == {
        "sub": "agent-core",
        "kid": "orchestration",
        "actor": {"type": "agent", "agent": "synthesis", "agentRunId": str(RUN_ID)},
        "accountId": str(ACCOUNT),
        "agentRunId": str(RUN_ID),
    }


async def test_agent_scope() -> None:
    """EC02: an Agent Run token without agentScope (or agentRunId) → 401 invalid_service_token."""
    app = _knowledge_app()
    _assert_rejected(_call(app, await _agent_token(agentScope=None)), 401, "invalid_service_token")
    _assert_rejected(_call(app, await _agent_token(agentRunId=None)), 401, "invalid_service_token")


async def test_unknown_kid() -> None:
    """EC06: kid not in the environment key set → 401 invalid_service_token (no key is fetched)."""
    stranger = LocalKeySigner.generate("sandbox-runner")
    token = await sign_token(stranger, _claims(sub="sandbox-runner"))
    _assert_rejected(_call(_knowledge_app(), token), 401, "invalid_service_token")
    with pytest.raises(InvalidServiceToken) as exc:
        TokenVerifier("knowledge", KEYS).verify(token)
    assert exc.value.reason == "kid_unknown"


async def test_aud_array() -> None:
    """PID-00005-AC05, EC07 (H4): an agent token with aud = [knowledge, research] passes knowledge and fails
    agent-core; an array aud on any other token, or a single aud on an agent token, is refused."""
    token = await _agent_token(aud=("knowledge", "research"))
    assert TokenVerifier("knowledge", KEYS).verify(token).agent_run_id == RUN_ID
    assert TokenVerifier("research", KEYS).verify(token).service == "agent-core"
    with pytest.raises(InvalidServiceToken):
        TokenVerifier("agent-core", KEYS).verify(token)
    _assert_rejected(_call(_knowledge_app("agent-core"), token), 401, "invalid_service_token")

    with pytest.raises(InvalidServiceToken):
        TokenVerifier("knowledge", KEYS).verify(await _token(aud=["knowledge"]))
    with pytest.raises(InvalidServiceToken):
        TokenVerifier("knowledge", KEYS).verify(await _agent_token(aud="knowledge"))
    with pytest.raises(InvalidServiceToken):
        TokenVerifier("knowledge", KEYS).verify(await _agent_token(aud=[]))


async def test_tokens_follow_contract() -> None:
    """Tokens issued here validate against ServiceTokenClaims of internal/schemas.yaml, header kid = service."""
    import jwt

    issuer = ServiceTokenIssuer("agent-core", SIGNERS["agent-core"])
    token = await issuer.issue("knowledge", actor=RESEARCHER, account_id=ACCOUNT, project_id=uuid7())
    header = jwt.get_unverified_header(token)
    assert header == {"alg": "ES256", "typ": "JWT", "kid": "agent-core"}
    claims = jwt.decode(token, options={"verify_signature": False})
    assert contract_errors(INTERNAL_SCHEMAS, "ServiceTokenClaims", claims) == []
    assert 0 < claims["exp"] - time.time() <= 300
    agent_claims = jwt.decode(await _agent_token(), options={"verify_signature": False})
    assert contract_errors(INTERNAL_SCHEMAS, "ServiceTokenClaims", agent_claims) == []


async def test_client() -> None:
    """Outgoing calls: sub = this service, aud = target, act/account from the request being handled; jobs use
    act.type = system; the client never issues an agent token."""
    issuer = ServiceTokenIssuer("knowledge", SIGNERS["knowledge"])
    research_verifier = TokenVerifier("research", KEYS)

    # In a job (no request): system actor with component.
    headers = await issuer.headers_for("research", component="indexer", account_id=ACCOUNT)
    caller = research_verifier.verify(headers["Authorization"].removeprefix("Bearer "))
    assert (caller.service, caller.kid, caller.actor.type, caller.actor.component) == (
        "knowledge",
        "knowledge",
        "system",
        "indexer",
    )
    with pytest.raises(ValueError):
        await issuer.headers_for("research")
    with pytest.raises(ValueError):
        await issuer.issue("research", actor=ActorRef(type="agent", agent="synthesis", agentRunId=RUN_ID))
    with pytest.raises(ValueError):
        ServiceTokenIssuer("knowledge", SIGNERS["research"])

    # Inside a request: the incoming actor and account are carried to the next service.
    app = FastAPI()
    install_problem_handlers(app)
    auth = ServiceAuth(TokenVerifier("knowledge", KEYS))

    @app.post("/internal/forward")
    async def forward(
        caller: Annotated[ServiceCaller, Depends(auth.require(["research", "agent-core"]))],
    ) -> dict[str, Any]:
        try:
            outgoing = await issuer.headers_for("research")
        except ValueError as exc:
            return {"refused": str(exc)}
        downstream = research_verifier.verify(outgoing["Authorization"].removeprefix("Bearer "))
        return {"actor": downstream.actor.as_json(), "accountId": str(downstream.account_id), "sub": downstream.service}

    client = TestClient(app)
    researcher_token = await _token(signer="agent-core")
    forwarded = client.post("/internal/forward", headers={"Authorization": f"Bearer {researcher_token}"})
    assert forwarded.json() == {"actor": RESEARCHER.as_json(), "accountId": str(ACCOUNT), "sub": "knowledge"}
    # A request made with an Agent Run token cannot be turned into a self-issued token.
    refused = client.post("/internal/forward", headers={"Authorization": f"Bearer {await _agent_token()}"})
    assert "refused" in refused.json()

    # Tokens are reused until close to expiry.
    assert await issuer.issue("research", actor=RESEARCHER) == await issuer.issue("research", actor=RESEARCHER)


async def test_kms_signer_and_key_set_formats() -> None:
    """A KMS-held key (LocalKms here) signs tokens other services verify; key sets load from PEM or JWKS."""
    kms = LocalKms()
    kms.create_signing_key("kms/agent-core")
    signer = KmsTokenSigner(kms, "kms/agent-core", kid="agent-core")
    pem = await kms.get_public_key_pem("kms/agent-core")
    keys = PublicKeySet.from_pem({"agent-core": pem})
    issuer = ServiceTokenIssuer("agent-core", signer)
    token = await issuer.issue("knowledge", actor=RESEARCHER, account_id=ACCOUNT)
    assert TokenVerifier("knowledge", keys).verify(token).kid == "agent-core"

    round_trip = PublicKeySet.from_json(__import__("json").dumps(keys.to_jwks()))
    assert round_trip.kids() == ["agent-core"]
    assert TokenVerifier("knowledge", round_trip).verify(token).service == "agent-core"
    with pytest.raises(ValueError):
        PublicKeySet.from_jwks({"keys": [{"kty": "RSA", "kid": "x"}]})
