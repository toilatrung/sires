// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Labels and addresses of the research area: short reference names, evidence location, times through the shell's
// formatters (EC46), agent names kept in English (UX-I18N-003), routes of H3.

import type { TFunction } from 'i18next';
import { formatDateTime, formatTime } from '../../shell';
import type { Schemas } from './data';

const enc = encodeURIComponent;

/** Addresses of PRD 4.3 / H3 (and the links to other areas the screens open). */
export const paths = {
  evidence: (projectId: string, tab?: 'references' | 'claims' | 'evidence') => `/projects/${enc(projectId)}/evidence${tab ? `?tab=${tab}` : ''}`,
  claim: (projectId: string, claimId: string) => `/projects/${enc(projectId)}/claims/${enc(claimId)}`,
  evidenceItem: (projectId: string, evidenceId: string) => `/projects/${enc(projectId)}/evidence/${enc(evidenceId)}`,
  artifacts: (projectId: string) => `/projects/${enc(projectId)}/artifacts`,
  artifact: (projectId: string, artifactId: string, query: { version?: string; compare?: string } = {}) => {
    const search = new URLSearchParams();
    if (query.version) search.set('version', query.version);
    if (query.compare) search.set('compare', query.compare);
    const qs = search.toString();
    return `/projects/${enc(projectId)}/artifacts/${enc(artifactId)}${qs ? `?${qs}` : ''}`;
  },
  workflow: (projectId: string, workflowId: string) => `/projects/${enc(projectId)}/activity/workflows/${enc(workflowId)}`,
  task: (projectId: string, taskId: string) => `/projects/${enc(projectId)}/tasks/${enc(taskId)}`,
  plan: (projectId: string) => `/projects/${enc(projectId)}/plan`,
  library: () => '/library',
  reference: (referenceId: string) => `/library/${enc(referenceId)}`,
};

/** Family name as printed in author–year citations (last word of the name). */
const familyName = (name: string) => name.trim().split(/\s+/).pop() ?? name;

/** “Lewis et al.”, “Izacard & Grave”, “Lewis”. */
export function authorsShort(reference: Schemas['Reference'] | undefined): string {
  const authors = reference?.metadata.authors ?? [];
  if (authors.length === 0) return '';
  if (authors.length === 1) return familyName(authors[0]!.name);
  if (authors.length === 2) return `${familyName(authors[0]!.name)} & ${familyName(authors[1]!.name)}`;
  return `${familyName(authors[0]!.name)} et al.`;
}

/** “Lewis et al. 2020”, the short reference of evidence rows and filters. */
export function referenceShort(reference: Schemas['Reference'] | undefined): string {
  if (!reference) return '';
  const year = reference.metadata.year;
  return [authorsShort(reference), year].filter(Boolean).join(' ');
}

/** “trang 7 · đoạn 3 · chunk 58a1c2”; missing parts are left out (EC08). */
export function locationParts(t: TFunction, location: Schemas['Evidence']['location'] | undefined, chunkId?: string): string[] {
  const parts: string[] = [];
  if (location?.page !== undefined) parts.push(t('evidence.page', { page: location.page }));
  if (location?.paragraph !== undefined) parts.push(t('evidence.paragraph', { paragraph: location.paragraph }));
  if (chunkId) parts.push(t('evidence.chunk', { chunk: shortId(chunkId) }));
  return parts;
}

/** Last 6 hex digits of a UUID, for chunk and other technical ids. */
export const shortId = (value: string) => value.replace(/-/g, '').slice(-6);

/** Agent Run code as on the reference screens (ar-91c0): last four hex digits. */
export const runCode = (agentRunId: string) => `ar-${agentRunId.replace(/-/g, '').slice(-4)}`;

/** “HH:mm” today, “dd/mm/yyyy HH:mm” another day, with the shell's formatters (EC46). */
export function formatWhen(value: string | undefined, now = new Date()): string {
  if (!value) return '';
  const date = new Date(value);
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return sameDay ? formatTime(date) : formatDateTime(date);
}

/** Agent names stay in English in both languages (UX-I18N-003). */
export const AGENT_NAMES: Record<Schemas['AgentName'], string> = {
  orchestrator: 'Orchestrator',
  discovery: 'Discovery Agent',
  reference_processing: 'Reference Processing Agent',
  evidence_retrieval: 'Evidence Retrieval Agent',
  synthesis: 'Synthesis Agent',
  writing: 'Writing Agent',
  verification: 'Verification Agent',
  diagram: 'Diagram Agent',
  analysis: 'Analysis Agent',
};

export function linkCounts(claim: Pick<Schemas['Claim'], 'evidenceLinks'>) {
  const links = claim.evidenceLinks ?? [];
  return {
    total: links.length,
    supports: links.filter((link) => link.relation === 'supports').length,
    contradicts: links.filter((link) => link.relation === 'contradicts').length,
    context: links.filter((link) => link.relation === 'context').length,
  };
}

/** Problem.detail of a refused command, shown next to its code (EC19, EC41). */
export function problemDetail(error: { problem?: { detail?: string } } | undefined): string | undefined {
  return error?.problem?.detail;
}
