// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Context switcher (PRD 4.3, UX-LAYOUT-003): a listbox with Global and the Active projects (H1, EC34).
// Global → /dashboard, a project → /projects/<id>/overview; the indicator follows the URL at once.
// Keyboard: Enter, Space or ArrowDown opens; arrows, Home, End move; Enter or Space chooses; Escape closes.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { routeContext } from '../context';
import { useNavigationData } from '../hooks';
import { ChevronDown } from '../icons';

interface Option {
  id: string;
  name: string;
  global?: boolean;
}

export function ContextSwitcher() {
  const { t } = useTranslation('shell');
  const location = useLocation();
  const navigate = useNavigate();
  const data = useNavigationData();
  const ctx = routeContext(location.pathname);
  const listId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const options: Option[] = [{ id: 'global', name: t('context.global'), global: true }, ...(data.projects ?? [])];
  const currentIndex = ctx.kind === 'global' ? 0 : Math.max(0, options.findIndex((o) => o.id === ctx.projectId));
  const currentName =
    ctx.kind === 'global' ? t('context.global') : (data.project?.name ?? data.projects?.find((p) => p.id === ctx.projectId)?.name ?? '');

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const openList = () => {
    setActive(currentIndex);
    setOpen(true);
  };

  const close = (focusButton = true) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };

  const choose = (option: Option) => {
    close();
    navigate(option.global ? '/dashboard' : `/projects/${encodeURIComponent(option.id)}/overview`);
  };

  const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openList();
    }
  };

  const onListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((i) => Math.min(last, i + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(last);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        choose(options[active]);
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

  const optionId = (index: number) => `${listId}-o${index}`;

  return (
    <div className="sires-switcher" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="sires-switcher__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={t('context.switch', { name: currentName || t('context.project') })}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onButtonKey}
      >
        <span className="sires-switcher__kind">{ctx.kind === 'global' ? t('context.label') : t('context.project')}</span>
        <span className="sires-switcher__name">{currentName}</span>
        <ChevronDown />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          data-popover=""
          className="sires-menu"
          aria-label={t('context.list')}
          aria-activedescendant={optionId(active)}
          onKeyDown={onListKey}
        >
          {options.map((option, index) => (
            <li
              key={option.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === currentIndex}
              data-active={index === active ? '' : undefined}
              className="sires-menu__item"
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(option)}
            >
              {option.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
