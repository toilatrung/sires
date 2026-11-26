// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Line icons of the reference screens (TopBar, Components, MobilePending): stroke 1.8–2.4, currentColor, decorative.

interface IconProps {
  size?: number;
}

const common = { fill: 'none', stroke: 'currentColor', 'aria-hidden': true, focusable: false } as const;

export function ChevronDown({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...common}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function ChevronLeft({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...common}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function ChatIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={1.8} {...common}>
      <path d="M4 5h16v11H9l-5 4z" />
    </svg>
  );
}

export function BellIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={1.8} {...common}>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
      <path d="M10 20h4" />
    </svg>
  );
}

export function GearIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={1.8} {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  );
}

export function MenuIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...common}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function CloseIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...common}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function PersonIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={1.8} {...common}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

/** “Cần bạn xử lý”: circle with an exclamation mark (Components). */
export function NeedsYouIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2.4} {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.5" />
    </svg>
  );
}

/** Available for agent (chip icon). */
export function AgentChipIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...common}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </svg>
  );
}

/** Manual editor requirement (pen icon). */
export function PenIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...common}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
    </svg>
  );
}
