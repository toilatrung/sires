// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import 'reflect-metadata';
import { Logger, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { ServiceManifest } from './manifest';

/** Starts a NestJS service on PORT or the manifest port. */
export async function bootstrapService(rootModule: Type<unknown>, manifest: ServiceManifest): Promise<void> {
  const app = await NestFactory.create(rootModule);
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? manifest.port);
  await app.listen(port);
  new Logger(manifest.name).log(`listening on :${port}`);
}
