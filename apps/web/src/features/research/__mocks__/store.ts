// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// One stateful store behind the 24 overrides of the research area (PID-00114 S01, H12). A test creates its own store
// with a scenario (createResearchStore), never through a global; the dev mock creates one at load. State changes
// push events through the mock /events stream of PID-00013 (`emit`).

import { id } from '../../../shell/mock';
import type { EventInput, Schemas } from '../../../shell/mock';
import {
  PROJECT_ID, THRESHOLDS, agentActor, before, buildArtifacts, buildClaims, buildEvidence, buildReferences, diagramTypes, researcher,
} from './data';

type Claim = Schemas['Claim'];
type Evidence = Schemas['EvidenceInContext'];
type Version = Schemas['ArtifactVersion'];
type Workflow = Schemas['Workflow'];

export interface ResearchStoreOptions {
  /** `empty`: a project without references, claims, evidence or artifacts (EC01, EC26). */
  scenario?: 'demo' | 'empty';
  /** Extra generated claims, evidence and artifacts so the lists span several pages (EC04). */
  extraRows?: number;
  /** How a verification workflow ends (CLAIM-SUPPORT-001, EC21). */
  verification?: 'succeeds' | 'fails';
  /** How a Diagram Agent revision workflow ends (EC37). */
  diagramRevision?: 'succeeds' | 'fails';
  /** Delay before a workflow ends; `null` keeps it running until `finishWorkflows()` (tests). */
  workflowDelayMs?: number | null;
  /** Pushes an event to the mock /events stream (PID-00013 S03). */
  emit?: (event: EventInput) => void;
  now?: () => Date;
}

/** A request an override received, for tests that check what the screen sent. */
export interface RecordedCall {
  operationId: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

interface PendingWorkflow {
  workflow: Workflow;
  finish: () => void;
}

export interface ResearchStore {
  readonly projectId: string;
  readonly options: Required<Pick<ResearchStoreOptions, 'verification' | 'diagramRevision'>> & ResearchStoreOptions;
  references: Schemas['ProjectReferenceSelection'][];
  evidence: Evidence[];
  claims: Claim[];
  artifacts: Schemas['Artifact'][];
  versions: Version[];
  workflows: Workflow[];
  diagramTypes: Schemas['DiagramType'][];
  calls: RecordedCall[];
  now(): Date;
  emit(event: EventInput): void;
  /** Ends every running workflow now (tests that keep workflows running with `workflowDelayMs: null`). */
  finishWorkflows(): void;
  /** Starts a workflow that ends after the configured delay or on `finishWorkflows()`. */
  startWorkflow(workflow: Workflow, finish: () => void): void;
  /** Calls of one operation, in order. */
  callsOf(operationId: string): RecordedCall[];
}

const numbered = (prefix: string, n: number) => `${prefix} ${String(n).padStart(2, '0')}`;

function extraRows(store: ResearchStore, count: number) {
  const now = store.now();
  for (let k = 0; k < count; k += 1) {
    const n = 300 + k;
    store.claims.push({
      id: id('claim', n), accountId: store.claims[0]?.accountId ?? researcher.accountId!, projectId: store.projectId,
      createdAt: before(now, 40 + k), createdBy: agentActor('synthesis', 103), rowVersion: 1,
      statement: `${numbered('Claim bổ sung', k + 1)}: phát biểu mẫu để kiểm phân trang.`, approvalStatus: 'Draft', supportStatus: 'Not Assessed',
      needsReview: false, evidenceLinks: [],
    });
    store.evidence.push({
      id: id('evidence', n), accountId: researcher.accountId!, projectId: store.projectId, createdAt: before(now, 40 + k),
      createdBy: agentActor('evidence_retrieval', 101), rowVersion: 1, referenceId: store.references[0]?.referenceId ?? id('reference', 101),
      chunkId: id('chunk', n), quote: `[đoạn trích bổ sung ${k + 1}]`, location: { page: 1 + (k % 9) }, status: 'Active',
    });
    store.artifacts.push({
      id: id('artifact', n), accountId: researcher.accountId!, projectId: store.projectId, createdAt: before(now, 40 + k),
      createdBy: researcher, rowVersion: 1, type: 'note', title: `${numbered('Ghi chú bổ sung', k + 1)}`, currentAcceptedVersionId: null,
      latestVersion: { id: id('artifactVersion', n), versionNumber: 1, status: 'Draft', createdAt: before(now, 40 + k) },
    });
    store.versions.push({
      id: id('artifactVersion', n), accountId: researcher.accountId!, projectId: store.projectId, createdAt: before(now, 40 + k),
      createdBy: researcher, rowVersion: 1, artifactId: id('artifact', n), versionNumber: 1, format: 'markdown',
      content: `Ghi chú bổ sung ${k + 1}.`, contentHash: `sha256:${n}`, status: 'Draft', provenance: { createdBy: researcher, inputs: [] },
    });
  }
}

export function createResearchStore(options: ResearchStoreOptions = {}): ResearchStore {
  const now = options.now ?? (() => new Date());
  const start = now();
  const empty = options.scenario === 'empty';
  const built = empty ? { artifacts: [], versions: [] } : buildArtifacts(start);
  const pending = new Set<PendingWorkflow>();
  const delay = options.workflowDelayMs === undefined ? 4000 : options.workflowDelayMs;

  const store: ResearchStore = {
    projectId: PROJECT_ID,
    options: { verification: 'succeeds', diagramRevision: 'succeeds', ...options },
    references: empty ? [] : buildReferences(start),
    evidence: empty ? [] : buildEvidence(start),
    claims: empty ? [] : buildClaims(start),
    artifacts: built.artifacts,
    versions: built.versions,
    workflows: [],
    diagramTypes: [...diagramTypes],
    calls: [],
    now,
    emit: (event) => options.emit?.(event),
    finishWorkflows() {
      for (const entry of [...pending]) {
        pending.delete(entry);
        entry.finish();
      }
    },
    startWorkflow(workflow, finish) {
      store.workflows.push(workflow);
      const entry: PendingWorkflow = { workflow, finish };
      pending.add(entry);
      if (delay !== null) {
        setTimeout(() => {
          if (!pending.has(entry)) return;
          pending.delete(entry);
          finish();
        }, delay);
      }
    },
    callsOf: (operationId) => store.calls.filter((call) => call.operationId === operationId),
  };
  if (options.extraRows) extraRows(store, options.extraRows);
  return store;
}

/* ---------- Domain helpers used by the overrides ---------- */

export const linkedClaimIds = (store: ResearchStore, evidenceId: string) =>
  store.claims.filter((claim) => claim.evidenceLinks?.some((link) => link.evidenceId === evidenceId)).map((claim) => claim.id);

export function touch<T extends { rowVersion: number; updatedAt?: string; updatedBy?: Schemas['ActorRef'] }>(store: ResearchStore, row: T, by = researcher): T {
  row.rowVersion += 1;
  row.updatedAt = store.now().toISOString();
  row.updatedBy = by;
  return row;
}

/**
 * Deterministic Mermaid check of the mock (DIAG-VALIDATE-001): a known header on the first line, no `->` arrow
 * (Mermaid uses `-->`; `->>` belongs to sequence diagrams), balanced square brackets per line. A source with the
 * marker `%% render-error` passes the syntax check but cannot render (render_error, WF-07.E2).
 */
export function checkMermaid(source: string): Schemas['DiagramValidation'] {
  const lines = source.split('\n');
  const errors: { line?: number; message: string }[] = [];
  const first = lines.findIndex((line) => line.trim() !== '');
  if (first < 0) return { status: 'syntax_error', errors: [{ line: 1, message: 'Nguồn trống.' }] };
  if (!/^(flowchart|graph|sequenceDiagram|stateDiagram(-v2)?|classDiagram)\b/.test(lines[first]!.trim())) {
    errors.push({ line: first + 1, message: 'Dòng đầu phải khai báo loại sơ đồ (flowchart, sequenceDiagram, stateDiagram-v2).' });
  }
  lines.forEach((line, index) => {
    if (/(^|[^-])->(?!>)/.test(line)) errors.push({ line: index + 1, message: 'Mũi tên “->” không hợp lệ; Mermaid dùng “-->”.' });
    const open = (line.match(/\[/g) ?? []).length;
    const close = (line.match(/\]/g) ?? []).length;
    if (open !== close) errors.push({ line: index + 1, message: 'Thiếu dấu ngoặc vuông đóng hoặc mở.' });
  });
  if (errors.length) return { status: 'syntax_error', errors };
  if (source.includes('%% render-error')) return { status: 'render_error', errors: [{ message: 'Sơ đồ quá lớn, render quá thời gian.' }] };
  return { status: 'valid' };
}

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** SVG preview the mock renders for a valid source: the node labels in one row (token colours only). */
export function renderPreview(source: string, caption: string): string {
  const labels = [...source.matchAll(/\[\(?([^\])]+)\)?\]/g)].map((match) => match[1]!.trim()).slice(0, 6);
  const width = Math.max(320, labels.length * 130 + 40);
  const boxes = labels.map((label, index) => {
    const x = 20 + index * 130;
    return `<rect x="${x}" y="40" width="110" height="40" rx="6" fill="#FCF9F5" stroke="#1C1B18" stroke-width="1.5"/>`
      + `<text x="${x + 55}" y="65" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="12" fill="#1C1B18">${escapeXml(label)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="110" viewBox="0 0 ${width} 110">`
    + `<rect width="${width}" height="110" fill="#EFEAE3"/>${boxes}`
    + `<text x="20" y="100" font-family="Montserrat, sans-serif" font-size="11" fill="#4D4A44">${escapeXml(caption)}</text></svg>`;
}

/** Workflow of a command (202 WorkflowAccepted), with steps so the long-operation card shows “Bước n/m”. */
export function newWorkflow(store: ResearchStore, type: Schemas['WorkflowType'], subject: Schemas['TypedRef'], idempotencyKey: string,
  taskId: string | undefined, steps: Array<[string, Schemas['AgentName']]>): Workflow {
  const at = store.now().toISOString();
  const workflowId = id('workflow', 200 + store.workflows.length);
  return {
    id: workflowId, accountId: researcher.accountId!, projectId: store.projectId, createdAt: at, createdBy: researcher, rowVersion: 1,
    idempotencyKey, type, ...(taskId ? { taskId } : {}), subject, triggeredBy: researcher, status: 'Running', startedAt: at,
    steps: steps.map(([description, agent], index) => ({
      id: id('step', 2000 + store.workflows.length * 10 + index), order: index + 1, description, assignedAgent: agent,
      status: index === 0 ? 'Running' : 'Pending', attemptCount: index === 0 ? 1 : 0,
    })),
  };
}

/** Ends a workflow: every step Succeeded (or the current one Failed), status and event (H13). */
export function endWorkflow(store: ResearchStore, workflow: Workflow, outcome: 'Succeeded' | 'Failed') {
  workflow.status = outcome;
  workflow.endedAt = store.now().toISOString();
  workflow.rowVersion += 1;
  workflow.steps = workflow.steps?.map((step, index) => ({
    ...step, status: outcome === 'Succeeded' ? 'Succeeded' : index === 0 ? 'Failed' : 'Cancelled', attemptCount: Math.max(1, step.attemptCount),
  }));
  if (outcome === 'Failed') workflow.lastError = { code: 'provider_unavailable', message: 'Provider tạm thời không phục vụ được sau 3 lần thử.' };
  store.emit({ type: 'workflow.status_changed', projectId: store.projectId, objectType: 'workflow', objectId: workflow.id, fromState: 'Running', toState: outcome });
}

/** Support status the mock Verification Agent assigns from the links it may count (CLAIM-MAPPING-001). */
export function assess(store: ResearchStore, claim: Claim): Schemas['SupportStatus'] {
  const counted = (claim.evidenceLinks ?? []).filter((link) => store.evidence.find((row) => row.id === link.evidenceId)?.status === 'Active');
  const supports = counted.filter((link) => link.relation === 'supports').length;
  const contradicts = counted.filter((link) => link.relation === 'contradicts').length;
  if (supports && contradicts) return 'Conflicting';
  if (supports >= 2) return 'Supported';
  if (supports === 1) return 'Partially Supported';
  return 'Unsupported';
}

export function verificationResult(store: ResearchStore, claim: Claim, outcome: Schemas['SupportStatus']): Schemas['VerificationResult'] {
  return {
    id: id('audit', 500 + store.workflows.length), targetType: 'claim', targetId: claim.id, agentRunId: id('agentRun', 500 + store.workflows.length),
    outcome, thresholdsUsed: THRESHOLDS, at: store.now().toISOString(),
  };
}
