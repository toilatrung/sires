// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Where the claims of a synthesis version sit in its content (S07, H11): ArtifactVersion.claimAnchors, half-open
// [charStart, charEnd), chip right after charEnd (ClaimAnchor). Kept in one function so the placement rule changes in
// one place.

import type { Schemas } from './data';

export interface Placement {
  /** Offset in `content` right after the anchored sentence. */
  at: number;
  /** Claims anchored there, in the order of claimAnchors (EC39). */
  claimIds: string[];
}

export interface Located {
  placements: Placement[];
  /** Claims of the version without an anchor, or whose anchor falls outside the content (EC38). */
  unlocated: string[];
}

export function locateClaims(content: string, claimIds: readonly string[], anchors: readonly Schemas['ClaimAnchor'][] | undefined): Located {
  const known = new Set(claimIds);
  const placed = new Set<string>();
  const byOffset = new Map<number, string[]>();
  for (const anchor of anchors ?? []) {
    const inside = anchor.charStart >= 0 && anchor.charEnd > anchor.charStart && anchor.charEnd <= content.length;
    if (!known.has(anchor.claimId) || !inside || placed.has(anchor.claimId)) continue;
    placed.add(anchor.claimId);
    byOffset.set(anchor.charEnd, [...(byOffset.get(anchor.charEnd) ?? []), anchor.claimId]);
  }
  return {
    placements: [...byOffset].map(([at, ids]) => ({ at, claimIds: ids })).sort((a, b) => a.at - b.at),
    unlocated: claimIds.filter((claimId) => !placed.has(claimId)),
  };
}

/** Paragraphs of a text (blank-line separated) with their offsets, so chips stay in the paragraph of their sentence. */
export function paragraphs(content: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const separator = /\n[ \t]*\n+/g;
  let start = 0;
  for (const match of content.matchAll(separator)) {
    ranges.push({ start, end: match.index });
    start = match.index + match[0].length;
  }
  ranges.push({ start, end: content.length });
  return ranges.filter((range) => range.end > range.start);
}
