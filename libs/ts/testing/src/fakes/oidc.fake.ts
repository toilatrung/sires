// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
  timingSafeEqual,
  verify,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';

// Stub OIDC provider for tests only (PID-00004 S02). It follows the eTroy OIDC flow (ASM-13): authorization code +
// PKCE S256, /token, opaque rotating refresh tokens with reuse detection, RS256 ID token with sub, name, email,
// JWKS, /userinfo, RP-initiated logout with exact post_logout_redirect_uri matching. The signing key is generated
// per instance and never leaves the process. eTroy OIDC itself has no discovery document; the stub serves one so
// openid-client can discover it.

export interface FakeOidcUser {
  sub: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  picture?: string;
}

export interface FakeOidcClient {
  clientId: string;
  /** Omit for a public client (token endpoint auth `none`, PKCE only). */
  clientSecret?: string;
  /** Exact-match list, as eTroy OIDC does. */
  redirectUris: readonly string[];
  /** Exact-match list for RP-initiated logout; anything else is rejected. */
  postLogoutRedirectUris?: readonly string[];
}

export interface FakeOidcProviderOptions {
  clients: readonly FakeOidcClient[];
  /** Defaults to one user, DEFAULT_FAKE_OIDC_USER. */
  users?: readonly FakeOidcUser[];
  /** Access and ID token lifetime; eTroy default 900. */
  accessTokenTtlSeconds?: number;
  /** eTroy default 30 days. */
  refreshTokenTtlSeconds?: number;
  /** eTroy default 300. */
  authorizationCodeTtlSeconds?: number;
  /** Clock in milliseconds, for expiry tests. Tokens carry iat/exp from this clock. */
  now?: () => number;
  /** Bind address; defaults to 127.0.0.1 on a random port. */
  host?: string;
  port?: number;
}

/** `http_503`: every endpoint answers 503 temporarily_unavailable. `reset`: connections are dropped. */
export type FakeOidcOutage = 'http_503' | 'reset';

export interface FakeOidcLogout {
  clientId?: string;
  sub?: string;
  postLogoutRedirectUri?: string;
}

export const DEFAULT_FAKE_OIDC_USER: FakeOidcUser = {
  sub: 'fake-user-0001',
  name: 'Nguyễn Văn Thử',
  email: 'researcher@example.test',
  emailVerified: true,
};

const SUPPORTED_SCOPES = new Set(['openid', 'profile', 'email']);
const CODE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const KEY_ID = 'fake-oidc-test-key';

interface AuthorizationCode {
  clientId: string;
  redirectUri: string;
  scope: string;
  nonce?: string;
  codeChallenge: string;
  sub: string;
  expiresAt: number;
  used: boolean;
}

interface RefreshRecord {
  familyId: string;
  clientId: string;
  sub: string;
  scope: string;
  expiresAt: number;
  status: 'active' | 'consumed' | 'compromised';
}

class OidcError extends Error {
  constructor(
    readonly status: number,
    readonly error: string,
    description: string,
  ) {
    super(description);
  }
}

const b64url = (input: Buffer | string): string => Buffer.from(input).toString('base64url');
const sha256 = (input: string): Buffer => createHash('sha256').update(input).digest();
const token = (): string => randomBytes(32).toString('base64url');

export class FakeOidcProvider {
  private readonly clients = new Map<string, FakeOidcClient>();
  private readonly users: FakeOidcUser[];
  private readonly codes = new Map<string, AuthorizationCode>();
  private readonly refreshTokens = new Map<string, RefreshRecord>();
  private readonly compromisedFamilies = new Set<string>();
  private readonly sockets = new Set<Socket>();
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly now: () => number;
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  private readonly codeTtl: number;
  private server?: Server;
  private outage?: FakeOidcOutage;
  private issuerUrl?: string;
  /** Every accepted RP-initiated logout, in order. */
  readonly logouts: FakeOidcLogout[] = [];

  constructor(private readonly options: FakeOidcProviderOptions) {
    for (const client of options.clients) this.clients.set(client.clientId, client);
    this.users = [...(options.users ?? [DEFAULT_FAKE_OIDC_USER])];
    this.now = options.now ?? Date.now;
    this.accessTtl = options.accessTokenTtlSeconds ?? 900;
    this.refreshTtl = options.refreshTokenTtlSeconds ?? 30 * 24 * 3600;
    this.codeTtl = options.authorizationCodeTtlSeconds ?? 300;
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey;
  }

  /** Starts the HTTP server; resolves with the provider for chaining. */
  async start(): Promise<this> {
    if (this.server) return this;
    const server = createServer((req, res) => void this.handle(req, res));
    server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.options.port ?? 0, this.options.host ?? '127.0.0.1', () => resolve());
    });
    const { address, port } = server.address() as AddressInfo;
    this.issuerUrl = `http://${address}:${port}`;
    this.server = server;
    return this;
  }

  async close(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = undefined;
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  /** Issuer URL, e.g. http://127.0.0.1:54321. Available after start(). */
  get issuer(): string {
    if (!this.issuerUrl) throw new Error('FakeOidcProvider not started');
    return this.issuerUrl;
  }

  get discoveryUrl(): string {
    return `${this.issuer}/.well-known/openid-configuration`;
  }

  /** Public verification key as published on /jwks. */
  get publicJwk(): JsonWebKey {
    return { ...this.publicKey.export({ format: 'jwk' }), kid: KEY_ID, alg: 'RS256', use: 'sig' };
  }

  /** Puts the provider in an outage (discovery and login fail) until setAvailable(). */
  setUnavailable(mode: FakeOidcOutage = 'http_503'): void {
    this.outage = mode;
  }

  setAvailable(): void {
    this.outage = undefined;
  }

  get available(): boolean {
    return this.outage === undefined;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (this.outage === 'reset') {
      req.socket.destroy();
      return;
    }
    try {
      if (this.outage === 'http_503') {
        throw new OidcError(503, 'temporarily_unavailable', 'OIDC provider is unavailable');
      }
      const url = new URL(req.url ?? '/', this.issuer);
      const params = req.method === 'POST' ? await readForm(req) : url.searchParams;
      const route = `${req.method} ${url.pathname}`;
      switch (route) {
        case 'GET /.well-known/openid-configuration':
          return sendJson(res, 200, this.discovery());
        case 'GET /jwks':
          return sendJson(res, 200, { keys: [this.publicJwk] });
        case 'GET /authorize':
          return this.authorize(params, res);
        case 'POST /token':
          return sendJson(res, 200, this.tokenEndpoint(params, req.headers.authorization));
        case 'GET /userinfo':
          return sendJson(res, 200, this.userinfo(req.headers.authorization));
        case 'GET /logout':
        case 'POST /logout':
          return this.logout(params, res);
        default:
          throw new OidcError(404, 'not_found', `${route} is not served by FakeOidcProvider`);
      }
    } catch (error) {
      if (error instanceof OidcError) {
        if (error.status === 401) res.setHeader('WWW-Authenticate', `Bearer error="${error.error}"`);
        return sendJson(res, error.status, { error: error.error, error_description: error.message });
      }
      return sendJson(res, 500, { error: 'server_error', error_description: String(error) });
    }
  }

  private discovery(): Record<string, unknown> {
    const issuer = this.issuer;
    return {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      userinfo_endpoint: `${issuer}/userinfo`,
      jwks_uri: `${issuer}/jwks`,
      end_session_endpoint: `${issuer}/logout`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: [...SUPPORTED_SCOPES],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
      code_challenge_methods_supported: ['S256'],
      claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'nonce', 'name', 'picture', 'email', 'email_verified'],
    };
  }

  private authorize(params: URLSearchParams, res: ServerResponse): void {
    const client = this.clients.get(params.get('client_id') ?? '');
    if (!client) throw new OidcError(400, 'invalid_client', 'unknown client_id');
    const redirectUri = params.get('redirect_uri') ?? '';
    if (!client.redirectUris.includes(redirectUri)) {
      throw new OidcError(400, 'invalid_request', 'redirect_uri is not registered for this client');
    }
    const back = new URL(redirectUri);
    const state = params.get('state');
    if (state !== null) back.searchParams.set('state', state);
    const fail = (error: string, description: string): void => {
      back.searchParams.set('error', error);
      back.searchParams.set('error_description', description);
      redirect(res, back);
    };
    if (params.get('response_type') !== 'code') return fail('unsupported_response_type', 'only code is supported');
    const scopes = (params.get('scope') ?? '').split(' ').filter(Boolean);
    if (!scopes.includes('openid') || !scopes.every((s) => SUPPORTED_SCOPES.has(s))) {
      return fail('invalid_scope', 'scope must include openid and only openid, profile, email');
    }
    const codeChallenge = params.get('code_challenge');
    if (!codeChallenge || params.get('code_challenge_method') !== 'S256') {
      return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required');
    }
    const hint = params.get('login_hint');
    const user = hint ? this.users.find((u) => u.sub === hint || u.email === hint) : this.users[0];
    if (!user) return fail('access_denied', 'no test user matches login_hint');
    const code = token();
    this.codes.set(code, {
      clientId: client.clientId,
      redirectUri,
      scope: scopes.join(' '),
      nonce: params.get('nonce') ?? undefined,
      codeChallenge,
      sub: user.sub,
      expiresAt: this.now() + this.codeTtl * 1000,
      used: false,
    });
    back.searchParams.set('code', code);
    redirect(res, back);
  }

  private authenticateClient(params: URLSearchParams, authorization?: string): FakeOidcClient {
    let clientId = params.get('client_id') ?? undefined;
    let secret = params.get('client_secret') ?? undefined;
    if (authorization?.startsWith('Basic ')) {
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      clientId = decodeURIComponent(decoded.slice(0, colon));
      secret = decodeURIComponent(decoded.slice(colon + 1));
    }
    const client = this.clients.get(clientId ?? '');
    if (!client) throw new OidcError(401, 'invalid_client', 'unknown client');
    if (client.clientSecret !== undefined && !safeEqual(client.clientSecret, secret ?? '')) {
      throw new OidcError(401, 'invalid_client', 'client authentication failed');
    }
    return client;
  }

  private tokenEndpoint(params: URLSearchParams, authorization?: string): Record<string, unknown> {
    const client = this.authenticateClient(params, authorization);
    const grantType = params.get('grant_type');
    if (grantType === 'authorization_code') return this.exchangeCode(client, params);
    if (grantType === 'refresh_token') return this.rotateRefreshToken(client, params);
    throw new OidcError(400, 'unsupported_grant_type', `grant_type ${grantType ?? '(none)'} is not supported`);
  }

  private exchangeCode(client: FakeOidcClient, params: URLSearchParams): Record<string, unknown> {
    const invalid = (why: string) => new OidcError(400, 'invalid_grant', why);
    const record = this.codes.get(params.get('code') ?? '');
    if (!record || record.used) throw invalid('authorization code is invalid or already used');
    if (record.expiresAt <= this.now()) throw invalid('authorization code expired');
    if (record.clientId !== client.clientId || record.redirectUri !== params.get('redirect_uri')) {
      throw invalid('authorization code was issued to another client or redirect_uri');
    }
    const verifier = params.get('code_verifier') ?? '';
    if (!CODE_VERIFIER.test(verifier) || b64url(sha256(verifier)) !== record.codeChallenge) {
      throw invalid('code_verifier does not match code_challenge');
    }
    record.used = true;
    const user = this.user(record.sub);
    const refreshToken = this.issueRefreshToken(randomBytes(16).toString('hex'), client.clientId, user.sub, record.scope);
    return {
      access_token: this.accessToken(client.clientId, user, record.scope),
      token_type: 'Bearer',
      expires_in: this.accessTtl,
      id_token: this.idToken(client.clientId, user, record.scope, record.nonce),
      refresh_token: refreshToken,
      scope: record.scope,
    };
  }

  private rotateRefreshToken(client: FakeOidcClient, params: URLSearchParams): Record<string, unknown> {
    // Non-revealing answer for every failure, as eTroy OIDC does.
    const invalid = new OidcError(400, 'invalid_grant', 'refresh token is invalid');
    const presented = params.get('refresh_token') ?? '';
    const hash = b64url(sha256(presented));
    const record = this.refreshTokens.get(hash);
    if (!record || record.clientId !== client.clientId) throw invalid;
    if (record.status !== 'active' || this.compromisedFamilies.has(record.familyId)) {
      // Reuse of a consumed token: the whole family is compromised.
      this.compromisedFamilies.add(record.familyId);
      for (const r of this.refreshTokens.values()) if (r.familyId === record.familyId) r.status = 'compromised';
      throw invalid;
    }
    if (record.expiresAt <= this.now()) throw invalid;
    record.status = 'consumed';
    const user = this.user(record.sub);
    return {
      access_token: this.accessToken(client.clientId, user, record.scope),
      token_type: 'Bearer',
      expires_in: this.accessTtl,
      refresh_token: this.issueRefreshToken(record.familyId, client.clientId, user.sub, record.scope),
      scope: record.scope,
    };
  }

  private issueRefreshToken(familyId: string, clientId: string, sub: string, scope: string): string {
    const value = token();
    this.refreshTokens.set(b64url(sha256(value)), {
      familyId,
      clientId,
      sub,
      scope,
      expiresAt: this.now() + this.refreshTtl * 1000,
      status: 'active',
    });
    return value;
  }

  private userinfo(authorization?: string): Record<string, unknown> {
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const claims = this.verifyJwt(bearer);
    // Access tokens carry `scope`; ID tokens do not (eTroy JWT token contract).
    if (!claims || typeof claims['scope'] !== 'string' || Number(claims['exp']) * 1000 <= this.now()) {
      throw new OidcError(401, 'invalid_token', 'access token is invalid or expired');
    }
    const user = this.user(String(claims['sub']));
    return scopedClaims(user, String(claims['scope']));
  }

  private logout(params: URLSearchParams, res: ServerResponse): void {
    const hint = params.get('id_token_hint');
    // id_token_hint may be expired (OIDC RP-Initiated Logout 1.0); only the signature is checked.
    const hinted = hint ? this.verifyJwt(hint) : undefined;
    if (hint && !hinted) throw new OidcError(400, 'invalid_request', 'id_token_hint is not a valid ID token');
    const clientId = params.get('client_id') ?? (hinted ? String(hinted['aud']) : undefined);
    const postLogout = params.get('post_logout_redirect_uri') ?? undefined;
    const client = clientId ? this.clients.get(clientId) : undefined;
    if (clientId && !client) throw new OidcError(400, 'invalid_request', 'unknown client_id');
    if (postLogout !== undefined && !client?.postLogoutRedirectUris?.includes(postLogout)) {
      throw new OidcError(400, 'invalid_request', 'post_logout_redirect_uri is not registered for this client');
    }
    this.logouts.push({ clientId, sub: hinted ? String(hinted['sub']) : undefined, postLogoutRedirectUri: postLogout });
    if (postLogout === undefined) return sendJson(res, 200, { logged_out: true });
    const back = new URL(postLogout);
    const state = params.get('state');
    if (state !== null) back.searchParams.set('state', state);
    redirect(res, back);
  }

  private user(sub: string): FakeOidcUser {
    const user = this.users.find((u) => u.sub === sub);
    if (!user) throw new OidcError(400, 'invalid_grant', 'unknown subject');
    return user;
  }

  private accessToken(clientId: string, user: FakeOidcUser, scope: string): string {
    const iat = Math.floor(this.now() / 1000);
    return this.signJwt({ iss: this.issuer, sub: user.sub, aud: clientId, iat, exp: iat + this.accessTtl, scope });
  }

  private idToken(clientId: string, user: FakeOidcUser, scope: string, nonce?: string): string {
    const iat = Math.floor(this.now() / 1000);
    return this.signJwt({
      iss: this.issuer,
      sub: user.sub,
      aud: clientId,
      iat,
      exp: iat + this.accessTtl,
      ...(nonce === undefined ? {} : { nonce }),
      ...scopedClaims(user, scope),
    });
  }

  private signJwt(payload: Record<string, unknown>): string {
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KEY_ID }));
    const body = b64url(JSON.stringify(payload));
    const signature = sign('RSA-SHA256', Buffer.from(`${header}.${body}`), this.privateKey);
    return `${header}.${body}.${b64url(signature)}`;
  }

  /** Returns the payload when the signature is ours; does not check exp. */
  private verifyJwt(jwt: string): Record<string, unknown> | undefined {
    const [header, body, signature] = jwt.split('.');
    if (!header || !body || !signature) return undefined;
    const ok = verify('RSA-SHA256', Buffer.from(`${header}.${body}`), this.publicKey, Buffer.from(signature, 'base64url'));
    if (!ok) return undefined;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
    return payload['iss'] === this.issuer ? payload : undefined;
  }
}

/** Claims by granted scope, as the eTroy claims mapper does. */
function scopedClaims(user: FakeOidcUser, scope: string): Record<string, unknown> {
  const scopes = new Set(scope.split(' '));
  return {
    sub: user.sub,
    ...(scopes.has('profile') ? { name: user.name, ...(user.picture ? { picture: user.picture } : {}) } : {}),
    ...(scopes.has('email') ? { email: user.email, email_verified: user.emailVerified ?? true } : {}),
  };
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function redirect(res: ServerResponse, location: URL): void {
  res.writeHead(302, { Location: location.toString(), 'Cache-Control': 'no-store' });
  res.end();
}
