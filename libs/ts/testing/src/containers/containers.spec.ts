// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Needs a reachable Docker engine (Linux/WSL2, or DOCKER_HOST). Without Docker these tests fail with
// DockerUnavailableError; they are never skipped (PID-00004 EC01).
import { connect } from 'amqplib';
import { Client as MinioClient } from 'minio';
import { Client as PgClient } from 'pg';
import { getContainerRuntimeClient } from 'testcontainers';
import { describe, expect, it } from 'vitest';
import { startPostgres, startTestStack } from './index';

const CONTAINER_TIMEOUT = 600_000;

async function query<T>(uri: string, sql: string): Promise<T[]> {
  const client = new PgClient({ connectionString: uri });
  await client.connect();
  try {
    return (await client.query(sql)).rows as T[];
  } finally {
    await client.end();
  }
}

async function containerExists(id: string): Promise<boolean> {
  const runtime = await getContainerRuntimeClient();
  try {
    await runtime.container.getById(id).inspect();
    return true;
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) return false;
    throw error;
  }
}

function atLeast(version: string, min: [number, number]): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  return major > min[0] || (major === min[0] && minor >= min[1]);
}

describe('container helper', () => {
  it('khởi động và dọn container (PID-00004-AC01)', { timeout: CONTAINER_TIMEOUT }, async () => {
    const stack = await startTestStack();
    const ids: string[] = [];
    try {
      const { postgres, rabbitmq, minio } = stack;
      if (!postgres || !rabbitmq || !minio) throw new Error('stack incomplete');
      ids.push(postgres.containerId, rabbitmq.containerId, minio.containerId);

      // PostgreSQL 16 with pgvector >= 0.8, usable for vector queries.
      const [server] = await query<{ server_version_num: string }>(postgres.connectionUri, 'SHOW server_version_num');
      expect(server?.server_version_num.startsWith('16')).toBe(true);
      const [vector] = await query<{ extversion: string }>(
        postgres.connectionUri,
        "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
      );
      expect(vector && atLeast(vector.extversion, [0, 8])).toBe(true);
      const [distance] = await query<{ d: number }>(postgres.connectionUri, "SELECT '[1,2,3]'::vector <-> '[1,2,5]'::vector AS d");
      expect(distance?.d).toBe(2);

      // RabbitMQ: publish then read back over AMQP.
      const amqp = await connect(rabbitmq.amqpUrl);
      // Without a listener a server-side close is an uncaught 'error' event; the pending calls reject anyway.
      amqp.on('error', () => undefined);
      try {
        const channel = await amqp.createChannel();
        // RabbitMQ 4 refuses transient non-exclusive queues; an exclusive queue goes away with the connection.
        await channel.assertQueue('pid-00004.smoke', { exclusive: true });
        channel.sendToQueue('pid-00004.smoke', Buffer.from('ping'));
        let message: Awaited<ReturnType<typeof channel.get>> = false;
        for (let i = 0; i < 50 && message === false; i += 1) {
          message = await channel.get('pid-00004.smoke', { noAck: true });
          if (message === false) await new Promise((r) => setTimeout(r, 100));
        }
        expect(message && message.content.toString()).toBe('ping');
        await channel.close();
      } finally {
        await amqp.close();
      }

      // MinIO: bucket, put, get over S3.
      const s3 = new MinioClient({
        endPoint: minio.host,
        port: minio.port,
        useSSL: false,
        accessKey: minio.accessKey,
        secretKey: minio.secretKey,
      });
      await s3.makeBucket('pid-00004-smoke');
      await s3.putObject('pid-00004-smoke', 'hello.txt', Buffer.from('xin chào'));
      const chunks: Buffer[] = [];
      for await (const chunk of await s3.getObject('pid-00004-smoke', 'hello.txt')) chunks.push(chunk as Buffer);
      expect(Buffer.concat(chunks).toString('utf8')).toBe('xin chào');

      // No fixed ports from infra/local/compose.yaml.
      expect([postgres.port, rabbitmq.amqpPort, minio.port]).not.toContain(5432);
      expect([postgres.port, rabbitmq.amqpPort, minio.port]).not.toContain(5672);
      expect([postgres.port, rabbitmq.amqpPort, minio.port]).not.toContain(9000);
    } finally {
      await stack.stop();
    }
    for (const id of ids) expect(await containerExists(id)).toBe(false);
  });

  it('cổng ngẫu nhiên (PID-00004 EC02)', { timeout: CONTAINER_TIMEOUT }, async () => {
    const [a, b] = await Promise.all([startPostgres(), startPostgres()]);
    try {
      expect(a.port).not.toBe(b.port);
      expect([a.port, b.port]).not.toContain(5432);
      await query(a.connectionUri, 'CREATE TABLE only_in_a (id int)');
      const [row] = await query<{ found: string | null }>(b.connectionUri, "SELECT to_regclass('only_in_a') AS found");
      expect(row?.found).toBeNull();
    } finally {
      await Promise.all([a.stop(), b.stop()]);
    }
    expect(await containerExists(a.containerId)).toBe(false);
    expect(await containerExists(b.containerId)).toBe(false);
  });
});
