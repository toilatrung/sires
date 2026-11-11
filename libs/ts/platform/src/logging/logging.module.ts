// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type NestMiddleware,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { ServiceManifest } from '../manifest';
import { runWithLogContext } from './context';
import { createLogger, type LoggerOptions } from './logger';
import { requestIdFor } from './request-id';

/** Opens one log context per HTTP request, so `setLogContext` in a handler only tags that request's logs. */
export class LogContextMiddleware implements NestMiddleware {
  use(_req: IncomingMessage, _res: ServerResponse, next: () => void): void {
    runWithLogContext({}, next);
  }
}

@Module({})
export class LoggingModule implements NestModule {
  /**
   * nestjs-pino over {@link createLogger}: one `request completed` line per request with method, url, status and
   * time only (no headers, no body), `request_id` on every line logged while handling the request.
   */
  static forService(manifest: ServiceManifest, options: Omit<LoggerOptions, 'service'> = {}): DynamicModule {
    const logger = createLogger({ ...options, service: manifest.name });
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            logger,
            genReqId: (req: IncomingMessage) => requestIdFor(req),
            customAttributeKeys: { reqId: 'request_id' },
            quietReqLogger: true,
            serializers: {
              req: (req: { method?: string; url?: string }) => ({ method: req.method, url: req.url }),
              res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
            },
          },
        }),
      ],
      exports: [LoggerModule],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LogContextMiddleware).forRoutes({ path: '{/*splat}', method: RequestMethod.ALL });
  }
}
