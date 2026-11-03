// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Controller, type DynamicModule, Get, Inject, Module } from '@nestjs/common';
import type { ServiceManifest } from './manifest';

export const SERVICE_MANIFEST = Symbol('SERVICE_MANIFEST');

export interface HealthStatus {
  service: string;
  status: 'ok';
}

@Controller('health')
export class HealthController {
  constructor(@Inject(SERVICE_MANIFEST) private readonly manifest: ServiceManifest) {}

  @Get()
  check(): HealthStatus {
    return { service: this.manifest.name, status: 'ok' };
  }
}

@Module({})
export class HealthModule {
  static forService(manifest: ServiceManifest): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [{ provide: SERVICE_MANIFEST, useValue: manifest }],
      exports: [SERVICE_MANIFEST],
    };
  }
}
