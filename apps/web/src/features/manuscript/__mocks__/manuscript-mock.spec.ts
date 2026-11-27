// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00115 S01: the area's mock of path 12 (H3, EC56) — claims, demo rows valid against the public OpenAPI, and
// the stateful behaviour the screens rely on (revision per save, 409, Outdated, whole-proposal accept, builds).

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claims, createMocks, defineMocks, type EventInput } from '../../../shell/mock';
import { loadSpec } from '../../../shell/mock/generator/openapi.mjs';
import { mockFetch, useMockServer } from '../../../shell/mock/node';
import { features } from '../../../shell/features';
import mocks from '.';
import { demoBibliography, demoBuilds, demoProjectReferences, demoProposals, demoRevisions, METHOD_R15, proposalId, RAG, referenceId, revisionId } from './fixtures';
import { activeFiles, currentSnapshot, finishBuilds, resetManuscriptStore, setManuscriptEventSink, testStore } from './store';

const PATH_12 = [
  'getManuscript', 'initManuscript', 'listManuscriptFiles', 'getManuscriptFileContent', 'commitManuscriptChanges', 'listManuscriptRevisions',
  'getManuscriptRevision', 'listChangeProposals', 'getChangeProposal', 'acceptChangeProposal', 'rejectChangeProposal', 'insertDiagramIntoManuscript',
  'listBibliography', 'addBibliographyEntry', 'listBuilds', 'startBuild', 'getBuild', 'getBuildLog', 'getBuildPdf', 'exportManuscript',
];

const mock = useMockServer({ sources: [{ name: 'manuscript', mocks }] });
const base = `/api/v1/projects/${RAG}/manuscript`;
const events: EventInput[] = [];

beforeEach(() => {
  resetManuscriptStore();
  events.length = 0;
  setManuscriptEventSink((event) => events.push(event));
});
afterEach(() => setManuscriptEventSink(undefined));

const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) });
const get = async <T>(path: string): Promise<T> => (await (await mockFetch(`${base}${path}`)).json()) as T;

describe('mock path 12 (S01)', () => {
  it('đăng ký không trùng (EC56)', async () => {
    const loaded = await Promise.all(features.filter((feature) => feature.mocks).map(async (feature) => ({ name: feature.id, mocks: (await feature.mocks!()).default })));
    const owner = claims([{ name: 'shell', mocks: defineMocks({}) }, ...loaded]);
    for (const id of PATH_12) expect(owner.get(id), id).toBe('manuscript');
    // Another area declaring one of them fails loudly (PID-00013 EC10); others override it in their tests.
    const library = { name: 'library', mocks: defineMocks({ overrides: { listBibliography: () => ({ status: 200 }) } }) };
    expect(() => createMocks([{ name: 'manuscript', mocks }, library])).toThrow('Mock operation listBibliography is claimed by two areas: manuscript and library');
    expect(Object.keys(mocks.overrides ?? {}).sort()).toEqual([...PATH_12].sort());
  });

  it('dữ liệu mẫu hợp lệ theo schema', () => {
    const doc = loadSpec();
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    ajv.addSchema({ ...doc, $id: 'openapi' });
    const check = (schema: string, rows: unknown[]) => {
      const validate = ajv.compile({ $ref: `openapi#/components/schemas/${schema}` });
      for (const row of rows) expect(validate(row) ? [] : validate.errors, schema).toEqual([]);
    };
    check('ManuscriptRevision', demoRevisions().map((snapshot) => snapshot.revision));
    check('ChangeProposal', demoProposals());
    check('Build', demoBuilds());
    check('BibliographyEntry', demoBibliography());
    check('ProjectReferenceSelection', demoProjectReferences());
  });

  it('dữ liệu mẫu khớp màn tham chiếu', async () => {
    const manuscript = await get<{ currentRevisionNumber: number; latestBuild: { status: string; revisionNumber: number } }>('');
    expect(manuscript.currentRevisionNumber).toBe(18);
    expect(manuscript.latestBuild).toMatchObject({ status: 'Failed', revisionNumber: 17 });
    const files = await get<{ items: { path: string }[] }>('/files');
    expect(files.items.map((row) => row.path)).toEqual(['bibliography/references.bib', 'figures/pipeline.png', 'main.tex', 'sections/intro.tex', 'sections/method.tex', 'sections/related-work.tex']);
    const main = currentSnapshot(testStore().projects.get(RAG)!).files.values().next().value!;
    expect(main.content.split('\n')[11]).toBe('\\input{sections/method}');
    expect(main.content.split('\n')[3]).toBe('\\usepackage{booktabs}');
    const proposals = await get<{ items: { status: string }[] }>('/change-proposals');
    expect(proposals.items.map((row) => row.status).sort()).toEqual(['Accepted', 'Outdated', 'Proposed', 'Proposed']);
  });

  it('commit lệch base trả 409', async () => {
    const first = await mockFetch(`${base}/revisions`, json({ baseRevisionId: revisionId(18), changes: [{ path: 'main.tex', operation: 'modify', content: 'a\n' }] }));
    expect(first.status).toBe(201);
    const stale = await mockFetch(`${base}/revisions`, json({ baseRevisionId: revisionId(18), changes: [{ path: 'main.tex', operation: 'modify', content: 'x' }] }));
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { code: string }).code).toBe('base_revision_mismatch');
    expect(testStore().projects.get(RAG)!.manuscript.currentRevisionNumber).toBe(19);
  });

  it('commit khôi phục từ revision cũ', async () => {
    const pm = testStore().projects.get(RAG)!;
    const r15 = pm.revisions[0]!.revision.id;
    const restored = await mockFetch(`${base}/revisions`, json({ baseRevisionId: revisionId(18), changes: [
      { path: 'sections/method.tex', operation: 'modify', restoreFromRevisionId: r15 },
      { path: 'figures/pipeline.png', operation: 'modify', restoreFromRevisionId: r15 },
    ] }));
    expect(restored.status).toBe(201);
    const files = activeFiles(currentSnapshot(pm));
    expect(files.find((row) => row.path === 'sections/method.tex')!.content).toBe(METHOD_R15);
    expect(files.find((row) => row.path === 'figures/pipeline.png')!.binary).toBe(true);
    // A revision without that path: 400 on the field (contract: validation_failed).
    const missing = await mockFetch(`${base}/revisions`, json({ baseRevisionId: pm.manuscript.currentRevisionId, changes: [{ path: 'sections/new.tex', operation: 'add', restoreFromRevisionId: r15 }] }));
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { errors: { field: string }[] }).errors[0]!.field).toBe('changes[0].restoreFromRevisionId');
    expect(pm.manuscript.currentRevisionNumber).toBe(19);
  });

  it('lưu file làm proposal Outdated', async () => {
    const files = await get<{ items: { id: string; path: string }[] }>('/files');
    const intro = files.items.find((row) => row.path === 'sections/intro.tex')!;
    const text = await (await mockFetch(`${base}/files/${intro.id}/content`)).text();
    const response = await mockFetch(`${base}/revisions`, json({ baseRevisionId: revisionId(18), changes: [{ path: intro.path, operation: 'modify', content: `${text}% sửa\n` }] }));
    expect(response.status).toBe(201);
    expect(((await response.json()) as { revisionNumber: number }).revisionNumber).toBe(19);
    const proposal = await get<{ status: string }>(`/change-proposals/${proposalId(1)}`);
    expect(proposal.status).toBe('Outdated');
    expect(events.map((event) => `${event.objectType}:${event.toState}`)).toEqual(['revision:Created', 'change_proposal:Outdated']);
    const invalid = await mockFetch(`${base}/revisions`, json({ baseRevisionId: testStore().projects.get(RAG)!.manuscript.currentRevisionId, changes: [{ path: '../x.tex', operation: 'add', content: '' }] }));
    expect(invalid.status).toBe(400);
  });

  it('accept chuyển Accepted và tạo revision', async () => {
    const accepted = await mockFetch(`${base}/change-proposals/${proposalId(1)}/accept`, json(undefined));
    expect(accepted.status).toBe(200);
    const pm = testStore().projects.get(RAG)!;
    const files = activeFiles(currentSnapshot(pm));
    expect(files.find((row) => row.path === 'sections/intro.tex')!.content).toContain('Retrieval restricted to vetted sources improves factuality');
    expect(files.find((row) => row.path === 'sections/method.tex')!.content).toContain('Scores are averaged over three annotators');
    expect(pm.manuscript.currentRevisionNumber).toBe(19);
    // The second Proposed proposal touched method.tex too: now Outdated.
    expect(pm.proposals.find((row) => row.id === proposalId(2))!.status).toBe('Outdated');
    resetManuscriptStore();
    const failed = await mockFetch(`${base}/change-proposals/${proposalId(2)}/accept`, json(undefined));
    expect(failed.status).toBe(409);
    expect(((await failed.json()) as { code: string }).code).toBe('citation_check_failed');
  });

  it('build qua các trạng thái và phát sự kiện', async () => {
    const started = await mockFetch(`${base}/builds`, json({}));
    expect(started.status).toBe(202);
    const build = (await started.json()) as { id: string; status: string };
    expect(build.status).toBe('Queued');
    expect((await mockFetch(`${base}/builds`, json({}))).status).toBe(200);
    finishBuilds(testStore());
    const done = await get<{ status: string; issues: { code: string; file: string; line: number }[] }>(`/builds/${build.id}`);
    expect(done.status).toBe('Failed');
    expect(done.issues.map((issue) => `${issue.code} ${issue.file}:${issue.line}`)).toEqual(['missing_package main.tex:4', 'undefined_citation sections/intro.tex:7']);
    expect(await (await mockFetch(`${base}/builds/${build.id}/log`)).text()).toContain("booktabs.sty' not found");
    expect(events.map((event) => event.toState)).toEqual(['Queued', 'Running', 'Failed']);
    const pdf = await mockFetch(`${base}/export?format=pdf`);
    expect(pdf.headers.get('X-Build-Revision')).toBe('16');
    expect(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 8))).toBe('%PDF-1.4');
    const zip = await mockFetch(`${base}/export?format=zip`);
    expect(new Uint8Array(await zip.arrayBuffer()).slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
  });

  it('thêm entry cho Trusted Reference, 422 khi không trusted', async () => {
    const added = await mockFetch(`${base}/bibliography`, json({ referenceId: referenceId(4) }));
    expect(added.status).toBe(201);
    expect(((await added.json()) as { bibtexKey: string }).bibtexKey).toBe('smith2020');
    expect((await mockFetch(`${base}/bibliography`, json({ referenceId: referenceId(4) }))).status).toBe(200);
    const pm = testStore().projects.get(RAG)!;
    expect(pm.manuscript.currentRevisionNumber).toBe(19);
    expect(activeFiles(currentSnapshot(pm)).find((row) => row.fileType === 'bib')!.content).toContain('@article{smith2020,');
    // The Revoked reference already has an entry: the existing one comes back. A pending one gets 422.
    expect((await mockFetch(`${base}/bibliography`, json({ referenceId: referenceId(3) }))).status).toBe(200);
    const smith = demoProjectReferences()[3]!;
    testStore().references.push({ ...smith, id: 'e5000000-0000-4000-8000-000000000099', referenceId: referenceId(5), reference: { ...smith.reference!, id: referenceId(5), bibtexKey: 'pending2024', approvalStatus: 'Pending Approval' } });
    const pending = await mockFetch(`${base}/bibliography`, json({ referenceId: referenceId(5) }));
    expect(pending.status).toBe(422);
    expect(((await pending.json()) as { code: string }).code).toBe('reference_not_trusted');
  });

  it('gửi lại cùng Idempotency-Key không tạo thêm revision', async () => {
    const request = json({ baseRevisionId: revisionId(18), changes: [{ path: 'main.tex', operation: 'modify', content: 'x\n' }] });
    expect((await mockFetch(`${base}/revisions`, request)).status).toBe(201);
    expect((await mockFetch(`${base}/revisions`, request)).status).toBe(201);
    expect(testStore().projects.get(RAG)!.manuscript.currentRevisionNumber).toBe(19);
    expect(mock.events).toBeTruthy();
  });
});
