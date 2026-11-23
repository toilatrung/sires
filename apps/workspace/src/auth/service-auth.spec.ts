// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Service token cho mọi route trừ /health (PID-00017 S05; EC16), trên ứng dụng thật của createServiceApp (Fastify,
// problem+json). Route /probe chỉ có trong test.

import { Controller, Get, Module } from '@nestjs/common';
import {
  createServiceApp,
  generateServiceKeys,
  HealthModule,
  InternalCallers,
  issueServiceToken,
  SERVICE_AUTH_ENV,
} from '@sires/platform';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { manifest } from '../manifest';
import { NO_OUTGOING_SIGNER, ServiceAuthConfigError, WorkspaceAuthModule, workspaceServiceAuthOptions } from './service-auth';

@Controller('probe')
class ProbeController {
  @Get()
  @InternalCallers('gateway')
  probe(): { ok: true } {
    return { ok: true };
  }
}

describe('service token (PID-00017 S05)', () => {
  const keys = generateServiceKeys();
  let app: Awaited<ReturnType<typeof createServiceApp>>;

  beforeAll(async () => {
    vi.stubEnv('OTEL_SDK_DISABLED', 'true');
    @Module({
      imports: [
        HealthModule.forService(manifest),
        WorkspaceAuthModule.forRoot({ service: 'workspace', publicKeys: keys.publicKeys, signer: NO_OUTGOING_SIGNER }),
      ],
      controllers: [ProbeController],
    })
    class TestApplication {}
    app = await createServiceApp(TestApplication, manifest, { logDestination: { write: () => undefined } });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  const call = (url: string, token?: string) =>
    app.inject({ method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const tokenFrom = (service: Parameters<typeof keys.signer>[0], audience: 'workspace' | 'planning' = 'workspace') =>
    issueServiceToken(keys.signer(service), { audience, actor: { type: 'system', component: service } });

  it('thiếu token (EC16)', async () => {
    const response = await call('/probe');
    expect(response.statusCode).toBe(401);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ code: 'invalid_service_token', status: 401 });
    // Token sai aud (gửi cho planning) cũng bị từ chối.
    expect((await call('/probe', await tokenFrom('gateway', 'planning'))).statusCode).toBe(401);
  });

  it('thiếu token — token hợp lệ thì qua, người gọi ngoài x-callers bị 403', async () => {
    const ok = await call('/probe', await tokenFrom('gateway'));
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ ok: true });
    const other = await call('/probe', await tokenFrom('planning'));
    expect(other.statusCode).toBe(403);
    expect(other.json()).toMatchObject({ code: 'caller_not_allowed' });
  });

  it('health không cần token (EC16)', async () => {
    const response = await call('/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ service: 'workspace', status: 'ok' });
  });

  it('health không cần token — cấu hình khóa công khai', async () => {
    const seed = 'dev-seed-for-workspace-tests';
    expect(workspaceServiceAuthOptions({ [SERVICE_AUTH_ENV.devSeed]: seed }).service).toBe('workspace');
    await expect(NO_OUTGOING_SIGNER.sign(new Uint8Array([1]))).rejects.toThrow('không có khóa ký');
    for (const [env, message] of [
      [{}, `thiếu ${SERVICE_AUTH_ENV.publicKeys}`],
      [{ [SERVICE_AUTH_ENV.publicKeys]: '{"keys": "secret-ish"}' }, `${SERVICE_AUTH_ENV.publicKeys} không phải JWKS hợp lệ`],
      [{ [SERVICE_AUTH_ENV.devSeed]: seed, NODE_ENV: 'production' }, 'bị từ chối khi NODE_ENV=production'],
      [{ [SERVICE_AUTH_ENV.devSeed]: 'short' }, 'ít nhất 16 ký tự'],
    ] as const) {
      let error: unknown;
      try {
        workspaceServiceAuthOptions(env as NodeJS.ProcessEnv);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ServiceAuthConfigError);
      expect((error as Error).message).toContain(message);
      expect((error as Error).message).not.toContain('secret-ish');
    }
  });
});
