// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Session of the SPA (spec 4.7, UX-AUTH-001, UX-AUTH-002, INT-OIDC-003, ADR-27, H11).
// - check(): on app load, GET /auth/session; 401 → /sign-in?returnTo=<current path>; then GET /me.
// - touch(): GET /auth/session on each user navigation (S13). Never on a timer, never for background requests.
// - expire(): every 401 while in use → drafts saved, SSE closed, /sign-in?reason=session-expired&returnTo=….

import type { PublicApi } from '@sires/contracts';
import type { ApiClient } from '../api/client';
import { ApiError, isApiError } from '../api/errors';

export type Account = PublicApi.components['schemas']['Account'];
export interface SessionInfo {
  accountId: string;
  expiresAt: string;
  csrfToken: string;
}

export type SessionState =
  | { status: 'unknown' }
  | { status: 'checking' }
  | { status: 'signed-in'; session: SessionInfo; account?: Account; accountEtag?: string }
  | { status: 'signed-out' }
  | { status: 'expired' }
  | { status: 'error'; error: ApiError };

/** Route of the sign-in screen (PID-00036) and the query parameters the shell passes to it. */
export const SIGN_IN_PATH = '/sign-in';
export const RETURN_TO_PARAM = 'returnTo';
export const REASON_PARAM = 'reason';
export const REASON_SESSION_EXPIRED = 'session-expired';

/** Relative in-app path only (startLogin returnTo pattern ^/); no protocol-relative “//host”, never /sign-in itself. */
export function safeReturnTo(path: string | null | undefined): string | undefined {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return undefined;
  if (path === SIGN_IN_PATH || path.startsWith(`${SIGN_IN_PATH}?`) || path.startsWith(`${SIGN_IN_PATH}/`)) return undefined;
  return path;
}

export function signInPath(options: { returnTo?: string; reason?: typeof REASON_SESSION_EXPIRED } = {}): string {
  const search = new URLSearchParams();
  if (options.reason) search.set(REASON_PARAM, options.reason);
  const returnTo = safeReturnTo(options.returnTo);
  if (returnTo) search.set(RETURN_TO_PARAM, returnTo);
  const s = search.toString();
  return s ? `${SIGN_IN_PATH}?${s}` : SIGN_IN_PATH;
}

export interface SessionControllerOptions {
  api: ApiClient;
  /** In-app navigation (the router); `replace` so Back does not return to a screen that needs the session. */
  navigate: (to: string) => void;
  /** Current in-app path with search and hash. */
  currentPath: () => string;
}

type Listener = (state: SessionState) => void;

export class SessionController {
  private state: SessionState = { status: 'unknown' };
  private readonly listeners = new Set<Listener>();
  private readonly expireHooks = new Set<() => void>();
  private readonly accountHooks = new Set<(account: Account) => void>();
  private checking?: Promise<SessionState>;

  constructor(private readonly options: SessionControllerOptions) {
    options.api.setCsrfProvider(() => this.csrfToken());
    options.api.setUnauthenticatedHandler(() => this.expire());
  }

  get current(): SessionState {
    return this.state;
  }

  get accountId(): string | undefined {
    return this.state.status === 'signed-in' ? this.state.session.accountId : undefined;
  }

  get signedIn(): boolean {
    return this.state.status === 'signed-in';
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Runs right before the session-expired redirect (drafts flush, SSE close). */
  onExpire(hook: () => void): () => void {
    this.expireHooks.add(hook);
    return () => this.expireHooks.delete(hook);
  }

  /** Runs whenever GET /me returns the account (language from Preferences, avatar initials). */
  onAccount(hook: (account: Account) => void): () => void {
    this.accountHooks.add(hook);
    return () => this.accountHooks.delete(hook);
  }

  private set(next: SessionState): void {
    this.state = next;
    for (const listener of [...this.listeners]) listener(next);
  }

  /** Check the session once on app load (UX-AUTH-001). Concurrent calls share one request. */
  ensureChecked(): Promise<SessionState> {
    if (this.state.status === 'signed-in' || this.state.status === 'signed-out' || this.state.status === 'expired') {
      return Promise.resolve(this.state);
    }
    return this.check();
  }

  check(): Promise<SessionState> {
    if (this.checking) return this.checking;
    this.set({ status: 'checking' });
    this.checking = this.runCheck().finally(() => {
      this.checking = undefined;
    });
    return this.checking;
  }

  private async runCheck(): Promise<SessionState> {
    let session: SessionInfo;
    try {
      ({ data: session } = await this.options.api.get('/auth/session', { skipUnauthenticatedHandler: true }));
    } catch (error) {
      if (isApiError(error) && error.unauthenticated) {
        this.set({ status: 'signed-out' });
        this.options.navigate(signInPath({ returnTo: this.options.currentPath() }));
      } else {
        this.set({ status: 'error', error: isApiError(error) ? error : new ApiError('network') });
      }
      return this.state;
    }
    this.set({ status: 'signed-in', session });
    await this.loadAccount();
    return this.state;
  }

  /** GET /me: account, Preferences and the ETag the next PATCH /me/preferences sends as If-Match (H2). */
  async loadAccount(): Promise<Account | undefined> {
    if (this.state.status !== 'signed-in') return undefined;
    try {
      const { data: account, etag } = await this.options.api.get('/me');
      if (this.state.status !== 'signed-in') return undefined;
      this.set({ ...this.state, account, accountEtag: etag });
      for (const hook of [...this.accountHooks]) hook(account);
      return account;
    } catch {
      // 401 already went to the session-expired flow; other errors leave the frame without account data.
      return undefined;
    }
  }

  /** After a successful PATCH /me/…: keep the new account and ETag. */
  setAccount(account: Account, etag: string | undefined): void {
    if (this.state.status !== 'signed-in') return;
    this.set({ ...this.state, account, accountEtag: etag ?? this.state.accountEtag });
  }

  /**
   * GET /auth/session for a user navigation or a screen being opened (S13, H11): the gateway counts it as user
   * activity and extends the session. Also refreshes csrfToken and expiresAt. Never call it from a timer.
   */
  async touch(): Promise<void> {
    if (this.state.status !== 'signed-in') return;
    try {
      const { data } = await this.options.api.get('/auth/session', { skipUnauthenticatedHandler: true });
      if (this.state.status === 'signed-in') this.set({ ...this.state, session: data });
    } catch (error) {
      if (isApiError(error) && error.unauthenticated) this.expire();
    }
  }

  /** CSRF token for a write; read from GET /auth/session when the shell has none yet (EC09). */
  async csrfToken(): Promise<string> {
    if (this.state.status === 'signed-in') return this.state.session.csrfToken;
    const { data } = await this.options.api.get('/auth/session', { skipUnauthenticatedHandler: true });
    this.set({ status: 'signed-in', session: data });
    return data.csrfToken;
  }

  /** Session-expired flow (EC08): once, then SignIn in its session-expired state with the way back. */
  expire(): void {
    if (this.state.status === 'expired' || this.state.status === 'signed-out') return;
    const returnTo = this.options.currentPath();
    for (const hook of [...this.expireHooks]) {
      try {
        hook();
      } catch {
        // A failing hook must not keep the user on a screen whose session is gone.
      }
    }
    this.set({ status: 'expired' });
    this.options.navigate(signInPath({ returnTo, reason: REASON_SESSION_EXPIRED }));
  }

  /** Signed out on purpose (S14): stop treating later 401s as an expiry. */
  markSignedOut(): void {
    this.set({ status: 'signed-out' });
  }
}
