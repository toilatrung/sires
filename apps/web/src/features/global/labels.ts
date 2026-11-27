// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Labels and links shared by the screens of PID-00060: pending action and notification kinds (names verbatim from
// PRD 4.4, English in both languages), the action button of each kind (H4), links built from objectType (H5).

import { useCallback, useEffect, useState } from 'react';
import type { PublicApi } from '@sires/contracts';
import { formatShortDate, formatTime, isApiError, useApi } from '../../shell';

type Schemas = PublicApi.components['schemas'];
export type PendingKind = Schemas['PendingActionKind'];
export type NotificationKind = Schemas['Notification']['kind'];

export const PENDING_KINDS: readonly PendingKind[] = [
  'plan_approval',
  'interactive_prompt',
  'reference_approval',
  'task_review',
  'manual_work',
  'manuscript_change_proposal',
  'recovery_decision',
];

/** PRD 4.4 names, identical in vi and en (design.md §4 “Danh sách chờ”). */
export const PENDING_KIND_LABEL: Readonly<Record<PendingKind, string>> = {
  plan_approval: 'Plan approval request',
  interactive_prompt: 'Interactive Agent Prompt',
  reference_approval: 'Reference approval',
  task_review: 'Task review request',
  manual_work: 'Manual work required',
  manuscript_change_proposal: 'Manuscript change proposal',
  recovery_decision: 'Recovery decision',
};

export const NOTIFICATION_KINDS: readonly NotificationKind[] = ['blocked_task', 'failure', 'completion', 'impact_warning', 'provider_issue'];

export const NOTIFICATION_KIND_LABEL: Readonly<Record<NotificationKind, string>> = {
  blocked_task: 'Blocked task',
  failure: 'Failure',
  completion: 'Completion',
  impact_warning: 'Impact warning',
  provider_issue: 'Provider issue',
};

/** Chip tone of a notification kind (design.md §4 Notifications), a shell chip style. */
export const NOTIFICATION_TONE: Readonly<Record<NotificationKind, 'warning' | 'error' | 'confirmed'>> = {
  blocked_task: 'warning',
  impact_warning: 'warning',
  failure: 'error',
  provider_issue: 'error',
  completion: 'confirmed',
};

export interface ObjectLink {
  to: string;
  /** i18n key under `link.` of the global namespace. */
  label: string;
}

/**
 * Route of an object from its type and ids, by the addresses of PRD 4.3 (PID-00060 H5). The contract gives
 * Notification no deepLink and objectType is free text; unknown types or a missing project id give no link (EC09).
 */
export function objectLink(objectType: string | undefined, objectId: string | undefined, projectId: string | undefined): ObjectLink | undefined {
  if (!objectType) return undefined;
  const inProject = (path: string, label: string) => (projectId ? { to: `/projects/${projectId}${path}`, label } : undefined);
  switch (objectType) {
    case 'project':
      return objectId ? { to: `/projects/${objectId}/overview`, label: 'project' } : undefined;
    case 'task':
      return objectId ? inProject(`/tasks/${objectId}`, 'task') : undefined;
    case 'workflow':
      return objectId ? inProject(`/activity/workflows/${objectId}`, 'workflow') : undefined;
    case 'reference':
      return objectId ? { to: `/library/${objectId}`, label: 'reference' } : undefined;
    case 'claim':
      return objectId ? inProject(`/claims/${objectId}`, 'claim') : undefined;
    case 'artifact':
      return objectId ? inProject(`/artifacts/${objectId}`, 'artifact') : undefined;
    case 'manuscript':
    case 'build':
      return inProject('/manuscript', 'manuscript');
    case 'provider_connection':
      return { to: '/settings/providers', label: 'providers' };
    default:
      return undefined;
  }
}

/** “HH:mm” today, “dd/mm HH:mm” otherwise (reference screens PendingActions, Notifications; EC30). */
export function shortStamp(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const sameDay = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
  return sameDay ? formatTime(at) : `${formatShortDate(at)} ${formatTime(at)}`;
}

/** Display name of an agent (“Discovery Agent”), English in both languages like the reference screens. */
export function agentLabel(name: string | undefined): string | undefined {
  if (!name) return undefined;
  if (name === 'orchestrator') return 'Orchestrator';
  const words = name.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return `${words.join(' ')} Agent`;
}

/** Names of the account's projects (Active and Archived) by id, for rows that only carry projectId. */
export function useProjectNames(): Map<string, string> {
  const api = useApi();
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const load = useCallback(async () => {
    try {
      const rows: Array<{ id: string; name: string }> = [];
      for (const status of ['Active', 'Archived'] as const) {
        const { data } = await api.get('/projects', { query: { status, limit: 200 } });
        rows.push(...(data.items as Schemas['ResearchProject'][]));
      }
      setNames(new Map(rows.map((row) => [row.id, row.name])));
    } catch (error) {
      if (!isApiError(error)) throw error;
      // Without names the rows still show; the project label is just missing.
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  return names;
}

/** Phone layout below 768px (design.md §5; UX-RESP-001). False where matchMedia is missing (tests). */
export function usePhone(): boolean {
  const query = '(max-width: 767px)';
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [phone, setPhone] = useState(get);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const onChange = () => setPhone(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, []);
  return phone;
}
