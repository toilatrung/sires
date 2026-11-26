// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Types and pure helpers of the Deliberation tab (PID-00083): party names, session codes, and the deliberation
// state of the Agent List (EC21) that PID-00059's Agent List reads.

import type { PublicApi } from '@sires/contracts';

export type Schemas = PublicApi.components['schemas'];
export type Detail = Schemas['DeliberationDetail'];
export type Deliberation = Schemas['Deliberation'];
export type Entry = Schemas['DeliberationEntry'];
export type Party = Schemas['DeliberationPartyRef'];

export const partyKey = (party: Party) => (party.agent === 'orchestrator' ? 'orchestrator' : `analysis:${party.instance ?? 'A'}`);
export const partyName = (party: Party) => (party.agent === 'orchestrator' ? 'Orchestrator' : `Analysis Agent${party.instance ? ` ${party.instance}` : ''}`);

/** Short code of a session or snapshot id, as the reference screens write it (dl-3c1, cs-2a). */
export const shortCode = (prefix: 'dl' | 'cs', id: string) => `${prefix}-${id.replace(/-/g, '').slice(-3)}`;

export interface StepPosition {
  current: number;
  total: number;
}

/** Position of a step in its workflow (“bước m/n”). */
export function stepPosition(workflow: Pick<Schemas['Workflow'], 'steps'> | undefined, stepId: string): StepPosition | undefined {
  const steps = workflow?.steps ?? [];
  const index = steps.findIndex((s) => s.id === stepId);
  return index >= 0 ? { current: index + 1, total: steps.length } : undefined;
}

export type AgentKey = 'orchestrator' | 'analysis:A' | 'analysis:B';

export interface DeliberationAgentState {
  /** running → “Đang chạy”, error → “Lỗi”, waiting → “Chờ bạn” (Orchestrator of a Failed session with its decision prompt Open). */
  state: 'running' | 'error' | 'waiting';
  deliberationId: string;
  step?: StepPosition;
  round: number;
}

/**
 * Deliberation state of Orchestrator and Analysis Agent A, B for the Agent List of PID-00059 (EC21), from the sessions
 * of a project that are Running or Failed. A Running session wins over a Failed one; PID-00059 keeps its own priority
 * order (H15) between this state and the agents' other work.
 */
export function deliberationAgentStates(
  sessions: readonly Deliberation[],
  options: { stepOf?: (session: Deliberation) => StepPosition | undefined; openDecisionPromptIds?: ReadonlySet<string> } = {},
): Partial<Record<AgentKey, DeliberationAgentState>> {
  const result: Partial<Record<AgentKey, DeliberationAgentState>> = {};
  const ordered = [...sessions].filter((s) => s.status === 'Running' || s.status === 'Failed').sort((a, b) => (a.status === b.status ? 0 : a.status === 'Running' ? -1 : 1));
  for (const session of ordered) {
    const base = { deliberationId: session.id, step: options.stepOf?.(session), round: session.currentRound };
    for (const participant of session.participants) {
      const key = partyKey(participant) as AgentKey;
      if (result[key]) continue;
      if (participant.status === 'running') result[key] = { ...base, state: 'running' };
      else if (participant.status === 'error') result[key] = { ...base, state: 'error' };
    }
    if (session.status === 'Failed' && session.decisionPromptId && options.openDecisionPromptIds?.has(session.decisionPromptId) && !result.orchestrator) {
      result.orchestrator = { ...base, state: 'waiting' };
    }
  }
  return result;
}
