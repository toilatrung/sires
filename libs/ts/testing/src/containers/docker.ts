// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { getContainerRuntimeClient } from 'testcontainers';

/** Thrown when no Docker engine is reachable; tests must fail with this, never pass silently (PID-00004 EC01). */
export class DockerUnavailableError extends Error {
  override readonly name = 'DockerUnavailableError';

  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      'Docker is required for @sires/testing containers but no Docker engine is reachable. ' +
        'Start Docker (Linux/WSL2) or set DOCKER_HOST (e.g. tcp://localhost:2375 for Docker inside WSL2). ' +
        `Cause: ${detail}`,
      { cause },
    );
  }
}

/** Resolves when a Docker engine answers; otherwise rejects with DockerUnavailableError. */
export async function assertDockerAvailable(): Promise<void> {
  try {
    await getContainerRuntimeClient();
  } catch (error) {
    throw new DockerUnavailableError(error);
  }
}

/** Runs a container start and turns "no Docker" failures into DockerUnavailableError. */
export async function withDocker<T>(start: () => Promise<T>): Promise<T> {
  await assertDockerAvailable();
  return start();
}
