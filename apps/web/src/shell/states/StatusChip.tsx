// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import type { ReactNode } from 'react';
import { AgentChipIcon, NeedsYouIcon, PenIcon } from '../icons';
import { statusTone, type ExecutionLabelKind, type StatusEntity } from './statuses';

export interface StatusChipProps {
  /** Standard status name exactly as in the contract (English), e.g. `Waiting for User`. */
  status: string;
  /** Entity of the status; decides the style of Proposed (Plan Version, Change Proposal → needs you). */
  entity?: StatusEntity;
  /** Text shown instead of the status name, e.g. “Discovered — Chưa duyệt”. The style still comes from `status`. */
  children?: ReactNode;
}

/**
 * Status chip (design.md §3, Components). Every chip has text; “needs you” adds the icon, running adds the dot.
 * A status in no approved table renders as plain text without a chip style (EC20).
 */
export function StatusChip({ status, entity, children }: StatusChipProps) {
  const tone = statusTone(status, entity);
  const label = children ?? status;
  if (!tone) return <span className="sires-status-text">{label}</span>;
  return (
    <span className="sires-chip" data-tone={tone} data-running={tone === 'running' ? '' : undefined}>
      {tone === 'needs-you' && <NeedsYouIcon />}
      {label}
    </span>
  );
}

/** Execution label of a Task, always in English, with its own icon (design.md §3, UX-LABEL-001). */
export function ExecutionLabel({ kind }: { kind: ExecutionLabelKind }) {
  const manual = kind === 'Manual editor requirement';
  return (
    <span className="sires-exec-label" data-kind={manual ? 'manual' : 'agent'}>
      {manual ? <PenIcon /> : <AgentChipIcon />}
      {kind}
    </span>
  );
}
