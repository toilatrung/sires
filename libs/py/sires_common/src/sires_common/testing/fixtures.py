# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""pytest fixtures: PostgreSQL, RabbitMQ and MinIO in Testcontainers (architecture 2.8, 8.9).

Enable in a conftest.py with `pytest_plugins = ["sires_common.testing.fixtures"]`; needs the `testing` extra and a
reachable Docker (DOCKER_HOST). Images default to infra/local/compose.yaml and can be overridden with
SIRES_TEST_POSTGRES_IMAGE, SIRES_TEST_RABBITMQ_IMAGE, SIRES_TEST_MINIO_IMAGE.
"""

from __future__ import annotations

import os
import secrets
from collections.abc import Iterator, Sequence
from dataclasses import dataclass

import asyncpg
import pytest
from testcontainers.community.minio import MinioContainer
from testcontainers.community.postgres import PostgresContainer
from testcontainers.community.rabbitmq import RabbitMqContainer

from sires_common.testing.fake_gateway import FakeModelGateway
from sires_common.testing.kms import LocalKms

POSTGRES_IMAGE = os.environ.get("SIRES_TEST_POSTGRES_IMAGE", "pgvector/pgvector:pg16")
RABBITMQ_IMAGE = os.environ.get("SIRES_TEST_RABBITMQ_IMAGE", "rabbitmq:4-management")
# compose.yaml names minio/minio:latest, which Docker Hub no longer serves (11/11/2026); see the PID-00005 report.
MINIO_IMAGE = os.environ.get("SIRES_TEST_MINIO_IMAGE", "cgr.dev/chainguard/minio:latest")


@dataclass(frozen=True, slots=True)
class PostgresServer:
    host: str
    port: int
    user: str
    password: str
    database: str

    def dsn(self, *, user: str | None = None, password: str | None = None, database: str | None = None) -> str:
        return (
            f"postgresql://{user or self.user}:{password or self.password}"
            f"@{self.host}:{self.port}/{database or self.database}"
        )


@dataclass(frozen=True, slots=True)
class ServiceDatabase:
    """A fresh database with the roles of one service (docs/database 11.2): `_app` (RLS applies), `_system`
    (BYPASSRLS) and `_purge`, all LOGIN with test passwords."""

    service: str
    name: str
    owner_dsn: str
    app_dsn: str
    system_dsn: str


@dataclass(frozen=True, slots=True)
class RabbitMqServer:
    url: str


@dataclass(frozen=True, slots=True)
class MinioServer:
    endpoint: str
    access_key: str
    secret_key: str


_ROLE_SQL = """
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{app}') THEN
    CREATE ROLE "{app}" LOGIN PASSWORD 'app' NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{system}') THEN
    CREATE ROLE "{system}" LOGIN PASSWORD 'system' BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{purge}') THEN
    CREATE ROLE "{purge}" LOGIN PASSWORD 'purge' BYPASSRLS;
  END IF;
END $$;
"""


async def create_service_database(
    server: PostgresServer,
    service: str,
    scripts: Sequence[str],
    *,
    finalize: bool = True,
) -> ServiceDatabase:
    """Create `sires_<service>_<random>`, the three roles, run `scripts` (e.g. 00-common.sql then the service DDL)
    as the owner, then `app.enable_tenant_rls()` and `app.grant_standard(service)` when `finalize`."""
    if not service.replace("_", "").isalnum():
        raise ValueError("tên service dùng chữ, số và _")
    roles = {kind: f"sires_{service}_{kind}" for kind in ("app", "system", "purge")}
    name = f"sires_{service}_{secrets.token_hex(4)}"
    admin = await asyncpg.connect(server.dsn())
    try:
        await admin.execute(_ROLE_SQL.format(**roles))
        await admin.execute(f'CREATE DATABASE "{name}"')
    finally:
        await admin.close()
    owner_dsn = server.dsn(database=name)
    conn = await asyncpg.connect(owner_dsn)
    try:
        for script in scripts:
            await conn.execute(script)
        if finalize:
            await conn.execute("SELECT app.enable_tenant_rls()")
            await conn.execute("SELECT app.grant_standard($1)", service)
    finally:
        await conn.close()
    return ServiceDatabase(
        service=service,
        name=name,
        owner_dsn=owner_dsn,
        app_dsn=server.dsn(user=roles["app"], password="app", database=name),
        system_dsn=server.dsn(user=roles["system"], password="system", database=name),
    )


@pytest.fixture(scope="session")
def sires_postgres() -> Iterator[PostgresServer]:
    with PostgresContainer(POSTGRES_IMAGE, driver=None) as container:
        yield PostgresServer(
            host=container.get_container_host_ip(),
            port=int(container.get_exposed_port(5432)),
            user=container.username,
            password=container.password,
            database=container.dbname,
        )


@pytest.fixture(scope="session")
def sires_rabbitmq() -> Iterator[RabbitMqServer]:
    with RabbitMqContainer(RABBITMQ_IMAGE) as container:
        host = container.get_container_host_ip()
        port = container.get_exposed_port(container.port)
        yield RabbitMqServer(url=f"amqp://{container.username}:{container.password}@{host}:{port}/")


@pytest.fixture(scope="session")
def sires_minio() -> Iterator[MinioServer]:
    with MinioContainer(MINIO_IMAGE) as container:
        config = container.get_config()
        yield MinioServer(
            endpoint=str(config["endpoint"]),
            access_key=str(config["access_key"]),
            secret_key=str(config["secret_key"]),
        )


@pytest.fixture
def fake_model_gateway() -> FakeModelGateway:
    return FakeModelGateway()


@pytest.fixture
def local_kms() -> LocalKms:
    return LocalKms()
