// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

/**
 * Default images. PostgreSQL and RabbitMQ follow infra/local/compose.yaml. MinIO: Docker Hub `minio/minio`
 * no longer exists, so the default is the Chainguard build; the PO decides the final source (report PID-00004).
 * Each one can be overridden per call or with SIRES_TEST_{POSTGRES,RABBITMQ,MINIO}_IMAGE.
 */
export const DEFAULT_IMAGES = {
  postgres: 'pgvector/pgvector:pg16',
  rabbitmq: 'rabbitmq:4-management',
  minio: 'cgr.dev/chainguard/minio:latest',
} as const;

export type ImageKey = keyof typeof DEFAULT_IMAGES;

const ENV_KEYS: Record<ImageKey, string> = {
  postgres: 'SIRES_TEST_POSTGRES_IMAGE',
  rabbitmq: 'SIRES_TEST_RABBITMQ_IMAGE',
  minio: 'SIRES_TEST_MINIO_IMAGE',
};

/** Explicit option first, then the environment override, then the default. */
export function resolveImage(key: ImageKey, explicit?: string): string {
  return explicit ?? process.env[ENV_KEYS[key]] ?? DEFAULT_IMAGES[key];
}
