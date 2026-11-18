// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { withDocker } from './docker';
import { resolveImage } from './images';

export interface RabbitMqOptions {
  /** Defaults to rabbitmq:4-management (same as infra/local/compose.yaml). */
  image?: string;
}

export interface StartedRabbitMq {
  /** amqp://guest:guest@host:port on a random host port. */
  readonly amqpUrl: string;
  /** Management HTTP API base URL (http://host:port), user guest/guest. */
  readonly managementUrl: string;
  readonly host: string;
  readonly amqpPort: number;
  readonly containerId: string;
  readonly container: StartedRabbitMQContainer;
  /** Stops and removes the container. */
  stop(): Promise<void>;
}

const AMQP_PORT = 5672;
const MANAGEMENT_PORT = 15672;

/** Starts RabbitMQ on random host ports. */
export async function startRabbitMq(options: RabbitMqOptions = {}): Promise<StartedRabbitMq> {
  const container = await withDocker(() =>
    new RabbitMQContainer(resolveImage('rabbitmq', options.image)).withStartupTimeout(120_000).start(),
  );
  const host = container.getHost();
  const amqpPort = container.getMappedPort(AMQP_PORT);
  return {
    amqpUrl: `amqp://guest:guest@${host}:${amqpPort}`,
    managementUrl: `http://${host}:${container.getMappedPort(MANAGEMENT_PORT)}`,
    host,
    amqpPort,
    containerId: container.getId(),
    container,
    stop: async () => {
      await container.stop();
    },
  };
}
