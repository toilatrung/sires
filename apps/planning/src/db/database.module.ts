// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Kết nối database của planning (PID-00023 S07): hai Drizzle database trên node-postgres, một cho vai trò _app
// (request; ghi qua withAccountTransaction của @sires/platform để RLS áp theo tài khoản) và một cho _system
// (consumer, job). Không có repository nghiệp vụ: PID tính năng viết. Pool mở kết nối khi có truy vấn đầu tiên và
// đóng khi ứng dụng dừng.

import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { TenantDatabase } from '@sires/platform';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { type DatabaseConfig, loadDatabaseConfig } from '../config/database.config';

/** Token của Drizzle database vai trò _app (dùng với withAccountTransaction). */
export const APP_DB = Symbol('planning.appDb');
/** Token của Drizzle database vai trò _system. */
export const SYSTEM_DB = Symbol('planning.systemDb');
/** Token của cấu hình đã kiểm. */
export const DATABASE_CONFIG = Symbol('planning.databaseConfig');
const POOLS = Symbol('planning.pools');

interface Pools {
  readonly app: Pool;
  readonly system: Pool;
}

@Global()
@Module({
  providers: [
    // Kiểm cấu hình khi khởi động: thiếu biến thì service không lên (DatabaseConfigError).
    { provide: DATABASE_CONFIG, useFactory: (): DatabaseConfig => loadDatabaseConfig() },
    {
      provide: POOLS,
      inject: [DATABASE_CONFIG],
      useFactory: (config: DatabaseConfig): Pools => ({
        app: new Pool({ connectionString: config.appUrl, max: config.poolMax, application_name: 'planning-app' }),
        system: new Pool({ connectionString: config.systemUrl, max: config.poolMax, application_name: 'planning-system' }),
      }),
    },
    { provide: APP_DB, inject: [POOLS], useFactory: (pools: Pools): TenantDatabase => drizzle(pools.app) },
    { provide: SYSTEM_DB, inject: [POOLS], useFactory: (pools: Pools): TenantDatabase => drizzle(pools.system) },
  ],
  exports: [APP_DB, SYSTEM_DB, DATABASE_CONFIG],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(POOLS) private readonly pools: Pools) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.pools.app.end(), this.pools.system.end()]);
  }
}
