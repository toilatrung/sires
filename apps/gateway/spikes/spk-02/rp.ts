// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// SPK-02 (PID-00015): how the gateway would use openid-client as the OIDC RP of eTroy OIDC (ADR-09, ADR-27).
// Spike code only: it lives outside src/, is not built and is not imported by the service. PID-00038 writes the
// real login flow. Everything the gateway keeps (pending login, tokens) stays server-side; nothing here is logged.

import * as oidc from 'openid-client';

export interface SpikeRpOptions {
  issuer: URL;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  /** Defaults to "openid profile email" (ASM-13: sub, name, email). */
  scope?: string;
  /**
   * `discovery`: read /.well-known/openid-configuration (the stub serves it).
   * `static`: build the configuration from known endpoints, as eTroy OIDC publishes no discovery document.
   */
  metadata: { mode: 'discovery' } | { mode: 'static'; server: oidc.ServerMetadata };
  /** Per-request timeout for every call to the provider. Defaults to 5 s. */
  timeoutSeconds?: number;
  /** Only for the http stub; eTroy OIDC is https. */
  allowInsecureRequests?: boolean;
  /** Clock in milliseconds, shared with the stub in expiry tests. */
  now?: () => number;
  /** Refresh this many seconds before the access token expires. Defaults to 30. */
  refreshSkewSeconds?: number;
}

/** What the gateway keeps between redirecting to /authorize and handling the callback. */
export interface PendingLogin {
  state: string;
  nonce: string;
  codeVerifier: string;
  createdAt: number;
}

/** Server-side session content. Account linking key is (issuer, sub) — INT-OIDC-002. */
export interface SpikeSession {
  issuer: string;
  sub: string;
  name?: string;
  email?: string;
  emailVerified?: boolean;
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  accessExpiresAt: number;
}

/** eTroy OIDC did not answer (5xx, connection error, timeout): INT-OIDC-004, no new login. */
export class OidcUnavailableError extends Error {
  override readonly name = 'OidcUnavailableError';
}

/** The callback was rejected: state, nonce, signature, issuer, audience or code checks failed (INT-OIDC-001-AC02). */
export class LoginRejectedError extends Error {
  override readonly name = 'LoginRejectedError';
}

/** The session can no longer be kept: refresh failed or is impossible (INT-OIDC-003-AC01). */
export class ReloginRequiredError extends Error {
  override readonly name = 'ReloginRequiredError';
  constructor(readonly reason: 'refresh_rejected' | 'no_refresh_token' | 'provider_unavailable') {
    super(`login required: ${reason}`);
  }
}

export class SpikeRelyingParty {
  private configuration?: Promise<oidc.Configuration>;
  /** One refresh in flight per refresh token: eTroy rotates refresh tokens and treats reuse as compromise. */
  private readonly refreshing = new Map<string, Promise<SpikeSession>>();
  private readonly now: () => number;
  private readonly scope: string;
  private readonly timeout: number;
  private readonly skewMs: number;

  constructor(private readonly options: SpikeRpOptions) {
    this.now = options.now ?? Date.now;
    this.scope = options.scope ?? 'openid profile email';
    this.timeout = options.timeoutSeconds ?? 5;
    this.skewMs = (options.refreshSkewSeconds ?? 30) * 1000;
  }

  /** Resolves the provider configuration once; a failed attempt is not cached. */
  config(): Promise<oidc.Configuration> {
    this.configuration ??= this.createConfiguration().catch((error: unknown) => {
      this.configuration = undefined;
      throw toUnavailable(error) ?? error;
    });
    return this.configuration;
  }

  /**
   * Step 1 of login. Probes the provider first so an outage shows the SIRes message (INT-OIDC-004) instead of a
   * browser error page at eTroy. The returned pending login is stored server-side, keyed by a short-lived cookie.
   */
  async startLogin(): Promise<{ authorizationUrl: URL; pending: PendingLogin }> {
    const config = await this.config();
    await this.probe(config);
    const pending: PendingLogin = {
      state: oidc.randomState(),
      nonce: oidc.randomNonce(),
      codeVerifier: oidc.randomPKCECodeVerifier(),
      createdAt: this.now(),
    };
    const authorizationUrl = oidc.buildAuthorizationUrl(config, {
      redirect_uri: this.options.redirectUri,
      scope: this.scope,
      code_challenge: await oidc.calculatePKCECodeChallenge(pending.codeVerifier),
      code_challenge_method: 'S256',
      state: pending.state,
      nonce: pending.nonce,
    });
    return { authorizationUrl, pending };
  }

  /** Step 2: the callback. openid-client checks state, PKCE, ID token signature (JWKS), iss, aud, exp and nonce. */
  async completeLogin(callbackUrl: URL, pending: PendingLogin): Promise<SpikeSession> {
    const config = await this.config();
    let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
    try {
      tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: pending.codeVerifier,
        expectedState: pending.state,
        expectedNonce: pending.nonce,
        idTokenExpected: true,
      });
    } catch (error) {
      throw toUnavailable(error) ?? new LoginRejectedError(describe(error), { cause: error });
    }
    const claims = tokens.claims();
    if (!claims || !tokens.id_token) throw new LoginRejectedError('ID token missing');
    return {
      issuer: claims.iss,
      sub: claims.sub,
      name: typeof claims['name'] === 'string' ? claims['name'] : undefined,
      email: typeof claims['email'] === 'string' ? claims['email'] : undefined,
      emailVerified: typeof claims['email_verified'] === 'boolean' ? claims['email_verified'] : undefined,
      idToken: tokens.id_token,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessExpiresAt: this.expiresAt(tokens.expires_in),
    };
  }

  /**
   * Called before using the session. A valid access token needs no provider call, so an outage does not end the
   * session (ASM-13, INT-OIDC-004). An expiring one is refreshed once, even under concurrent requests.
   */
  async ensureFresh(session: SpikeSession): Promise<{ session: SpikeSession; refreshed: boolean }> {
    if (this.now() < session.accessExpiresAt - this.skewMs) return { session, refreshed: false };
    const refreshToken = session.refreshToken;
    if (!refreshToken) throw new ReloginRequiredError('no_refresh_token');
    let inFlight = this.refreshing.get(refreshToken);
    if (!inFlight) {
      inFlight = this.refresh(session, refreshToken).finally(() => this.refreshing.delete(refreshToken));
      this.refreshing.set(refreshToken, inFlight);
    }
    return { session: await inFlight, refreshed: true };
  }

  /** Same as ensureFresh but without single-flight, to show what concurrent refreshes do to a rotating family. */
  async refreshWithoutCoordination(session: SpikeSession): Promise<SpikeSession> {
    if (!session.refreshToken) throw new ReloginRequiredError('no_refresh_token');
    return this.refresh(session, session.refreshToken);
  }

  /** Reads /userinfo with the session's access token; the subject must match the ID token. */
  async userInfo(session: SpikeSession): Promise<oidc.UserInfoResponse> {
    const config = await this.config();
    try {
      return await oidc.fetchUserInfo(config, session.accessToken, session.sub);
    } catch (error) {
      throw toUnavailable(error) ?? error;
    }
  }

  /** RP-initiated logout (ADR-27): the browser is sent here after the SIRes session is deleted. */
  async logoutUrl(session: SpikeSession, state: string): Promise<URL> {
    const config = await this.config();
    return oidc.buildEndSessionUrl(config, {
      id_token_hint: session.idToken,
      post_logout_redirect_uri: this.options.postLogoutRedirectUri,
      client_id: this.options.clientId,
      state,
    });
  }

  private async refresh(session: SpikeSession, refreshToken: string): Promise<SpikeSession> {
    const config = await this.config().catch((error: unknown) => {
      throw error instanceof OidcUnavailableError ? new ReloginRequiredError('provider_unavailable') : error;
    });
    try {
      const tokens = await oidc.refreshTokenGrant(config, refreshToken);
      return {
        ...session,
        // eTroy returns a new ID token on refresh (refresh-token contract); the stub does not.
        idToken: tokens.id_token ?? session.idToken,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? refreshToken,
        accessExpiresAt: this.expiresAt(tokens.expires_in),
      };
    } catch (error) {
      if (toUnavailable(error)) throw new ReloginRequiredError('provider_unavailable');
      if (error instanceof oidc.ResponseBodyError && error.error === 'invalid_grant') {
        throw new ReloginRequiredError('refresh_rejected');
      }
      throw error;
    }
  }

  private async probe(config: oidc.Configuration): Promise<void> {
    const jwksUri = config.serverMetadata().jwks_uri;
    if (!jwksUri) return;
    try {
      const res = await fetch(jwksUri, { signal: AbortSignal.timeout(this.timeout * 1000) });
      if (res.status >= 500) throw new OidcUnavailableError(`JWKS answered ${res.status}`);
    } catch (error) {
      throw toUnavailable(error) ?? error;
    }
  }

  private async createConfiguration(): Promise<oidc.Configuration> {
    const { issuer, clientId, clientSecret, metadata, allowInsecureRequests } = this.options;
    const auth = oidc.ClientSecretBasic(clientSecret);
    let config: oidc.Configuration;
    if (metadata.mode === 'discovery') {
      config = await oidc.discovery(issuer, clientId, undefined, auth, {
        timeout: this.timeout,
        ...(allowInsecureRequests ? { execute: [oidc.allowInsecureRequests] } : {}),
      });
    } else {
      config = new oidc.Configuration(metadata.server, clientId, undefined, auth);
      if (allowInsecureRequests) oidc.allowInsecureRequests(config);
    }
    config.timeout = this.timeout;
    return config;
  }

  private expiresAt(expiresIn: number | undefined): number {
    // eTroy always sends expires_in (900 s); without it the token is treated as already expiring.
    return this.now() + (expiresIn ?? 0) * 1000;
  }
}

/** Maps transport failures and 5xx answers to OidcUnavailableError; returns undefined for anything else. */
export function toUnavailable(error: unknown): OidcUnavailableError | undefined {
  if (error instanceof OidcUnavailableError) return error;
  for (let e: unknown = error, depth = 0; e && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    if (e instanceof oidc.ResponseBodyError && (e.status >= 500 || e.error === 'temporarily_unavailable')) {
      return new OidcUnavailableError(`provider answered ${e.status} ${e.error}`, { cause: error });
    }
    if (e instanceof Response && e.status >= 500) {
      return new OidcUnavailableError(`provider answered ${e.status}`, { cause: error });
    }
    const name = (e as { name?: string }).name;
    if (e instanceof TypeError || name === 'TimeoutError' || name === 'AbortError') {
      return new OidcUnavailableError(`provider unreachable: ${describe(e)}`, { cause: error });
    }
  }
  return undefined;
}

function describe(error: unknown): string {
  if (error instanceof oidc.ResponseBodyError || error instanceof oidc.AuthorizationResponseError) {
    return `${error.error}${error.error_description ? `: ${error.error_description}` : ''}`;
  }
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
