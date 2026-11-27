// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Luồng OIDC của mock (PID-00160 S02–S04): mock chạy trong tiến trình ở cổng ngẫu nhiên, openid-client đóng vai
// gateway, trình duyệt mô phỏng bằng fetch (test/browser.ts). AC01–AC07, AC10; EC06–EC12.

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as oidc from 'openid-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOGIN_FAILED } from '../src/interactions.js';
import { startMock, type StartedMock } from '../src/main.js';
import { Browser, freePort, parseForm, remember, secretsSeen, type Visit } from './browser.js';

const CLIENT_ID = 'sires-gateway-local';
const CLIENT_SECRET = 'sires-local-gateway-secret';
const CALLBACK = 'http://localhost:5173/api/v1/auth/callback';
// Gateway gửi post_logout_redirect_uri là trang /sign-in của SIRes (POST /auth/logout, PC-05 P3).
const POST_LOGOUT = 'http://localhost:5173/sign-in';
const SCOPE = 'openid profile email';
const A = { sub: 'sires-mock-a', email: 'researcher-a@sires.test', name: 'Nguyễn Thị An', password: 'sires-local' };
const B = { sub: 'sires-mock-b', email: 'researcher-b@sires.test', name: 'Trần Văn Bình', password: 'sires-local' };

let mock: StartedMock;
let issuer: string;
let config: oidc.Configuration;
const logs: string[] = [];

beforeAll(async () => {
  const port = await freePort();
  issuer = `http://127.0.0.1:${port}`;
  mock = await startMock({
    env: { OIDC_MOCK_ENV: 'local', OIDC_MOCK_ISSUER: issuer, OIDC_MOCK_PORT: String(port) },
    sink: (line) => logs.push(line),
    host: '127.0.0.1',
  });
  config = await gateway(CLIENT_SECRET);
});

afterAll(async () => {
  await mock?.close();
});

/** openid-client như gateway: discovery, client_secret_basic; issuer cục bộ là http nên bật allowInsecureRequests. */
function gateway(secret: string): Promise<oidc.Configuration> {
  return oidc.discovery(new URL(issuer), CLIENT_ID, undefined, oidc.ClientSecretBasic(secret), { execute: [oidc.allowInsecureRequests] });
}

interface Started {
  readonly browser: Browser;
  readonly verifier: string;
  readonly state: string;
  readonly nonce: string;
  readonly url: URL;
}

/** URL authorize với state, nonce, PKCE S256 như gateway; `extra` ghi đè tham số. */
async function begin(extra: Record<string, string> = {}, browser = new Browser(new URL(issuer).origin)): Promise<Started> {
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const params: Record<string, string> = {
    redirect_uri: CALLBACK,
    scope: SCOPE,
    state,
    nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    ...extra,
  };
  for (const [k, v] of Object.entries(extra)) if (v === '') delete params[k];
  return { browser, verifier, state, nonce, url: oidc.buildAuthorizationUrl(config, params) };
}

/** Gửi form đăng nhập trong trang `visit`. */
function submitLogin(browser: Browser, visit: Visit, email: string, password: string): Promise<Visit> {
  const form = parseForm(visit);
  return browser.request(form.action, { form: { ...form.fields, email, password } });
}

/** Đăng nhập tới callback (chưa đổi code). */
async function authorize(account: { email: string; password: string }, extra: Record<string, string> = {}, browser?: Browser) {
  const started = await begin(extra, browser);
  let visit = await started.browser.request(started.url);
  if (visit.kind === 'page') visit = await submitLogin(started.browser, visit, account.email, account.password);
  if (visit.kind !== 'redirect') throw new Error(`không về callback: ${visit.status} ${visit.body.slice(0, 200)}`);
  remember(visit.url.searchParams.get('code') ?? undefined);
  return { ...started, callback: visit.url };
}

/** Đăng nhập và đổi code bằng client_secret_basic, kiểm state, nonce như gateway. */
async function login(account: { email: string; password: string }, browser?: Browser) {
  const flow = await authorize(account, {}, browser);
  const tokens = await oidc.authorizationCodeGrant(config, flow.callback, {
    pkceCodeVerifier: flow.verifier, expectedNonce: flow.nonce, expectedState: flow.state,
  });
  remember(tokens.access_token, tokens.id_token, tokens.refresh_token);
  return { ...flow, tokens };
}

async function oauthError(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    // 401 có WWW-Authenticate: openid-client 6 ném WWWAuthenticateChallengeError, mã lỗi nằm trong challenge.
    const challenge = (error as { cause?: { parameters?: { error?: string } }[] }).cause;
    if (Array.isArray(challenge)) return challenge[0]?.parameters?.error;
    return (error as { error?: string }).error ?? (error as Error).message;
  }
}

function jwtHeader(jwt: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jwt.split('.')[0] as string, 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('discovery và JWKS', () => {
  it('issuer, endpoint, PKCE S256, RS256, một khóa RSA công khai (PID-00160-AC01)', async () => {
    const meta = config.serverMetadata();
    expect(meta).toMatchObject({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      userinfo_endpoint: `${issuer}/userinfo`,
      jwks_uri: `${issuer}/jwks`,
      revocation_endpoint: `${issuer}/revoke`,
      end_session_endpoint: `${issuer}/session/end`,
      code_challenge_methods_supported: ['S256'],
    });
    expect(meta.id_token_signing_alg_values_supported).toContain('RS256');
    expect(meta.token_endpoint_auth_methods_supported).toContain('client_secret_basic');
    const jwks = (await (await fetch(`${issuer}/jwks`)).json()) as { keys: Record<string, unknown>[] };
    expect(jwks.keys).toHaveLength(1);
    const [key] = jwks.keys;
    expect(key).toMatchObject({ kty: 'RSA', alg: 'RS256', kid: mock.kid });
    for (const part of ['d', 'p', 'q', 'dp', 'dq', 'qi']) expect(key).not.toHaveProperty(part);
  });

  it('sau proxy https: endpoint dùng https và khớp issuer (EC07)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sires-oidc-mock-proxy-'));
    const clients = join(dir, 'clients.json');
    const accounts = join(dir, 'accounts.json');
    writeFileSync(clients, JSON.stringify([{
      client_id: 'sires-gateway-staging', client_secret: 's'.repeat(40),
      redirect_uris: ['https://app.sires.test/api/v1/auth/callback'], post_logout_redirect_uris: ['https://app.sires.test/'],
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'client_secret_basic',
    }]));
    writeFileSync(accounts, JSON.stringify([
      { sub: 's-a', email: 'a@sires.test', email_verified: true, name: 'A', password: 'p'.repeat(20) },
      { sub: 's-b', email: 'b@sires.test', email_verified: true, name: 'B', password: 'q'.repeat(20) },
    ]));
    const port = await freePort();
    const behindProxy = await startMock({
      env: {
        OIDC_MOCK_ENV: 'staging', OIDC_MOCK_ISSUER: 'https://oidc-mock.sires.test', OIDC_MOCK_PORT: String(port),
        OIDC_MOCK_CLIENTS_FILE: clients, OIDC_MOCK_ACCOUNTS_FILE: accounts, OIDC_MOCK_COOKIE_KEYS: 'k'.repeat(40),
      },
      sink: () => undefined,
      host: '127.0.0.1',
    });
    try {
      const res = await fetch(`http://127.0.0.1:${port}/.well-known/openid-configuration`, {
        headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'oidc-mock.sires.test' },
      });
      const meta = (await res.json()) as Record<string, string>;
      expect(meta.issuer).toBe('https://oidc-mock.sires.test');
      for (const name of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'end_session_endpoint', 'revocation_endpoint']) {
        expect(meta[name]?.startsWith('https://oidc-mock.sires.test/'), name).toBe(true);
      }
    } finally {
      await behindProxy.close();
    }
  });
});

describe('đăng nhập code + PKCE, nonce trong ID token', () => {
  it('callback đúng state; ID token, access token, refresh token, userinfo (PID-00160-AC02)', async () => {
    const { callback, state, nonce, tokens } = await login(A);
    expect(`${callback.origin}${callback.pathname}`).toBe(CALLBACK);
    expect(callback.searchParams.get('state')).toBe(state);

    const claims = tokens.claims();
    expect(claims).toBeDefined();
    expect(claims).toMatchObject({
      iss: issuer, aud: CLIENT_ID, sub: A.sub, nonce, name: A.name, email: A.email, email_verified: true,
    });
    expect((claims?.exp ?? 0) - (claims?.iat ?? 0)).toBe(900);
    expect(jwtHeader(tokens.id_token as string)).toMatchObject({ alg: 'RS256', kid: mock.kid });
    expect(tokens.expires_in).toBe(900);
    expect(tokens.refresh_token).toEqual(expect.any(String));

    const userinfo = await oidc.fetchUserInfo(config, tokens.access_token, A.sub);
    expect(userinfo).toEqual({ sub: A.sub, name: A.name, email: A.email, email_verified: true });
  });
});

describe('từ chối yêu cầu sai', () => {
  it('thiếu PKCE, PKCE plain, redirect_uri chưa đăng ký (PID-00160-AC03 ca 1–3)', async () => {
    const variants: Record<string, string>[] = [{ code_challenge: '', code_challenge_method: '' }, { code_challenge_method: 'plain' }];
    for (const extra of variants) {
      const started = await begin(extra);
      const visit = await started.browser.request(started.url);
      // Lỗi trả về client đã đăng ký kèm state, không có code và không qua trang đăng nhập.
      expect(visit.kind).toBe('redirect');
      expect(visit.kind === 'redirect' && visit.url.searchParams.get('error')).toBe('invalid_request');
      expect(visit.kind === 'redirect' && visit.url.searchParams.get('state')).toBe(started.state);
      expect(visit.kind === 'redirect' && visit.url.searchParams.has('code')).toBe(false);
    }
    // Khác một ký tự, và đường dẫn cũ thiếu base /api/v1 của hợp đồng gateway: trang lỗi, không chuyển hướng.
    for (const uri of ['http://localhost:5173/api/v1/auth/callbacK', 'http://localhost:5173/auth/callback']) {
      const wrongRedirect = await begin({ redirect_uri: uri });
      const visit = await wrongRedirect.browser.request(wrongRedirect.url);
      expect(visit.kind, uri).toBe('page');
      expect(visit.kind === 'page' && visit.status).toBe(400);
      expect(visit.kind === 'page' && visit.body).toContain('redirect_uri');
    }
  });

  it('sai mật khẩu, email không có: hiện lại form, không về client (PID-00160-AC03 ca 4; EC06)', async () => {
    for (const [email, password] of [[A.email, 'wrong-password'], ['khong-co@sires.test', A.password]] as const) {
      const started = await begin();
      const form = await started.browser.request(started.url);
      const visit = await submitLogin(started.browser, form, email, password);
      expect(visit.kind).toBe('page');
      expect(visit.kind === 'page' && visit.status).toBe(200);
      expect(visit.kind === 'page' && visit.body).toContain(LOGIN_FAILED);
      expect(visit.kind === 'page' && visit.body).toContain('name="password"');
    }
  });

  it('code_verifier sai, code dùng lại, sai client_secret (PID-00160-AC03 ca 5–7)', async () => {
    const wrongVerifier = await authorize(A);
    expect(await oauthError(oidc.authorizationCodeGrant(config, wrongVerifier.callback, {
      pkceCodeVerifier: oidc.randomPKCECodeVerifier(), expectedNonce: wrongVerifier.nonce, expectedState: wrongVerifier.state,
    }))).toBe('invalid_grant');

    const reused = await authorize(A);
    const checks = { pkceCodeVerifier: reused.verifier, expectedNonce: reused.nonce, expectedState: reused.state };
    const first = await oidc.authorizationCodeGrant(config, reused.callback, checks);
    remember(first.access_token, first.id_token, first.refresh_token);
    expect(await oauthError(oidc.authorizationCodeGrant(config, reused.callback, checks))).toBe('invalid_grant');

    const wrongSecret = await authorize(A);
    expect(await oauthError(oidc.authorizationCodeGrant(await gateway('not-the-secret'), wrongSecret.callback, {
      pkceCodeVerifier: wrongSecret.verifier, expectedNonce: wrongSecret.nonce, expectedState: wrongSecret.state,
    }))).toBe('invalid_client');
  });
});

describe('phiên mock dùng lại', () => {
  it('authorize lại trong 8 giờ không hỏi mật khẩu; prompt=login thì hỏi lại (EC08)', async () => {
    const first = await login(A);
    const again = await begin({}, first.browser);
    const visit = await first.browser.request(again.url);
    expect(visit.kind).toBe('redirect');
    expect(visit.kind === 'redirect' && visit.url.searchParams.has('code')).toBe(true);
    remember(visit.kind === 'redirect' ? visit.url.searchParams.get('code') ?? undefined : undefined);
    const forced = await begin({ prompt: 'login' }, first.browser);
    const form = await first.browser.request(forced.url);
    expect(form.kind === 'page' && form.body).toContain('name="password"');
  });
});

describe('refresh xoay vòng, dùng lại thu hồi family', () => {
  it('R1 → R2; dùng lại R1 thì invalid_grant và R2 cũng hết dùng được (PID-00160-AC04)', async () => {
    const { tokens } = await login(A);
    const r1 = tokens.refresh_token as string;
    const refreshed = await oidc.refreshTokenGrant(config, r1);
    remember(refreshed.access_token, refreshed.id_token, refreshed.refresh_token);
    const r2 = refreshed.refresh_token as string;
    expect(r2).toEqual(expect.any(String));
    expect(r2).not.toBe(r1);
    expect(refreshed.access_token).not.toBe(tokens.access_token);
    expect(refreshed.claims()?.sub).toBe(A.sub);
    expect(await oauthError(oidc.refreshTokenGrant(config, r1))).toBe('invalid_grant');
    expect(await oauthError(oidc.refreshTokenGrant(config, r2))).toBe('invalid_grant');
  });

  it('hai refresh đồng thời bằng cùng refresh token: đúng một lần thành công (EC09)', async () => {
    const { tokens } = await login(B);
    const results = await Promise.allSettled([
      oidc.refreshTokenGrant(config, tokens.refresh_token as string),
      oidc.refreshTokenGrant(config, tokens.refresh_token as string),
    ]);
    for (const r of results) if (r.status === 'fulfilled') remember(r.value.access_token, r.value.id_token, r.value.refresh_token);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason.error).toBe('invalid_grant');
  });
});

describe('đăng xuất RP-initiated', () => {
  /** Mở end_session (GET hoặc POST), gửi form xác nhận như khi tắt JS (EC11); trả nơi trình duyệt tới. */
  async function endSession(browser: Browser, params: Record<string, string>, method: 'GET' | 'POST' = 'GET'): Promise<Visit> {
    const endpoint = config.serverMetadata().end_session_endpoint as string;
    const page = method === 'GET'
      ? await browser.request(`${endpoint}?${new URLSearchParams(params)}`)
      : await browser.request(endpoint, { form: params });
    if (page.kind !== 'page' || !page.body.includes('op.logoutForm')) return page;
    expect(page.body).toContain('>Đăng xuất</button>');
    expect(page.body).toContain('.submit()');
    const form = parseForm(page, 'op.logoutForm');
    expect(form.fields.logout).toBe('yes');
    return browser.request(form.action, { form: form.fields });
  }

  it('id_token_hint, post_logout_redirect_uri đã đăng ký, state; đăng nhập lại phải nhập mật khẩu (PID-00160-AC05)', async () => {
    const { browser, tokens } = await login(A);
    const visit = await endSession(browser, { id_token_hint: tokens.id_token as string, post_logout_redirect_uri: POST_LOGOUT, state: 's1' });
    expect(visit.kind).toBe('redirect');
    expect(visit.kind === 'redirect' && visit.url.href).toBe(`${POST_LOGOUT}?state=s1`);
    const again = await begin({}, browser);
    const form = await browser.request(again.url);
    expect(form.kind === 'page' && form.body).toContain('name="password"');
  });

  it('như gateway gửi: chỉ client_id và /sign-in, không id_token_hint, không state; đăng nhập lại phải nhập mật khẩu (PID-00160-AC05, H9)', async () => {
    const { browser } = await login(A);
    const visit = await endSession(browser, { client_id: CLIENT_ID, post_logout_redirect_uri: POST_LOGOUT });
    expect(visit.kind).toBe('redirect');
    expect(visit.kind === 'redirect' && visit.url.href).toBe(POST_LOGOUT);
    const again = await begin({}, browser);
    const form = await browser.request(again.url);
    expect(form.kind === 'page' && form.body).toContain('name="password"');
  });

  it('chỉ có client_id kèm state; POST cho kết quả như GET; trang gốc của web không còn đăng ký (EC10)', async () => {
    const root = await login(B);
    const viaRoot = await endSession(root.browser, { client_id: CLIENT_ID, post_logout_redirect_uri: 'http://localhost:5173/', state: 's0' });
    expect(viaRoot.kind).toBe('page');
    expect(viaRoot.kind === 'page' && viaRoot.status).toBe(400);
    const first = await login(A);
    const viaClientId = await endSession(first.browser, { client_id: CLIENT_ID, post_logout_redirect_uri: POST_LOGOUT, state: 's2' });
    expect(viaClientId.kind === 'redirect' && viaClientId.url.href).toBe(`${POST_LOGOUT}?state=s2`);
    const second = await login(B);
    const viaPost = await endSession(second.browser, { id_token_hint: second.tokens.id_token as string, post_logout_redirect_uri: POST_LOGOUT, state: 's3' }, 'POST');
    expect(viaPost.kind === 'redirect' && viaPost.url.href).toBe(`${POST_LOGOUT}?state=s3`);
  });

  it('post_logout_redirect_uri chưa đăng ký thì không chuyển hướng; không có thì trang đã đăng xuất (EC12)', async () => {
    const { browser, tokens } = await login(A);
    const unregistered = await endSession(browser, {
      id_token_hint: tokens.id_token as string, post_logout_redirect_uri: 'http://localhost:5173/x', state: 's4',
    });
    expect(unregistered.kind).toBe('page');
    expect(unregistered.kind === 'page' && unregistered.status).toBe(400);
    const done = await endSession(browser, { id_token_hint: tokens.id_token as string });
    expect(done.kind).toBe('page');
    expect(done.kind === 'page' && done.body).toContain('Đã đăng xuất khỏi OIDC mock');
  });
});

describe('thu hồi refresh token qua /revoke', () => {
  it('200 rồi refresh bằng token đó bị invalid_grant; sai secret thì 401 invalid_client (PID-00160-AC06)', async () => {
    const { tokens } = await login(A);
    const refresh = tokens.refresh_token as string;
    await oidc.tokenRevocation(config, refresh, { token_type_hint: 'refresh_token' });
    expect(await oauthError(oidc.refreshTokenGrant(config, refresh))).toBe('invalid_grant');

    const res = await fetch(`${issuer}/revoke`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${CLIENT_ID}:wrong-secret`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token: refresh, token_type_hint: 'refresh_token' }),
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_client');
  });
});

describe('hai tài khoản thử, sub ổn định', () => {
  it('B có sub, claim của B; A đăng nhập lại sau khi đăng xuất vẫn cùng sub (PID-00160-AC07)', async () => {
    const b = await login(B);
    expect(b.tokens.claims()).toMatchObject({ sub: B.sub, name: B.name, email: B.email });
    const a1 = await login(A);
    const endpoint = config.serverMetadata().end_session_endpoint as string;
    const confirm = await a1.browser.request(`${endpoint}?${new URLSearchParams({ client_id: CLIENT_ID })}`);
    const form = parseForm(confirm, 'op.logoutForm');
    await a1.browser.request(form.action, { form: form.fields });
    const a2 = await login(A, a1.browser);
    expect(a2.tokens.claims()?.sub).toBe(A.sub);
    expect(a1.tokens.claims()?.sub).toBe(A.sub);
  });
});

describe('log không chứa token, mật khẩu, secret', () => {
  it('sau các luồng trên, log không có giá trị nhạy cảm nào; có sự kiện đăng nhập với sub, client_id (PID-00160-AC10)', () => {
    expect(logs.length).toBeGreaterThan(10);
    const text = logs.join('\n');
    expect(secretsSeen.size).toBeGreaterThan(20);
    for (const secret of [...secretsSeen, CLIENT_SECRET, A.password, 'wrong-password', 'not-the-secret', 'wrong-secret']) {
      expect(text.includes(secret), `log chứa ${secret.slice(0, 6)}…`).toBe(false);
    }
    // Không có trường nào mang header, cookie hay mật khẩu.
    expect(text).not.toMatch(/"(authorization|cookie|set-cookie|password|code|token|client_secret)"\s*:/i);
    const events = logs.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events).toContainEqual(expect.objectContaining({ event: 'interaction.ended', sub: A.sub, client_id: CLIENT_ID }));
    expect(events).toContainEqual(expect.objectContaining({ event: 'interaction.login_failed', client_id: CLIENT_ID }));
    expect(events.some((e) => e.event === 'grant.success')).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ event: 'grant.error', error: 'invalid_grant' }));
    expect(events.some((e) => e.event === 'end_session.success')).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ event: 'revocation.success', client_id: CLIENT_ID }));
  });
});
