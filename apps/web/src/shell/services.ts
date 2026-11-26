// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// The shell's services, created once in main.tsx (or by the test harness) and given to <ShellProvider>.
// Feature areas reach them through the hooks in ./hooks, never by importing each other (rule 1.4.9).

import i18next, { type i18n } from 'i18next';
import type { Router } from './activity';
import { ApiClient, type FetchLike } from './api/client';
import { IdempotencyKeys } from './api/idempotency';
import { isApiError } from './api/errors';
import { DraftStore, type DraftStorage } from './drafts/store';
import { changeLanguage, isLocale } from './locale';
import { NavigationStore } from './navigation/navigation';
import { LanguagePreference } from './preferences';
import { SessionController, signInPath } from './session/session';
import { EventStream } from './sse';
import { trackUserNavigation } from './activity';

/** Full-page navigations the SPA cannot do through the router (sign-out goes to the IdP). */
export interface BrowserNavigator {
  /** POST a form as a top-level navigation, so the browser follows the 303 to the IdP (S14). */
  submitForm(action: string, fields: Record<string, string>): void;
  assign(url: string): void;
}

export const browserNavigator: BrowserNavigator = {
  submitForm(action, fields) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = action;
    form.hidden = true;
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  },
  assign(url) {
    window.location.assign(url);
  },
};

export interface ShellServices {
  api: ApiClient;
  session: SessionController;
  events: EventStream;
  drafts: DraftStore;
  navigation: NavigationStore;
  language: LanguagePreference;
  idempotency: IdempotencyKeys;
  browser: BrowserNavigator;
  i18n: i18n;
  /** Connect the data router: in-app redirects, current path, user-navigation tracking (S13). */
  attachRouter(router: Router): () => void;
  /** Signed in: open SSE and load navigation data (idempotent). */
  startSignedIn(): void;
  /** Sign-out from the avatar menu (S14). */
  signOut(): Promise<void>;
}

export interface ShellServicesOptions {
  fetch?: FetchLike;
  storage?: DraftStorage;
  browser?: BrowserNavigator;
  i18n?: i18n;
  sseRetryDelays?: readonly number[];
}

/** Form field carrying the CSRF token in POST /auth/logout (PC-05 P3: form POST, 303 to end_session_endpoint). */
export const LOGOUT_CSRF_FIELD = 'csrfToken';

export function createShellServices(options: ShellServicesOptions = {}): ShellServices {
  const i18nInstance = options.i18n ?? i18next;
  const browser = options.browser ?? browserNavigator;
  let router: Router | undefined;

  const currentPath = (): string => {
    const loc = router?.state.location ?? (typeof window !== 'undefined' ? window.location : undefined);
    return loc ? `${loc.pathname}${loc.search}${loc.hash}` : '/';
  };
  const navigate = (to: string): void => {
    if (router) void router.navigate(to, { replace: true });
    else browser.assign(to);
  };

  const api = new ApiClient({ fetch: options.fetch });
  const session = new SessionController({ api, navigate, currentPath });
  const events = new EventStream({ fetch: options.fetch, retryDelays: options.sseRetryDelays, onUnauthenticated: () => session.expire() });
  const drafts = new DraftStore(() => session.accountId, options.storage);
  const navigation = new NavigationStore(api, events);
  const language = new LanguagePreference(api, session, i18nInstance);
  let started = false;

  session.onExpire(() => {
    drafts.flushAll();
    events.close();
    navigation.stop();
    started = false;
  });
  // Language from Preferences when the account loads (EC02), unless the user already picked one on this page.
  session.onAccount((account) => {
    const preferred = account.preferences?.uiLanguage;
    if (!language.userChose && isLocale(preferred)) void changeLanguage(preferred, i18nInstance);
  });

  return {
    api,
    session,
    events,
    drafts,
    navigation,
    language,
    idempotency: new IdempotencyKeys(),
    browser,
    i18n: i18nInstance,
    attachRouter(next) {
      router = next;
      const untrack = trackUserNavigation(next, session);
      return () => {
        untrack();
        if (router === next) router = undefined;
      };
    },
    startSignedIn() {
      if (started || !session.signedIn) return;
      started = true;
      events.connect();
      navigation.start();
    },
    async signOut() {
      const accountId = session.accountId;
      const leave = () => {
        drafts.clearAccount(accountId);
        events.close();
        navigation.stop();
        started = false;
        session.markSignedOut();
      };
      let token: string;
      try {
        // A fresh token right before the form is sent (logout contract: “lấy từ GET /auth/session ngay trước khi gửi”).
        ({ csrfToken: token } = (await api.get('/auth/session', { skipUnauthenticatedHandler: true })).data);
      } catch (error) {
        if (isApiError(error) && error.unauthenticated) {
          // No session any more: nothing to end at the gateway; still forget this account's drafts here.
          leave();
          navigate(signInPath());
          return;
        }
        // Still signed in (network or server error): keep the session, drafts and SSE; the menu reports the error.
        throw error;
      }
      leave();
      browser.submitForm(api.url('/auth/logout'), { [LOGOUT_CSRF_FIELD]: token });
    },
  };
}
