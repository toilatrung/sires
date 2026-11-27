// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// What the Researcher did with Change Proposals on this screen (PID-00115 S06): proposals acted on or deep-linked
// keep their box after they leave Proposed, so the new state shows where the decision was made (EC33, EC37); the
// result line of each decision lives here too, because a box is re-created when the editor switches files.

import { useSyncExternalStore } from 'react';

export type NoticeKind = 'accepted' | 'rejected' | 'outdated' | 'processed' | 'citation' | 'requested';

export interface Notice {
  kind: NoticeKind;
  /** Revision created by an accepted proposal. */
  revision?: number;
  /** Status the server reported when the decision was refused (409). */
  status?: string;
}

interface Session {
  projectId: string;
  sticky: ReadonlySet<string>;
  notices: ReadonlyMap<string, Notice>;
  /** Proposal the deep link points at (H11). */
  focus?: string;
}

let state: Session = { projectId: '', sticky: new Set(), notices: new Map() };
const listeners = new Set<() => void>();

function emit(next: Session) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Starts a fresh session when the screen of another project (or a new mount) begins. */
export function startProposalSession(projectId: string): void {
  emit({ projectId, sticky: new Set(), notices: new Map() });
}

export function keepProposal(id: string, notice?: Notice): void {
  const sticky = new Set(state.sticky).add(id);
  const notices = new Map(state.notices);
  if (notice) notices.set(id, notice);
  else notices.delete(id);
  emit({ ...state, sticky, notices });
}

export function focusProposal(id: string | undefined): void {
  emit({ ...state, focus: id, ...(id ? { sticky: new Set(state.sticky).add(id) } : {}) });
}

export function useProposalSession(): Session {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
