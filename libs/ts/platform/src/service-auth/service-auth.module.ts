// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { type DynamicModule, type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import type { ServiceName } from './claims';
import { ServiceTokenClient } from './client';
import { ServiceAuthContextMiddleware } from './context';
import { SERVICE_AUTH_OPTIONS, ServiceAuthGuard, type ServiceAuthOptions } from './guard';
import { serviceAuthKeysFromEnv } from './keys';

@Module({})
export class ServiceAuthModule implements NestModule {
  /**
   * Internal authentication for one service (global): ServiceAuthGuard for `@UseGuards` on internal controllers,
   * ServiceTokenClient for outgoing calls, and the per-request caller holder read by `currentServiceAuth()`.
   */
  static forRoot(options: ServiceAuthOptions): DynamicModule {
    if (options.signer.service !== options.service) {
      throw new TypeError(`ServiceAuthModule: signer of “${options.signer.service}” given to “${options.service}”`);
    }
    return {
      module: ServiceAuthModule,
      global: true,
      providers: [{ provide: SERVICE_AUTH_OPTIONS, useValue: options }, ServiceAuthGuard, ServiceTokenClient],
      exports: [SERVICE_AUTH_OPTIONS, ServiceAuthGuard, ServiceTokenClient],
    };
  }

  /** {@link forRoot} with keys from SERVICE_AUTH_PRIVATE_KEY and SERVICE_AUTH_PUBLIC_KEYS, or SERVICE_AUTH_DEV_SEED. */
  static fromEnv(service: ServiceName, env: NodeJS.ProcessEnv = process.env): DynamicModule {
    return ServiceAuthModule.forRoot({ service, ...serviceAuthKeysFromEnv(service, env) });
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ServiceAuthContextMiddleware).forRoutes({ path: '{/*splat}', method: RequestMethod.ALL });
  }
}
