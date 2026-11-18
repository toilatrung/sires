// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { withDocker } from './docker';
import { resolveImage } from './images';

export interface PostgresOptions {
  /** Defaults to pgvector/pgvector:pg16 (same as infra/local/compose.yaml). */
  image?: string;
  database?: string;
  username?: string;
  password?: string;
  /** Extensions created in `database` once the server is up. Defaults to ['vector']. */
  extensions?: readonly string[];
}

export interface StartedPostgres {
  /** postgres://user:password@host:port/database on a random host port. */
  readonly connectionUri: string;
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly username: string;
  readonly password: string;
  readonly containerId: string;
  readonly container: StartedPostgreSqlContainer;
  /** Stops and removes the container. */
  stop(): Promise<void>;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** Starts PostgreSQL 16 + pgvector on a random host port and creates the requested extensions. */
export async function startPostgres(options: PostgresOptions = {}): Promise<StartedPostgres> {
  const extensions = options.extensions ?? ['vector'];
  for (const name of extensions) {
    if (!IDENTIFIER.test(name)) throw new Error(`Invalid extension name: ${name}`);
  }
  const container = await withDocker(() =>
    new PostgreSqlContainer(resolveImage('postgres', options.image))
      .withDatabase(options.database ?? 'sires_test')
      .withUsername(options.username ?? 'sires')
      .withPassword(options.password ?? 'sires-test')
      .start(),
  );
  try {
    for (const name of extensions) {
      const result = await container.exec([
        'psql', '-v', 'ON_ERROR_STOP=1', '-U', container.getUsername(), '-d', container.getDatabase(),
        '-c', `CREATE EXTENSION IF NOT EXISTS ${name}`,
      ]);
      if (result.exitCode !== 0) throw new Error(`CREATE EXTENSION ${name} failed: ${result.output}`);
    }
  } catch (error) {
    await container.stop();
    throw error;
  }
  return {
    connectionUri: container.getConnectionUri(),
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    username: container.getUsername(),
    password: container.getPassword(),
    containerId: container.getId(),
    container,
    stop: async () => {
      await container.stop();
    },
  };
}
