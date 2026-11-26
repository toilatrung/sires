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

describe('client API: phản hồi không phải JSON', () => {
  const PREVIEW = '/api/v1/projects/p1/artifacts/a1/versions/v1/preview';

  it('getBlob, getText đọc SVG, ảnh với Accept */*; lỗi problem+json thành ApiError; 401 vào luồng phiên hết hạn', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>';
    let mode: 'ok' | 'gone' | 'expired' = 'ok';
    const stub = new FetchStub().on('GET', PREVIEW, () =>
      mode === 'ok' ? new Response(svg, { status: 200, headers: { 'content-type': 'image/svg+xml', etag: '"3"' } }) : mode === 'gone' ? problem(404, 'not_found') : problem(401, 'unauthenticated'),
    );
    const onUnauthenticated = vi.fn();
    const api = new ApiClient({ fetch: stub.fetch, onUnauthenticated });
    const path = { projectId: 'p1', artifactId: 'a1', versionId: 'v1' };

    const blob = await api.getBlob('/projects/{projectId}/artifacts/{artifactId}/versions/{versionId}/preview', { path });
    expect(blob.data).toBeInstanceOf(Blob);
    expect(blob.data.type).toBe('image/svg+xml');
    expect(await blob.data.text()).toBe(svg);
    expect(blob.etag).toBe('"3"');
    const text = await api.getText('/projects/{projectId}/artifacts/{artifactId}/versions/{versionId}/preview', { path });
    expect(text.data).toBe(svg);
    expect(stub.calls(PREVIEW).every((r) => r.headers.Accept === '*/*')).toBe(true);

    mode = 'gone';
    const error = await api.getBlob('/projects/{projectId}/artifacts/{artifactId}/versions/{versionId}/preview', { path }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('not_found');
    expect(onUnauthenticated).not.toHaveBeenCalled();

    mode = 'expired';
    await expect(api.getText('/projects/{projectId}/artifacts/{artifactId}/versions/{versionId}/preview', { path })).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });
});

describe('client API: tải tệp (multipart/form-data)', () => {
  it('FormData gửi nguyên kèm X-CSRF-Token và Idempotency-Key, không đặt Content-Type tay; gửi lại sau lỗi mạng dùng lại khóa', async () => {
    let attempt = 0;
    const stub = new FetchStub()
      .on('GET', '/api/v1/auth/session', () => json(fx.session))
      .on('POST', '/api/v1/references/pdf-imports', () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('offline');
        return json({ id: 'imp-1' }, { status: 202 });
      });
    const { api } = setup(stub);
    const keys = new IdempotencyKeys(() => 'key-upload');
    const form = new FormData();
    form.append('file', new Blob(['%PDF-1.7'], { type: 'application/pdf' }), 'bai-bao.pdf');
    const send = () => keys.run('importReferenceFromPdf:bai-bao.pdf', (idempotencyKey) => api.post('/references/pdf-imports', { body: form, idempotencyKey }));

    await expect(send()).rejects.toMatchObject({ kind: 'network' });
    await send();

    const posts = stub.calls('/api/v1/references/pdf-imports', 'POST');
    expect(posts).toHaveLength(2);
    for (const post of posts) {
      expect(post.formData).toBe(form);
      expect(post.body).toBeUndefined();
      expect(post.headers['X-CSRF-Token']).toBe('csrf-1');
      expect(post.headers['Idempotency-Key']).toBe('key-upload');
      // fetch sets multipart/form-data with its boundary; the client never sets Content-Type for a FormData.
      expect(Object.keys(post.headers).some((h) => h.toLowerCase() === 'content-type')).toBe(false);
    }
    expect((posts[1]!.formData!.get('file') as File).name).toBe('bai-bao.pdf');
  });

  it('ở mức type: thao tác multipart nhận FormData, không nhận object', () => {
    const api = new ApiClient({ fetch: async () => json({}) });
    const typed = () => {
      // @ts-expect-error an upload takes a FormData, not the JSON-like body of the schema
      void api.post('/references/pdf-imports', { body: { file: 'x' }, idempotencyKey: 'k' });
      void api.post('/references/pdf-imports', { body: new FormData(), idempotencyKey: 'k' });
      void api.post('/references/pdf-imports', { body: new FormData(), contentType: 'multipart/form-data', idempotencyKey: 'k' });
    };
    expect(typeof typed).toBe('function');
  });
});
