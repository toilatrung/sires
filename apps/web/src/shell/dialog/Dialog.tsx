// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Shared dialog (design.md §4 “Dialog”, §2.4 motion): 480 px, surface, 8 px radius, scrim, the consequence in numbers
// before the confirm button, the cancel button names the safe option. Modal: Tab and Shift+Tab stay inside, Escape
// cancels, focus goes to the safe option (or the first field) on open and back to the opener on close.
// `Dialog` takes any content and actions (a form); `ConfirmDialog` is the confirmation most areas need.

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  title: ReactNode;
  /** What the action does, with numbers when known. */
  children: ReactNode;
  /** Buttons at the bottom right; the safe option first. */
  actions: ReactNode;
  /** Escape and the scrim's cancel; also called by the safe option in ConfirmDialog. */
  onCancel: () => void;
  /** Element to focus on open; default: the first field, else the first button. */
  initialFocus?: () => HTMLElement | null | undefined;
  /** As a form: Enter submits. */
  onSubmit?: () => void;
  /** Wider content (a form with two columns): up to 640 px. */
  wide?: boolean;
}

export function Dialog({ title, children, actions, onCancel, initialFocus, onSubmit, wide }: DialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  const focusFirst = useRef(initialFocus);
  focusFirst.current = initialFocus;

  // Once, on open: focus inside, keep Tab inside, Escape cancels; on close the opener gets focus back.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    const first = focusFirst.current?.() ?? root?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? root?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const head = items[0]!;
      const tail = items[items.length - 1]!;
      const active = document.activeElement;
      if (!dialogRef.current.contains(active)) {
        event.preventDefault();
        head.focus();
      } else if (event.shiftKey && active === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && active === tail) {
        event.preventDefault();
        head.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  const body = (
    <>
      <h2 id={titleId} className="sires-dialog__title">
        {title}
      </h2>
      <div className="sires-dialog__body">{children}</div>
      <div className="sires-dialog__actions">{actions}</div>
    </>
  );
  return (
    <div className="sires-scrim">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="sires-dialog" data-wide={wide ? '' : undefined}>
        {onSubmit ? (
          <form
            className="sires-dialog__form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            {body}
          </form>
        ) : (
          body
        )}
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  title: ReactNode;
  /** The consequence, in numbers when known. */
  children: ReactNode;
  confirmLabel: string;
  /** Names the safe option (“Không thực thi”, “Giữ nguyên”). */
  cancelLabel: string;
  /** While sending, or until a required field is filled: the confirm button is disabled. */
  busy?: boolean;
  /** Destructive action: the confirm button uses the danger style. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation: focus starts on the safe option. */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel, busy, danger, onConfirm, onCancel }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      title={title}
      onCancel={onCancel}
      initialFocus={() => cancelRef.current}
      actions={
        <>
          <button ref={cancelRef} type="button" className="sires-button" data-variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="sires-button" data-variant={danger ? 'danger' : 'primary'} disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
