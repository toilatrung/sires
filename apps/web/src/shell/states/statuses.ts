// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// One label and one style per standard status (UX-STATUS-001, design.md §3, Components). Status names stay in
// English in both languages (UX-I18N-003). A status in neither table gets no style: the chip never invents one (EC20).

export type StatusTone =
  | 'proposed' // dashed 1.5px, muted text
  | 'proposed-brand' // dashed 1.5px brand, brand-ink text
  | 'confirmed' // solid 1.5px ink
  | 'confirmed-brand' // solid 1.5px brand, brand-ink text
  | 'needs-you' // brand-tint fill, brand-line border, brand-ink text, “!” icon
  | 'running' // solid brand, brand-tint fill, pulsing dot (data-running)
  | 'warning' // solid warn
  | 'warning-flag' // dashed warn (light flag)
  | 'error' // danger border, danger-tint fill, danger-ink text
  | 'neutral' // line border, ground fill, muted text
  | 'neutral-dashed'; // dashed muted border, ground fill (Expired, like the prompt card) — H4

/** Entity whose standard status is shown; only needed where the style depends on it (Proposed). */
export type StatusEntity =
  | 'task'
  | 'workflow'
  | 'workflow-step'
  | 'agent-run'
  | 'plan-version'
  | 'change-proposal'
  | 'artifact'
  | 'reference'
  | 'reference-index'
  | 'claim'
  | 'evidence'
  | 'context-snapshot'
  | 'prompt'
  | 'pending-action'
  | 'project'
  | 'deliberation'
  | 'build'
  | 'provider-connection';

/** design.md §3 table as approved 31/10/2026, with the style the Components screen shows. */
export const BASE_STATUSES: Readonly<Record<string, StatusTone>> = {
  Draft: 'proposed',
  Proposed: 'proposed',
  Discovered: 'proposed',
  'Partially Supported': 'proposed-brand',
  Approved: 'confirmed-brand',
  Ready: 'confirmed-brand',
  Accepted: 'confirmed',
  Trusted: 'confirmed',
  Completed: 'confirmed',
  Succeeded: 'confirmed',
  'Waiting for User': 'needs-you',
  'In Review': 'needs-you',
  'Pending Approval': 'needs-you',
  'Plan approval request': 'needs-you',
  'Interactive Agent Prompt': 'needs-you',
  'Reference approval': 'needs-you',
  'Task review request': 'needs-you',
  'Manual work required': 'needs-you',
  'Manuscript change proposal': 'needs-you',
  'Recovery decision': 'needs-you',
  'In Progress': 'running',
  Running: 'running',
  Indexing: 'running',
  Blocked: 'warning',
  Interrupted: 'warning',
  Conflicting: 'warning',
  Unsupported: 'warning-flag',
  'needs review': 'warning-flag',
  Failed: 'error',
  Invalid: 'error',
  Queued: 'neutral',
  Pending: 'neutral',
  Cancelled: 'neutral',
  Superseded: 'neutral',
  Rejected: 'neutral',
  Paused: 'neutral',
};

/**
 * Supplementary table approved by the PO (H4, PC-05 P1, “chốt theo đề xuất”, 26/11/2026), added to design.md §3
 * by the source fix of PID-00012 (S11). Supported follows the Components screen (brand, as Approved).
 */
export const SUPPLEMENTARY_STATUSES: Readonly<Record<string, StatusTone>> = {
  Supported: 'confirmed-brand',
  Indexed: 'confirmed',
  Valid: 'confirmed',
  Active: 'confirmed',
  Created: 'neutral',
  'Not Indexed': 'neutral',
  'Not Assessed': 'neutral',
  Untested: 'neutral',
  New: 'neutral',
  Excluded: 'neutral',
  Archived: 'neutral',
  Answered: 'neutral',
  Selected: 'proposed',
  Imported: 'proposed',
  Revoked: 'warning',
  Stale: 'warning-flag',
  Outdated: 'warning-flag',
  Unavailable: 'error',
  Expired: 'neutral-dashed',
};

/** Proposed waits for the Researcher on these entities (design.md §3 “Plan Proposed”; H4 adds Change Proposal). */
const PROPOSED_NEEDS_YOU: ReadonlySet<StatusEntity> = new Set(['plan-version', 'change-proposal']);

/** Style of a standard status, or undefined when no approved table has it (EC20). */
export function statusTone(status: string, entity?: StatusEntity): StatusTone | undefined {
  if (status === 'Proposed' && entity && PROPOSED_NEEDS_YOU.has(entity)) return 'needs-you';
  return BASE_STATUSES[status] ?? SUPPLEMENTARY_STATUSES[status];
}

/** Execution labels of a Task (design.md §3), always in English. */
export type ExecutionLabelKind = 'Available for agent' | 'Manual editor requirement';
