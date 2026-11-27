// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Stateful store behind the global area's mock overrides (PID-00037 S01, H9). One store serves every screen of the
// area so the dashboard, Research Projects and Pending Actions tell the same story; PID-00060 extends it with
// notifications and prompts. Seeded lazily from the shared demo fixtures; tests reset or seed it per test.

import type { Fixtures, Schemas } from '../../../shell/mock/types';

type Project = Schemas['ResearchProject'];
type PendingAction = Schemas['PendingAction'];
type Workflow = Schemas['Workflow'];
type Notification = Schemas['Notification'];

export const RESTORE_WINDOW_DAYS = 30;
const DAY = 86_400_000;
/** Workflow states that block archiving or deleting a project (PROJ-CRUD-003 Preconditions). */
export const ACTIVE_WORKFLOW_STATES: readonly Schemas['WorkflowStatus'][] = ['Running', 'Waiting for User', 'Paused', 'Interrupted'];

export interface GlobalSeed {
  projects: Project[];
  pendingActions: PendingAction[];
  workflows: Workflow[];
  notifications: Notification[];
}

export interface GlobalStore extends GlobalSeed {
  /** Idempotency-Key → id of the project it created (DATA-IDEMP-001). */
  created: Map<string, string>;
  /** Idempotency-Key → id of the project it changed, for archive and delete. */
  changed: Map<string, string>;
}

let current: GlobalStore | undefined;
let seedOverride: Partial<GlobalSeed> | undefined;

const clone = <T>(rows: readonly T[] | undefined): T[] => (rows ?? []).map((row) => structuredClone(row));

/** Dev scenario chosen in the browser: `sessionStorage.setItem('sires.mock.global', 'first-run')`. */
function devScenario(): string | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem('sires.mock.global');
  } catch {
    return null;
  }
}

function seedFrom(fixtures: Fixtures): GlobalSeed {
  const seed: GlobalSeed = {
    projects: clone(fixtures.ResearchProject),
    pendingActions: clone(fixtures.PendingAction),
    workflows: clone(fixtures.Workflow),
    notifications: clone(fixtures.Notification),
  };
  if (devScenario() === 'first-run') return { projects: [], pendingActions: [], workflows: [], notifications: [] };
  return seed;
}

/** The store, created from the shared demo fixtures on first use (or from the test seed). */
export function globalStore(fixtures: Fixtures): GlobalStore {
  if (!current) {
    const base = seedFrom(fixtures);
    current = { ...base, ...(seedOverride ? structuredClone(seedOverride) : {}), created: new Map(), changed: new Map() };
  }
  return current;
}

/** Tests: start the next request from the demo fixtures, or from `seed` where given. */
export function resetGlobalStore(seed?: Partial<GlobalSeed>): void {
  current = undefined;
  seedOverride = seed;
}

export function isDeleted(project: Project): boolean {
  return Boolean(project.deletedAt);
}

export function activeWorkflows(store: GlobalStore, projectId: string): Workflow[] {
  return store.workflows.filter((workflow) => workflow.projectId === projectId && ACTIVE_WORKFLOW_STATES.includes(workflow.status));
}

/** Open pending actions of a project become Expired with a reason (PROJ-CRUD-003: archive, delete). */
export function expirePendingActions(store: GlobalStore, projectId: string, reason: string): void {
  for (const action of store.pendingActions) {
    if (action.projectId === projectId && action.status === 'Open') {
      action.status = 'Expired';
      action.expiryReason = reason;
    }
  }
}

export function purgeAfter(from: Date): string {
  return new Date(from.getTime() + RESTORE_WINDOW_DAYS * DAY).toISOString();
}

/** Dashboard computed from the store (WS-DASHBOARD-001): Active projects only, Open pending actions first. */
export function dashboard(store: GlobalStore): Schemas['Dashboard'] {
  const live = new Map(store.projects.filter((p) => !isDeleted(p)).map((p) => [p.id, p]));
  const visible = (projectId: string | undefined) => !projectId || live.get(projectId)?.status === 'Active';
  return {
    pendingActions: store.pendingActions
      .filter((action) => action.status === 'Open' && visible(action.projectId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    interruptedWorkflows: store.workflows.filter((workflow) => workflow.status === 'Interrupted' && visible(workflow.projectId)),
    recentProjects: [...live.values()]
      .filter((project) => project.status === 'Active')
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)),
    unreadNotifications: store.notifications.filter((row) => row.status === 'Unread').length,
  };
}
