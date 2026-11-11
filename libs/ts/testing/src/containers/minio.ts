// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { MinioContainer, type StartedMinioContainer } from '@testcontainers/minio';
import { withDocker } from './docker';
import { resolveImage } from './images';

export interface MinioOptions {
  /** Defaults to DEFAULT_IMAGES.minio; see images.ts. */
  image?: string;
  accessKey?: string;
  secretKey?: string;
}

export interface StartedMinio {
  /** S3 endpoint http://host:port on a random host port (path-style, no TLS). */
  readonly endpoint: string;
  readonly host: string;
  readonly port: number;
  readonly accessKey: string;
  readonly secretKey: string;
  readonly containerId: string;
  readonly container: StartedMinioContainer;
  /** Stops and removes the container. */
  stop(): Promise<void>;
}

/** Starts a MinIO server on a random host port. */
export async function startMinio(options: MinioOptions = {}): Promise<StartedMinio> {
  const accessKey = options.accessKey ?? 'sires';
  const secretKey = options.secretKey ?? 'sires-test-secret';
  const container = await withDocker(() =>
    new MinioContainer(resolveImage('minio', options.image))
      .withUsername(accessKey)
      .withPassword(secretKey)
      .withStartupTimeout(120_000)
      .start(),
  );
  return {
    endpoint: container.getConnectionUrl(),
    host: container.getHost(),
    port: container.getPort(),
    accessKey,
    secretKey,
    containerId: container.getId(),
    container,
    stop: async () => {
      await container.stop();
    },
  };
}
