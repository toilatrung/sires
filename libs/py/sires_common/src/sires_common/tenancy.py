# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Tenancy, transactions and UUIDv7 (architecture 6.2, 6.3; docs/database/ddl/00-common.sql).

Every transaction of the `_app` role sets `app.account_id` with `SET LOCAL` semantics, so Row-Level Security only
returns rows of that account and nothing leaks to the next transaction on the same pooled connection. A transaction
without the setting sees no row (`app.current_account_id()` is NULL). Background jobs and consumers use the `_system`
role (BYPASSRLS) through `system_transaction`.
"""

from __future__ import annotations

import secrets
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import asyncpg
from asyncpg.pool import PoolConnectionProxy

from sires_common.schemas import ActorRef

type Connection = asyncpg.Connection[Any] | PoolConnectionProxy[Any]
type Pool = asyncpg.Pool[Any]

_MS_MASK = (1 << 48) - 1
_RAND_B_BITS = 62


def uuid7() -> UUID:
    """UUIDv7 (RFC 9562): 48-bit Unix time in ms, version 7, 74 random bits, variant 10.

    Same layout as `app.uuid_v7()`; ids sort by creation time (architecture 6.2).
    """
    ms = time.time_ns() // 1_000_000
    rand = secrets.randbits(12 + _RAND_B_BITS)
    rand_a = rand >> _RAND_B_BITS
    rand_b = rand & ((1 << _RAND_B_BITS) - 1)
    value = (ms & _MS_MASK) << 80 | 0x7 << 76 | rand_a << 64 | 0b10 << 62 | rand_b
    return UUID(int=value)


@dataclass(frozen=True, slots=True)
class TenantContext:
    """Who acts and for which account, taken from the internal token (architecture 6.3)."""

    account_id: UUID
    actor: ActorRef
    project_id: UUID | None = None


async def create_pool(dsn: str, *, min_size: int = 1, max_size: int = 10, **kwargs: Any) -> Pool:
    """Connection pool for one database role (`_app` or `_system`)."""
    pool = await asyncpg.create_pool(dsn, min_size=min_size, max_size=max_size, **kwargs)
    if pool is None:  # pragma: no cover - asyncpg returns None only when awaited without a loop
        raise RuntimeError("asyncpg.create_pool returned None")
    return pool


@asynccontextmanager
async def tenant_transaction(pool: Pool, account_id: UUID | str) -> AsyncIterator[Connection]:
    """Open a transaction with `app.account_id` set for this transaction only (`SET LOCAL`).

    Commits when the block ends, rolls back when it raises. The setting disappears with the transaction, so the
    connection goes back to the pool without a tenant.
    """
    account = account_id if isinstance(account_id, UUID) else UUID(str(account_id))
    async with pool.acquire() as conn:
        async with conn.transaction():
            # set_config(..., is_local => true) is SET LOCAL with a bind parameter.
            await conn.execute("SELECT set_config('app.account_id', $1, true)", str(account))
            yield conn


@asynccontextmanager
async def tenant_context_transaction(pool: Pool, context: TenantContext) -> AsyncIterator[Connection]:
    """`tenant_transaction` for the account of a `TenantContext`."""
    async with tenant_transaction(pool, context.account_id) as conn:
        yield conn


@asynccontextmanager
async def system_transaction(pool: Pool) -> AsyncIterator[Connection]:
    """Transaction without tenant, for the `_system` role (relay, consumer, replica, jobs)."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            yield conn
