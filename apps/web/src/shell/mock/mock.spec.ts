// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// @vitest-environment node

// PID-00013 acceptance: AC01 and edge cases EC01–EC05, EC08–EC10, EC12, EC13 (specs/scope.html).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import openapiTS, { astToString } from 'openapi-typescript';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { buildModel, generateAll, generateMocks } from './generate.mjs';
import { defaultSpec, loadSpec, workspaceRoot } from './generator/openapi.mjs';
import { DEMO_ACCOUNT_ID } from './generator/sample.mjs';
import { operations } from './generated';
import { ACCOUNT_ID, CSRF_TOKEN, createMocks, demoFixtures, defineMocks, id, MOCK_HEADER, projectIds, signedOutMocks } from './index';
import { useMockServer } from './node';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '../../..');
const sampleSpec = path.join(here, '__fixtures__/sample-openapi.yaml');
const temps: string[] = [];
const tempDir = (root = os.tmpdir()) => {
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'sires-mock-'));
  temps.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

/** Type errors of `files` under strict settings, as `file:line message`. */
function typecheck(files: string[]): { file: string; line: number; message: string }[] {
  const program = ts.createProgram(files, {
    strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, types: [], lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  });
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => ({
    file: diagnostic.file ? path.resolve(diagnostic.file.fileName) : '',
    line: diagnostic.file && diagnostic.start !== undefined ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1 : 0,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }));
}

/** Sample spec → PublicApi-like types (openapi-typescript, as @sires/contracts) → mock module → typed override. */
async function generateSample(spec: string, dir: string) {
  fs.writeFileSync(path.join(dir, 'api.ts'), astToString(await openapiTS(pathToFileURL(spec))));
  await generateMocks({ spec, out: path.join(dir, 'generated'), types: "import type * as PublicApi from '../api';" });
  fs.copyFileSync(path.join(here, '__fixtures__/sample-override.ts.txt'), path.join(dir, 'override.ts'));
  return path.join(dir, 'override.ts');
}

function bodyOf(spec: string, operationId: string, status: string) {
  const model = buildModel({ spec, operations: [operationId] }).models[0]!;
  return model.responses[status]!.body as Record<string, unknown>;
}

describe('bộ sinh mock (S01, S04)', () => {
  it('đổi schema thì typecheck báo lệch', async () => {
    // PID-00013-AC01, EC12. Unchanged spec: the override typechecks.
    const before = tempDir();
    const override = await generateSample(sampleSpec, before);
    expect(typecheck([override])).toEqual([]);
    expect(bodyOf(sampleSpec, 'getNote', '200')).toHaveProperty('title');

    // Rename Note.title to heading in a copy of the sample spec, regenerate.
    const after = tempDir();
    const renamed = path.join(after, 'sample-openapi.yaml');
    // Git on Windows may check the sample out with CRLF; compare on LF.
    const source = fs.readFileSync(sampleSpec, 'utf8').replace(/\r\n/g, '\n');
    const changed = source.replace('required: [title, status, body]', 'required: [heading, status, body]')
      .replace(/(\n {12})title:(\n {14}type: string\n {14}minLength: 1)/, '$1heading:$2');
    expect(changed).not.toBe(source);
    fs.writeFileSync(renamed, changed);
    const regenerated = await generateSample(renamed, after);

    const body = bodyOf(renamed, 'getNote', '200');
    expect(body).toHaveProperty('heading');
    expect(body).not.toHaveProperty('title');
    expect(fs.readFileSync(path.join(after, 'generated/index.ts'), 'utf8')).toContain('"heading"');

    const errors = typecheck([regenerated]);
    const titleLine = fs.readFileSync(regenerated, 'utf8').split('\n').findIndex((line) => line.includes('note.title')) + 1;
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((error) => error.file === path.resolve(regenerated))).toBe(true);
    expect([...new Set(errors.map((error) => error.line))]).toEqual([titleLine]);
    expect(errors[0]!.message).toContain("'title'");
  }, 120_000);

  it('không có ví dụ', () => {
    // EC01: no example anywhere → built from the schema; an example, when present, wins.
    const note = bodyOf(sampleSpec, 'getNote', '200');
    expect(note).toMatchObject({ status: expect.stringMatching(/^(Draft|Published)$/), body: { kind: 'text' } });
    expect(typeof note.title).toBe('string');
    expect(bodyOf(sampleSpec, 'getNoteAuthor', '200')).toEqual({ id: '0b6f2f1e-3c4d-4e5f-8a9b-0c1d2e3f4a5b', displayName: 'Trần Quốc Bảo', role: 'supervisor' });
    // The public bundle has no example on any success response; every operation still generates.
    const { models } = buildModel();
    expect(models.length).toBe(Object.keys(operations).length);
  });

  it('dữ liệu hợp lệ theo schema', () => {
    // EC02: allOf, oneOf, enum, [type, 'null'], formats and nested $ref, checked with a JSON Schema validator.
    for (const spec of [sampleSpec, defaultSpec]) {
      const { doc, models } = buildModel({ spec });
      const ajv = new Ajv2020({ strict: false, allErrors: true });
      addFormats(ajv);
      ajv.addSchema({ ...doc, $id: 'openapi' });
      let checked = 0;
      for (const model of models) {
        for (const [status, entry] of Object.entries(model.responses)) {
          if (entry.body === undefined) continue;
          const schema = JSON.parse(JSON.stringify(entry.schema).replace(/"\$ref":"#\//g, '"$ref":"openapi#/'));
          const validate = ajv.compile({ $id: `${model.operationId}-${status}`, ...schema });
          expect(validate(entry.body) ? [] : validate.errors, `${model.operationId} ${status}`).toEqual([]);
          checked += 1;
        }
      }
      expect(checked).toBeGreaterThan(spec === defaultSpec ? 300 : 4);
    }
  });

  it('ổn định', async () => {
    // EC03: same spec → same module, byte for byte; a subset gives the same data as the full set.
    const first = tempDir();
    const second = tempDir();
    await generateMocks({ out: first });
    await generateMocks({ out: second });
    expect(fs.readFileSync(path.join(first, 'index.ts'), 'utf8')).toBe(fs.readFileSync(path.join(second, 'index.ts'), 'utf8'));
    const subset = buildModel({ operations: ['getProject'] }).models[0]!;
    const full = buildModel().models.find((model) => model.operationId === 'getProject')!;
    expect(subset.responses).toEqual(full.responses);
    expect(buildModel({ tags: ['Projects'] }).models.map((model) => model.operationId)).toContain('listProjects');
    expect(() => buildModel({ operations: ['noSuchOperation'] })).toThrow(/noSuchOperation/);
  }, 60_000);

  it('bộ sinh đọc đúng file bundle của @sires/contracts', () => {
    // EC13: mocks and PublicApi come from one document.
    const contracts = fs.readFileSync(path.join(workspaceRoot, 'libs/ts/contracts/scripts/generate.mjs'), 'utf8');
    expect(contracts).toContain("emit('dist/openapi.bundled.yaml', 'public.ts')");
    expect(path.relative(workspaceRoot, defaultSpec).split(path.sep).join('/')).toBe('docs/api-design/dist/openapi.bundled.yaml');
    expect(loadSpec().info.title).toBe(loadSpec(path.join(workspaceRoot, 'docs/api-design/dist/openapi.bundled.yaml')).info.title);
  });

  it('khu vực sinh mock vào __mocks__ của mình', async () => {
    // S04 / README: mocks.config.json of each area → features/<area>/__mocks__/generated, ignored by git; the
    // README's index.ts example typechecks against it.
    const root = tempDir(path.join(webRoot, 'node_modules/.cache'));
    const area = path.join(root, 'src/features/global/__mocks__');
    fs.mkdirSync(path.join(root, 'src/shell/mock'), { recursive: true });
    fs.mkdirSync(area, { recursive: true });
    fs.writeFileSync(path.join(root, 'src/shell/mock/mocks.config.json'), JSON.stringify({ operations: ['getSession'] }));
    fs.writeFileSync(path.join(area, 'mocks.config.json'), JSON.stringify({ operations: ['getProject', 'listProjects'], tags: ['Workspace'] }));
    const results = await generateAll({ root });
    expect(results.map((result) => path.relative(root, path.dirname(result.files[0]!)).split(path.sep).join('/')))
      .toEqual(['src/shell/mock/generated', 'src/features/global/__mocks__/generated']);
    expect(results[1]!.operations).toEqual(expect.arrayContaining(['getProject', 'listProjects', 'getDashboard']));
    expect(fs.readFileSync(path.join(area, 'generated/.gitignore'), 'utf8')).toMatch(/\n\*\n$/);

    const shell = path.relative(area, here).split(path.sep).join('/');
    const example = path.join(area, 'index.ts');
    fs.writeFileSync(example, [
      `import { defineMocks } from '${shell}';`,
      "import { operations } from './generated';",
      'export default defineMocks({',
      '  operations,',
      '  overrides: {',
      '    getProject: ({ params, fixtures }) => {',
      '      const row = fixtures.ResearchProject?.find((project) => project.id === params.projectId);',
      '      return row ? { status: 200, body: { ...row, name: row.name.trim() } } : { status: 404 };',
      '    },',
      '    listProjects: () => ({ status: 200, body: { ...operations.listProjects.responses[200].body(), nextCursor: null } }),',
      '  },',
      '  fixtures: { Notification: [] },',
      '});',
    ].join('\n'));
    expect(typecheck([example])).toEqual([]);
  }, 120_000);

  it('phản hồi không phải JSON', () => {
    // EC04: 302, 303, 204 and text/event-stream carry no JSON body in the generated module.
    expect(operations.startLogin.responses[302]).toEqual({ contentType: null, headers: ['Location'] });
    expect(operations.logout.responses[303]).toEqual({ contentType: null, headers: ['Location', 'Set-Cookie'] });
    expect(operations.deleteProviderConnection.responses[204]).toEqual({ contentType: null });
    expect(operations.streamEvents.responses[200]).toEqual({ contentType: 'text/event-stream' });
    expect(operations.getReferenceDocument.responses[200]).toEqual({ contentType: 'application/pdf' });
  });
});

describe('mock khi chạy test (S02)', () => {
  const mock = useMockServer();
  const api = (route: string, init?: RequestInit) => fetch(`http://localhost/api/v1${route}`, init);

  it('phiên mẫu', async () => {
    // EC08: the frame of PID-00012 gets a session with csrfToken and an account with preferences.uiLanguage.
    const session = await api('/auth/session');
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ accountId: ACCOUNT_ID, csrfToken: CSRF_TOKEN });
    const me = await api('/me');
    expect(me.status).toBe(200);
    expect(me.headers.get('ETag')).toMatch(/^"\d+"$/);
    expect(await me.json()).toMatchObject({ id: ACCOUNT_ID, preferences: { uiLanguage: 'vi' }, profile: { displayName: 'Nguyễn Thị Minh Anh' } });
    expect(ACCOUNT_ID).toBe(DEMO_ACCOUNT_ID);

    // Signed-out path for a test (PID-00012 EC07, PID-00036 SignIn): both session reads answer 401 unauthenticated.
    mock.use(signedOutMocks);
    const signedOut = await api('/auth/session');
    expect(signedOut.status).toBe(401);
    expect(await signedOut.json()).toMatchObject({ code: 'unauthenticated' });
    expect((await api('/me')).status).toBe(401);
  });

  it('phản hồi không phải JSON qua mock', async () => {
    // EC04 at runtime: login and logout redirects stay in the app (never eTroy), 204 has no body, binaries are not JSON.
    const login = await api('/auth/login?returnTo=/dashboard', { redirect: 'manual' });
    expect(login.status).toBe(302);
    expect(login.headers.get('Location')).toBe('/dashboard');
    const logout = await api('/auth/logout', { method: 'POST', redirect: 'manual' });
    expect(logout.status).toBe(303);
    expect(logout.headers.get('Location')).toBe('/');
    const removed = await api(`/provider-connections/${id('connection', 3)}`, { method: 'DELETE' });
    expect(removed.status).toBe(204);
    expect(await removed.text()).toBe('');
    const pdf = await api(`/references/${id('reference', 1)}/document`);
    expect(pdf.headers.get('Content-Type')).toBe('application/pdf');
    expect((await pdf.text()).startsWith('%PDF')).toBe(true);
  });

  it('lỗi có type', async () => {
    // EC05: a declared error answers problem+json with a code of ErrorCode; a code outside the catalog fails typecheck.
    mock.use({ overrides: { getProject: () => ({ status: 404 }), createProject: () => ({ status: 400 }) } });
    const missing = await api(`/projects/${projectIds.rag}`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Content-Type')).toBe('application/problem+json');
    expect(await missing.json()).toMatchObject({ status: 404, code: 'not_found' });
    const conflict = await api('/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const problem = await conflict.json() as { code: string };
    const catalog = loadSpec().components.schemas.ErrorCode.enum as string[];
    expect(conflict.status).toBe(400);
    expect(catalog).toContain(problem.code);

    const dir = tempDir(path.join(webRoot, 'node_modules/.cache'));
    const file = path.join(dir, 'problem.check.ts');
    const types = path.relative(dir, path.join(here, 'types')).split(path.sep).join('/');
    fs.writeFileSync(file, [
      `import type { Overrides } from '${types}';`,
      'export const ok: Overrides = { getProject: () => ({ status: 404, body: { type: "about:blank", title: "x", status: 404, code: "not_found" } }) };',
      'export const bad: Overrides = { getProject: () => ({ status: 404, body: { type: "about:blank", title: "x", status: 404, code: "no_such_code" } }) };',
      'export const undeclared: Overrides = { getProject: () => ({ status: 418 }) };',
    ].join('\n'));
    const errors = typecheck([file]).filter((error) => error.file === path.resolve(file));
    expect([...new Set(errors.map((error) => error.line))].sort()).toEqual([3, 4]);
  }, 120_000);

  it('override có type', async () => {
    // EC09: an area replaces one operation's reply with a typed resolver; the shared mock keeps no state.
    const renamed = defineMocks({
      overrides: {
        getProject: ({ params, fixtures }) => {
          const row = fixtures.ResearchProject?.find((project) => project.id === params.projectId);
          return row ? { status: 200, body: { ...row, name: 'Tên do khu vực đặt' } } : { status: 404 };
        },
      },
    });
    mock.use(renamed);
    const project = await api(`/projects/${projectIds.rag}`);
    expect(project.headers.get(MOCK_HEADER)).toBe('getProject');
    expect(await project.json()).toMatchObject({ id: projectIds.rag, name: 'Tên do khu vực đặt' });
    const create = await api('/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Đề tài mới' }) });
    expect(await create.json()).toMatchObject({ name: 'Đề tài mới' });
    const list = await (await api('/projects')).json() as { items: { name: string }[] };
    expect(list.items.map((item) => item.name)).not.toContain('Đề tài mới');

    const dir = tempDir(path.join(webRoot, 'node_modules/.cache'));
    const file = path.join(dir, 'override.check.ts');
    const types = path.relative(dir, path.join(here, 'types')).split(path.sep).join('/');
    fs.writeFileSync(file, [
      `import type { Overrides } from '${types}';`,
      'export const bad: Overrides = { getProject: ({ params }) => ({ status: 200, body: { id: params.projectId, title: "wrong field" } }) };',
    ].join('\n'));
    expect([...new Set(typecheck([file]).filter((error) => error.file === path.resolve(file)).map((error) => error.line))]).toEqual([2]);
  }, 120_000);

  it('dữ liệu demo theo project và id', async () => {
    // YC1: list and detail come from the shared fixtures and agree with each other.
    const projects = await (await api('/projects?status=Active')).json() as { items: { id: string; status: string }[] };
    expect(projects.items.length).toBeGreaterThanOrEqual(3);
    expect(projects.items.every((item) => item.status === 'Active')).toBe(true);
    const tasks = await (await api(`/projects/${projectIds.rag}/tasks`)).json() as { items: { projectId: string }[] };
    expect(tasks.items.length).toBeGreaterThan(0);
    expect(tasks.items.every((task) => task.projectId === projectIds.rag)).toBe(true);
    const task = await api(`/projects/${projectIds.rag}/tasks/${id('task', 2)}`);
    expect(await task.json()).toMatchObject({ id: id('task', 2), status: 'In Progress' });
    const unknown = await api(`/projects/${projectIds.rag}/tasks/${id('task', 999)}`);
    expect(unknown.status).toBe(404);
  });

  it('mọi operation của OpenAPI công khai có mock', async () => {
    // S01 “sinh mock cho toàn bộ operation”: each path reaches its own handler (literal segments before parameters).
    for (const descriptor of Object.values(operations)) {
      if (descriptor.operationId === 'streamEvents') continue;
      const route = descriptor.path.replace(/\{[^}]+\}/g, id('project', 1));
      const response = await api(route, {
        method: descriptor.method, redirect: 'manual',
        ...(descriptor.method === 'GET' || descriptor.method === 'DELETE' ? {} : { headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      });
      expect(response.headers.get(MOCK_HEADER), `${descriptor.method} ${descriptor.path}`).toBe(descriptor.operationId);
    }
    expect((await api('/no/such/route')).status).toBe(404);
  }, 60_000);
});

describe('ghép mock của khu vực (S02)', () => {
  it('trùng operation', () => {
    // EC10: two claimants of one operation fail loudly, naming the operation and both areas.
    const settings = { name: 'settings', mocks: defineMocks({ overrides: { getMe: () => ({ status: 401 }) } }) };
    expect(() => createMocks([settings])).toThrow('Mock operation getMe is claimed by two areas: shell and settings');
    const global = { name: 'global', mocks: defineMocks({ overrides: { listProjects: () => ({ status: 200 }) } }) };
    const project = { name: 'project', mocks: defineMocks({ operations: { listProjects: operations.listProjects } }) };
    expect(() => createMocks([global, project])).toThrow('Mock operation listProjects is claimed by two areas: global and project');
    expect(() => createMocks([global])).not.toThrow();
  });

  it('dữ liệu demo hợp lệ theo schema', () => {
    // YC1: every fixture row satisfies its component schema in the public OpenAPI.
    const doc = loadSpec();
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    ajv.addSchema({ ...doc, $id: 'openapi' });
    const tables = Object.entries(demoFixtures);
    expect(tables.length).toBeGreaterThanOrEqual(15);
    for (const [schema, rows] of tables) {
      const validate = ajv.compile({ $ref: `openapi#/components/schemas/${schema}` });
      for (const row of rows as unknown[]) expect(validate(row) ? [] : validate.errors, schema).toEqual([]);
    }
  });
});
