// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { randomBytes } from 'node:crypto';
import { Body, Controller, Get, Logger, Module, Post } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SpanKind } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { InMemorySpanExporter, type ReadableSpan, SimpleSpanProcessor } from '@opentelemetry/sdk-trace';
import { afterEach, describe, expect, it } from 'vitest';
import { createServiceApp, type ServiceAppOptions } from '../bootstrap';
import { setLogContext } from '../logging/context';
import { uuidv7 } from '../tenancy/uuid';
import { currentTelemetry, exporterFromEnv, REQUEST_ID_ATTRIBUTE } from './telemetry';

@Controller('ping')
class PingController {
  private readonly logger = new Logger('PingController');

  @Get()
  ping(): { ok: true } {
    this.logger.log('xử lý ping');
    return { ok: true };
  }

  /** Route with a JSON body: Fastify reads the body before the handler, after middleware ran (QC G1). */
  @Post('notes')
  note(@Body() body: { accountId: string; projectId: string }): { tagged: boolean } {
    const tagged = setLogContext({ accountId: body.accountId, projectId: body.projectId });
    this.logger.log('ghi note');
    return { tagged };
  }
}

@Module({ controllers: [PingController] })
class PingModule {}

const OTEL_ENV = ['OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', 'OTEL_TRACES_EXPORTER', 'OTEL_SDK_DISABLED'];

type LogRecord = Record<string, unknown>;

// nestjs-pino keeps one pino-http instance per process (the first application's), so every application of this
// file writes to one shared sink; each test reads the lines written since it started.
const lines: string[] = [];
const sink = { write: (line: string) => void lines.push(line) };

async function startApp(options: ServiceAppOptions = {}) {
  lines.length = 0;
  const app: NestFastifyApplication = await createServiceApp(
    PingModule,
    { name: 'sample', port: 0 },
    { ...options, logDestination: sink },
  );
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const logs = () => lines.map((line) => JSON.parse(line) as LogRecord);
  return { app, url, logs };
}

async function waitFor<T>(probe: () => T | undefined, timeoutMs = 3_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('OpenTelemetry cho HTTP', () => {
  let app: NestFastifyApplication | undefined;
  const savedEnv = Object.fromEntries(OTEL_ENV.map((name) => [name, process.env[name]]));

  afterEach(async () => {
    await app?.close();
    app = undefined;
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('span và log cùng mã yêu cầu', async () => {
    const exporter = new InMemorySpanExporter();
    const started = await startApp({ telemetry: { spanProcessor: new SimpleSpanProcessor({ exporter }) } });
    app = started.app;

    const response = await fetch(`${started.url}/ping`);
    expect(response.status).toBe(200);

    const serverSpan = (): ReadableSpan | undefined =>
      exporter.getFinishedSpans().find((span) => span.kind === SpanKind.SERVER);
    const span = await waitFor(serverSpan);
    const requestId = span.attributes[REQUEST_ID_ATTRIBUTE];
    expect(typeof requestId).toBe('string');

    const requestLogs = await waitFor(() => {
      const found = started.logs().filter((log) => log.request_id === requestId);
      return found.some((log) => log.msg === 'request completed') ? found : undefined;
    });
    expect(requestLogs.map((log) => log.msg)).toEqual(expect.arrayContaining(['xử lý ping', 'request completed']));
    for (const log of requestLogs) {
      expect(log.trace_id).toBe(span.spanContext().traceId);
      expect(log.service).toBe('sample');
    }
  });

  it('POST có body giữ log context và mã tương quan (PID-00001-AC06, QC G1)', async () => {
    const exporter = new InMemorySpanExporter();
    const started = await startApp({ telemetry: { spanProcessor: new SimpleSpanProcessor({ exporter }) } });
    app = started.app;
    const accountId = uuidv7();
    const projectId = uuidv7();

    const response = await fetch(`${started.url}/ping/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, projectId, text: 'x'.repeat(64 * 1024) }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ tagged: true });

    const span = await waitFor(() => exporter.getFinishedSpans().find((item) => item.kind === SpanKind.SERVER));
    const log = await waitFor(() => started.logs().find((item) => item.msg === 'ghi note'));
    expect(log).toMatchObject({
      request_id: span.attributes[REQUEST_ID_ATTRIBUTE],
      trace_id: span.spanContext().traceId,
      project_id: projectId,
    });
    expect(log.account_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(started.logs())).not.toContain(accountId);
  });

  it('không ghi query string vào log và span (NFR-OBS-002, QC G2)', async () => {
    const exporter = new InMemorySpanExporter();
    const started = await startApp({ telemetry: { spanProcessor: new SimpleSpanProcessor({ exporter }) } });
    app = started.app;

    const response = await fetch(`${started.url}/ping?code=abc123&token=xyz789&state=s1`);
    expect(response.status).toBe(200);

    const span = await waitFor(() => exporter.getFinishedSpans().find((item) => item.kind === SpanKind.SERVER));
    const log = await waitFor(() => started.logs().find((item) => item.msg === 'request completed'));
    expect(log.req).toEqual({ method: 'GET', url: '/ping' });
    const recorded = JSON.stringify({ logs: started.logs(), attributes: span.attributes, name: span.name });
    for (const value of ['abc123', 'xyz789', 'code=', 'token=']) expect(recorded).not.toContain(value);
    expect(Object.values(span.attributes)).toContain('/ping');
    if (span.attributes['url.query'] !== undefined) expect(span.attributes['url.query']).toBe('[REDACTED]');
  });

  it('dùng lại x-request-id dạng UUID và traceparent của bên gọi', async () => {
    const exporter = new InMemorySpanExporter();
    const started = await startApp({ telemetry: { spanProcessor: new SimpleSpanProcessor({ exporter }) } });
    app = started.app;
    const requestId = uuidv7();
    const traceId = randomBytes(16).toString('hex');
    const parentSpanId = randomBytes(8).toString('hex');

    const response = await fetch(`${started.url}/ping`, {
      headers: { 'x-request-id': requestId, traceparent: `00-${traceId}-${parentSpanId}-01` },
    });
    expect(response.status).toBe(200);

    const span = await waitFor(() => exporter.getFinishedSpans().find((item) => item.kind === SpanKind.SERVER));
    expect(span.attributes[REQUEST_ID_ATTRIBUTE]).toBe(requestId);
    expect(span.spanContext().traceId).toBe(traceId);
    const log = await waitFor(() => started.logs().find((item) => item.msg === 'xử lý ping'));
    expect(log).toMatchObject({ request_id: requestId, trace_id: traceId });

    const forged = await fetch(`${started.url}/ping`, { headers: { 'x-request-id': 'not-a-uuid <script>' } });
    expect(forged.status).toBe(200);
    const forgedSpan = await waitFor(() => exporter.getFinishedSpans().filter((item) => item.kind === SpanKind.SERVER)[1]);
    expect(forgedSpan.attributes[REQUEST_ID_ATTRIBUTE]).not.toBe('not-a-uuid <script>');
  });

  it('chạy khi không có exporter', async () => {
    for (const name of OTEL_ENV) delete process.env[name];
    expect(exporterFromEnv()).toBeUndefined();

    const started = await startApp();
    app = started.app;
    expect(currentTelemetry()?.exporting).toBe(false);

    const response = await fetch(`${started.url}/ping`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const log = await waitFor(() => started.logs().find((item) => item.msg === 'request completed'));
    expect(log.trace_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('chọn exporter theo biến môi trường OTEL_*', () => {
    expect(exporterFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318' })).toBeInstanceOf(OTLPTraceExporter);
    expect(exporterFromEnv({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://otel-collector:4318/v1/traces' })).toBeInstanceOf(
      OTLPTraceExporter,
    );
    expect(exporterFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318', OTEL_TRACES_EXPORTER: 'none' })).toBeUndefined();
    expect(exporterFromEnv({})).toBeUndefined();
  });
});
