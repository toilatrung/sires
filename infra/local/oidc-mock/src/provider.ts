// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Cấu hình oidc-provider cho OIDC mock (PID-00160 spec 4.3): đường dẫn như eTroy (/authorize, /token, /userinfo,
// /jwks, /revoke), end_session ở /session/end (RP-Initiated Logout 1.0); PKCE S256 bắt buộc; client_secret_basic;
// claim theo scope trong ID token; thời hạn như eTroy (K8); refresh xoay vòng, dùng lại thì thu hồi grant (K10);
// không có màn đồng ý. Dữ liệu ở bộ nhớ trong: khởi động lại thì mất phiên, grant, token; khóa ký sinh mỗi lần.

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import Provider, { type Configuration, type KoaContextWithOIDC } from 'oidc-provider';
import { ConfigError, type MockConfig } from './config.js';
import { errorPage, loggedOutPage, logoutPage } from './interactions.js';
import type { Logger } from './log.js';
import { AccountStore, type Seeds } from './seed.js';

/** Thời hạn (giây) như eTroy và FakeOidcProvider: token 900, refresh 30 ngày, phiên 8 giờ (K8). */
export const TTL = {
  AccessToken: 900,
  IdToken: 900,
  AuthorizationCode: 300,
  RefreshToken: 30 * 24 * 3600,
  Grant: 30 * 24 * 3600,
  Session: 8 * 3600,
  Interaction: 600,
} as const;

/** Claim theo scope như eTroy (K9). */
export const CLAIMS = {
  openid: ['sub'],
  profile: ['name', 'picture'],
  email: ['email', 'email_verified'],
} as const;

export const ROUTES = {
  authorization: '/authorize',
  token: '/token',
  userinfo: '/userinfo',
  jwks: '/jwks',
  revocation: '/revoke',
  end_session: '/session/end',
} as const;

/** Một khóa RSA 2048 cho RS256, kid mới mỗi lần khởi động (EC13); khóa riêng không ra khỏi tiến trình. */
function signingKey(): { kid: string; jwk: Record<string, unknown> } {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = randomBytes(12).toString('base64url');
  return { kid, jwk: { ...privateKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' } };
}

function oidcError(error: unknown): string {
  const code = (error as { error?: unknown })?.error;
  return typeof code === 'string' ? code : (error as Error)?.name ?? 'error';
}

function clientIdOf(ctx: KoaContextWithOIDC): string | undefined {
  return ctx.oidc?.client?.clientId;
}

export interface MockProvider {
  readonly provider: Provider;
  readonly accounts: AccountStore;
  readonly kid: string;
}

/**
 * Dựng Provider và kiểm metadata của mọi client bằng chính oidc-provider (EC03) trước khi mở cổng; client bị từ
 * chối → ConfigError nêu file.
 */
export async function createProvider(config: MockConfig, seeds: Seeds, log: Logger): Promise<MockProvider> {
  const accounts = new AccountStore(seeds.accounts);
  const { kid, jwk } = signingKey();

  const configuration: Configuration = {
    clients: seeds.clients.map((c) => ({ ...c })) as Configuration['clients'],
    jwks: { keys: [jwk] } as Configuration['jwks'],
    cookies: { keys: [...config.cookieKeys] },
    routes: ROUTES,
    responseTypes: ['code'],
    clientAuthMethods: ['client_secret_basic'],
    enabledJWA: { idTokenSigningAlgValues: ['RS256'] },
    pkce: { required: () => true },
    scopes: ['openid', 'offline_access', 'profile', 'email'],
    claims: Object.fromEntries(Object.entries(CLAIMS).map(([scope, names]) => [scope, [...names]])),
    // ID token có claim theo scope như eTroy, không chỉ khi không có access token.
    conformIdTokenClaims: false,
    ttl: { ...TTL },
    features: {
      devInteractions: { enabled: false },
      revocation: { enabled: true },
      introspection: { enabled: false },
      registration: { enabled: false },
      rpInitiatedLogout: {
        enabled: true,
        logoutSource: async (ctx, form) => {
          ctx.type = 'html';
          ctx.body = logoutPage(form);
        },
        postLogoutSuccessSource: async (ctx) => {
          ctx.type = 'html';
          ctx.body = loggedOutPage();
        },
      },
    },
    // Refresh token cấp cho client có grant refresh_token, không cần offline_access (như eTroy); sống 30 ngày, không
    // gắn với phiên 8 giờ; luôn xoay vòng. Dùng lại token đã tiêu thụ: oidc-provider thu hồi cả grant (K10).
    issueRefreshToken: async (_ctx, client) => client.grantTypeAllowed('refresh_token'),
    expiresWithSession: async () => false,
    rotateRefreshToken: true,
    // Không có màn đồng ý: grant tự có đủ scope OIDC và claim client yêu cầu (H4).
    loadExistingGrant: async (ctx) => {
      const { client, account, session, provider: op } = ctx.oidc;
      if (!client || !account || !session) return undefined;
      const grantId = ctx.oidc.result?.consent?.grantId || session.grantIdFor(client.clientId);
      const grant = (grantId ? await op.Grant.find(grantId) : undefined)
        ?? new op.Grant({ clientId: client.clientId, accountId: account.accountId });
      const scopes = [...ctx.oidc.requestParamOIDCScopes].join(' ');
      if (scopes) grant.addOIDCScope(scopes);
      const claims = [...ctx.oidc.requestParamClaims];
      if (claims.length > 0) grant.addOIDCClaims(claims);
      await grant.save();
      return grant;
    },
    findAccount: async (_ctx, sub) => {
      const account = accounts.findBySub(sub);
      if (!account) return undefined;
      return {
        accountId: account.sub,
        claims: async () => ({
          sub: account.sub,
          name: account.name,
          email: account.email,
          email_verified: account.email_verified,
          ...(account.picture ? { picture: account.picture } : {}),
        }),
      };
    },
    interactions: { url: (_ctx, interaction) => `/interaction/${interaction.uid}` },
    renderError: async (ctx, out) => {
      ctx.type = 'html';
      ctx.body = errorPage({ ...out });
    },
  };

  const provider = new Provider(config.issuer, configuration);
  // Sau tunnel hay reverse proxy: endpoint dựng từ X-Forwarded-Proto, X-Forwarded-Host (EC07).
  provider.proxy = true;

  for (const client of seeds.clients) {
    try {
      await provider.Client.find(client.client_id);
    } catch (error) {
      throw new ConfigError(`${config.clientsFile}: client ${client.client_id} bị oidc-provider từ chối (${oidcError(error)})`);
    }
  }

  provider.on('grant.success', (ctx) => log.event('grant.success', {
    client_id: clientIdOf(ctx),
    grant_type: String(ctx.oidc.params?.grant_type ?? ''),
    sub: ctx.oidc.account?.accountId,
  }));
  const onError = (event: string) => (ctx: KoaContextWithOIDC, error: unknown) =>
    log.event(event, { client_id: clientIdOf(ctx), error: oidcError(error) });
  provider.on('grant.error', onError('grant.error'));
  provider.on('authorization.error', onError('authorization.error'));
  provider.on('end_session.error', onError('end_session.error'));
  provider.on('revocation.error', onError('revocation.error'));
  provider.on('userinfo.error', onError('userinfo.error'));
  provider.on('end_session.success', (ctx) => log.event('end_session.success', { client_id: clientIdOf(ctx) }));
  // oidc-provider 9.15 không phát revocation.success: main.ts ghi khi POST /revoke trả 200.
  provider.on('server_error', (ctx, error) => log.event('server_error', { client_id: clientIdOf(ctx), error: oidcError(error) }));

  return { provider, accounts, kid };
}
