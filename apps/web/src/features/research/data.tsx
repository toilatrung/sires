// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Data access of the research area: GET with loading/error state, cursor pages, reload on SSE events and on the
// shell's “cần tải lại” signal (H13), Task keys cached by taskId (S02). Every call goes through the shell's typed
// client (useApi); state is never built from an event payload.

import type { PublicApi } from '@sires/contracts';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, isApiError, useApi, useEvents, useStreamSignal, type StreamEvent } from '../../shell';

export type Schemas = PublicApi.components['schemas'];

/** ApiError of any rejection (a non-API failure counts as a network error). */
export function toApiError(error: unknown): ApiError {
  return isApiError(error) ? error : new ApiError('network');
}

export interface Loaded<T> {
  data?: T;
  error?: ApiError;
  /** True until the first answer and during a reload (data stays visible meanwhile). */
  loading: boolean;
  reload: () => void;
}

/** One GET (or several) with state; `deps` restart it. A newer request wins over an older answer. */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]): Loaded<T> {
  const [state, setState] = useState<{ data?: T; error?: ApiError; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let current = true;
    setState((previous) => ({ ...previous, loading: true }));
    loadRef.current().then(
      (data) => current && setState({ data, loading: false }),
      (error: unknown) => current && setState({ error: toApiError(error), loading: false }),
    );
    return () => {
      current = false;
    };
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}

export interface Paged<T> extends Loaded<T[]> {
  nextCursor?: string | null;
  loadMore: () => void;
  loadingMore: boolean;
  moreError?: ApiError;
}

/** Cursor pages of a list (Page.nextCursor). `deps` (filters) restart from the first page; reload too. */
export function usePaged<T>(fetchPage: (cursor?: string) => Promise<{ items?: T[]; nextCursor?: string | null }>, deps: readonly unknown[]): Paged<T> {
  const [items, setItems] = useState<T[] | undefined>();
  const [nextCursor, setNextCursor] = useState<string | null | undefined>();
  const [error, setError] = useState<ApiError | undefined>();
  const [moreError, setMoreError] = useState<ApiError | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tick, setTick] = useState(0);
  const generation = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  useEffect(() => {
    const mine = ++generation.current;
    setLoading(true);
    setMoreError(undefined);
    fetchRef.current().then(
      (page) => {
        if (mine !== generation.current) return;
        setItems(page.items ?? []);
        setNextCursor(page.nextCursor ?? null);
        setError(undefined);
        setLoading(false);
      },
      (failure: unknown) => {
        if (mine !== generation.current) return;
        setError(toApiError(failure));
        setLoading(false);
      },
    );
  }, [...deps, tick]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    const mine = generation.current;
    setLoadingMore(true);
    setMoreError(undefined);
    fetchRef.current(nextCursor).then(
      (page) => {
        if (mine !== generation.current) return;
        setItems((previous) => [...(previous ?? []), ...(page.items ?? [])]);
        setNextCursor(page.nextCursor ?? null);
        setLoadingMore(false);
      },
      (failure: unknown) => {
        if (mine !== generation.current) return;
        setMoreError(toApiError(failure));
        setLoadingMore(false);
      },
    );
  }, [nextCursor, loadingMore]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data: items, error, loading, reload, nextCursor, loadMore, loadingMore, moreError };
}

/** Every page of a list (e.g. claims of one synthesis version), for places that show all rows at once. */
export async function allPages<T>(fetchPage: (cursor?: string) => Promise<{ items?: T[]; nextCursor?: string | null }>, limit = 10): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < limit; page += 1) {
    const result = await fetchPage(cursor);
    rows.push(...(result.items ?? []));
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return rows;
}

/* ---------- Events (H13) ---------- */

/** `research.object_status_changed` of the open project for these object types. */
export function useResearchObjectEvents(projectId: string, objectTypes: readonly string[], handler: (event: StreamEvent) => void): void {
  const types = objectTypes.join(',');
  useEvents({ types: ['research.object_status_changed'], projectId }, (event) => {
    if (event.objectType && types.split(',').includes(event.objectType)) handler(event);
  });
}

/** Reference events (account-level, no project filter) and project_reference.changed of the open project. */
export function useReferenceEvents(projectId: string, handler: () => void): void {
  useEvents({ types: ['reference.status_changed', 'reference.indexing_status_changed'] }, () => handler());
  useEvents({ types: ['project_reference.changed'], projectId }, () => handler());
}

/** The shell's “cần tải lại” signal (replay.unavailable): reload what the screen shows. */
export function useReloadSignal(reload: () => void): void {
  useStreamSignal((signal) => {
    if (signal === 'reload') reload();
  });
}

/* ---------- Task keys (stableKey from getTask, cached by taskId) ---------- */

interface TaskKeyCache {
  get(taskId: string): Schemas['Task'] | null | undefined;
  request(taskId: string): void;
}

const TaskKeyContext = createContext<TaskKeyCache | null>(null);

/** Mount with `key={projectId}` so another project starts with an empty cache. */
export function TaskKeysProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const api = useApi();
  const [tasks, setTasks] = useState<Record<string, Schemas['Task'] | null>>({});
  const requested = useRef(new Set<string>());
  const cache = useMemo<TaskKeyCache>(() => ({
    get: (taskId) => tasks[taskId],
    request: (taskId) => {
      if (requested.current.has(taskId)) return;
      requested.current.add(taskId);
      api.get('/projects/{projectId}/tasks/{taskId}', { path: { projectId, taskId } }).then(
        ({ data }) => setTasks((previous) => ({ ...previous, [taskId]: data })),
        () => setTasks((previous) => ({ ...previous, [taskId]: null })),
      );
    },
  }), [api, projectId, tasks]);
  return <TaskKeyContext.Provider value={cache}>{children}</TaskKeyContext.Provider>;
}

/** Task of a row: undefined while loading, null when not found (provenance shows “—”, EC28). */
export function useTask(taskId: string | undefined): Schemas['Task'] | null | undefined {
  const cache = useContext(TaskKeyContext);
  useEffect(() => {
    if (taskId) cache?.request(taskId);
  }, [cache, taskId]);
  return taskId ? cache?.get(taskId) : null;
}

/** One command at a time: a second click while the first is sending does nothing (EC44, DATA-IDEMP-001). */
export function useSingleFlight(): <T>(send: () => Promise<T>) => Promise<T | undefined> {
  const sending = useRef(false);
  return useCallback(async <T,>(send: () => Promise<T>) => {
    if (sending.current) return undefined;
    sending.current = true;
    try {
      return await send();
    } finally {
      sending.current = false;
    }
  }, []);
}
