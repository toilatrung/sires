// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { createPublicKey, verify } from 'node:crypto';
import * as oidc from 'openid-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FAKE_OIDC_USER, FakeOidcProvider } from './oidc.fake';

const CLIENT_ID = 'sires-gateway-test';
const CLIENT_SECRET = 'test-secret-not-real';
const REDIRECT_URI = 'http://localhost:3000/auth/callback';
const POST_LOGOUT_URI = 'http://localhost:3000/signed-out';

let provider: FakeOidcProvider;

async function discover(): Promise<oidc.Configuration> {
  return oidc.discovery(new URL(provider.issuer), CLIENT_ID, undefined, oidc.ClientSecretPost(CLIENT_SECRET), {
    execute: [oidc.allowInsecureRequests],
  });
}

/** Runs /authorize like a browser would (the stub logs the default user in) and returns the callback URL. */
async function authorize(config: oidc.Configuration, verifier: string, state: string, nonce: string): Promise<URL> {
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email',
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  });
  const res = await fetch(url, { redirect: 'manual' });
  expect(res.status).toBe(302);
  return new URL(res.headers.get('location') ?? '');
}

async function login(config: oidc.Configuration) {
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const callback = await authorize(config, verifier, state, nonce);
  return oidc.authorizationCodeGrant(config, callback, {
    pkceCodeVerifier: verifier,
    expectedState: state,
    expectedNonce: nonce,
    idTokenExpected: true,
  });
}

function decodeJwt(jwt: string): { header: Record<string, unknown>; payload: Record<string, unknown> } {
  const [h, p] = jwt.split('.');
  return {
    header: JSON.parse(Buffer.from(h ?? '', 'base64url').toString('utf8')) as Record<string, unknown>,
    payload: JSON.parse(Buffer.from(p ?? '', 'base64url').toString('utf8')) as Record<string, unknown>,
  };
}

beforeEach(async () => {
  provider = await new FakeOidcProvider({
    clients: [
      {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        redirectUris: [REDIRECT_URI],
        postLogoutRedirectUris: [POST_LOGOUT_URI],
      },
    ],
  }).start();
});

afterEach(async () => {
  await provider.close();
});

describe('FakeOidcProvider', () => {
  it('luồng authorization code (PID-00004-AC02)', async () => {
    const config = await discover();
    expect(config.serverMetadata().issuer).toBe(provider.issuer);
    expect(config.serverMetadata().code_challenge_methods_supported).toEqual(['S256']);

    const tokens = await login(config);
    const claims = tokens.claims();
    expect(claims).toMatchObject({
      iss: provider.issuer,
      aud: CLIENT_ID,
      sub: DEFAULT_FAKE_OIDC_USER.sub,
      name: DEFAULT_FAKE_OIDC_USER.name,
      email: DEFAULT_FAKE_OIDC_USER.email,
      email_verified: true,
    });

    // The ID token signature checks against the key published on /jwks (RS256, kid set).
    const idToken = tokens.id_token ?? '';
    const { header } = decodeJwt(idToken);
    expect(header).toMatchObject({ alg: 'RS256', kid: provider.publicJwk.kid });
    const jwks = (await (await fetch(`${provider.issuer}/jwks`)).json()) as { keys: Record<string, string>[] };
    const key = createPublicKey({ key: jwks.keys[0] as never, format: 'jwk' });
    const [h, p, s] = idToken.split('.');
    expect(verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, Buffer.from(s ?? '', 'base64url'))).toBe(true);
    const tampered = `${h}.${Buffer.from(JSON.stringify({ ...decodeJwt(idToken).payload, sub: 'x' })).toString('base64url')}`;
    expect(verify('RSA-SHA256', Buffer.from(tampered), key, Buffer.from(s ?? '', 'base64url'))).toBe(false);

    // Access token works on /userinfo with the same claims.
    const info = await oidc.fetchUserInfo(config, tokens.access_token, DEFAULT_FAKE_OIDC_USER.sub);
    expect(info).toMatchObject({ sub: DEFAULT_FAKE_OIDC_USER.sub, name: DEFAULT_FAKE_OIDC_USER.name, email: DEFAULT_FAKE_OIDC_USER.email });
    expect(tokens.expires_in).toBe(900);
  });

  it('refresh xoay vòng và PKCE sai (PID-00004-AC03)', async () => {
    const config = await discover();
    const first = await login(config);
    const used = first.refresh_token ?? '';
    expect(used).not.toBe('');

    const second = await oidc.refreshTokenGrant(config, used);
    expect(second.refresh_token).toBeDefined();
    expect(second.refresh_token).not.toBe(used);

    // Reusing the consumed token is rejected and compromises the family, so the new token dies too.
    await expect(oidc.refreshTokenGrant(config, used)).rejects.toMatchObject({ error: 'invalid_grant' });
    await expect(oidc.refreshTokenGrant(config, second.refresh_token ?? '')).rejects.toMatchObject({ error: 'invalid_grant' });

    // Wrong code_verifier is rejected; the code stays unused only for the right verifier.
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const callback = await authorize(config, verifier, state, nonce);
    await expect(
      oidc.authorizationCodeGrant(config, callback, {
        pkceCodeVerifier: oidc.randomPKCECodeVerifier(),
        expectedState: state,
        expectedNonce: nonce,
      }),
    ).rejects.toMatchObject({ error: 'invalid_grant' });

    // Missing PKCE at /authorize is refused before any code is issued.
    const noPkce = oidc.buildAuthorizationUrl(config, { redirect_uri: REDIRECT_URI, scope: 'openid', state });
    const res = await fetch(noPkce, { redirect: 'manual' });
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.searchParams.get('error')).toBe('invalid_request');
    expect(location.searchParams.get('code')).toBeNull();
  });

  it('hết hạn token theo đồng hồ của provider', async () => {
    let now = Date.now();
    await provider.close();
    provider = await new FakeOidcProvider({
      clients: [{ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUris: [REDIRECT_URI] }],
      accessTokenTtlSeconds: 60,
      refreshTokenTtlSeconds: 120,
      now: () => now,
    }).start();
    const config = await discover();
    const tokens = await login(config);
    now += 61_000;
    await expect(oidc.fetchUserInfo(config, tokens.access_token, oidc.skipSubjectCheck)).rejects.toThrow();
    now += 60_000;
    await expect(oidc.refreshTokenGrant(config, tokens.refresh_token ?? '')).rejects.toMatchObject({ error: 'invalid_grant' });
  });

  it('không khả dụng (PID-00004 EC03)', async () => {
    provider.setUnavailable();
    await expect(discover()).rejects.toThrow();
    const res = await fetch(`${provider.issuer}/authorize?client_id=${CLIENT_ID}`, { redirect: 'manual' });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'temporarily_unavailable' });

    provider.setUnavailable('reset');
    await expect(fetch(provider.discoveryUrl)).rejects.toThrow();

    provider.setAvailable();
    const config = await discover();
    expect((await login(config)).claims()?.sub).toBe(DEFAULT_FAKE_OIDC_USER.sub);
  });

  it('logout sai uri (PID-00004 EC04)', async () => {
    const config = await discover();
    const tokens = await login(config);
    const idTokenHint = tokens.id_token ?? '';

    const wrong = oidc.buildEndSessionUrl(config, {
      id_token_hint: idTokenHint,
      post_logout_redirect_uri: 'http://localhost:3000/elsewhere',
      state: 's1',
    });
    const rejected = await fetch(wrong, { redirect: 'manual' });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({ error: 'invalid_request' });
    expect(provider.logouts).toHaveLength(0);

    const right = oidc.buildEndSessionUrl(config, {
      id_token_hint: idTokenHint,
      post_logout_redirect_uri: POST_LOGOUT_URI,
      state: 's2',
    });
    const accepted = await fetch(right, { redirect: 'manual' });
    expect(accepted.status).toBe(302);
    expect(accepted.headers.get('location')).toBe(`${POST_LOGOUT_URI}?state=s2`);
    expect(provider.logouts).toEqual([
      { clientId: CLIENT_ID, sub: DEFAULT_FAKE_OIDC_USER.sub, postLogoutRedirectUri: POST_LOGOUT_URI },
    ]);
  });
});
