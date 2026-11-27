// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Small building blocks of the manuscript area: modal dialog and banner (design.md §4), actor names (design.md §6:
// the account's own name for Researcher, “Writing Agent”, “System”), and the media queries of the layout (H4, H21).

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../shell';
import type { ActorRef } from './model';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** `alertdialog` for confirmations of destructive actions. */
  alert?: boolean;
  wide?: boolean;
}

/** Modal dialog: scrim, focus kept inside, Escape closes, focus returns to the opener (EC55). */
export function Dialog({ title, onClose, children, alert, wide }: DialogProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? ref.current)?.focus();
    return () => opener?.focus?.();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close.current();
      return;
    }
    if (event.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="ms-scrim" onMouseDown={(event) => event.target === event.currentTarget && close.current()}>
      <div
        ref={ref}
        className="ms-dialog"
        data-wide={wide ? '' : undefined}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="ms-dialog__title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export interface BannerProps {
  tone: 'info' | 'warn' | 'danger';
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** Name of the region for assistive technology. */
  label?: string;
}

/** Banner inside a pane (design.md §4): tone stripe, short text, actions on the right. */
export function Banner({ tone, title, children, actions, label }: BannerProps) {
  return (
    <section className="ms-banner" data-tone={tone} aria-label={label}>
      <div className="ms-banner__text">
        {title && <strong className="ms-banner__title">{title}</strong>}
        {children && <div className="ms-banner__body">{children}</div>}
      </div>
      {actions && <div className="ms-banner__actions">{actions}</div>}
    </section>
  );
}

/** “Writing Agent”, “Orchestrator”, … (design.md §6: agent names stay in English). */
export function agentLabel(name: string | undefined): string {
  if (!name) return 'Agent';
  if (name === 'orchestrator') return 'Orchestrator';
  return `${name.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} Agent`;
}

/** Name of an actor: the account's own display name for its Researcher actions, else Researcher/agent/System. */
export function useActorLabel(): (actor: ActorRef | undefined) => string {
  const session = useSession();
  const { t } = useTranslation('manuscript');
  const me = session.status === 'signed-in' ? session.account?.profile.displayName : undefined;
  const myId = session.status === 'signed-in' ? session.account?.id : undefined;
  return (actor) => {
    if (!actor) return t('actor.unknown');
    if (actor.type === 'agent') return agentLabel(actor.agent);
    if (actor.type === 'system') return 'System';
    return me && (!actor.accountId || !myId || actor.accountId === myId) ? me : 'Researcher';
  };
}

export type Layout = 'desktop' | 'tablet' | 'phone';

function measure(): Layout {
  // Without matchMedia (tests, SSR) the screen is laid out for desktop.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop';
  if (window.matchMedia('(max-width: 767px)').matches) return 'phone';
  return window.matchMedia('(min-width: 1280px)').matches ? 'desktop' : 'tablet';
}

/** Layout of H4/H21: desktop ≥1280 three panes, tablet 768–1279 three tabs, phone <768 proposal review only. */
export function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>(measure);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const queries = ['(max-width: 767px)', '(min-width: 1280px)'].map((query) => window.matchMedia(query));
    const onChange = () => setLayout(measure());
    onChange();
    for (const query of queries) query.addEventListener?.('change', onChange);
    window.addEventListener('resize', onChange);
    return () => {
      for (const query of queries) query.removeEventListener?.('change', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, []);
  return layout;
}
