// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Avatar menu (H9, PC-05 P3): “Hồ sơ” → /settings/profile, “Đăng xuất” → drafts cleared, SSE closed, form POST
// /auth/logout with the CSRF token; the gateway answers 303 to the IdP end_session_endpoint (AC06).
// Menu button pattern: Enter, Space or ArrowDown opens on the first item; arrows, Home, End move; Escape closes.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useSession, useShell } from '../hooks';
import { PersonIcon } from '../icons';

export function initials(displayName: string | undefined): string | undefined {
  const words = displayName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length === 0) return undefined;
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return `${first}${last}`.toLocaleUpperCase();
}

export function AvatarMenu() {
  const { t } = useTranslation('shell');
  const services = useShell();
  const session = useSession();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const focusIndex = useRef(0);

  const name = session.status === 'signed-in' ? session.account?.profile?.displayName : undefined;
  const short = initials(name);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[focusIndex.current]?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const openAt = (index: number) => {
    focusIndex.current = index;
    setOpen(true);
  };
  const close = (focusButton = true) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };

  const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openAt(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(1);
    }
  };

  const onMenuKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const items = itemRefs.current.filter(Boolean) as HTMLElement[];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      event.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        move(index + 1);
        break;
      case 'ArrowUp':
        move(index - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(items.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        close(false);
        break;
      default:
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    setOpen(false);
    try {
      await services.signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="sires-avatar" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="sires-avatar__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={name ? t('account.menu', { name }) : t('account.menuUnknown')}
        disabled={signingOut}
        onClick={() => (open ? close() : openAt(0))}
        onKeyDown={onButtonKey}
      >
        {short ?? <PersonIcon />}
      </button>
      {open && (
        <ul id={menuId} role="menu" data-popover="" data-side="bottom" className="sires-menu sires-menu--end" aria-label={t('account.menuUnknown')} onKeyDown={onMenuKey}>
          <li role="none">
            <Link
              ref={(el) => {
                itemRefs.current[0] = el;
              }}
              role="menuitem"
              to="/settings/profile"
              className="sires-menu__item"
              onClick={() => close(false)}
            >
              {t('account.profile')}
            </Link>
          </li>
          <li role="none">
            <button
              ref={(el) => {
                itemRefs.current[1] = el;
              }}
              role="menuitem"
              type="button"
              className="sires-menu__item"
              onClick={() => void signOut()}
            >
              {t('account.signOut')}
            </button>
          </li>
        </ul>
      )}
      {signingOut && (
        <span role="status" className="sires-visually-hidden">
          {t('account.signingOut')}
        </span>
      )}
    </div>
  );
}
