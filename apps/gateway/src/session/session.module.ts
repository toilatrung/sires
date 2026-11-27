// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { csrfKeyFromEnv } from './session.crypto';
import { SessionGuard } from './session.guard';
import { SessionActivityInterceptor } from './session.interceptor';
import { SESSION_OPTIONS, SessionService, type SessionOptions } from './session.service';

@Module({
  providers: [
    {
      provide: SESSION_OPTIONS,
      useFactory: (): SessionOptions => {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) throw new Error('DATABASE_URL is required for the gateway app role');
        return { databaseUrl, csrfKey: csrfKeyFromEnv() };
      },
    },
    SessionService,
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_INTERCEPTOR, useClass: SessionActivityInterceptor },
  ],
  exports: [SessionService],
})
export class SessionModule {}
