// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Body, Controller, Get, Module, NotFoundException, Post, PreconditionFailedException } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServiceApp } from '../bootstrap';
import { PreconditionRequiredException } from '../tenancy/concurrency';
import { uuidv7 } from '../tenancy/uuid';
import { ERROR_STATUS, isErrorCode, PROBLEM_TYPE_BASE } from './catalog';
import { ProblemException } from './problem.exception';
import { toProblem } from './problem.filter';

const SECRET = 'sk-ant-api03-ZXhhbXBsZVNlY3JldEtleUZvclRlc3RzT25seQ';

@Controller('err')
class ErrorController {
  @Get('declared')
  declared(): never {
    throw new ProblemException('invalid_transition', {
      title: 'Chuyển trạng thái không hợp lệ',
      detail: 'Plan Version đã Approved',
      currentState: 'Approved',
    });
  }

  @Get('stale')
  stale(): never {
    throw new PreconditionFailedException('If-Match không khớp rowVersion hiện hành');
  }

  @Get('missing-if-match')
  missingIfMatch(): never {
    throw new PreconditionRequiredException();
  }

  @Get('not-found')
  notFound(): never {
    throw new NotFoundException('Project 42 thuộc tài khoản khác');
  }

  @Get('crash')
  crash(): never {
    throw new Error(`kết nối database lỗi với key ${SECRET} tại /srv/app/secret.ts:12`);
  }

  @Get('throws-string')
  throwsString(): never {
    throw 'chuỗi lỗi lạ';
  }

  @Post('echo')
  echo(@Body() body: unknown): unknown {
    return body;
  }
}

@Module({ controllers: [ErrorController] })
class ErrorModule {}

const lines: string[] = [];
let app: NestFastifyApplication;
let url: string;

beforeAll(async () => {
  app = await createServiceApp(ErrorModule, { name: 'errors-test', port: 0 }, {
    logDestination: { write: (line: string) => void lines.push(line) },
  });
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

async function call(path: string, init: RequestInit = {}) {
  const requestId = uuidv7();
  const res = await fetch(`${url}${path}`, { ...init, headers: { 'x-request-id': requestId, ...init.headers } });
  const text = await res.text();
  return { res, requestId, text, body: JSON.parse(text) as Record<string, unknown> };
}

describe('ProblemJsonFilter', () => {
  it('problem json và lỗi không khai báo (PID-00001-AC04)', async () => {
    // Declared error: its own code, the catalogue status, RFC 9457 fields, the request id as correlationId.
    const declared = await call('/err/declared');
    expect(declared.res.status).toBe(409);
    expect(declared.res.headers.get('content-type')).toMatch(/^application\/problem\+json/);
    expect(declared.body).toEqual({
      type: `${PROBLEM_TYPE_BASE}invalid_transition`,
      title: 'Chuyển trạng thái không hợp lệ',
      status: 409,
      code: 'invalid_transition',
      detail: 'Plan Version đã Approved',
      currentState: 'Approved',
      correlationId: declared.requestId,
    });

    // Undeclared error: 500 internal_error, no stack, no internal message, no secret.
    const crash = await call('/err/crash');
    expect(crash.res.status).toBe(500);
    expect(crash.body).toEqual({
      type: `${PROBLEM_TYPE_BASE}internal_error`,
      title: 'Lỗi hệ thống',
      status: 500,
      code: 'internal_error',
      correlationId: crash.requestId,
    });
    for (const leak of ['database', SECRET, 'secret.ts', 'at ', 'stack']) expect(crash.text).not.toContain(leak);

    // The log keeps the cause for the correlation id, with the key masked (NFR-OBS-002).
    const logged = lines.map((line) => JSON.parse(line) as Record<string, unknown>).filter((l) => l['msg'] === 'lỗi không khai báo');
    expect(logged.at(-1)).toMatchObject({ level: 50, code: 'internal_error', request_id: crash.requestId });
    expect(JSON.stringify(logged.at(-1))).toContain('kết nối database lỗi');
    expect(lines.join('\n')).not.toContain(SECRET);

    // A thrown non-Error is undeclared as well.
    expect((await call('/err/throws-string')).body).toMatchObject({ status: 500, code: 'internal_error' });
  });

  it('mã lỗi thuộc danh mục (NFR-OBS-005-AC01)', async () => {
    const cases: Array<[string, RequestInit, number, string]> = [
      ['/err/declared', {}, 409, 'invalid_transition'],
      ['/err/stale', {}, 412, 'precondition_failed'],
      ['/err/missing-if-match', {}, 428, 'precondition_required'],
      ['/err/not-found', {}, 404, 'not_found'],
      ['/khong-co-route', {}, 404, 'not_found'],
      ['/err/crash', {}, 500, 'internal_error'],
      // Errors raised by Fastify before the handler go through the same filter.
      ['/err/echo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":' }, 400, 'validation_failed'],
      [
        '/err/echo',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ a: 'x'.repeat(2_000_000) }) },
        413,
        'payload_too_large',
      ],
    ];
    for (const [path, init, status, code] of cases) {
      const { res, body, requestId } = await call(path, init);
      expect({ path, status: res.status, code: body['code'] }).toEqual({ path, status, code });
      expect(isErrorCode(body['code'])).toBe(true);
      expect(body['status']).toBe(ERROR_STATUS[body['code'] as keyof typeof ERROR_STATUS]);
      expect(body['type']).toBe(`${PROBLEM_TYPE_BASE}${code}`);
      expect(body['correlationId']).toBe(requestId);
      expect(res.headers.get('content-type')).toMatch(/^application\/problem\+json/);
    }
  });

  it('lỗi HTTP không có mã trong danh mục thành internal_error', () => {
    const teapot = Object.assign(new Error('unsupported media type'), { statusCode: 415 });
    expect(toProblem(teapot, 'r1')).toMatchObject({ status: 500, undeclared: true, body: { code: 'internal_error' } });
    expect(toProblem(new ProblemException('internal_error'), 'r2')).toMatchObject({ status: 500, undeclared: true });
  });
});
