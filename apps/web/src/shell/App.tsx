// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Shell frame of every screen except /sign-in (design.md §4, §5): TopBar (or the phone header and tab bar),
// ProjectRail in Project context except Manuscript, the routed screen, and the Assistant panel on the right.
// Screens render only once the session is known, so drafts and API calls always have an account.

import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router';
import { routeContext } from './context';
import { features } from './features';
import { useMediaQuery, useNavigationData, useSession, useShell } from './hooks';
import { CloseIcon } from './icons';
import { MobileHeader, MobileTabBar } from './mobile/MobileChrome';
import { ProjectRail } from './rail/ProjectRail';
import { ErrorState } from './states/States';
import { LanguageSwitch } from './topbar/LanguageSwitch';
import { TopBar } from './topbar/TopBar';
import { currentLanguage } from './locale';
import { NotFound } from './NotFound';

const PHONE = '(max-width: 767px)';

function AssistantPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation('shell');
  const Content = features.find((f) => f.assistant)?.assistant;
  return (
    <aside id={id} aria-label={t('assistant.title')} className="sires-assistant">
      <div className="sires-assistant__head">
        <h2 className="sires-assistant__title">{t('assistant.title')}</h2>
        <button type="button" className="sires-icon-button" aria-label={t('assistant.close')} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="sires-assistant__body">{Content ? <Content /> : <p className="sires-muted">{t('assistant.placeholder')}</p>}</div>
    </aside>
  );
}

function SessionGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation('shell');
  const { session } = useShell();
  const state = useSession();
  if (state.status === 'signed-in') return <>{children}</>;
  if (state.status === 'error') {
    return (
      <section className="sires-page">
        <ErrorState error={state.error} title={t('session.checkFailed')} next={t('session.checkFailedNext')} onRetry={() => void session.check()} />
      </section>
    );
  }
  return (
    <p role="status" className="sires-page sires-muted">
      {t('session.checking')}
    </p>
  );
}

function LanguageSaveNotice() {
  const { t, i18n } = useTranslation('shell');
  const { language } = useShell();
  const error = useSyncExternalStore(
    (cb) => language.subscribe(cb),
    () => language.error,
    () => language.error,
  );
  if (!error) return null;
  const current = currentLanguage(i18n);
  return (
    <div className="sires-notice">
      <ErrorState
        error={error}
        title={t('preferences.saveFailed')}
        notSaved={t('preferences.keptInSession', { language: t(`language.${current}`) })}
        next={t('preferences.nextStep')}
        onRetry={() => void language.select(current)}
        actions={
          <button type="button" className="sires-button" data-variant="secondary" data-size="sm" onClick={() => language.dismissError()}>
            {t('state.dismiss')}
          </button>
        }
      />
    </div>
  );
}

export function App() {
  const { t } = useTranslation('shell');
  const services = useShell();
  const session = useSession();
  const location = useLocation();
  const data = useNavigationData();
  const ctx = routeContext(location.pathname);
  const phone = useMediaQuery(PHONE);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const assistantId = useId();
  const projectId = ctx.kind === 'project' ? ctx.projectId : undefined;

  useEffect(() => {
    void services.session.ensureChecked();
  }, [services]);

  useEffect(() => {
    if (session.status === 'signed-in') services.startSignedIn();
  }, [services, session.status]);

  useEffect(() => {
    if (session.status === 'signed-in') services.navigation.setProjectContext(projectId);
  }, [services, session.status, projectId]);

  const notFound = ctx.kind === 'project' && data.project?.id === projectId && data.project?.state === 'not-found';
  const showRail = ctx.kind === 'project' && !ctx.manuscript && !notFound && !phone && session.status === 'signed-in';
  const showAssistant = assistantOpen && ctx.kind === 'global';

  return (
    <div className="sires-shell" data-context={ctx.kind}>
      <a href="#sires-main" className="sires-skip">
        {t('skipToContent')}
      </a>
      {phone ? (
        <MobileHeader />
      ) : (
        <TopBar assistantOpen={showAssistant} assistantPanelId={assistantId} onToggleAssistant={() => setAssistantOpen((v) => !v)} />
      )}
      <LanguageSaveNotice />
      <div className="sires-shell__body">
        {showRail && projectId && <ProjectRail projectId={projectId} area={ctx.kind === 'project' ? ctx.area : undefined} />}
        <main id="sires-main" className="sires-shell__main" tabIndex={-1}>
          <SessionGate>{notFound ? <NotFound project /> : <Outlet />}</SessionGate>
        </main>
        {showAssistant && <AssistantPanel id={assistantId} onClose={() => setAssistantOpen(false)} />}
      </div>
      {phone && <MobileTabBar />}
    </div>
  );
}

/** Frame of /sign-in (SignIn.html): no TopBar or rail, only VI/EN at the top right (EC17). */
export function Frameless({ children }: { children?: ReactNode }) {
  return (
    <div className="sires-frameless">
      <header className="sires-frameless__header">
        <LanguageSwitch />
      </header>
      {children ?? <Outlet />}
    </div>
  );
}
