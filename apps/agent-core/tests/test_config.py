# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S03 — configuration of agent-core and the internal-token builders from sires_common (PID-00020-AC02, EC06)."""

from __future__ import annotations

import json
import time
from typing import Annotated

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from agent_core import config
from agent_core.config import ConfigError, Settings
from agent_core.main import app as agent_core_app
from sires_common.errors import install_problem_handlers
from sires_common.schemas import ActorRef
from sires_common.service_auth import (
    SERVICE_TOKEN_ISSUER,
    LocalKeySigner,
    PublicKeySet,
    ServiceAuth,
    ServiceCaller,
    TokenVerifier,
    bearer_headers,
    sign_token,
)
from sires_common.testing.kms import LocalKms

pytestmark = pytest.mark.anyio


def _pem_pair() -> tuple[str, str]:
    key = ec.generate_private_key(ec.SECP256R1())
    private = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    public = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode()
    return private, public


def _identity_app(keys: PublicKeySet) -> FastAPI:
    """What identity will do (PID-00048 side): verifier and guard from sires_common with the same key set."""
    auth = ServiceAuth(TokenVerifier("identity", keys))
    app = FastAPI()
    install_problem_handlers(app)

    @app.get("/internal/ping")
    async def ping(caller: Annotated[ServiceCaller, Depends(auth.require(["agent-core"]))]) -> dict[str, str]:
        return {"sub": caller.service}

    return app


def _assert_problem(response: httpx.Response, status: int, code: str) -> None:
    assert response.status_code == status
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == code


async def test_service_token_roundtrip() -> None:
    """PID-00020-AC02, EC06: a token agent-core signs for identity is accepted there; an unknown kid → 401."""
    private_pem, public_pem = _pem_pair()
    # The public key set every service of the environment loads (JWKS form); only agent-core's key is in it.
    jwks = PublicKeySet.from_pem({"agent-core": public_pem}).to_jwks()
    settings = Settings.from_env(
        {
            config.ENV_SIGNING_KEY_PEM: private_pem,
            config.ENV_PUBLIC_KEYS: json.dumps(jwks),
        }
    )

    issuer = config.token_issuer(settings)
    token = await issuer.issue("identity", actor=ActorRef(type="system", component="test"))

    identity_keys = config.public_key_set(settings)
    caller = TokenVerifier("identity", identity_keys).verify(token)
    assert caller.service == "agent-core"
    assert caller.kid == "agent-core"

    client = TestClient(_identity_app(identity_keys))
    accepted = client.get("/internal/ping", headers=bearer_headers(token))
    assert accepted.status_code == 200
    assert accepted.json() == {"sub": "agent-core"}

    # EC06: same claims, signed with a key whose kid is not in the configured set → rejected, nothing fetched.
    rogue = LocalKeySigner.generate("knowledge")
    claims = {
        "iss": SERVICE_TOKEN_ISSUER,
        "sub": "knowledge",
        "aud": "identity",
        "exp": int(time.time()) + 60,
        "act": {"type": "system", "component": "test"},
    }
    rogue_token = await sign_token(rogue, claims)
    _assert_problem(client.get("/internal/ping", headers=bearer_headers(rogue_token)), 401, "invalid_service_token")

    # agent-core's own verifier and guard come from the same settings.
    assert config.token_verifier(settings).verify(
        await issuer.issue("agent-core", actor=ActorRef(type="system", component="test"))
    ).service == "agent-core"
    assert isinstance(config.service_auth(settings), ServiceAuth)


def test_health_unchanged() -> None:
    """H1: no start-up behaviour was added; /health answers as before with no variable set."""
    response = TestClient(agent_core_app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"service": "agent-core", "status": "ok"}


async def test_kms_signer() -> None:
    """Staging signs in KMS: SERVICE_TOKEN_SIGNING_KMS_KEY_ID with a KMS client gives a working issuer."""
    kms = LocalKms()
    kms.create_signing_key("agent-core-signing")
    public_pem = (await kms.get_public_key_pem("agent-core-signing")).decode()
    settings = Settings.from_env(
        {
            config.ENV_SIGNING_KMS_KEY_ID: "agent-core-signing",
            config.ENV_PUBLIC_KEYS: json.dumps({"agent-core": public_pem}),
        }
    )
    token = await config.token_issuer(settings, kms=kms).issue(
        "identity", actor=ActorRef(type="system", component="test")
    )
    assert TokenVerifier("identity", config.public_key_set(settings)).verify(token).service == "agent-core"


def test_missing_or_inconsistent_settings() -> None:
    private_pem, _ = _pem_pair()
    empty = Settings.from_env({config.ENV_SIGNING_KEY_PEM: "  "})
    with pytest.raises(ConfigError, match=config.ENV_SIGNING_KEY_PEM):
        config.token_signer(empty)
    with pytest.raises(ConfigError, match=config.ENV_PUBLIC_KEYS):
        config.public_key_set(empty)
    with pytest.raises(ConfigError, match=config.ENV_MIGRATOR_DATABASE_URL):
        empty.require_migrator_database_url()
    both = Settings.from_env({config.ENV_SIGNING_KEY_PEM: private_pem, config.ENV_SIGNING_KMS_KEY_ID: "k"})
    with pytest.raises(ConfigError, match="chỉ đặt một"):
        config.token_signer(both)
    with pytest.raises(ConfigError, match="client KMS"):
        config.token_signer(Settings.from_env({config.ENV_SIGNING_KMS_KEY_ID: "k"}))
    with pytest.raises(ConfigError):
        config.public_key_set(Settings.from_env({config.ENV_PUBLIC_KEYS: "not json"}))
    # Secrets never appear in repr (logs of a settings object).
    assert private_pem not in repr(Settings.from_env({config.ENV_SIGNING_KEY_PEM: private_pem}))


def test_sqlalchemy_url() -> None:
    assert config.sqlalchemy_url("postgresql://u:p@h:5432/d") == "postgresql+asyncpg://u:p@h:5432/d"
    assert config.sqlalchemy_url("postgres://u:p@h/d") == "postgresql+asyncpg://u:p@h/d"
    with pytest.raises(ConfigError):
        config.sqlalchemy_url("mysql://h/d")
