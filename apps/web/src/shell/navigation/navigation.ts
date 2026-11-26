// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Navigation data of TopBar and ProjectRail (H1, PRD 4.4): counts, context switcher, project, Plan line, Active task.
// Loaded through the typed API client and refreshed from SSE. Refreshes after an SSE event are background
// requests: they never call GET /auth/session (S13, EC32). No number is shown until the API returned it.

import type { PublicApi } from '@sires/contracts';
import type { ApiClient } from '../api/client';
import { isApiError } from '../api/errors';
import type { EventStream, StreamEvent } from '../sse';

type Schemas = PublicApi.components['schemas'];
export type PendingActionKind = Schemas['PendingActionKind'];
export type PlanVersionStatus = Schemas['PlanVersionStatus'];

/** The eight Project areas of the rail, in order (PRD 4.2, ProjectRail). */
export const RAIL_AREAS = ['overview', 'chat', 'plan', 'evidence', 'artifacts', 'manuscript', 'activity', 'history'] as const;
export type RailArea = (typeof RAIL_AREAS)[number];

/**
 * Where each pending action kind is handled (PRD 4.4, column “Xử lý tại”; H1). Reference approval is handled in
 * Trusted Library (Global), so it counts on the TopBar but in no rail area (EC33).
 */
export const AREA_BY_KIND: Record<PendingActionKind, RailArea | undefined> = {
  interactive_prompt: 'chat',
  plan_approval: 'plan',
  task_review: 'plan',
  manual_work: 'plan',
  manuscript_change_proposal: 'manuscript',
  recovery_decision: 'activity',
  reference_approval: undefined,
};

export interface ProjectOption {
  id: string;
  name: string;
}

export type PlanLine = { kind: 'version'; versionNumber: number; status: PlanVersionStatus } | { kind: 'none' };

export interface ActiveTask {
  id: string;
  key?: string;
  title?: string;
}

export interface ProjectNavigation {
  id: string;
  state: 'loading' | 'ready' | 'not-found' | 'error';
  name?: string;
  status?: Schemas['ProjectStatus'];
  plan?: PlanLine;
  activeTask?: ActiveTask;
  areaCounts?: Partial<Record<RailArea, number>>;
}

export interface NavigationState {
  /** openCount of GET /pending-actions (all projects). */
  pendingCount?: number;
  /** unreadCount of GET /notifications. */
  unreadCount?: number;
  /** Active projects for the context switcher (EC34). */
  projects?: ProjectOption[];
  project?: ProjectNavigation;
}

/** Count open pending actions per rail area (H1, EC33). */
export function groupByArea(items: ReadonlyArray<{ kind: PendingActionKind; status?: string }>): Partial<Record<RailArea, number>> {
  const counts: Partial<Record<RailArea, number>> = {};
  for (const item of items) {
    if (item.status && item.status !== 'Open') continue;
    const area = AREA_BY_KIND[item.kind];
    if (area) counts[area] = (counts[area] ?? 0) + 1;
  }
  return counts;
}

const PAGE_LIMIT = 200;

type Listener = (state: NavigationState) => void;

export class NavigationStore {
  private state: NavigationState = {};
  private readonly listeners = new Set<Listener>();
  private readonly unsubscribers: Array<() => void> = [];
  private projectId?: string;
  private projectRequest = 0;

  constructor(
    private readonly api: ApiClient,
    private readonly events?: EventStream,
  ) {}

  get current(): NavigationState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<NavigationState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) listener(this.state);
  }

  private setProject(patch: Partial<ProjectNavigation>): void {
    if (!this.state.project) return;
    this.set({ project: { ...this.state.project, ...patch } });
  }

  /** Start: load the global data and follow SSE. */
  start(): void {
    if (this.events && this.unsubscribers.length === 0) {
      this.unsubscribers.push(
        this.events.subscribe({ types: ['pending_action.changed'] }, (event) => this.onPendingChanged(event)),
        this.events.subscribe({ types: ['notification.created'] }, () => void this.loadUnread()),
        this.events.subscribe({ types: ['project.lifecycle_changed'] }, (event) => this.onProjectChanged(event)),
        this.events.subscribe({ types: ['plan_version.status_changed'] }, (event) => {
          if (event.projectId && event.projectId === this.projectId) void this.loadPlan(event.projectId);
        }),
        this.events.onSignal((signal) => {
          if (signal === 'reload') void this.reload();
        }),
      );
    }
    void this.loadGlobal();
  }

  stop(): void {
    while (this.unsubscribers.length) this.unsubscribers.pop()?.();
  }

  /** Reload everything (after “reload” from SSE, H5). */
  async reload(): Promise<void> {
    await Promise.all([this.loadGlobal(), this.projectId ? this.loadProject(this.projectId) : Promise.resolve()]);
  }

  /** Counts only: areas call it after an action that changes them without an SSE event (e.g. marking read). */
  async refreshCounts(): Promise<void> {
    await Promise.all([this.loadPendingCount(), this.loadUnread(), this.projectId ? this.loadAreaCounts(this.projectId) : Promise.resolve()]);
  }

  async loadGlobal(): Promise<void> {
    await Promise.all([this.loadPendingCount(), this.loadUnread(), this.loadProjects()]);
  }

  private async loadPendingCount(): Promise<void> {
    try {
      const { data } = await this.api.get('/pending-actions', { query: { status: 'Open', limit: 1 } });
      if (typeof data.openCount === 'number') this.set({ pendingCount: data.openCount });
    } catch {
      // Keep the last known number; never show an invented one.
    }
  }

  private async loadUnread(): Promise<void> {
    try {
      const { data } = await this.api.get('/notifications', { query: { status: 'Unread', limit: 1 } });
      if (typeof data.unreadCount === 'number') this.set({ unreadCount: data.unreadCount });
    } catch {
      // As above.
    }
  }

  private async loadProjects(): Promise<void> {
    try {
      const projects: ProjectOption[] = [];
      let cursor: string | undefined;
      do {
        const { data } = await this.api.get('/projects', { query: { status: 'Active', limit: PAGE_LIMIT, cursor } });
        for (const p of data.items ?? []) if (p.status === 'Active') projects.push({ id: p.id, name: p.name });
        cursor = data.nextCursor ?? undefined;
      } while (cursor);
      this.set({ projects });
    } catch {
      // The switcher still offers Global.
    }
  }

  /** Follow the route: project context when a project id is in the URL, Global otherwise. */
  setProjectContext(projectId: string | undefined): void {
    if (projectId === this.projectId) return;
    this.projectId = projectId;
    if (!projectId) {
      this.set({ project: undefined });
      return;
    }
    void this.loadProject(projectId);
  }

  async loadProject(projectId: string): Promise<void> {
    const request = ++this.projectRequest;
    const known = this.state.projects?.find((p) => p.id === projectId);
    this.set({ project: { id: projectId, state: 'loading', name: known?.name } });
    try {
      const { data: project } = await this.api.get('/projects/{projectId}', { path: { projectId } });
      if (request !== this.projectRequest) return;
      this.setProject({
        state: 'ready',
        name: project.name,
        status: project.status,
        activeTask: project.activeTaskId ? { id: project.activeTaskId } : undefined,
      });
      await Promise.all([
        this.loadPlan(projectId),
        this.loadAreaCounts(projectId),
        project.activeTaskId ? this.loadActiveTask(projectId, project.activeTaskId) : Promise.resolve(),
      ]);
    } catch (error) {
      if (request !== this.projectRequest) return;
      // 404 covers both “does not exist” and “another account's” (OWN-03): same not-found state (EC23).
      this.setProject({ state: isApiError(error) && error.status === 404 ? 'not-found' : 'error' });
    }
  }

  private async loadPlan(projectId: string): Promise<void> {
    try {
      const { data: plan } = await this.api.get('/projects/{projectId}/plan', { path: { projectId } });
      if (projectId !== this.projectId) return;
      const versions = plan.versions ?? [];
      const pick = versions.find((v) => v.id === plan.baselineVersionId) ?? versions.find((v) => v.id === plan.openVersionId);
      this.setProject({ plan: pick ? { kind: 'version', versionNumber: pick.versionNumber, status: pick.status } : { kind: 'none' } });
    } catch (error) {
      if (projectId === this.projectId && isApiError(error) && error.status === 404) this.setProject({ plan: { kind: 'none' } });
    }
  }

  private async loadActiveTask(projectId: string, taskId: string): Promise<void> {
    try {
      const { data: task } = await this.api.get('/projects/{projectId}/tasks/{taskId}', { path: { projectId, taskId } });
      if (projectId !== this.projectId || this.state.project?.activeTask?.id !== taskId) return;
      this.setProject({ activeTask: { id: taskId, key: task.stableKey, title: task.currentDefinition?.title } });
    } catch {
      // Keep the id-only Active task; the rail shows it without code and title.
    }
  }

  private async loadAreaCounts(projectId: string): Promise<void> {
    try {
      const items: Array<{ kind: PendingActionKind; status?: string }> = [];
      let cursor: string | undefined;
      do {
        const { data } = await this.api.get('/pending-actions', { query: { projectId, status: 'Open', limit: PAGE_LIMIT, cursor } });
        items.push(...(data.items ?? []));
        cursor = data.nextCursor ?? undefined;
      } while (cursor);
      if (projectId === this.projectId) this.setProject({ areaCounts: groupByArea(items) });
    } catch {
      // No counts rather than wrong counts.
    }
  }

  private onPendingChanged(event: StreamEvent): void {
    void this.loadPendingCount();
    if (this.projectId && (!event.projectId || event.projectId === this.projectId)) void this.loadAreaCounts(this.projectId);
  }

  private onProjectChanged(event: StreamEvent): void {
    void this.loadProjects();
    if (this.projectId && event.projectId === this.projectId) void this.loadProject(this.projectId);
  }

  /** “Bỏ active task” (setActiveTask with taskId null). A user command: the gateway counts it as activity. */
  async clearActiveTask(): Promise<void> {
    const projectId = this.projectId;
    if (!projectId) return;
    const { data: project } = await this.api.put('/projects/{projectId}/active-task', { path: { projectId }, body: { taskId: null } });
    if (projectId === this.projectId) this.setProject({ activeTask: project.activeTaskId ? { id: project.activeTaskId } : undefined });
  }
}
