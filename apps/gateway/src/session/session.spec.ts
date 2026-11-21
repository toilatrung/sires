// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import 'reflect-metadata';
import { Controller, Delete, Get, Module, Patch, Post, Put, Req } from '@nestjs/common';
import { createServiceApp, ProblemException, uuidv7 } from '@sires/platform';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { startGatewayDatabase, type GatewayDatabase } from '../db/database.testkit';
import { manifest } from '../manifest';
import { csrfKeyFromEnv, hashToken, newSessionId, sessionCookie, sessionIdFromCookie } from './session.crypto';
import { type SessionRequest } from './session.guard';
import { SessionService } from './session.service';

let handlerCalls = 0;

/** These routes exist only inside the test. No business/auth endpoint is implemented in PH-01. */
@Controller()
class TestController {
  @Get('read') read(@Req() req: SessionRequest) {
    return { accountId: req.accountId };
  }
  @Get('events') events() {
    return { ok: true };
  }
  @Get('auth/session') getSession() {
    return { ok: true };
  }
  @Get('auth/login') login() {
    return { ok: true };
  }
  @Get('auth/callback') callback() {
    return { ok: true };
  }
  @Post('write') post() {
    handlerCalls++;
    return { ok: true };
  }
  @Put('write') put() {
    handlerCalls++;
    return { ok: true };
  }
  @Patch('write') patch() {
    handlerCalls++;
    return { ok: true };
  }
  @Delete('write') delete() {
    handlerCalls++;
    return { ok: true };
  }
  @Post('denied') denied() {
    throw new ProblemException('forbidden');
  }
}

@Module({ imports: [AppModule], controllers: [TestController] })
class TestAppModule {}

describe('gateway session — HTTP Fastify và PostgreSQL 16 thật', () => {
  let database: GatewayDatabase;
  let app: Awaited<ReturnType<typeof createServiceApp>>;
  let sessions: SessionService;
  const logLines: string[] = [];
  const key = Buffer.alloc(32, 19);
  const accountId = uuidv7();
  const oneHour = 60 * 60 * 1000;
  const expires = () => new Date(Date.now() + 48 * oneHour);
  const cookie = (sid: string) => `sires_session=${sid}`;
  type Issued = Awaited<ReturnType<SessionService['create']>>;
  const issue = () => sessions.create({ accountId, absoluteExpiresAt: expires() });
  const activity = async (issued: Issued) =>
    (
      await database.admin.query('select last_seen_at, idle_expires_at from app.session where id=$1', [
        issued.session.id,
      ])
    ).rows[0];
  const age = async (issued: Issued, hours = 2) =>
    database.admin.query(
      "update app.session set last_seen_at=now()-$2*interval '1 hour',idle_expires_at=now()+(12-$2)*interval '1 hour' where id=$1",
      [issued.session.id, hours],
    );

  beforeAll(async () => {
    database = await startGatewayDatabase();
    vi.stubEnv('DATABASE_URL', database.appUrl);
    vi.stubEnv('GATEWAY_CSRF_KEY', key.toString('hex'));
    vi.stubEnv('OTEL_TRACES_EXPORTER', 'none');
    app = await createServiceApp(TestAppModule, manifest, {
      logDestination: {
        write: (line: string) => {
          logLines.push(line);
        },
      },
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    sessions = app.get(SessionService);
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    await database?.stop();
    vi.unstubAllEnvs();
  }, 60_000);

  it('không có phiên (NFR-AUTH-001-AC01, EC02)', async () => {
    const response = await app.inject({ method: 'GET', url: '/read' });
    expect(response.statusCode).toBe(401);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ status: 401, code: 'unauthenticated' });
    expect(response.json()).not.toHaveProperty('accountId');
  });

  it('cookie lạ (EC03): id không tồn tại, sai định dạng và cookie trùng', async () => {
    for (const header of ['sires_session=???', cookie(newSessionId()), 'sires_session=a; sires_session=b']) {
      const response = await app.inject({ method: 'GET', url: '/read', headers: { cookie: header } });
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('unauthenticated');
    }
  });

  it('phiên đã thu hồi (EC04)', async () => {
    const issued = await issue();
    await database.admin.query("update app.session set revoked_at=now(),revoke_reason='logout' where id=$1", [
      issued.session.id,
    ]);
    expect(
      (await app.inject({ method: 'GET', url: '/read', headers: { cookie: cookie(issued.sessionId) } })).statusCode,
    ).toBe(401);
  });

  it('quá hạn tuyệt đối (EC05)', async () => {
    const issued = await issue();
    await database.admin.query("update app.session set absolute_expires_at=now()-interval '1 second' where id=$1", [
      issued.session.id,
    ]);
    const before = await activity(issued);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/write',
          headers: { cookie: cookie(issued.sessionId), 'x-csrf-token': issued.csrfToken },
        })
      ).statusCode,
    ).toBe(401);
    expect(await activity(issued)).toEqual(before);
  });

  it('hết hạn sau 12 giờ không hoạt động (PID-00014-AC01)', async () => {
    const issued = await issue();
    await age(issued, 13);
    const before = await activity(issued);
    const response = await app.inject({
      method: 'POST',
      url: '/write',
      headers: { cookie: cookie(issued.sessionId), 'x-csrf-token': issued.csrfToken },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('unauthenticated');
    expect(await activity(issued)).toEqual(before);
    await age(issued, 11);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/write',
          headers: { cookie: cookie(issued.sessionId), 'x-csrf-token': issued.csrfToken },
        })
      ).statusCode,
    ).toBe(201);
    const after = await activity(issued);
    expect(after.last_seen_at.getTime()).toBeGreaterThan(before.last_seen_at.getTime());
    expect(after.idle_expires_at.getTime() - after.last_seen_at.getTime()).toBe(12 * oneHour);
  });

  it('biên 12 giờ (EC06): ngay tại hạn cũng từ chối và không hồi sinh', async () => {
    const issued = await issue();
    await database.admin.query('update app.session set idle_expires_at=now() where id=$1', [issued.session.id]);
    const before = await activity(issued);
    for (const url of ['/read', '/auth/session']) {
      expect((await app.inject({ method: 'GET', url, headers: { cookie: cookie(issued.sessionId) } })).statusCode).toBe(
        401,
      );
    }
    expect(await activity(issued)).toEqual(before);
  });

  it('hai tab dùng chung phiên (EC01)', async () => {
    const issued = await issue();
    await age(issued);
    const results = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: 'POST',
          url: '/write',
          headers: { cookie: cookie(issued.sessionId), 'x-csrf-token': issued.csrfToken },
        }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual([201, 201]);
    expect(
      (
        await database.admin.query('select count(*)::int as n from app.session where sid_hash=$1', [
          hashToken(issued.sessionId),
        ])
      ).rows[0].n,
    ).toBe(1);
    const after = await activity(issued);
    expect(after.idle_expires_at.getTime() - after.last_seen_at.getTime()).toBe(12 * oneHour);
  });

  it('SSE không gia hạn (EC07)', async () => {
    const issued = await issue();
    await age(issued);
    const before = await activity(issued);
    expect(
      (await app.inject({ method: 'GET', url: '/events', headers: { cookie: cookie(issued.sessionId) } })).statusCode,
    ).toBe(200);
    expect(await activity(issued)).toEqual(before);
  });

  it('route công khai (EC08)', async () => {
    for (const url of ['/health', '/auth/login', '/auth/callback']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    }
  });

  it('lệnh ghi thiếu CSRF bị từ chối (PID-00014-AC02), có token đúng đi qua', async () => {
    const issued = await issue();
    await age(issued);
    const before = await activity(issued);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const calls = handlerCalls;
      const rejected = await app.inject({ method, url: '/write', headers: { cookie: cookie(issued.sessionId) } });
      expect(rejected.statusCode).toBe(403);
      expect(rejected.headers['content-type']).toContain('application/problem+json');
      expect(rejected.json().code).toBe('forbidden');
      expect(handlerCalls).toBe(calls);
      expect(await activity(issued)).toEqual(before);
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      expect(
        (
          await app.inject({
            method,
            url: '/write',
            headers: { cookie: cookie(issued.sessionId), 'x-csrf-token': issued.csrfToken },
          })
        ).statusCode,
      ).toBe(method === 'POST' ? 201 : 200);
    }
  });

  it('CSRF sai (EC09) và handler từ chối không gia hạn', async () => {
    const issued = await issue();
    await age(issued);
    const before = await activity(issued);
    const calls = handlerCalls;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/write',
          headers: { cookie: cookie(issued.sessionId), 'x-csrf-token': 'wrong-csrf' },
        })
      ).statusCode,
    ).toBe(403);
    expect(handlerCalls).toBe(calls);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/denied',
          headers: { cookie: cookie(issued.sessionId), 'x-csrf-token': issued.csrfToken },
        })
      ).statusCode,
    ).toBe(403);
    expect(await activity(issued)).toEqual(before);
  });

  it('GET không cần CSRF (EC10), HEAD không cần CSRF', async () => {
    const issued = await issue();
    for (const method of ['GET', 'HEAD'] as const) {
      const response = await app.inject({ method, url: '/read', headers: { cookie: cookie(issued.sessionId) } });
      expect(response.statusCode).toBe(200);
      if (method === 'GET') expect(response.json().accountId).toBe(accountId);
    }
  });

  it('lệnh ghi không có phiên (EC11)', async () => {
    for (const header of [{}, { 'x-csrf-token': 'present-but-no-session' }]) {
      const response = await app.inject({ method: 'POST', url: '/write', headers: header });
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('unauthenticated');
    }
  });

  it('GET /auth/session gia hạn, GET khác không (EC14)', async () => {
    const issued = await issue();
    await age(issued);
    const before = await activity(issued);
    for (let i = 0; i < 3; i++) {
      expect(
        (await app.inject({ method: 'GET', url: '/read?poll=1', headers: { cookie: cookie(issued.sessionId) } }))
          .statusCode,
      ).toBe(200);
    }
    expect(await activity(issued)).toEqual(before);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/auth/session?navigation=1',
          headers: { cookie: cookie(issued.sessionId) },
        })
      ).statusCode,
    ).toBe(200);
    const after = await activity(issued);
    expect(after.last_seen_at.getTime()).toBeGreaterThan(before.last_seen_at.getTime());
    expect(after.idle_expires_at.getTime() - after.last_seen_at.getTime()).toBe(12 * oneHour);
  });

  it('tạo phiên rồi gọi lệnh ghi với CSRF token được cấp; database chỉ lưu băm', async () => {
    const issued = await sessions.create({
      accountId,
      absoluteExpiresAt: expires(),
      oidcSid: 'oidc-example',
      refreshTokenEnc: Buffer.from('encrypted'),
      userAgentHash: hashToken('agent'),
    });
    expect(issued.session.sidHash).toEqual(hashToken(issued.sessionId));
    expect(issued.session.csrfTokenHash).toEqual(hashToken(issued.csrfToken));
    expect(issued.session.oidcSid).toBe('oidc-example');
    expect(issued.session.refreshTokenEnc).toEqual(Buffer.from('encrypted'));
    expect(issued.session.userAgentHash).toEqual(hashToken('agent'));
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/write',
          headers: { cookie: cookie(issued.sessionId), 'x-csrf-token': issued.csrfToken },
        })
      ).statusCode,
    ).toBe(201);
  });

  it('hai tab dùng chung CSRF token của phiên (EC15)', async () => {
    const issued = await issue();
    const tokens = [sessions.getCsrfToken(issued.sessionId), sessions.getCsrfToken(issued.sessionId)];
    expect(tokens).toEqual([issued.csrfToken, issued.csrfToken]);
    const responses = await Promise.all(
      tokens.map((token) =>
        app.inject({
          method: 'POST',
          url: '/write',
          headers: { cookie: cookie(issued.sessionId), 'x-csrf-token': token },
        }),
      ),
    );
    expect(responses.map((r) => r.statusCode)).toEqual([201, 201]);
  });

  it('đổi khóa CSRF thì token cũ mất hiệu lực (EC17)', async () => {
    const issued = await issue();
    const before = await activity(issued);
    vi.stubEnv('GATEWAY_CSRF_KEY', Buffer.alloc(32, 20).toString('hex'));
    const rotatedApp = await createServiceApp(TestAppModule, manifest, {
      logDestination: {
        write: (line: string) => {
          logLines.push(line);
        },
      },
    });
    vi.stubEnv('GATEWAY_CSRF_KEY', key.toString('hex'));
    try {
      await rotatedApp.init();
      await rotatedApp.getHttpAdapter().getInstance().ready();
      const rotated = rotatedApp.get(SessionService);
      const found = await rotated.find(issued.sessionId);
      expect(() => rotated.requireCsrf(found, issued.sessionId, issued.csrfToken)).toThrowError(ProblemException);
      const calls = handlerCalls;
      const response = await rotatedApp.inject({
        method: 'POST',
        url: '/write',
        headers: { cookie: cookie(issued.sessionId), 'x-csrf-token': issued.csrfToken },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('forbidden');
      expect(handlerCalls).toBe(calls);
      expect(await activity(issued)).toEqual(before);
      expect(rotated.getCsrfToken(issued.sessionId)).not.toBe(issued.csrfToken);
    } finally {
      await rotatedApp.close();
    }
  });

  it('thuộc tính cookie sires_session và cấu hình khóa không lộ giá trị', async () => {
    const issued = await issue();
    expect(issued.cookie).toBe(sessionCookie(issued.sessionId, issued.session.absoluteExpiresAt));
    expect(issued.cookie).toContain('; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=');
    expect(issued.cookie).toContain(issued.session.absoluteExpiresAt.toUTCString());
    expect(sessionIdFromCookie(`other=value; ${cookie(issued.sessionId)}`)).toBe(issued.sessionId);
    for (const value of ['', 'private-config-value']) {
      expect(() => csrfKeyFromEnv({ GATEWAY_CSRF_KEY: value })).toThrow('GATEWAY_CSRF_KEY must contain');
      try {
        csrfKeyFromEnv({ GATEWAY_CSRF_KEY: value });
      } catch (error) {
        expect(String(error)).not.toContain('private-config-value');
      }
    }
    expect(() => sessionCookie('bad; injected=true', expires())).toThrow();
  });

  it('không log bí mật phiên (EC12): thành công, 401 và 403', async () => {
    const issued = await issue();
    await app.inject({
      method: 'POST',
      url: '/write',
      headers: { cookie: cookie(issued.sessionId), 'x-csrf-token': issued.csrfToken },
    });
    await app.inject({
      method: 'POST',
      url: '/write',
      headers: { cookie: cookie(issued.sessionId), 'x-csrf-token': 'wrong-visible-token' },
    });
    await app.inject({ method: 'POST', url: '/write', headers: { 'x-csrf-token': issued.csrfToken } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const logs = logLines.join('');
    expect(logs).toContain('request completed');
    expect(logs).not.toContain(issued.sessionId);
    expect(logs).not.toContain(issued.csrfToken);
    expect(logs).not.toContain(cookie(issued.sessionId));
    expect(logs).not.toContain('wrong-visible-token');
    expect(logs).not.toContain(key.toString('hex'));
  });

  it('gia hạn sau khi bị thu hồi không khôi phục phiên', async () => {
    const issued = await issue();
    const current = await sessions.find(issued.sessionId);
    await database.admin.query("update app.session set revoked_at=now(),revoke_reason='admin' where id=$1", [
      issued.session.id,
    ]);
    const before = await activity(issued);
    await expect(sessions.renew(current)).rejects.toThrowError(ProblemException);
    expect(await activity(issued)).toEqual(before);
  });
});
