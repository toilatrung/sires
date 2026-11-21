// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { createHash } from 'node:crypto';
import type { PublicApi } from '@sires/contracts';
import { samplePdf } from './documents.ts';

type Schema = PublicApi.components['schemas'];
export type AccountLabel = 'A' | 'B';
export const SCALE = {
  tasksPerPlanVersion: 200, planVersions: 50, workflows: 2_000, agentRuns: 20_000,
  selectedReferences: 500, evidence: 10_000, artifactVersions: 2_000,
  manuscriptFiles: 200, manuscriptRevisions: 2_000, references: 5_000,
  indexedDocuments: 2_000, maxPdfBytes: 50 * 1024 * 1024,
} as const;
const at = '2026-01-01T00:00:00.000Z';

export function generateFixtures(seed: string | number = 'PID-00034', profile: 'standard' | 'scale' = 'standard') {
  const hash = (value: string) => createHash('sha256').update(`${seed}:${value}`).digest('hex');
  const id = (value: string) => {
    const h = hash(value);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  };
  const actor = (label: AccountLabel): Schema['ActorRef'] => ({ type: 'researcher', accountId: id(label) });
  const meta = (key: string, label: AccountLabel = 'A', projectId?: string): Schema['EntityMeta'] => ({
    id: id(key), accountId: id(label), projectId, createdAt: at, createdBy: actor(label), rowVersion: 1,
  });
  const accounts = (['A', 'B'] as const).map((label) => ({
    label, storageStateEnv: `E2E_ACCOUNT_${label}_STORAGE_STATE`,
    account: {
      ...meta(label, label), authIdentity: { issuer: 'https://oidc.example.test', subject: id(`subject-${label}`) },
      profile: { displayName: `Researcher ${label}`, email: `${label.toLowerCase()}@example.test` },
      preferences: { uiLanguage: 'vi', defaultAgentLanguage: 'en', includeResearchFieldInContext: false, debugMode: false },
    } satisfies Schema['Account'],
  }));
  const projects = (['P1', 'P2'] as const).map((label) => {
    const input: Schema['ProjectCreate'] = {
      name: label, agentResponseLanguage: 'en',
      context: { researchQuestion: label === 'P1' ? 'How can evidence improve research synthesis?' : 'How can learning outcomes be measured?',
        domain: label === 'P1' ? 'Computer science' : 'Education', manuscriptLanguage: 'en' },
    };
    return { label, input, project: {
      ...meta(label), name: label, agentResponseLanguage: 'en', status: 'Active',
      currentContextVersionId: id(`${label}-context`), lastActivityAt: at,
    } satisfies Schema['ResearchProject'] };
  });
  const connections = ([
    ['Claude', 'anthropic', 'E2E_ANTHROPIC_API_KEY', 'Valid'],
    ['OpenAI', 'openai', 'E2E_OPENAI_API_KEY', 'Valid'],
    ['Gemini', 'google', 'E2E_GOOGLE_API_KEY', 'Valid'],
    ['Invalid OpenAI', 'openai', null, 'Invalid'],
  ] as const).map(([name, provider, apiKeyEnv, expectedStatus]) => ({
    id: id(name), account: 'A' as const, name, provider, apiKeyEnv, expectedStatus,
    ...(expectedStatus === 'Invalid' ? { invalidKey: 'sires-intentionally-invalid-key' } : {}),
  }));
  const textPdf = samplePdf('text');
  const scanPdf = samplePdf('scan');
  const references = Array.from({ length: profile === 'scale' ? SCALE.references : 3 }, (_, i) => {
    const kind = i === 1 ? 'scan' : i === 2 || i >= SCALE.indexedDocuments ? 'none' : 'text';
    // 2.000 document đã index ở scale; hai mẫu scan/no-fulltext đặt cuối thư viện.
    const contentKind = profile === 'scale' ? (i < SCALE.indexedDocuments ? 'text' : i === 2000 ? 'scan' : 'none') : kind;
    const pdf = contentKind === 'text' ? (profile === 'scale' ? samplePdf('text', `SIRes synthetic research document ${i}`) : textPdf)
      : contentKind === 'scan' ? scanPdf : undefined;
    const topic = ['Evidence and reproducible computing', 'Scanned education study', 'Clinical research without full text'][i % 3];
    const title = profile === 'scale' ? `${topic} ${i}` : topic;
    const bibtexKey = `sires${hash('bibtex').slice(0, 8)}r${i}`;
    const reference: Schema['Reference'] = {
      ...meta(`reference-${i}`), metadata: { title, authors: [{ name: 'SIRes Test Researcher' }],
        identifiers: {}, source: 'bibtex', retrievedAt: at, year: 2026 },
      metadataVersion: 1, bibtexKey, origin: 'manual', approvalStatus: 'Trusted',
      indexingStatus: contentKind === 'text' ? 'Indexed' : contentKind === 'scan' ? 'Failed' : 'Unavailable',
      ...(pdf ? { document: { id: id(`document-${i}`), fileName: `${bibtexKey}.pdf`,
        sizeBytes: pdf.length, contentHash: createHash('sha256').update(pdf).digest('hex'), pageCount: 1,
        ...(contentKind === 'text' ? { indexedAt: at, chunkCount: 1, embeddingModel: 'synthetic-fixture' } : {}) } } : {}),
    };
    const input: Schema['ReferenceManualCreate'] = {
      bibtex: `@article{${bibtexKey}, title={${title}}, author={SIRes Test Researcher}, year={2026}}`,
    };
    return { input, reference, contentKind, ...(pdf ? { pdfBase64: pdf.toString('base64') } : {}) };
  });
  const scaleProjects = profile === 'scale' ? projects.map(({ label, project }) => {
    const projectId = project.id;
    const scoped = (key: string) => meta(`${label}-${key}`, 'A', projectId);
    const selectedReferenceIds = references.slice(0, SCALE.selectedReferences).map((r) => r.reference.id);
    const planVersions: Schema['PlanVersion'][] = Array.from({ length: SCALE.planVersions }, (_, v) => ({
      ...scoped(`plan-${v}`), planId: id(`${label}-research-plan`), versionNumber: v + 1,
      status: v === SCALE.planVersions - 1 ? 'Approved' : 'Superseded', contextVersionId: project.currentContextVersionId,
      phases: [{ id: id(`${label}-phase`), order: 1, name: 'Research' }],
      tasks: Array.from({ length: SCALE.tasksPerPlanVersion }, (_, t) => ({
        taskId: id(`${label}-task-${t}`), planVersionId: id(`${label}-plan-${v}`), phaseId: id(`${label}-phase`),
        title: `Research task ${t}`, objective: 'Inspect synthetic evidence', executionLabel: 'Available for agent',
        expectedOutputs: [{ artifactType: 'synthesis', required: true }], acceptanceCriteria: [{ id: 'fixture-criterion', text: 'Sources traceable' }],
      })),
    }));
    const workflows: Schema['Workflow'][] = Array.from({ length: SCALE.workflows }, (_, w) => ({
      ...scoped(`workflow-${w}`), type: 'task_execution', triggeredBy: actor('A'), status: 'Succeeded',
      taskId: id(`${label}-task-${w % SCALE.tasksPerPlanVersion}`), planVersionId: planVersions.at(-1)!.id,
      idempotencyKey: id(`${label}-workflow-${w}`), lastCheckpointId: id(`${label}-checkpoint-${w}`),
    }));
    const agentRuns: Schema['AgentRun'][] = Array.from({ length: SCALE.agentRuns }, (_, r) => ({
      ...scoped(`run-${r}`), workflowId: workflows[r % workflows.length].id, stepId: id(`${label}-step-${r % workflows.length}`),
      agent: 'evidence_retrieval', providerConnectionId: connections[1].id, provider: 'openai', model: 'synthetic-fixture',
      adapterVersion: 'fixture-v1', inputSummary: 'Synthetic scale fixture; no provider call', contextManifest: {}, structuredOutput: {},
      usage: { noData: true, inputTokens: null, outputTokens: null, calls: 0 }, status: 'Succeeded', attempts: 1, discarded: false,
    }));
    const evidence: Schema['Evidence'][] = Array.from({ length: SCALE.evidence }, (_, e) => ({
      ...scoped(`evidence-${e}`), projectId, referenceId: selectedReferenceIds[e % selectedReferenceIds.length],
      chunkId: id(`chunk-${e % selectedReferenceIds.length}`), quote: 'SIRes synthetic research document', location: { page: 1 }, status: 'Active',
    }));
    const artifactVersions: Schema['ArtifactVersion'][] = Array.from({ length: SCALE.artifactVersions }, (_, a) => ({
      ...scoped(`artifact-version-${a}`), artifactId: id(`${label}-artifact`), versionNumber: a + 1, format: 'markdown',
      content: `Synthetic research output ${a}`, contentHash: createHash('sha256').update(`Synthetic research output ${a}`).digest('hex'), status: 'Accepted',
      provenance: { createdBy: actor('A'), inputs: [{ type: 'evidence', id: evidence[a % evidence.length].id }] },
    }));
    const manuscriptFiles: Schema['ManuscriptFile'][] = Array.from({ length: SCALE.manuscriptFiles }, (_, f) => ({
      id: id(`${label}-file-${f}`), path: f === 0 ? 'main.tex' : `sections/section-${f}.tex`, fileType: 'tex', contentHash: hash(`file-${f}`), status: 'Active',
    }));
    const manuscriptRevisions: Schema['ManuscriptRevision'][] = Array.from({ length: SCALE.manuscriptRevisions }, (_, r) => ({
      id: id(`${label}-revision-${r}`), revisionNumber: r + 1, ...(r ? { parentRevisionId: id(`${label}-revision-${r - 1}`) } : {}),
      changes: [{ path: manuscriptFiles[r % manuscriptFiles.length].path, operation: r < SCALE.manuscriptFiles ? 'add' : 'modify', content: `Synthetic revision ${r}` }],
      source: r === 0 ? 'init' : 'direct_edit', createdBy: actor('A'), createdAt: at,
    }));
    return { projectId, selectedReferenceIds, planVersions, workflows, agentRuns, evidence, artifactVersions, manuscriptFiles, manuscriptRevisions };
  }) : [];
  return { seed, profile, accounts, projects, connections, references, scaleProjects };
}

export type FixtureData = ReturnType<typeof generateFixtures>;
