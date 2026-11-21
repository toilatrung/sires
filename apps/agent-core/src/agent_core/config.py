# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Configuration of agent-core, read from environment variables (PID-00020 S03, H1).

One place for the settings every later PID needs: database DSNs of the three roles that connect (`_app`,
`_system`, migrator), RabbitMQ, the ES256 signing key of agent-core (`kid = agent-core`: PEM locally and in tests,
a KMS key in staging) and the public key set of all services. The builders turn them into the internal-token
objects of `sires_common.service_auth`.

Nothing here runs at start-up: the app does not build a verifier or an issuer when it starts and does not stop
when a variable is missing (I1-B not chosen, N9). Callers build what they need; a missing variable raises
`ConfigError` at that moment. PID-00048 attaches the guard to routes.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field

from sires_common.kms import Kms
from sires_common.schemas import ServiceName
from sires_common.service_auth import (
    KmsTokenSigner,
    LocalKeySigner,
    PublicKeySet,
    ServiceAuth,
    ServiceTokenIssuer,
    TokenSigner,
    TokenVerifier,
)

SERVICE: ServiceName = "agent-core"

# Environment variables (README › Cấu hình). Names carry no service prefix: each pod has its own environment.
ENV_APP_DATABASE_URL = "DATABASE_APP_URL"
ENV_SYSTEM_DATABASE_URL = "DATABASE_SYSTEM_URL"
ENV_MIGRATOR_DATABASE_URL = "DATABASE_MIGRATOR_URL"
ENV_RABBITMQ_URL = "RABBITMQ_URL"
ENV_SIGNING_KEY_PEM = "SERVICE_TOKEN_SIGNING_KEY_PEM"
ENV_SIGNING_KMS_KEY_ID = "SERVICE_TOKEN_SIGNING_KMS_KEY_ID"
ENV_PUBLIC_KEYS = "SERVICE_TOKEN_PUBLIC_KEYS"


class ConfigError(RuntimeError):
    """A setting needed by the caller is missing or inconsistent. The message names the variable, never its value."""


def _value(env: Mapping[str, str], name: str) -> str | None:
    value = env.get(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


@dataclass(frozen=True, slots=True)
class Settings:
    """Raw settings; every field is optional until a builder needs it."""

    app_database_url: str | None = field(default=None, repr=False)
    system_database_url: str | None = field(default=None, repr=False)
    migrator_database_url: str | None = field(default=None, repr=False)
    rabbitmq_url: str | None = field(default=None, repr=False)
    signing_key_pem: str | None = field(default=None, repr=False)
    signing_kms_key_id: str | None = None
    public_keys_json: str | None = None

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        """Read the variables above from `env` (default `os.environ`); empty values count as missing."""
        source = os.environ if env is None else env
        return cls(
            app_database_url=_value(source, ENV_APP_DATABASE_URL),
            system_database_url=_value(source, ENV_SYSTEM_DATABASE_URL),
            migrator_database_url=_value(source, ENV_MIGRATOR_DATABASE_URL),
            rabbitmq_url=_value(source, ENV_RABBITMQ_URL),
            signing_key_pem=_value(source, ENV_SIGNING_KEY_PEM),
            signing_kms_key_id=_value(source, ENV_SIGNING_KMS_KEY_ID),
            public_keys_json=_value(source, ENV_PUBLIC_KEYS),
        )

    def require_app_database_url(self) -> str:
        return _required(self.app_database_url, ENV_APP_DATABASE_URL)

    def require_system_database_url(self) -> str:
        return _required(self.system_database_url, ENV_SYSTEM_DATABASE_URL)

    def require_migrator_database_url(self) -> str:
        return _required(self.migrator_database_url, ENV_MIGRATOR_DATABASE_URL)

    def require_rabbitmq_url(self) -> str:
        return _required(self.rabbitmq_url, ENV_RABBITMQ_URL)


def _required(value: str | None, name: str) -> str:
    if value is None:
        raise ConfigError(f"thiếu biến môi trường {name}")
    return value


def sqlalchemy_url(dsn: str) -> str:
    """`postgresql://…` (asyncpg form, as sires_common uses) → `postgresql+asyncpg://…` for SQLAlchemy and Alembic."""
    for prefix in ("postgresql+asyncpg://", "postgresql://", "postgres://"):
        if dsn.startswith(prefix):
            return "postgresql+asyncpg://" + dsn[len(prefix) :]
    raise ConfigError("DSN PostgreSQL phải bắt đầu bằng postgresql://")


def public_key_set(settings: Settings) -> PublicKeySet:
    """Public keys of the services, loaded from configuration only — never fetched from the network (PID-00005 H2).

    `SERVICE_TOKEN_PUBLIC_KEYS` is a JWKS (`{"keys": [...]}`) or a `{kid: PEM}` object.
    """
    text = _required(settings.public_keys_json, ENV_PUBLIC_KEYS)
    try:
        return PublicKeySet.from_json(text)
    except (ValueError, KeyError, TypeError, AttributeError) as exc:  # json.JSONDecodeError is a ValueError
        raise ConfigError(f"{ENV_PUBLIC_KEYS} không phải JWKS hoặc object kid → PEM hợp lệ") from exc


def token_signer(settings: Settings, *, kms: Kms | None = None) -> TokenSigner:
    """ES256 signer of agent-core (`kid = agent-core`): PEM key locally and in tests, KMS key in staging."""
    if settings.signing_key_pem and settings.signing_kms_key_id:
        raise ConfigError(f"chỉ đặt một trong {ENV_SIGNING_KEY_PEM} và {ENV_SIGNING_KMS_KEY_ID}")
    if settings.signing_key_pem:
        try:
            return LocalKeySigner.from_pem(SERVICE, settings.signing_key_pem)
        except (ValueError, TypeError) as exc:  # not PEM, not EC P-256, or encrypted
            raise ConfigError(f"{ENV_SIGNING_KEY_PEM} không phải khóa EC P-256 dạng PEM") from exc
    if settings.signing_kms_key_id:
        if kms is None:
            raise ConfigError(f"{ENV_SIGNING_KMS_KEY_ID} cần một client KMS")
        return KmsTokenSigner(kms, settings.signing_kms_key_id, SERVICE)
    raise ConfigError(f"thiếu {ENV_SIGNING_KEY_PEM} hoặc {ENV_SIGNING_KMS_KEY_ID}")


def token_issuer(settings: Settings, *, kms: Kms | None = None) -> ServiceTokenIssuer:
    """Issuer for agent-core's outgoing internal calls (`sub = agent-core`)."""
    return ServiceTokenIssuer(SERVICE, token_signer(settings, kms=kms))


def token_verifier(settings: Settings) -> TokenVerifier:
    """Verifier for internal tokens addressed to agent-core."""
    return TokenVerifier(SERVICE, public_key_set(settings))


def service_auth(settings: Settings) -> ServiceAuth:
    """Guard factory for agent-core's internal routes; PID-00048 declares it on routes with their `x-callers`."""
    return ServiceAuth(token_verifier(settings))
