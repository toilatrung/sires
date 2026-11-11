// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import type { IncomingMessage } from 'node:http';
import { createRequire } from 'node:module';
import { context, propagation, type Span, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, type SpanExporter, type SpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { requestIdFor } from '../logging/request-id';

// OpenTelemetry for HTTP (architecture 11.4, NFR-OBS-004): one server span per incoming request, W3C traceparent
// in and out, export over OTLP/HTTP when an endpoint is configured. The span carries the request id that the
// logger writes as `request_id`, and the logger reads trace_id/span_id from the active span.

/** Span attribute holding the request id, equal to `request_id` in the logs of the same request. */
export const REQUEST_ID_ATTRIBUTE = 'sires.request_id';

export interface TelemetryOptions {
  serviceName: string;
  /**
   * Exporter to use instead of the environment (tests, custom setups). By default spans go to OTLP/HTTP when
   * `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` or `OTEL_EXPORTER_OTLP_ENDPOINT` is set and `OTEL_TRACES_EXPORTER` is not
   * `none`; otherwise they are created (trace ids still reach the logs) but not exported.
   */
  exporter?: SpanExporter;
  /** Span processor to use instead of a BatchSpanProcessor around the exporter. */
  spanProcessor?: SpanProcessor;
}

export interface Telemetry {
  /** True when spans leave the process. */
  readonly exporting: boolean;
  /** Flushes pending spans and removes the global tracer, propagator, context manager and instrumentation. */
  shutdown(): Promise<void>;
}

let active: Telemetry | undefined;

/** Exporter chosen from the standard OpenTelemetry environment variables, or undefined when none is configured. */
export function exporterFromEnv(env: NodeJS.ProcessEnv = process.env): SpanExporter | undefined {
  if ((env.OTEL_TRACES_EXPORTER ?? '').trim().toLowerCase() === 'none') return undefined;
  const endpoint = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || env.OTEL_EXPORTER_OTLP_ENDPOINT;
  return endpoint ? new OTLPTraceExporter() : undefined;
}

/**
 * Starts tracing for this process; later calls return the running instance. `OTEL_SDK_DISABLED=true` turns
 * tracing off. Call it before the HTTP server module is loaded; modules loaded earlier are patched by requiring
 * them again here, so the order inside bootstrapService does not matter.
 */
export function startTelemetry(options: TelemetryOptions): Telemetry {
  if (active) return active;
  if ((process.env.OTEL_SDK_DISABLED ?? '').trim().toLowerCase() === 'true') {
    return { exporting: false, shutdown: async () => undefined };
  }

  const exporter = options.exporter ?? exporterFromEnv();
  const processor = options.spanProcessor ?? (exporter ? new BatchSpanProcessor({ exporter }) : undefined);
  const provider = new TracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: options.serviceName }),
    spanProcessors: processor ? [processor] : [],
  });
  const contextManager = new AsyncLocalStorageContextManager().enable();
  context.setGlobalContextManager(contextManager);
  propagation.setGlobalPropagator(
    new CompositePropagator({ propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()] }),
  );
  trace.setGlobalTracerProvider(provider);
  const instrumentation = enableHttpInstrumentation(provider);

  const telemetry: Telemetry = {
    exporting: processor !== undefined,
    shutdown: async () => {
      if (active !== telemetry) return;
      active = undefined;
      try {
        await provider.shutdown();
      } finally {
        instrumentation.disable();
        trace.disable();
        propagation.disable();
        context.disable();
      }
    },
  };
  active = telemetry;
  return telemetry;
}

/** The running telemetry, if any. */
export function currentTelemetry(): Telemetry | undefined {
  return active;
}

let httpInstrumentation: HttpInstrumentation | undefined;

/**
 * One HTTP instrumentation per process. Module hooks keep the first patched module, so a second instance would
 * never patch again; a restart (another app in the same process) reuses the instance with the new provider.
 */
function enableHttpInstrumentation(provider: TracerProvider): HttpInstrumentation {
  if (httpInstrumentation) {
    httpInstrumentation.setTracerProvider(provider);
    httpInstrumentation.enable();
    return httpInstrumentation;
  }
  httpInstrumentation = new HttpInstrumentation({
    requestHook: (span: Span, request) => {
      if (isIncoming(request)) span.setAttribute(REQUEST_ID_ATTRIBUTE, requestIdFor(request));
    },
  });
  registerInstrumentations({ tracerProvider: provider, instrumentations: [httpInstrumentation] });
  // Instrumentation patches a module when it is required. Require the HTTP modules once more so that servers built
  // from modules loaded before this call are traced too.
  const load = createRequire(__filename);
  load('node:http');
  load('node:https');
  return httpInstrumentation;
}

function isIncoming(request: unknown): request is IncomingMessage {
  return typeof request === 'object' && request !== null && 'headers' in request && !('setHeader' in request);
}
