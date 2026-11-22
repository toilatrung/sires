// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Controller, Get, Module, UseGuards, type DynamicModule } from '@nestjs/common';
import {
  InternalCallers, ServiceAuthGuard, ServiceAuthModule,
  type ServiceAuthOptions, type TenantDatabase,
} from '@sires/platform';
import { SampleService } from './sample.service';

@Controller('internal/sample')
@UseGuards(ServiceAuthGuard)
export class SampleController {
  @Get('ready')
  @InternalCallers('workspace')
  ready(): { ok: true } { return { ok: true }; }
}

@Module({})
export class SampleModule {
  static forRoot(db: TenantDatabase, auth: ServiceAuthOptions): DynamicModule {
    return {
      module: SampleModule,
      imports: [ServiceAuthModule.forRoot(auth)],
      controllers: [SampleController],
      providers: [{ provide: SampleService, useFactory: () => new SampleService(db) }],
      exports: [SampleService],
    };
  }
}
