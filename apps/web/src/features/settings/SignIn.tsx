// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// S0 SignIn (PID-00036 S02, H2–H4): one action “Đăng nhập bằng eTroy” that navigates the browser to startLogin of
// the gateway; the gateway sends the browser to the configured IdP (OIDC mock locally, D-OIDC). Login errors come
// back as /sign-in?error=<code>; an expired session as ?reason=session-expired (shell, PID-00012 S04).

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { REASON_PARAM, REASON_SESSION_EXPIRED, RETURN_TO_PARAM, safeReturnTo, useApi, useSession, useShell } from '../../shell';
import { NS } from './shared';

/** Codes the gateway puts in `error` (H3); anything else shows as login_failed (EC07). */
const LOGIN_ERRORS = ['oidc_unavailable', 'login_cancelled', 'login_failed'] as const;
type LoginError = (typeof LOGIN_ERRORS)[number];

const DEFAULT_RETURN = '/dashboard';

/** True when the dev server runs the mock of PID-00013 without a gateway: sign-in goes straight back (H2, EC12). */
export function isMockMode(): boolean {
  return import.meta.env.DEV && import.meta.env.MODE !== 'production' && (import.meta.env.MODE === 'mock' || import.meta.env.VITE_SIRES_MOCK === '1');
}

export function SignInScreen() {
  const { t } = useTranslation(NS);
  const [params] = useSearchParams();
  const api = useApi();
  const { browser } = useShell();
  const session = useSession();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  const rawError = params.get('error');
  const error: LoginError | undefined = rawError === null ? undefined : (LOGIN_ERRORS as readonly string[]).includes(rawError) ? (rawError as LoginError) : 'login_failed';
  // The code line shows the code received, as plain lower-case text (EC07); React escapes it, no HTML is injected.
  const shownCode = rawError ? rawError.toLowerCase().slice(0, 64) : error;
  const expired = !error && params.get(REASON_PARAM) === REASON_SESSION_EXPIRED;
  const returnTo = safeReturnTo(params.get(RETURN_TO_PARAM)) ?? DEFAULT_RETURN;

  // Signed in already and no error to show: go where the user was heading (H4, EC09). The frameless route does not
  // check the session, so the screen asks getSession itself; a 401 only shows the screen (no redirect to itself).
  useEffect(() => {
    if (error) return;
    if (session.status === 'signed-in') {
      navigate(returnTo, { replace: true });
      return;
    }
    let active = true;
    api.get('/auth/session', { skipUnauthenticatedHandler: true }).then(
      () => active && navigate(returnTo, { replace: true }),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [api, error, session.status, returnTo, navigate]);

  const signIn = () => {
    if (leaving) return;
    setLeaving(true);
    if (isMockMode()) {
      navigate(returnTo, { replace: true });
      return;
    }
    browser.assign(api.url('/auth/login', { returnTo }));
  };

  return (
    <div className="sires-signin">
      <section className="sires-signin__card" aria-labelledby="sires-signin-title">
        <h1 id="sires-signin-title" className="sires-signin__title">
          {t('signIn.title')}
        </h1>
        <p className="sires-signin__lead">{t('signIn.lead')}</p>
        {error && (
          <div role="alert" className="sires-signin__banner" data-tone="error">
            <strong>{t(`signIn.error.${error}.title`)}</strong>
            <span>{t(`signIn.error.${error}.body`)}</span>
            <span className="sires-signin__code">
              {t('signIn.errorCode')} <code className="sires-id">{shownCode}</code>
            </span>
          </div>
        )}
        {expired && (
          <div role="status" className="sires-signin__banner" data-tone="info">
            {t('signIn.expired')}
          </div>
        )}
        <button type="button" className="sires-button sires-signin__action" data-variant="primary" disabled={leaving} onClick={signIn}>
          {leaving ? t('signIn.leaving') : t('signIn.action')}
        </button>
        <p className="sires-signin__note">{t('signIn.note')}</p>
      </section>
      <p className="sires-signin__footer">{t('signIn.footer')}</p>
    </div>
  );
}
