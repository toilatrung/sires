// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Stable ids and helpers shared by the demo fixtures, so rows of different areas point at each other
// (a Task's projectId is a project the dashboard lists, a prompt's taskId opens that Task).

import type { Schemas } from '../types';

/** Same value as DEMO_ACCOUNT_ID in generator/sample.mjs (checked by mock.spec.ts). */
export const ACCOUNT_ID = '5b0e7c2a-4f1d-4c8e-9a6b-2d3f8e1a7c90';

const PREFIX = {
  project: '1a', context: '1b', plan: '2a', planVersion: '2b', phase: '2c', task: '3a', reference: '4a', document: '4b',
  chunk: '4c', evidence: '5a', claim: '5b', artifact: '5c', artifactVersion: '5d', prompt: '6a', pendingAction: '6b',
  notification: '6c', conversation: '6d', message: '6e', workflow: '7a', step: '7b', agentRun: '7c', audit: '7d',
  connection: '8a', assignment: '8b', manuscript: '9a', revision: '9b', build: '9c',
} as const;

/** Readable, valid UUID: `id('task', 3)` → `3a000000-0000-4000-8000-000000000003`. */
export function id(kind: keyof typeof PREFIX, n: number): string {
  return `${PREFIX[kind]}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export const projects = {
  rag: id('project', 1),
  learning: id('project', 2),
  salinity: id('project', 3),
  credit: id('project', 4),
};

/** ISO time `hours` before now, so the demo always reads “2 giờ trước”, not a fixed date. */
export function ago(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

export const researcher: Schemas['ActorRef'] = { type: 'researcher', accountId: ACCOUNT_ID };
export const agent = (name: Schemas['AgentName'], run: number): Schemas['ActorRef'] =>
  ({ type: 'agent', agent: name, agentRunId: id('agentRun', run) });
export const system: Schemas['ActorRef'] = { type: 'system', component: 'readiness' };

/** EntityMeta fields of a row (18.1). */
export function meta(kind: keyof typeof PREFIX, n: number, options: { projectId?: string; hours?: number; by?: Schemas['ActorRef']; version?: number } = {}) {
  const createdAt = ago(options.hours ?? 72);
  return {
    id: id(kind, n),
    accountId: ACCOUNT_ID,
    ...(options.projectId ? { projectId: options.projectId } : {}),
    createdAt,
    createdBy: options.by ?? researcher,
    updatedAt: ago(Math.max(0, (options.hours ?? 72) / 3)),
    rowVersion: options.version ?? 1,
  } satisfies Schemas['EntityMeta'];
}
