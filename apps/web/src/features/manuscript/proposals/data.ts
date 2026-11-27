// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Data a Change Proposal box shows besides the proposal itself (PID-00115 S06): the Task key (planning), the claims'
// support status (research), the base revision number and which files changed since it (H13), and the citation
// result of the diff (H12). Helpers only read; decisions are in useProposalActions.

import { useEffect, useState } from 'react';
import type { PublicApi } from '@sires/contracts';
import { useApi } from '../../../shell';
import { citeKeys, type ManuscriptFile, type Proposal } from '../model';

type Claim = PublicApi.components['schemas']['Claim'];
type Hunk = PublicApi.components['schemas']['DiffHunk'];
export type DiffEntry = Proposal['diff'][number];

/** Line after which the box of a file sits: the last old line of its first hunk (H11). */
export function boxLine(entry: DiffEntry): number {
  const hunk = [...(entry.hunks ?? [])].sort((a, b) => (a.oldStart ?? 0) - (b.oldStart ?? 0))[0];
  if (!hunk) return 0;
  const start = hunk.oldStart ?? 0;
  const count = hunk.oldLines ?? 0;
  return count > 0 ? start + count - 1 : start;
}

export interface DiffRow {
  kind: 'add' | 'del' | 'same';
  text: string;
}

export function hunkRows(hunk: Hunk): DiffRow[] {
  return (hunk.lines ?? []).map((line) => ({
    kind: line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : 'same',
    text: line.slice(1),
  }));
}

/** Keys cited in the added lines of the whole proposal. */
export function addedKeys(proposal: Proposal): string[] {
  const keys = new Set<string>();
  for (const entry of proposal.diff) {
    for (const hunk of entry.hunks ?? []) {
      for (const line of hunk.lines ?? []) if (line[0] === '+') for (const cite of citeKeys(line.slice(1))) keys.add(cite.key);
    }
  }
  return [...keys];
}

export type CitationResult =
  | { state: 'passed'; resolved: number; total: number }
  | { state: 'failed'; bad: string[] }
  | { state: 'missing' };

/** Only `citationCheck.passed === true` allows accepting (H12, DBQ-11, EC30). */
export function citationResult(proposal: Proposal): CitationResult {
  const check = proposal.citationCheck;
  if (!check || check.passed === undefined || check.passed === null) return { state: 'missing' };
  if (check.passed === true) {
    const total = addedKeys(proposal).length;
    const unresolved = check.unresolvedKeys?.length ?? 0;
    return { state: 'passed', total, resolved: Math.max(0, total - unresolved) };
  }
  const bad = [...new Set([...(check.unresolvedKeys ?? []), ...(check.mismatches ?? []).map((row) => row.key).filter((key): key is string => Boolean(key))])];
  return { state: 'failed', bad };
}

/** Keys marked as errors inside the diff lines. */
export function badKeys(proposal: Proposal): Set<string> {
  const result = citationResult(proposal);
  return new Set(result.state === 'failed' ? result.bad : proposal.citationCheck?.unresolvedKeys ?? []);
}

function useLoad<T>(key: string | undefined, load: () => Promise<T>): T | undefined {
  const [value, setValue] = useState<{ key: string; data: T } | undefined>();
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    load().then(
      (data) => alive && setValue({ key, data }),
      () => undefined,
    );
    return () => {
      alive = false;
    };
    // `load` is re-created on every render; `key` names what it loads.
  }, [key]);
  return value && value.key === key ? value.data : undefined;
}

/** Stable key of the proposal's Task (e.g. T-2.1), from the planning area's getTask. */
export function useTaskKey(projectId: string, taskId: string | undefined): string | undefined {
  const api = useApi();
  return useLoad(taskId ? `task:${projectId}:${taskId}` : undefined, async () => {
    const { data } = await api.get('/projects/{projectId}/tasks/{taskId}', { path: { projectId, taskId: taskId! } });
    return data.stableKey;
  });
}

/** Revision number of a revision id (the proposal's base revision, H13). */
export function useRevisionNumber(projectId: string, revisionId: string | undefined): number | undefined {
  const api = useApi();
  return useLoad(revisionId ? `revision:${projectId}:${revisionId}` : undefined, async () => {
    const { data } = await api.get('/projects/{projectId}/manuscript/revisions/{revisionId}', { path: { projectId, revisionId: revisionId! } });
    return data.revisionNumber;
  });
}

/** Claims of the proposal (research area); a claim that cannot be read is left out. */
export function useClaims(projectId: string, claimIds: readonly string[] | undefined): Claim[] {
  const api = useApi();
  const ids = claimIds ?? [];
  return (
    useLoad(ids.length ? `claims:${projectId}:${ids.join(',')}` : undefined, async () => {
      const rows = await Promise.all(ids.map((claimId) => api.get('/projects/{projectId}/claims/{claimId}', { path: { projectId, claimId } }).then((result) => result.data, () => undefined)));
      return rows.filter((row): row is Claim => Boolean(row));
    }) ?? []
  );
}

/** Files of the proposal that changed between its base revision and now (the Outdated reason, H13). */
export function useChangedPaths(projectId: string, proposal: Proposal, current: readonly ManuscriptFile[], currentRevision: number | undefined): string[] {
  const api = useApi();
  const paths = proposal.diff.map((entry) => entry.path).filter((path): path is string => Boolean(path));
  const base = useLoad(proposal.status === 'Outdated' ? `base:${projectId}:${proposal.baseRevisionId}:${currentRevision ?? ''}` : undefined, async () => {
    const { data } = await api.get('/projects/{projectId}/manuscript/files', { path: { projectId }, query: { revisionId: proposal.baseRevisionId } });
    return (data.items ?? []) as ManuscriptFile[];
  });
  if (!base) return paths;
  const changed = paths.filter((path) => base.find((file) => file.path === path)?.contentHash !== current.find((file) => file.path === path)?.contentHash);
  return changed.length ? changed : paths;
}
