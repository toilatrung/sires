// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Confirmation dialog of design.md §4 (480px, surface, 8px, scrim; consequence before the confirm button, the cancel
// button names the safe option). The shell has no dialog component yet (H2: “dùng của shell nếu shell có”).
// Keyboard: focus moves into the dialog, Tab stays inside, Esc cancels, focus returns to the opener.

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface DialogProps {
  title: ReactNode;
  children: ReactNode;
  /** Label of the safe option, e.g. “Giữ Draft”. */
  cancelLabel: ReactNode;
  onCancel: () => void;
  /** Confirm button; omitted for a dialog that only reports (bulk result). */
  confirm?: {
    label: ReactNode;
    onConfirm: () => void;
    disabled?: boolean;
    /** Reason shown next to a disabled confirm button (design.md §4 “Vô hiệu”). */
    disabledReason?: ReactNode;
    variant?: 'primary' | 'danger' | 'secondary';
    busy?: boolean;
  };
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function Dialog({ title, children, cancelLabel, onCancel, confirm }: DialogProps) {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>('textarea, input, select') ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => opener?.focus?.();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancelRef.current();
      return;
    }
    if (event.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const firstItem = items[0]!;
    const lastItem = items[items.length - 1]!;
    if (event.shiftKey && document.activeElement === firstItem) {
      event.preventDefault();
      lastItem.focus();
    } else if (!event.shiftKey && document.activeElement === lastItem) {
      event.preventDefault();
      firstItem.focus();
    }
  };

  return createPortal(
    <div className="research-scrim">
      <section ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="research-dialog" onKeyDown={onKeyDown}>
        <h3 id={titleId} className="research-dialog__title">{title}</h3>
        <div className="research-dialog__body">{children}</div>
        <div className="research-dialog__actions">
          {confirm?.disabled && confirm.disabledReason && <span className="research-reason">{confirm.disabledReason}</span>}
          <button type="button" className="sires-button" onClick={onCancel}>{cancelLabel}</button>
          {confirm && (
            <button
              type="button"
              className="sires-button"
              data-variant={confirm.variant === 'secondary' ? undefined : confirm.variant ?? 'primary'}
              disabled={confirm.disabled || confirm.busy}
              aria-busy={confirm.busy || undefined}
              onClick={confirm.onConfirm}
            >
              {confirm.label}
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
