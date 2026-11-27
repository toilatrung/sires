// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Shared pieces of the project area (PID-00058): namespace, loader hook, names of agents and senders, links to the
// routes of other areas.

import type { PublicApi } from '@sires/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isApiError, type ApiError } from '../../shell';

export const NS = 'project';

/** Plan of a project, or null when it has none yet (getPlan 404 → no Plan baseline, EC01, EC29). */
export async function planOrNull(api: { get: (path: '/projects/{projectId}/plan', options: { path: { projectId: string } }) => Promise<{ data: Schemas['ResearchPlan'] }> }, projectId: string): Promise<Schemas['ResearchPlan'] | null> {
  try {
    return (await api.get('/projects/{projectId}/plan', { path: { projectId } })).data;
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

export type Schemas = PublicApi.components['schemas'];
export type ActorRef = Schemas['ActorRef'];

export type Loadable<T> = { state: 'loading' } | { state: 'ready'; data: T } | { state: 'error'; error: ApiError | Error };

/** Load data for a view; `reload` reruns the loader, `setData` replaces it after a write or an event. */
export function useResource<T>(load: () => Promise<T>, deps: readonly unknown[] = []): { value: Loadable<T>; reload: () => Promise<void>; setData: (update: (old: T) => T) => void } {
  const [value, setValue] = useState<Loadable<T>>({ state: 'loading' });
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useCallback(async () => {
    setValue((old) => (old.state === 'ready' ? old : { state: 'loading' }));
    try {
      setValue({ state: 'ready', data: await loadRef.current() });
    } catch (error) {
      setValue({ state: 'error', error: error as ApiError });
    }
  }, []);
  useEffect(() => {
    setValue({ state: 'loading' });
    void reload();
    // `deps` lists what the loader reads (project id); the loader itself is kept in a ref.
  }, deps);
  const setData = useCallback((update: (old: T) => T) => setValue((old) => (old.state === 'ready' ? { state: 'ready', data: update(old.data) } : old)), []);
  return { value, reload, setData };
}

/** i18n key of an agent's display name; Analysis Agent carries its instance (H8). */
export function agentKey(agent: string | undefined, instance?: string | null): { key: string; instance?: string } {
  return { key: `agent.${agent ?? 'unknown'}`, instance: agent === 'analysis' && instance ? instance : undefined };
}

/** Route of an Agent Run in the monitoring area (PID-00059 H13). */
export function agentRunHref(projectId: string, agentRunId: string): string {
  return `/projects/${projectId}/activity/agent-runs/${agentRunId}`;
}

/** Workflow page of the monitoring area (Recovery decision, running workflow). */
export function workflowHref(projectId: string, workflowId: string): string {
  return `/projects/${projectId}/activity/workflows/${workflowId}`;
}

/** Short id shown in links (“ar-7f21”): prefix and the last four hex digits. */
export function shortId(prefix: string, value: string): string {
  return `${prefix}-${value.replace(/-/g, '').slice(-4)}`;
}

/** Route of an object linked from a message, when the web knows one (S03); others are not shown as links. */
export function objectHref(projectId: string, objectType: string | undefined, objectId: string | undefined): string | undefined {
  if (!objectType || !objectId) return undefined;
  switch (objectType) {
    case 'workflow':
      return workflowHref(projectId, objectId);
    case 'agent_run':
      return agentRunHref(projectId, objectId);
    case 'task':
      return `/projects/${projectId}/tasks/${objectId}`;
    case 'plan_version':
      return `/projects/${projectId}/plan/versions/${objectId}`;
    default:
      return undefined;
  }
}
