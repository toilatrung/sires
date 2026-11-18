// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// SPK-02 (PID-00015): openid-client against FakeOidcProvider. Run:
//   pnpm --filter @sires/gateway exec vitest run --dir spikes/spk-02
// SPK02_TIMINGS=1 prints the median duration of each step (report.md section 3).

import { DEFAULT_FAKE_OIDC_USER, FakeOidcProvider } from '@sires/testing';
import type { ServerMetadata } from 'openid-client';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  LoginRejectedError,
  OidcUnavailableError,
  ReloginRequiredError,
  SpikeRelyingParty,
  type SpikeRpOptions,
  type SpikeSession,
} from './rp';

const CLIENT_ID = 'sires-gateway-spike';
const CLIENT_SECRET = 'spike-secret-not-real';
const REDIRECT_URI = 'http://localhost:3000/api/v1/auth/callback';
const POST_LOGOUT_URI = 'http://localhost:3000/signed-out';

const timings = new Map<string, number[]>();
let provider: FakeOidcProvider | undefined;

async function startProvider(extra: { accessTtl?: number; refreshTtl?: number; now?: () => number } = {}) {
  provider = await new FakeOidcProvider({
    clients: [
      {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        redirectUris: [REDIRECT_URI],
        postLogoutRedirectUris: [POST_LOGOUT_URI],
      },
    ],
    accessTokenTtlSeconds: extra.accessTtl,
    refreshTokenTtlSeconds: extra.refreshTtl,
    now: extra.now,
  }).start();
  return provider;
}

/** Endpoints as the gateway would configure them for eTroy OIDC, which has no discovery document. */
function staticMetadata(op: FakeOidcProvider): ServerMetadata {
  return {
    issuer: op.issuer,
    authorization_endpoint: `${op.issuer}/authorize`,
    token_endpoint: `${op.issuer}/token`,
    userinfo_endpoint: `${op.issuer}/userinfo`,
    jwks_uri: `${op.issuer}/jwks`,
    end_session_endpoint: `${op.issuer}/logout`,
  };
}

function rpFor(op: FakeOidcProvider, mode: 'discovery' | 'static', extra: Partial<SpikeRpOptions> = {}) {
  return new SpikeRelyingParty({
    issuer: new URL(op.issuer),
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
    postLogoutRedirectUri: POST_LOGOUT_URI,
    metadata: mode === 'discovery' ? { mode } : { mode, server: staticMetadata(op) },
    allowInsecureRequests: true,
    timeoutSeconds: 2,
    ...extra,
  });
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const list = timings.get(label) ?? [];
    list.push(performance.now() - start);
    timings.set(label, list);
  }
}

/** What the browser does between the redirect to /authorize and the callback (the stub logs the user in). */
async function browserAuthorize(url: URL): Promise<URL> {
  const res = await fetch(url, { redirect: 'manual' });
  expect(res.status).toBe(302);
  return new URL(res.headers.get('location') ?? '');
}

async function login(rp: SpikeRelyingParty): Promise<SpikeSession> {
  const { authorizationUrl, pending } = await timed('startLogin', () => rp.startLogin());
  const callback = await timed('browser /authorize', () => browserAuthorize(authorizationUrl));
  return timed('completeLogin (code → token, ID token checks)', () => rp.completeLogin(callback, pending));
}

afterEach(async () => {
  await provider?.close();
  provider = undefined;
});

afterAll(() => {
  if (!process.env['SPK02_TIMINGS']) return;
  const rows = [...timings].map(([label, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    return `| ${label} | ${values.length} | ${median.toFixed(1)} | ${(sorted.at(-1) ?? 0).toFixed(1)} |`;
  });
  console.info(['| Bước | Số lần | Trung vị (ms) | Lớn nhất (ms) |', '| --- | --- | --- | --- |', ...rows].join('\n'));
});

describe('SPK-02 openid-client trên FakeOidcProvider', () => {
  it.each(['discovery', 'static'] as const)('luồng đầy đủ trên stub (%s)', async (mode) => {
    let now = Date.now();
    const op = await startProvider({ now: () => now });
    const rp = rpFor(op, mode, { now: () => now });

    // Discovery or static endpoints, then authorization code + PKCE with state and nonce.
    const config = await timed(`config (${mode})`, () => rp.config());
    expect(config.serverMetadata().issuer).toBe(op.issuer);
    const { authorizationUrl, pending } = await rp.startLogin();
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizationUrl.searchParams.get('code_challenge')).not.toBe(pending.codeVerifier);
    expect(authorizationUrl.searchParams.get('scope')).toBe('openid profile email');
    const session = await rp.completeLogin(await browserAuthorize(authorizationUrl), pending);

    // Claims for account linking (iss, sub) and initial profile (name, email) — ASM-13, INT-OIDC-002.
    expect(session).toMatchObject({
      issuer: op.issuer,
      sub: DEFAULT_FAKE_OIDC_USER.sub,
      name: DEFAULT_FAKE_OIDC_USER.name,
      email: DEFAULT_FAKE_OIDC_USER.email,
      emailVerified: true,
    });
    expect(session.refreshToken).toBeTruthy();
    expect(session.accessExpiresAt).toBe(now + 900_000);
    const info = await timed('userinfo', () => rp.userInfo(session));
    expect(info).toMatchObject({ sub: session.sub, email: DEFAULT_FAKE_OIDC_USER.email });

    // A second login of the same person yields the same (iss, sub): no duplicate account.
    const again = await login(rp);
    expect([again.issuer, again.sub]).toEqual([session.issuer, session.sub]);

    // Callback with a wrong state or a code replay is refused before any session exists (INT-OIDC-001-AC02).
    const forged = await rp.startLogin();
    const callback = await browserAuthorize(forged.authorizationUrl);
    await expect(rp.completeLogin(callback, { ...forged.pending, state: 'other-state' })).rejects.toBeInstanceOf(
      LoginRejectedError,
    );
    await expect(rp.completeLogin(callback, { ...forged.pending, nonce: 'other-nonce' })).rejects.toBeInstanceOf(
      LoginRejectedError,
    );

    // Valid token: no provider call. Near expiry (inside the 30 s skew): refresh rotates the refresh token.
    expect(await rp.ensureFresh(session)).toEqual({ session, refreshed: false });
    now += 871_000;
    const fresh = await timed('refresh', () => rp.ensureFresh(session));
    expect(fresh.refreshed).toBe(true);
    expect(fresh.session.refreshToken).not.toBe(session.refreshToken);
    expect(fresh.session.accessToken).not.toBe(session.accessToken);
    expect(fresh.session.accessExpiresAt).toBe(now + 900_000);
    await expect(rp.userInfo(fresh.session)).resolves.toMatchObject({ sub: session.sub });

    // RP-initiated logout with id_token_hint and an exact post_logout_redirect_uri.
    const logout = await rp.logoutUrl(fresh.session, 'bye');
    expect(logout.searchParams.get('client_id')).toBe(CLIENT_ID);
    const res = await timed('logout', () => fetch(logout, { redirect: 'manual' }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${POST_LOGOUT_URI}?state=bye`);
    expect(op.logouts).toEqual([{ clientId: CLIENT_ID, sub: session.sub, postLogoutRedirectUri: POST_LOGOUT_URI }]);
  });

  it('không khả dụng', async () => {
    let now = Date.now();
    const op = await startProvider({ now: () => now });
    const rp = rpFor(op, 'static', { now: () => now });
    const session = await login(rp);

    for (const mode of ['http_503', 'reset'] as const) {
      op.setUnavailable(mode);
      // New login fails before the browser leaves SIRes, with a typed error the login page can show.
      await expect(timed(`startLogin khi ${mode}`, () => rp.startLogin())).rejects.toBeInstanceOf(
        OidcUnavailableError,
      );
      // Discovery at start-up fails the same way, and the failure is not cached.
      await expect(rpFor(op, 'discovery').config()).rejects.toBeInstanceOf(OidcUnavailableError);
      // The existing session keeps working while its access token is valid (ASM-13, INT-OIDC-004).
      expect((await rp.ensureFresh(session)).refreshed).toBe(false);
    }

    // A callback whose token exchange hits the outage is "unavailable", not "rejected".
    op.setAvailable();
    const { authorizationUrl, pending } = await rp.startLogin();
    const callback = await browserAuthorize(authorizationUrl);
    op.setUnavailable('http_503');
    await expect(rp.completeLogin(callback, pending)).rejects.toBeInstanceOf(OidcUnavailableError);

    // Once the access token expires the session cannot be refreshed: login again (which is unavailable for now).
    now += 900_000;
    await expect(rp.ensureFresh(session)).rejects.toMatchObject({ reason: 'provider_unavailable' });

    // Recovery: discovery that failed earlier now succeeds and login works again.
    op.setAvailable();
    const recovered = rpFor(op, 'discovery', { now: () => now });
    await expect((await login(recovered)).sub).toBe(DEFAULT_FAKE_OIDC_USER.sub);
  });

  it('hết hạn', async () => {
    let now = Date.now();
    const op = await startProvider({ accessTtl: 60, refreshTtl: 120, now: () => now });
    const rp = rpFor(op, 'static', { now: () => now, refreshSkewSeconds: 0 });
    const session = await login(rp);

    // Access token expired mid-session: the resource call fails, ensureFresh refreshes and the call works again.
    now += 61_000;
    await expect(rp.userInfo(session)).rejects.not.toBeInstanceOf(OidcUnavailableError);
    const { session: refreshed, refreshed: didRefresh } = await rp.ensureFresh(session);
    expect(didRefresh).toBe(true);
    await expect(rp.userInfo(refreshed)).resolves.toMatchObject({ sub: session.sub });

    // Concurrent requests on one session refresh once (single-flight); both get the same new tokens.
    now += 61_000;
    const [a, b] = await Promise.all([rp.ensureFresh(refreshed), rp.ensureFresh(refreshed)]);
    expect(a.session.refreshToken).toBe(b.session.refreshToken);
    expect(a.session.refreshToken).not.toBe(refreshed.refreshToken);

    // Without coordination, the second refresh reuses a consumed token and eTroy-style reuse detection kills the
    // whole family: the user is logged out. The gateway must serialise refresh per session (PID-00038).
    const other = await login(rp);
    const race = await Promise.allSettled([rp.refreshWithoutCoordination(other), rp.refreshWithoutCoordination(other)]);
    expect(race.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const winner = race.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<SpikeSession>;
    now += 61_000;
    await expect(rp.ensureFresh(winner.value)).rejects.toMatchObject({ reason: 'refresh_rejected' });

    // Refresh token past its lifetime: refresh is refused, the user must log in again (INT-OIDC-003-AC01).
    now += 121_000;
    await expect(rp.ensureFresh(a.session)).rejects.toBeInstanceOf(ReloginRequiredError);
    await expect(rp.ensureFresh(a.session)).rejects.toMatchObject({ reason: 'refresh_rejected' });
    await expect((await login(rp)).sub).toBe(session.sub);
  });
});
