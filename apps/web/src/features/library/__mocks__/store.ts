// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// One store for the 23 operations of path 10 (PID-00098 S01, H4): references, discovered results, usage, project
// selections and the discovery / reference_processing / indexing workflows. Tests reset it with a scenario; dev
// keeps it in memory for the page's life. Background steps (a search finishing, an import, indexing) run after
// `delayMs` and are announced on the mock /events stream like the gateway would.

import type { EventInput, Schemas } from '../../../shell/mock';
import { ACCOUNT_ID } from '../../../shell/mock';
import { demoReferences, demoResults, demoSources, demoUsage, projects, workflowId } from './data';

type Reference = Schemas['Reference'];
type DiscoveredResult = Schemas['DiscoveredResult'];
type Workflow = Schemas['Workflow'];
type Selection = Schemas['ProjectReferenceSelection'];
type Emit = (event: EventInput) => void;
export type UsageRow = { projectId: string; name: string; evidenceCount: number; citationCount: number };

export type SearchOutcome =
  | { kind: 'results' }
  | { kind: 'empty' }
  | { kind: 'failed'; code: Schemas['ProviderErrorCode']; message: string }
  | { kind: 'unavailable' };

export interface LibraryScenario {
  references?: Reference[];
  usage?: Record<string, UsageRow[]>;
  sources?: Schemas['DiscoverySource'][];
  /** Results a finished search produces (default: the five Discover results; author searches too). */
  results?: (workflowId: string, query: string, source: string) => DiscoveredResult[];
  search?: SearchOutcome;
  /** Discovered results whose import fails (no reference created, workflow lastError). */
  importFailures?: string[];
  importInterrupted?: boolean;
  /** Author searches by name stop at Waiting for User (profile choice prompt) until `resumeAuthorSearch`. */
  authorPrompt?: boolean;
  /** DOIs the mock cannot resolve (422). */
  unresolvableDois?: string[];
  /** Background steps: `auto` after delayMs (dev, most tests), `manual` until `advance()`. */
  advance?: 'auto' | 'manual';
  delayMs?: number;
}

const now = () => new Date().toISOString();
const researcher = { type: 'researcher', accountId: ACCOUNT_ID } as const;
const clone = <T>(value: T): T => structuredClone(value);
// usedInProjectCount is readOnly in the contract (server-computed); the mock server computes it.
const setUsed = (ref: Reference, count: number) => { (ref as { usedInProjectCount?: number }).usedInProjectCount = count; };

export function createLibraryStore() {
  let scenario: LibraryScenario = {};
  let references = new Map<string, Reference>();
  let results: DiscoveredResult[] = [];
  let usage: Record<string, UsageRow[]> = {};
  let selections: Selection[] = [];
  let workflows = new Map<string, Workflow>();
  let searches = new Map<string, { query: string; source: string }>();
  let pending: (() => void)[] = [];
  let workflowSeq = 100;
  let referenceSeq = 100;

  const store = {
    calls: [] as { operationId: string; body?: unknown; headers?: Record<string, string> }[],

    reset(next: LibraryScenario = {}) {
      scenario = next;
      references = new Map((next.references ?? demoReferences()).map((row) => [row.id, clone(row)]));
      usage = clone(next.usage ?? demoUsage());
      results = [];
      selections = [];
      workflows = new Map();
      searches = new Map();
      pending = [];
      workflowSeq = 100;
      referenceSeq = 100;
      store.calls = [];
      for (const ref of references.values()) setUsed(ref, usage[ref.id]?.length ?? 0);
    },

    get sources() { return scenario.sources ?? demoSources; },
    get scenario() { return scenario; },
    reference: (id: string) => references.get(id),
    references: () => [...references.values()],
    putReference(ref: Reference) {
      setUsed(ref, usage[ref.id]?.length ?? 0);
      references.set(ref.id, ref);
    },
    deleteReference: (id: string) => references.delete(id),
    usage: (id: string) => usage[id] ?? [],
    addUsage(id: string, row: UsageRow) {
      usage[id] = [...(usage[id] ?? []), row];
      const ref = references.get(id);
      if (ref) setUsed(ref, usage[id].length);
    },
    results: () => results,
    result: (id: string) => results.find((row) => row.id === id),
    selections: (projectId: string) => selections.filter((row) => row.projectId === projectId && row.status === 'Active'),
    addSelection(row: Selection) { selections.push(row); },
    removeSelection(projectId: string, refId: string) {
      const row = selections.find((s) => s.projectId === projectId && s.referenceId === refId && s.status === 'Active');
      if (row) row.status = 'Removed';
      return Boolean(row);
    },
    workflow: (id: string) => workflows.get(id),
    rememberSearch(id: string, query: string, source: string) { searches.set(id, { query, source }); },
    projectName: (projectId: string) => Object.values(projects).find((p) => p.id === projectId)?.name ?? projectId,

    nextReferenceId: () => `4e000000-0000-4000-8000-${String(++referenceSeq).padStart(12, '0')}`,

    /** Starts a workflow of the given type; the returned row is what the 202 sends. */
    startWorkflow(type: Schemas['WorkflowType'], idempotencyKey: string): Workflow {
      const id = workflowId(++workflowSeq);
      const row: Workflow = {
        id, accountId: ACCOUNT_ID, createdAt: now(), createdBy: researcher, rowVersion: 1,
        idempotencyKey, type, triggeredBy: researcher, status: 'Running', startedAt: now(), steps: [],
      };
      workflows.set(id, row);
      return clone(row);
    },

    finishWorkflow(id: string, status: Schemas['WorkflowStatus'], emit: Emit, lastError?: Workflow['lastError']) {
      const row = workflows.get(id);
      if (!row) return;
      const from = row.status;
      row.status = status;
      row.rowVersion += 1;
      if (status !== 'Running' && status !== 'Waiting for User') row.endedAt = now();
      if (lastError) row.lastError = lastError;
      emit({ type: 'workflow.status_changed', objectType: 'workflow', objectId: id, fromState: from, toState: status });
    },

    /** Runs a background step now (manual) or after delayMs (auto). */
    later(step: () => void) {
      if (scenario.advance === 'manual') pending.push(step);
      else setTimeout(step, scenario.delayMs ?? 1200);
    },
    /** Manual mode: runs every waiting background step. */
    advance() {
      const steps = pending;
      pending = [];
      for (const step of steps) step();
    },

    /** A search finished: its results become available. */
    completeSearch(id: string, query: string, source: string, emit: Emit) {
      const outcome = scenario.search ?? { kind: 'results' };
      if (outcome.kind === 'failed') {
        store.finishWorkflow(id, 'Failed', emit, { code: outcome.code, message: outcome.message });
        return;
      }
      if (outcome.kind === 'results') {
        const rows = (scenario.results ?? demoResults)(id, query, source).map((row) => ({ ...clone(row), searchWorkflowId: id }));
        results = [...results.filter((row) => row.searchWorkflowId !== id), ...rows];
      }
      store.finishWorkflow(id, 'Succeeded', emit);
    },

    /** The prompt of an author search was answered (global's answerPrompt in tests): continue the search. */
    resumeAuthorSearch(id: string, emit: Emit) {
      const row = workflows.get(id);
      if (!row) return;
      store.finishWorkflow(id, 'Running', emit);
      const search = searches.get(id) ?? { query: '', source: 'openalex' };
      store.later(() => store.completeSearch(id, search.query, search.source, emit));
    },
  };
  store.reset();
  return store;
}

export const libraryStore = createLibraryStore();
export type LibraryStore = ReturnType<typeof createLibraryStore>;
