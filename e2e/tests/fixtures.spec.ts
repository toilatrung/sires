// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { expect, test } from '@playwright/test';
import { generateFixtures, SCALE } from '../fixtures/generate.ts';
import { loadFixtures } from '../fixtures/load.ts';

test('TS-00-03 dữ liệu xác định', () => {
  const data = generateFixtures('repeatable');
  expect(data).toEqual(generateFixtures('repeatable'));
  expect(data.accounts[0].account.id).not.toBe(generateFixtures('other').accounts[0].account.id);
  expect(data.accounts.map((a) => a.label)).toEqual(['A', 'B']);
  expect(data.accounts[0].account.id).not.toBe(data.accounts[1].account.id);
  expect(data.projects.map((p) => p.label)).toEqual(['P1', 'P2']);
  expect(data.projects.every((p) => p.project.accountId === data.accounts[0].account.id)).toBe(true);
  expect(data.projects[0].input.agentResponseLanguage).toBe('en');
  expect(data.connections.filter((c) => c.expectedStatus === 'Valid').map((c) => c.provider)).toEqual(['anthropic', 'openai', 'google']);
  expect(data.connections.filter((c) => c.expectedStatus === 'Invalid')).toHaveLength(1);
  expect(data.references.map((r) => r.contentKind)).toEqual(['text', 'scan', 'none']);
  const [text, scan, missing] = data.references;
  expect(Buffer.from(text.pdfBase64!, 'base64').toString()).toContain(' Tj ET');
  const scannedPdf = Buffer.from(scan.pdfBase64!, 'base64').toString();
  expect(scannedPdf).toContain('/Subtype /Image');
  expect(scannedPdf).not.toContain('/Font');
  expect(missing.pdfBase64).toBeUndefined();
});

test('TS-00-04 dữ liệu quy mô 16.4', () => {
  const data = generateFixtures(42, 'scale');
  expect(data.references).toHaveLength(5000);
  const indexed = data.references.filter((r) => r.reference.indexingStatus === 'Indexed');
  expect(indexed).toHaveLength(2000);
  expect(new Set(indexed.map((r) => r.reference.document!.contentHash)).size).toBe(2000);
  expect(data.references.every((r) => !r.reference.document || r.reference.document.sizeBytes! <= SCALE.maxPdfBytes)).toBe(true);
  expect(data.scaleProjects).toHaveLength(2);
  for (const project of data.scaleProjects) {
    expect(project.planVersions).toHaveLength(50);
    expect(project.planVersions.every((p) => p.tasks?.length === 200)).toBe(true);
    expect(project.workflows).toHaveLength(2000);
    expect(project.agentRuns).toHaveLength(20000);
    expect(project.selectedReferenceIds).toHaveLength(500);
    expect(project.evidence).toHaveLength(10000);
    expect(project.artifactVersions).toHaveLength(2000);
    expect(project.manuscriptFiles).toHaveLength(200);
    expect(project.manuscriptRevisions).toHaveLength(2000);
    const workflows = new Set(project.workflows.map((w) => w.id));
    expect(project.agentRuns.every((r) => workflows.has(r.workflowId) && r.projectId === project.projectId)).toBe(true);
    const selected = new Set(project.selectedReferenceIds);
    expect(project.evidence.every((e) => selected.has(e.referenceId) && e.projectId === project.projectId)).toBe(true);
    expect(new Set(project.manuscriptFiles.map((f) => f.path)).size).toBe(200);
  }
  expect(data.scaleProjects[0].agentRuns[0].id).not.toBe(data.scaleProjects[1].agentRuns[0].id);
  const plan = loadFixtures(data);
  const approvals = plan.filter((call) => call.operationId === 'decideReferences');
  expect(approvals).toHaveLength(25);
  expect(approvals.every((call) => (call.body as { decisions: unknown[] }).decisions.length === 200)).toBe(true);
  expect(plan.filter((call) => call.operationId === 'selectReferencesForProject')
    .every((call) => (call.body as { referenceIds: string[] }).referenceIds.length === 500)).toBe(true);
});

test('TS-00-05 chạy thử bộ nạp', () => {
  const lines: string[] = [];
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error('Unexpected network call'); };
  try {
    const calls = loadFixtures(generateFixtures('dry-run'), { dryRun: true, write: (line) => lines.push(line) });
    expect(lines).toHaveLength(calls.length);
    expect(calls.filter((c) => c.operationId === 'createProject')).toHaveLength(2);
    expect(calls.filter((c) => c.operationId === 'createProviderConnection')).toHaveLength(4);
    expect(calls.filter((c) => c.operationId === 'uploadReferenceDocument')).toHaveLength(2);
    expect(calls.filter((c) => c.account === 'B').every((c) => c.method === 'GET')).toBe(true);
    const apiRoot = resolve(import.meta.dirname, '../../docs/api-design');
    const api = parse(readFileSync(resolve(apiRoot, 'openapi.yaml'), 'utf8'));
    const operations = new Map<string, { method: string; path: string }>();
    for (const [path, value] of Object.entries(api.paths as Record<string, { $ref: string }>)) {
      const [file, pointer] = value.$ref.split('#/');
      const pathItem = parse(readFileSync(resolve(apiRoot, file), 'utf8'))[pointer.replace(/~1/g, '/').replace(/~0/g, '~')];
      for (const [method, operation] of Object.entries(pathItem as Record<string, { operationId?: string }>)) {
        if (operation.operationId) operations.set(operation.operationId, { method: method.toUpperCase(), path });
      }
    }
    for (const call of calls) {
      const operation = operations.get(call.operationId);
      expect(operation, call.operationId).toBeDefined();
      expect(call.method).toBe(operation!.method);
      expect(call.path).toMatch(new RegExp(`^${operation!.path.replace(/\{[^}]+\}/g, '[^/]+')}$`));
      if (call.method !== 'GET') expect(call.headers?.['X-CSRF-Token']).toBeDefined();
    }
    expect(networkCalls).toBe(0);
    expect(lines.join('\n')).toContain('${env.E2E_OPENAI_API_KEY}');
  } finally { globalThis.fetch = originalFetch; }
});

test('TS-00-06 không có key trong fixture', () => {
  const sentinel = 'secret-sentinel-not-a-real-key';
  const previous = process.env.E2E_OPENAI_API_KEY;
  process.env.E2E_OPENAI_API_KEY = sentinel;
  try {
    const data = generateFixtures();
    const lines: string[] = [];
    loadFixtures(data, { write: (line) => lines.push(line) });
    expect(JSON.stringify(data)).not.toContain(sentinel);
    expect(lines.join('\n')).not.toContain(sentinel);
    expect(data.connections.filter((c) => c.expectedStatus === 'Valid').every((c) => c.apiKeyEnv && !('invalidKey' in c))).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.E2E_OPENAI_API_KEY;
    else process.env.E2E_OPENAI_API_KEY = previous;
  }
});

test('TS-00-07 chặn production', () => {
  const data = generateFixtures();
  for (const baseURL of ['https://sires.etroy.com', 'https://production.example.test', 'https://custom-domain.test', 'http://localhost:5173']) {
    expect(() => loadFixtures(data, { baseURL, dryRun: false })).toThrow('Từ chối nạp thật');
  }
  expect(() => loadFixtures(data, { baseURL: 'https://user:password@example.test' })).toThrow('không chứa credentials');
  expect(() => loadFixtures(data, { baseURL: 'file:///tmp/example' })).toThrow('HTTP(S)');
});
