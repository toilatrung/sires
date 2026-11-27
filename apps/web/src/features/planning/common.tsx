// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Shared pieces of the planning area: loading data, Task status order (PRD 9.8), the deliberation label of a Plan
// Version, the confirmation dialog and small helpers.

import type { PublicApi } from '@sires/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError, isApiError } from '../../shell';

export type Schemas = PublicApi.components['schemas'];
export type Task = Schemas['Task'];
export type TaskDefinition = Schemas['TaskDefinition'];
export type TaskStatus = Schemas['TaskStatus'];
export type PlanVersion = Schemas['PlanVersion'];
export type ResearchPlan = Schemas['ResearchPlan'];

/** Items of a list response: the contract types `Page.items` as unknown[] and the operation narrows it. */
export const itemsOf = <T,>(page: { items?: unknown } | undefined): T[] => ((page?.items as T[] | undefined) ?? []);

/** Page size for lists read in full (parameters.yaml Limit: maximum 200). */
export const PAGE_LIMIT = 200;

/**
 * Every item of a list operation: follows `nextCursor` until the last page, so boards, groups and counts are complete
 * beyond the first page (listTasks, listProjects; EC05).
 */
export async function readAll<T>(page: (cursor: string | undefined) => Promise<{ data: { items?: unknown; nextCursor?: string | null } }>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const { data } = await page(cursor);
    items.push(...itemsOf<T>(data));
    cursor = data.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

/** Task statuses in the order of the state table (PRD 9.8); the board groups by it. */
export const TASK_STATUS_ORDER: readonly TaskStatus[] = [
  'Draft',
  'Blocked',
  'Ready',
  'Queued',
  'In Progress',
  'Waiting for User',
  'In Review',
  'Completed',
  'Failed',
  'Cancelled',
];

export const isManual = (definition: Pick<TaskDefinition, 'executionLabel'> | undefined) => definition?.executionLabel === 'Manual editor requirement';

export const keyOf = (definition: Pick<TaskDefinition, 'stableKey' | 'taskId'> | undefined) => definition?.stableKey ?? definition?.taskId ?? '';

export interface Resource<T> {
  status: 'loading' | 'ready' | 'error';
  data?: T;
  /** ETag of the last response, for If-Match. */
  etag?: string;
  error?: ApiError;
  reload: () => Promise<void>;
}

/** Load data with the API client; a newer load wins; `reload` reads again (after SSE, a command, a 409/412). */
export function useResource<T>(load: () => Promise<{ data: T; etag?: string }>, deps: readonly unknown[]): Resource<T> {
  const [state, setState] = useState<Omit<Resource<T>, 'reload'>>({ status: 'loading' });
  const request = useRef(0);
  // The caller lists what `load` reads, like useEffect deps.
  const run = useCallback(load, deps);
  const reload = useCallback(async () => {
    const ticket = ++request.current;
    try {
      const { data, etag } = await run();
      if (ticket === request.current) setState({ status: 'ready', data, etag });
    } catch (error) {
      if (ticket === request.current) setState((prev) => ({ ...prev, status: 'error', error: isApiError(error) ? error : new ApiError('network') }));
    }
  }, [run]);
  useEffect(() => {
    setState({ status: 'loading' });
    void reload();
  }, [reload]);
  return { ...state, reload };
}

/** “Qua thảo luận” with a link to the Deliberation Record, or “Không qua thảo luận” (PLAN-GENERATE-001-AC02, EC04). */
export function DeliberationLabel({ provenance, projectId }: { provenance?: PlanVersion['provenance']; projectId: string }) {
  const { t } = useTranslation('planning');
  const label = provenance?.deliberation;
  if (!label) return null;
  if (label.status === 'skipped') return <span className="planning-delib" data-status="skipped">{t('plan.notDeliberated')}</span>;
  return (
    <span className="planning-delib" data-status="deliberated">
      {t('plan.deliberated')}
      {label.recordArtifactVersionId && (
        <>
          {' · '}
          <Link to={`/projects/${encodeURIComponent(projectId)}/artifacts?version=${encodeURIComponent(label.recordArtifactVersionId)}`}>
            {t('plan.deliberationRecord')}
          </Link>
        </>
      )}
    </span>
  );
}

/** Text of a ContextItem (assumptions shown before “Duyệt”), whatever key the content uses. */
export function contextText(item: Schemas['ContextItem']): string {
  const content = item.content ?? {};
  const value = content.text ?? content.statement ?? content.summary ?? Object.values(content).find((v) => typeof v === 'string');
  return typeof value === 'string' ? value : JSON.stringify(content);
}
