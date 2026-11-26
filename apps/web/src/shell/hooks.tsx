// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// React access to the shell services for the shell itself and for feature areas (see README “Dùng shell”).

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import type { ApiClient } from './api/client';
import type { DraftHandle } from './drafts/store';
import type { NavigationState } from './navigation/navigation';
import type { ShellServices } from './services';
import type { SessionState } from './session/session';
import type { EventFilter, EventHandler, StreamSignal, StreamStatus } from './sse';

const ShellContext = createContext<ShellServices | null>(null);

export function ShellProvider({ services, children }: { services: ShellServices; children: ReactNode }) {
  return <ShellContext.Provider value={services}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellServices {
  const services = useContext(ShellContext);
  if (!services) throw new Error('useShell: missing <ShellProvider>');
  return services;
}

/** Typed API client (PublicApi): CSRF, Idempotency-Key, If-Match and errors handled by the shell. */
export function useApi(): ApiClient {
  return useShell().api;
}

export function useSession(): SessionState {
  const { session } = useShell();
  return useSyncExternalStore(
    (cb) => session.subscribe(cb),
    () => session.current,
    () => session.current,
  );
}

export function useNavigationData(): NavigationState {
  const { navigation } = useShell();
  return useSyncExternalStore(
    (cb) => navigation.subscribe(cb),
    () => navigation.current,
    () => navigation.current,
  );
}

/**
 * Receive SSE events of some types (and project) while mounted. The handler may change between renders;
 * the subscription follows `filter.types` and `filter.projectId` only.
 */
export function useEvents(filter: EventFilter, handler: EventHandler): void {
  const { events } = useShell();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const types = filter.types?.join(',');
  const { projectId } = filter;
  useEffect(() => {
    const typeList = types ? (types.split(',') as EventFilter['types']) : undefined;
    return events.subscribe({ types: typeList, projectId }, (event) => handlerRef.current(event));
  }, [events, types, projectId]);
}

/** “reconnected” after SSE reconnects; “reload” when the server can no longer replay: reload your data with GET. */
export function useStreamSignal(handler: (signal: StreamSignal) => void): void {
  const { events } = useShell();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => events.onSignal((signal) => handlerRef.current(signal)), [events]);
}

export function useStreamStatus(): StreamStatus {
  const { events } = useShell();
  return useSyncExternalStore(
    (cb) => events.onStatus(cb),
    () => events.status,
    () => events.status,
  );
}

export interface DraftField {
  value: string;
  setValue: (value: string) => void;
  /** Call after the content was sent (EC30). */
  clear: () => void;
}

/**
 * Keep an input's unsent text in the shared draft store (H7): restored after the session expires and the same
 * account signs in again on the same route. `fieldId` names the input inside the screen, e.g. `chat.composer`.
 */
export function useDraft(fieldId: string, options: { route?: string; initial?: string } = {}): DraftField {
  const { drafts, session } = useShell();
  const location = useLocation();
  const route = options.route ?? location.pathname;
  const accountId = useSyncExternalStore(
    (cb) => session.subscribe(cb),
    () => session.accountId,
    () => session.accountId,
  );
  const handleRef = useRef<DraftHandle | null>(null);
  const [value, setState] = useState<string>(() => drafts.get(route, fieldId) ?? options.initial ?? '');
  const valueRef = useRef(value);
  valueRef.current = value;
  const registeredKey = useRef<string | null>(null);

  useEffect(() => {
    const handle = drafts.register(route, fieldId);
    handleRef.current = handle;
    const key = `${route}\n${fieldId}`;
    const sameField = registeredKey.current === null || registeredKey.current === key;
    registeredKey.current = key;
    if (handle.initial !== undefined) setState(handle.initial);
    else if (!sameField) setState(options.initial ?? '');
    else if (valueRef.current) handle.update(valueRef.current);
    return () => {
      handle.release();
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [drafts, route, fieldId, accountId]);

  const setValue = useCallback((next: string) => {
    setState(next);
    handleRef.current?.update(next);
  }, []);
  const clear = useCallback(() => {
    setState('');
    handleRef.current?.clear();
  }, []);
  return { value, setValue, clear };
}

/** For a screen opened without a route change: counts as user activity (S13, H11). Never call it on a timer. */
export function useMarkScreenOpened(): () => Promise<void> {
  const { session } = useShell();
  return useCallback(() => session.touch(), [session]);
}

/** Re-read navigation counts after an action that changes them without an SSE event (e.g. marking read). */
export function useRefreshNavigation(): () => Promise<void> {
  const { navigation } = useShell();
  return useCallback(() => navigation.refreshCounts(), [navigation]);
}

/** matchMedia as state; false when unavailable (tests, SSR). */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
