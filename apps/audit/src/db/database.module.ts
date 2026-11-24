// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { withAccountTransaction, type TenantTransaction } from '@sires/platform';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { AUDIT_DATABASE_CONFIG, type AuditDatabaseConfig, readDatabaseConfig } from '../config/database';

@Injectable()
export class AuditDatabase implements OnApplicationShutdown {
  private readonly appPool: Pool;
  private readonly systemPool: Pool;
  private readonly app;
  readonly system;

  constructor(@Inject(AUDIT_DATABASE_CONFIG) config: AuditDatabaseConfig) {
    this.appPool = new Pool({ connectionString: config.appUrl });
    this.systemPool = new Pool({ connectionString: config.systemUrl });
    this.app = drizzle(this.appPool);
    this.system = drizzle(this.systemPool);
  }

  forAccount<T>(accountId: string, work: (tx: TenantTransaction) => Promise<T>): Promise<T> {
    return withAccountTransaction(this.app, accountId, work);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.appPool.end(), this.systemPool.end()]);
  }
}

@Module({
  providers: [
    { provide: AUDIT_DATABASE_CONFIG, useFactory: () => readDatabaseConfig() },
    AuditDatabase,
  ],
  exports: [AuditDatabase],
})
export class DatabaseModule {}
