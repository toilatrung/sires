// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Phone frame below 768px (design.md §5, MobilePending, MobilePrompt, UX-RESP-001): compact header (logo, context,
// “Mở menu”) and a bottom tab bar Dashboard, Pending · n, Agent, Projects. The menu reuses the desktop controls.

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import logo from '../assets/sires-logo.svg';
import { GLOBAL_TABS, projectAreaPath, routeContext } from '../context';
import { formatNumber } from '../format';
import { useNavigationData } from '../hooks';
import { CloseIcon, GearIcon, MenuIcon } from '../icons';
import { RAIL_AREAS } from '../navigation/navigation';
import { AvatarMenu } from '../topbar/AvatarMenu';
import { ContextSwitcher } from '../topbar/ContextSwitcher';
import { LanguageSwitch } from '../topbar/LanguageSwitch';
import { NotificationsLink, PendingActionsLink } from '../topbar/TopBar';

export function MobileHeader() {
  const { t } = useTranslation('shell');
  const location = useLocation();
  const data = useNavigationData();
  const ctx = routeContext(location.pathname);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [location.key]);

  const contextName = ctx.kind === 'global' ? t('context.global') : (data.project?.name ?? t('context.project'));
  return (
    <header className="sires-mobile-header">
      <div className="sires-mobile-header__bar">
        <Link to="/dashboard" className="sires-topbar__logo">
          <img src={logo} alt={t('logoAlt')} />
        </Link>
        <div className="sires-mobile-header__end">
          <span className="sires-mobile-header__context">{contextName}</span>
          <button
            ref={buttonRef}
            type="button"
            className="sires-icon-button"
            data-size="touch"
            aria-label={open ? t('mobile.closeMenu') : t('mobile.openMenu')}
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>
      {open && (
        <nav id={menuId} aria-label={t('mobile.menu')} className="sires-mobile-menu" data-popover="">
          <ContextSwitcher />
          <ul className="sires-mobile-menu__links">
            {ctx.kind === 'global'
              ? GLOBAL_TABS.map((tab) => (
                  <li key={tab.id}>
                    <Link to={tab.path} aria-current={ctx.tab === tab.id ? 'page' : undefined}>
                      {t(tab.label)}
                    </Link>
                  </li>
                ))
              : RAIL_AREAS.map((area) => (
                  <li key={area}>
                    <Link to={projectAreaPath(ctx.projectId, area)} aria-current={ctx.area === area ? 'page' : undefined}>
                      {t(`rail.area.${area}`)}
                    </Link>
                  </li>
                ))}
          </ul>
          <div className="sires-mobile-menu__row">
            <PendingActionsLink />
            <NotificationsLink />
            <LanguageSwitch />
            <Link to="/settings/profile" className="sires-icon-button" aria-label={t('nav.settings')}>
              <GearIcon />
            </Link>
            <AvatarMenu />
          </div>
        </nav>
      )}
    </header>
  );
}

export function MobileTabBar() {
  const { t } = useTranslation('shell');
  const location = useLocation();
  const { pendingCount } = useNavigationData();
  const tabs = [
    { to: '/dashboard', label: t('mobile.dashboard') },
    {
      to: '/pending-actions',
      label: pendingCount !== undefined ? t('mobile.pendingCount', { n: formatNumber(pendingCount) }) : t('mobile.pending'),
    },
    { to: '/activity', label: t('mobile.agent') },
    { to: '/projects', label: t('mobile.projects') },
  ];
  return (
    <nav aria-label={t('mobile.nav')} className="sires-tabbar">
      {tabs.map((tab) => (
        <Link key={tab.to} to={tab.to} aria-current={location.pathname === tab.to ? 'page' : undefined} className="sires-tabbar__item">
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
