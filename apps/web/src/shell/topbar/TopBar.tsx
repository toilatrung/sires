// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// TopBar (docs/ui-design/pages/TopBar.html, Overview.html; design.md §4). Global: logo, context switcher, Global
// tabs; right: Assistant, Pending Actions + count, Notifications + unread, VI/EN, Settings, avatar. Project: the
// switcher shows the project, a “Global / area” trail replaces the tabs, no Assistant. Counts only when known.

import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import logo from '../assets/sires-logo.svg';
import { GLOBAL_TABS, routeContext } from '../context';
import { formatNumber } from '../format';
import { useNavigationData } from '../hooks';
import { BellIcon, ChatIcon, ChevronLeft, GearIcon } from '../icons';
import { AvatarMenu } from './AvatarMenu';
import { ContextSwitcher } from './ContextSwitcher';
import { LanguageSwitch } from './LanguageSwitch';

export interface TopBarProps {
  assistantOpen: boolean;
  onToggleAssistant: () => void;
  assistantPanelId: string;
}

export function PendingActionsLink() {
  const { t } = useTranslation('shell');
  const { pendingCount } = useNavigationData();
  return (
    <Link to="/pending-actions" className="sires-pending">
      {t('nav.pendingActions')}
      {pendingCount !== undefined && (
        <>
          {' '}
          <span className="sires-count sires-num">{formatNumber(pendingCount)}</span>
        </>
      )}
    </Link>
  );
}

export function NotificationsLink() {
  const { t } = useTranslation('shell');
  const { unreadCount } = useNavigationData();
  const unread = unreadCount !== undefined && unreadCount > 0 ? unreadCount : undefined;
  return (
    <Link
      to="/notifications"
      className="sires-icon-button sires-bell"
      aria-label={unread !== undefined ? t('nav.notificationsUnread', { count: unread }) : t('nav.notifications')}
    >
      <BellIcon />
      {unread !== undefined && (
        <span className="sires-bell__count sires-num" aria-hidden="true">
          {formatNumber(unread)}
        </span>
      )}
    </Link>
  );
}

export function TopBar({ assistantOpen, onToggleAssistant, assistantPanelId }: TopBarProps) {
  const { t } = useTranslation('shell');
  const location = useLocation();
  const ctx = routeContext(location.pathname);

  return (
    <header className="sires-topbar">
      <div className="sires-topbar__start">
        <Link to="/dashboard" className="sires-topbar__logo">
          <img src={logo} alt={t('logoAlt')} />
        </Link>
        <ContextSwitcher />
        {ctx.kind === 'global' ? (
          <nav aria-label={t('nav.globalAreas')} className="sires-tabs">
            {GLOBAL_TABS.map((tab) => (
              <Link key={tab.id} to={tab.path} className="sires-tab" aria-current={ctx.tab === tab.id ? 'page' : undefined}>
                {t(tab.label)}
              </Link>
            ))}
          </nav>
        ) : (
          <nav aria-label={t('nav.location')} className="sires-trail">
            <Link to="/dashboard" className="sires-trail__back">
              <ChevronLeft />
              {t('context.global')}
            </Link>
            {ctx.area && (
              <>
                <span aria-hidden="true">/</span>
                <span className="sires-trail__here">{t(`rail.area.${ctx.area}`)}</span>
              </>
            )}
          </nav>
        )}
      </div>
      <div className="sires-topbar__end">
        {ctx.kind === 'global' && (
          <button
            type="button"
            className="sires-assistant-toggle"
            aria-expanded={assistantOpen}
            aria-controls={assistantPanelId}
            onClick={onToggleAssistant}
          >
            <ChatIcon />
            {t('assistant.open')}
          </button>
        )}
        <PendingActionsLink />
        <NotificationsLink />
        <LanguageSwitch />
        <Link to="/settings/profile" className="sires-icon-button" aria-label={t('nav.settings')}>
          <GearIcon />
        </Link>
        <AvatarMenu />
      </div>
    </header>
  );
}
