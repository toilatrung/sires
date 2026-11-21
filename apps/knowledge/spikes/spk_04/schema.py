# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Measurement database: the reference DDL from docs/database/ddl (read only) plus spike-only objects.

The database is created by `sires_common.testing.fixtures.create_service_database` (roles `sires_knowledge_app`,
`_system`, `_purge`; 00-common.sql then knowledge.sql, which enables RLS and grants itself). Heavy indexes of the DDL
are dropped before the bulk load and re-created afterwards from the very statements of knowledge.sql.
"""

from __future__ import annotations

import re
import struct
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import asyncpg
import numpy as np

from sires_common.tenancy import Connection
from sires_common.testing.fixtures import PostgresServer, ServiceDatabase, create_service_database

from .config import DIM, HALFVEC_HNSW_INDEX, HALFVEC_PLAIN_TABLE, HALFVEC_TABLE, VECTOR_PLAIN_TABLE, VECTOR_TABLE

REPO_ROOT = Path(__file__).resolve().parents[4]
DDL_DIR = REPO_ROOT / "docs" / "database" / "ddl"

# Indexes rebuilt after the load (their CREATE statements are taken from knowledge.sql).
DEFERRED_INDEXES = ("chunk_text_tsv_idx", "emb_openai_text_embedding_3_small_hnsw_idx")

# Stored copies of the DDL vectors for the exact-scan variants (spike only). EXTERNAL is the default storage of
# vector and halfvec (out of line in TOAST, uncompressed); PLAIN keeps the value in the heap row (1 vector(1536) or
# 2 halfvec(1536) per 8 kB page), which removes the TOAST lookups of a full scan.
COPIES = {
    "halfvec": (HALFVEC_TABLE, f"halfvec({DIM})", "EXTERNAL"),
    "vector_plain": (VECTOR_PLAIN_TABLE, f"vector({DIM})", "PLAIN"),
    "halfvec_plain": (HALFVEC_PLAIN_TABLE, f"halfvec({DIM})", "PLAIN"),
}


def copy_table_sql(table: str, column_type: str, storage: str) -> str:
    """CREATE TABLE for one copy, with the RLS policy and grants of the DDL vector table."""
    return f"""
CREATE SCHEMA IF NOT EXISTS spk04;
GRANT USAGE ON SCHEMA spk04 TO sires_knowledge_app, sires_knowledge_system;
CREATE TABLE {table} (
  chunk_id      uuid PRIMARY KEY REFERENCES app.chunk (id) ON DELETE CASCADE,
  account_id    uuid NOT NULL,
  reference_id  uuid NOT NULL,
  embedding     {column_type} NOT NULL
);
ALTER TABLE {table} ALTER COLUMN embedding SET STORAGE {storage};
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON {table} USING (account_id = app.current_account_id())
  WITH CHECK (account_id = app.current_account_id());
GRANT SELECT ON {table} TO sires_knowledge_app, sires_knowledge_system;
"""


def fill_copy_sql(table: str, column_type: str) -> str:
    name = table.split(".")[1]
    return f"""
INSERT INTO {table} (chunk_id, account_id, reference_id, embedding)
SELECT chunk_id, account_id, reference_id, embedding::{column_type} FROM {VECTOR_TABLE};
CREATE INDEX {name}_scope_idx ON {table} (account_id, reference_id);
"""


HALFVEC_HNSW = (
    f"CREATE INDEX {HALFVEC_HNSW_INDEX} ON {VECTOR_TABLE} USING hnsw ((embedding::halfvec({DIM})) halfvec_cosine_ops)"
)

# Size of each table (heap + TOAST) and index of the knowledge schemas, larger than 1 MB.
RELATIONS_SQL = """
SELECT name, bytes FROM (
  SELECT n.nspname || '.' || c.relname AS name,
         CASE c.relkind WHEN 'i' THEN pg_relation_size(c.oid) ELSE pg_table_size(c.oid) END AS bytes
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('app', 'vec', 'replica', 'spk04') AND c.relkind IN ('r', 'i')) s
WHERE bytes > 1048576 ORDER BY bytes DESC
"""


def ddl(name: str) -> str:
    return (DDL_DIR / name).read_text(encoding="utf-8")


def ddl_index_statement(name: str) -> str:
    """The `CREATE INDEX <name> ...;` statement of knowledge.sql, verbatim."""
    match = re.search(rf"CREATE INDEX {re.escape(name)}\b[^;]*;", ddl("knowledge.sql"))
    if match is None:
        raise LookupError(f"{name} không có trong knowledge.sql")
    return match.group(0)


def server_from_dsn(dsn: str) -> PostgresServer:
    parts = urlsplit(dsn)
    return PostgresServer(
        host=parts.hostname or "127.0.0.1",
        port=parts.port or 5432,
        user=parts.username or "postgres",
        password=parts.password or "",
        database=parts.path.lstrip("/") or "postgres",
    )


def service_database(server: PostgresServer, name: str) -> ServiceDatabase:
    """DSNs of an existing measurement database (same role passwords as `create_service_database`)."""
    return ServiceDatabase(
        service="knowledge",
        name=name,
        owner_dsn=server.dsn(database=name),
        app_dsn=server.dsn(user="sires_knowledge_app", password="app", database=name),
        system_dsn=server.dsn(user="sires_knowledge_system", password="system", database=name),
    )


async def create_database(server: PostgresServer) -> ServiceDatabase:
    db = await create_service_database(
        server, "knowledge", [ddl("00-common.sql"), ddl("knowledge.sql")], finalize=False
    )
    conn = await asyncpg.connect(db.owner_dsn)
    try:
        for table, column_type, storage in COPIES.values():
            await conn.execute(copy_table_sql(table, column_type, storage))
        for index in DEFERRED_INDEXES:
            await conn.execute(f"DROP INDEX IF EXISTS {_schema_of(index)}.{index}")
    finally:
        await conn.close()
    return db


async def drop_database(server: PostgresServer, name: str) -> None:
    conn = await asyncpg.connect(server.dsn())
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
    finally:
        await conn.close()


def _schema_of(index: str) -> str:
    return "vec" if index.startswith("emb_") else "app"


# -- pgvector binary codecs (vector_send/vector_recv: uint16 dim, uint16 unused, float4[dim] big-endian) ----------


def encode_vector(value: Any) -> bytes:
    array = np.asarray(value, dtype=">f4")
    return struct.pack(">HH", array.shape[0], 0) + array.tobytes()


def decode_vector(data: bytes) -> np.ndarray[Any, np.dtype[np.float32]]:
    (dim,) = struct.unpack_from(">H", data)
    return np.frombuffer(data, dtype=">f4", count=dim, offset=4).astype(np.float32)


async def register_vector(conn: Connection) -> None:
    """asyncpg codec for `vector` (binary), used as the pool `init` callback."""
    await conn.set_type_codec("vector", schema="public", encoder=encode_vector, decoder=decode_vector, format="binary")
