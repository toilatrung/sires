// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { assertDockerAvailable } from './docker';
import { startMinio, type MinioOptions, type StartedMinio } from './minio';
import { startPostgres, type PostgresOptions, type StartedPostgres } from './postgres';
import { startRabbitMq, type RabbitMqOptions, type StartedRabbitMq } from './rabbitmq';

export { assertDockerAvailable, DockerUnavailableError } from './docker';
export { DEFAULT_IMAGES } from './images';
export { startMinio, type MinioOptions, type StartedMinio } from './minio';
export { startPostgres, type PostgresOptions, type StartedPostgres } from './postgres';
export { startRabbitMq, type RabbitMqOptions, type StartedRabbitMq } from './rabbitmq';

export interface TestStackOptions {
  /** `false` skips the container; an object passes options. All three start by default. */
  postgres?: PostgresOptions | false;
  rabbitmq?: RabbitMqOptions | false;
  minio?: MinioOptions | false;
}

export interface TestStack {
  readonly postgres?: StartedPostgres;
  readonly rabbitmq?: StartedRabbitMq;
  readonly minio?: StartedMinio;
  /** Stops and removes every container of the stack. */
  stop(): Promise<void>;
}

interface Stoppable {
  stop(): Promise<void>;
}

async function stopAll(started: readonly Stoppable[]): Promise<void> {
  const results = await Promise.allSettled(started.map((c) => c.stop()));
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length > 0) {
    throw new AggregateError(failures.map((f) => f.reason), 'Failed to stop test containers');
  }
}

/**
 * Starts PostgreSQL 16 + pgvector, RabbitMQ and MinIO in parallel, each on random host ports so two suites never
 * collide. If one fails to start, the others are stopped before the error is rethrown.
 */
export async function startTestStack(options: TestStackOptions = {}): Promise<TestStack> {
  await assertDockerAvailable();
  const [postgres, rabbitmq, minio] = await Promise.allSettled([
    options.postgres === false ? Promise.resolve(undefined) : startPostgres(options.postgres),
    options.rabbitmq === false ? Promise.resolve(undefined) : startRabbitMq(options.rabbitmq),
    options.minio === false ? Promise.resolve(undefined) : startMinio(options.minio),
  ]);
  const settled = [postgres, rabbitmq, minio];
  const started = settled.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
  const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) {
    await stopAll(started).catch(() => undefined);
    throw failed.reason;
  }
  return {
    postgres: postgres.status === 'fulfilled' ? postgres.value : undefined,
    rabbitmq: rabbitmq.status === 'fulfilled' ? rabbitmq.value : undefined,
    minio: minio.status === 'fulfilled' ? minio.value : undefined,
    stop: () => stopAll(started),
  };
}
