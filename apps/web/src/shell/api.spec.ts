// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api/client';
import { ApiError } from './api/errors';
import { IdempotencyKeys } from './api/idempotency';
import { SessionController } from './session/session';
import * as fx from './test/fixtures';
import { FetchStub, json, problem } from './test/stub';

function setup(stub: FetchStub) {
  const api = new ApiClient({ fetch: stub.fetch });
  const navigate = vi.fn();
  const session = new SessionController({ api, navigate, currentPath: () => '/dashboard' });
  return { api, session, navigate };
}

describe('client API', () => {
  it('csrf: lệnh ghi lấy csrfToken từ GET /auth/session khi chưa có, mọi lệnh ghi có X-CSRF-Token (EC09)', async () => {
    const stub = new FetchStub()
      .on('GET', '/api/v1/auth/session', () => json(fx.session))
      .on('PUT', '/api/v1/projects/p1/active-task', () => json(fx.projects[0]));
    const { api } = setup(stub);

    await api.put('/projects/{projectId}/active-task', { path: { projectId: 'p1' }, body: { taskId: null } });
    await api.put('/projects/{projectId}/active-task', { path: { projectId: 'p1' }, body: { taskId: null } });

    expect(stub.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /api/v1/auth/session',
      'PUT /api/v1/projects/p1/active-task',
      'PUT /api/v1/projects/p1/active-task',
    ]);
    for (const put of stub.calls('/api/v1/projects/p1/active-task', 'PUT')) expect(put.headers['X-CSRF-Token']).toBe('csrf-1');
    // GET never carries the CSRF token.
    expect(stub.calls('/api/v1/auth/session')[0].headers['X-CSRF-Token']).toBeUndefined();
  });

  it('idempotency: gửi lại cùng thao tác sau lỗi mạng dùng lại Idempotency-Key, thao tác mới có khóa mới (EC10)', async () => {
    let attempt = 0;
    const stub = new FetchStub()
      .on('GET', '/api/v1/auth/session', () => json(fx.session))
      .on('POST', '/api/v1/prompts/pr-1/response', () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('offline');
        return json({ id: 'pr-1' });
      });
    const { api } = setup(stub);
    let n = 0;
    const keys = new IdempotencyKeys(() => `key-${++n}`);
    const send = () =>
      keys.run('answerPrompt:pr-1', (idempotencyKey) =>
        api.post('/prompts/{promptId}/response', { path: { promptId: 'pr-1' }, body: { choiceIds: ['a'] }, idempotencyKey }),
      );

    await expect(send()).rejects.toMatchObject({ kind: 'network' });
    await send();
    await send();

    const posts = stub.calls('/api/v1/prompts/pr-1/response', 'POST');
    expect(posts.map((p) => p.headers['Idempotency-Key'])).toEqual(['key-1', 'key-1', 'key-2']);
  });

  it('idempotency: bị từ chối rõ ràng (4xx) thì bỏ khóa; 5xx chưa rõ kết quả thì giữ khóa', async () => {
    const answers = [problem(422, 'validation_failed'), problem(503, 'service_unavailable'), json({ id: 'pr-2' })];
    const stub = new FetchStub()
      .on('GET', '/api/v1/auth/session', () => json(fx.session))
      .on('POST', '/api/v1/prompts/pr-2/response', () => answers.shift() ?? json({}));
    const { api } = setup(stub);
    let n = 0;
    const keys = new IdempotencyKeys(() => `key-${++n}`);
    const send = () =>
      keys.run('answerPrompt:pr-2', (idempotencyKey) =>
        api.post('/prompts/{promptId}/response', { path: { promptId: 'pr-2' }, body: { choiceIds: ['a'] }, idempotencyKey }),
      );
    await expect(send()).rejects.toMatchObject({ status: 422 });
    await expect(send()).rejects.toMatchObject({ status: 503 });
    await send();
    expect(stub.calls('/api/v1/prompts/pr-2/response', 'POST').map((p) => p.headers['Idempotency-Key'])).toEqual(['key-1', 'key-2', 'key-2']);
  });

  it('lỗi không phải problem: lỗi mạng hoặc mã HTTP, không giữ body thô (EC11)', async () => {
    const stub = new FetchStub()
      .on('GET', '/api/v1/dashboard', () => new Response('<html>Bad gateway: stack at proxy.js:12</html>', { status: 502, headers: { 'content-type': 'text/html' } }))
      .on('GET', '/api/v1/pending-actions', () => {
        throw new TypeError('Failed to fetch');
      });
    const { api } = setup(stub);

    const http = await api.get('/dashboard').catch((e: unknown) => e as ApiError);
    expect(http).toBeInstanceOf(ApiError);
    expect(http).toMatchObject({ kind: 'http', status: 502, code: 'http_error', problem: undefined });
    expect(JSON.stringify(http)).not.toContain('proxy.js');
    expect(String((http as ApiError).message)).not.toContain('html');

    const network = await api.get('/pending-actions').catch((e: unknown) => e as ApiError);
    expect(network).toMatchObject({ kind: 'network', code: 'network_error', status: undefined });
  });

  it('problem có type: problem+json thành ApiError có Problem.code, correlationId; ETag và If-Match', async () => {
    const stub = new FetchStub()
      .on('GET', '/api/v1/auth/session', () => json(fx.session))
      .on('GET', '/api/v1/me', () => json(fx.account(), { headers: { etag: '"v7"' } }))
      .on('PATCH', '/api/v1/me/preferences', () => problem(412, 'precondition_failed', { correlationId: 'req-9', stack: 'x' }));
    const { api } = setup(stub);

    const me = await api.get('/me');
    expect(me.etag).toBe('"v7"');
    expect(me.data.preferences.uiLanguage).toBe('vi');

    const error = await api
      .patch('/me/preferences', { body: fx.account().preferences, contentType: 'application/merge-patch+json', ifMatch: '"v7"' })
      .catch((e: unknown) => e as ApiError);
    expect(error).toMatchObject({ kind: 'problem', status: 412, code: 'precondition_failed', correlationId: 'req-9' });
    expect((error as ApiError).problem).not.toHaveProperty('stack');
    const patch = stub.calls('/api/v1/me/preferences', 'PATCH')[0];
    expect(patch.headers['If-Match']).toBe('"v7"');
    expect(patch.headers['Content-Type']).toBe('application/merge-patch+json');
  });

  it('401 khi đang dùng gọi luồng phiên hết hạn đúng một lần', async () => {
    const stub = new FetchStub().on('GET', '/api/v1/dashboard', () => problem(401, 'unauthenticated'));
    const onUnauthenticated = vi.fn();
    const api = new ApiClient({ fetch: stub.fetch, onUnauthenticated });
    await expect(api.get('/dashboard')).rejects.toMatchObject({ status: 401 });
    await expect(api.get('/dashboard', { skipUnauthenticatedHandler: true })).rejects.toMatchObject({ status: 401 });
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('type: tham số, Idempotency-Key và If-Match bắt buộc theo hợp đồng', () => {
    const api = new ApiClient({ fetch: async () => json({}) });
    // Compile-time checks only; the calls are never awaited.
    const checks = () => {
      // @ts-expect-error path parameter projectId is required
      void api.get('/projects/{projectId}');
      // @ts-expect-error createProject requires Idempotency-Key
      void api.post('/projects', { body: { name: 'x' } });
      // @ts-expect-error updatePreferences requires If-Match
      void api.patch('/me/preferences', { body: fx.account().preferences, contentType: 'application/merge-patch+json' });
      // @ts-expect-error unknown path
      void api.get('/no-such-path');
    };
    expect(typeof checks).toBe('function');
  });
});
