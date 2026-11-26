// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Global or Project context from the URL (PRD 4.1–4.3). URLs carry identifiers only.

import { RAIL_AREAS, type RailArea } from './navigation/navigation';

export const GLOBAL_TABS = [
  { id: 'dashboard', path: '/dashboard', label: 'nav.dashboard' },
  { id: 'projects', path: '/projects', label: 'nav.projects' },
  { id: 'discover', path: '/discover', label: 'nav.discover' },
  { id: 'library', path: '/library', label: 'nav.library' },
  { id: 'tasks', path: '/tasks', label: 'nav.tasks' },
  { id: 'activity', path: '/activity', label: 'nav.activity' },
] as const;
export type GlobalTab = (typeof GLOBAL_TABS)[number]['id'];

/** Path segment after /projects/<id>/ for each rail area (ProjectRail, apps/web/README.md). */
export const AREA_SEGMENT: Record<RailArea, string> = {
  overview: 'overview',
  chat: 'chat',
  plan: 'plan',
  evidence: 'evidence',
  artifacts: 'artifacts',
  manuscript: 'manuscript',
  activity: 'activity',
  history: 'history',
};

const SEGMENT_AREA: Record<string, RailArea> = { ...Object.fromEntries(RAIL_AREAS.map((a) => [AREA_SEGMENT[a], a])), tasks: 'plan' };

export type RouteContext =
  | { kind: 'global'; tab?: GlobalTab }
  | { kind: 'project'; projectId: string; area?: RailArea; manuscript: boolean };

export function routeContext(pathname: string): RouteContext {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'projects' && segments[1]) {
    const area = segments[2] ? SEGMENT_AREA[segments[2]] : undefined;
    return { kind: 'project', projectId: decodeURIComponent(segments[1]), area, manuscript: area === 'manuscript' };
  }
  const tab = GLOBAL_TABS.find((t) => pathname === t.path || (t.id !== 'projects' && pathname.startsWith(`${t.path}/`)));
  return { kind: 'global', tab: tab?.id };
}

export function projectAreaPath(projectId: string, area: RailArea): string {
  return `/projects/${encodeURIComponent(projectId)}/${AREA_SEGMENT[area]}`;
}
