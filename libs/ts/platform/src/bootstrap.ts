// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import 'reflect-metadata';
import {
  type DynamicModule,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
  type Type,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger as PinoNestLogger } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { LoggingModule } from './logging/logging.module';
import { type RequestLike, requestIdFor } from './logging/request-id';
import type { ServiceManifest } from './manifest';
import { currentTelemetry, startTelemetry, type TelemetryOptions } from './telemetry/telemetry';

export interface ServiceAppOptions {
  /** Log destination instead of stdout. */
  logDestination?: DestinationStream;
  /** Telemetry overrides; by default the exporter follows the OTEL_* environment variables. */
  telemetry?: Omit<TelemetryOptions, 'serviceName'>;
}

/** Flushes and stops tracing when the application closes. */
@Injectable()
class TelemetryShutdown implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await currentTelemetry()?.shutdown();
  }
}

@Module({})
class ServiceRootModule {
  static for(rootModule: Type<unknown>, manifest: ServiceManifest, logDestination?: DestinationStream): DynamicModule {
    return {
      module: ServiceRootModule,
      imports: [LoggingModule.forService(manifest, { destination: logDestination }), rootModule],
      providers: [TelemetryShutdown],
    };
  }
}

/**
 * Builds a NestJS service on the Fastify adapter (architecture 2.3) without listening: OpenTelemetry started
 * first, the redacting pino logger as the application logger, one log context and one request id per request.
 */
export async function createServiceApp(
  rootModule: Type<unknown>,
  manifest: ServiceManifest,
  options: ServiceAppOptions = {},
): Promise<NestFastifyApplication> {
  startTelemetry({ ...options.telemetry, serviceName: manifest.name });
  // Loaded after tracing starts so that the HTTP server is instrumented.
  const { FastifyAdapter } = await import('@nestjs/platform-fastify');
  const app = await NestFactory.create<NestFastifyApplication>(
    ServiceRootModule.for(rootModule, manifest, options.logDestination),
    // Fastify copies its request id onto the raw request seen by middleware: use the same id as span and logs.
    new FastifyAdapter({ genReqId: (req: RequestLike) => requestIdFor(req) }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(PinoNestLogger));
  return app;
}

/** Starts a NestJS service on PORT or the manifest port, on all interfaces. */
export async function bootstrapService(rootModule: Type<unknown>, manifest: ServiceManifest): Promise<void> {
  const app = await createServiceApp(rootModule, manifest);
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? manifest.port);
  await app.listen(port, '0.0.0.0');
  new Logger(manifest.name).log(`listening on :${port}`);
}
