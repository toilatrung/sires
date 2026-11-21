// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { checkDrift, checkPython, checkTypeScript, contractProjects, ROOT } from './check-drift.mjs';
import { generate } from './generate.mjs';

const FIXTURES = fileURLToPath(new URL('./__fixtures__/', import.meta.url));
function fixture(t) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'sires-check-drift-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const specRoot = path.join(workspace, 'docs/api-design');
  for (const name of ['dist', 'internal', 'events']) fs.mkdirSync(path.join(specRoot, name), { recursive: true });
  const api = { openapi: '3.1.0', info: { title: 'Fixture', version: '1' }, paths: {}, components: { schemas: {
    EntityMeta: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    ResearchProject: { allOf: [{ $ref: '#/components/schemas/EntityMeta' },
      { type: 'object', properties: { title: { type: 'string' }, requiredCapabilities: {
        type: 'array', items: { type: 'string' },
      } } }] },
  } } };
  fs.writeFileSync(path.join(specRoot, 'dist/openapi.bundled.yaml'), JSON.stringify(api));
  fs.writeFileSync(path.join(specRoot, 'internal/test.yaml'), JSON.stringify(api));
  fs.writeFileSync(path.join(specRoot, 'events/asyncapi.yaml'), JSON.stringify({
    asyncapi: '3.0.0', info: api.info, components: {
      schemas: { EventEnvelope: { type: 'object', required: ['data'], properties: {
        data: { type: 'object', additionalProperties: true },
        aggregate: { type: 'object', properties: { id: { type: 'string' } } },
      } } },
      messages: { usage_recorded: { payload: { allOf: [
        { $ref: '#/components/schemas/EventEnvelope' },
        { type: 'object', properties: { data: { type: 'object', properties: { provider: { type: 'string' } } } } },
      ] } } },
    },
  }));
  fs.writeFileSync(path.join(workspace, 'tsconfig.base.json'), JSON.stringify({
    compilerOptions: { strict: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', types: [], skipLibCheck: true },
  }));
  const contracts = path.join(workspace, 'libs/ts/contracts');
  fs.mkdirSync(path.join(contracts, 'src'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'libs/ts/contracts/src/index.ts'), path.join(contracts, 'src/index.ts'));
  fs.writeFileSync(path.join(contracts, 'tsconfig.json'), JSON.stringify({ extends: '../../../tsconfig.base.json', include: ['src'] }));
  fs.mkdirSync(path.join(contracts, 'scripts'), { recursive: true });
  fs.cpSync(FIXTURES, path.join(contracts, 'scripts/__fixtures__'), { recursive: true });
  const graph = { nodes: { '@sires/contracts': { data: { root: 'libs/ts/contracts', tags: ['lang:ts'] } } }, dependencies: {} };
  const logs = [];
  return { workspace, specRoot, graph, mode: 'ts', log: (line) => logs.push(line), logs,
    file: (name) => path.join(contracts, 'scripts/__fixtures__', name) };
}

test('Nx: direct and transitive TS consumers are checked; unrelated projects are excluded', () => {
  const data = (name) => ({ data: { root: name, tags: ['lang:ts'] } });
  const graph = { nodes: { '@sires/contracts': data('contracts'), direct: data('direct'),
    transitive: data('transitive'), unrelated: data('unrelated') }, dependencies: {
    direct: [{ target: '@sires/contracts' }], transitive: [{ target: 'direct' }], unrelated: [{ target: 'unrelated' }],
  } };
  assert.deepEqual(contractProjects(graph).map((project) => project.name), ['@sires/contracts', 'direct', 'transitive']);
});

test('trường không có trong spec: read and object literal report field, schema, file and line (EC01)', async (t) => {
  const options = fixture(t);
  for (const name of ['read-extra.ts', 'write-extra.ts']) {
    options.logs.length = 0;
    assert.equal(await checkDrift({ ...options, fixtures: [options.file(`ts/${name}`)] }), false);
    const output = options.logs.join('\n');
    assert.match(output, /trường không có trong spec: 'fieldNotInSpec' — ResearchProject/);
    assert.match(output, new RegExp(`${name.replace('.', '\\.')}:[0-9]+:[0-9]+`));
  }
  assert.equal(await checkDrift({ ...options, fixtures: [options.file('ts/valid.ts')] }), true);
});

test('AsyncAPI allOf: envelope read/write names, nested paths and Partial (G1/G2/G4)', async (t) => {
  const options = fixture(t);
  await generate(options);
  for (const [file, expected] of [
    ['message-extra.ts', ['UsageRecordedMessage', 'UsageRecordedMessage']],
    ['nested-extra.ts', ['ResearchProject', 'EventEnvelope.aggregate']],
  ]) {
    options.logs.length = 0;
    assert.equal(checkTypeScript({ ...options, fixtures: [options.file(`ts/${file}`)] }), false);
    const errors = options.logs.filter((line) => line.includes('trường không có trong spec'));
    assert.equal(errors.length, expected.length, options.logs.join('\n'));
    expected.forEach((name, index) => assert.ok(errors[index].includes(`— ${name} (TypeScript)`), errors[index]));
  }
  assert.equal(checkTypeScript({ ...options, fixtures: [options.file('ts/message-valid.ts')] }), true);
});

test('real contracts: allOf schema and envelope names (G1/G2)', async (t) => {
  const options = fixture(t);
  await generate({ ...options, specRoot: path.join(ROOT, 'docs/api-design') });
  for (const [file, name] of [['read-extra.ts', 'ResearchProject'], ['write-extra.ts', 'ResearchProject'],
    ['message-extra.ts', 'UsageRecordedMessage']]) {
    options.logs.length = 0;
    assert.equal(checkTypeScript({ ...options, fixtures: [options.file(`ts/${file}`)] }), false);
    const errors = options.logs.filter((line) => line.includes('trường không có trong spec'));
    assert.equal(errors.length, file === 'message-extra.ts' ? 2 : 1, options.logs.join('\n'));
    for (const error of errors) assert.ok(error.includes(`— ${name} (TypeScript)`), error);
  }
  options.logs.length = 0;
  assert.equal(checkTypeScript({ ...options, fixtures: [options.file('ts/message-data-extra.ts')] }), false);
  assert.equal(checkTypeScript({ ...options, fixtures: [options.file('ts/message-valid.ts')] }), true);
});

test('message: trường không có trong data reports field, location and message (EC10/H5)', async (t) => {
  const options = fixture(t);
  assert.equal(await checkDrift({ ...options, specRoot: path.join(ROOT, 'docs/api-design'),
    fixtures: [options.file('ts/message-data-extra.ts')] }), false);
  const errors = options.logs.filter((line) => line.includes('trường không có trong spec'));
  assert.equal(errors.length, 3, options.logs.join('\n'));
  for (const error of errors) {
    assert.match(error, /message-data-extra.ts:[0-9]+:[0-9]+: trường không có trong spec: 'fieldNotInSpec' — UsageRecordedMessage.data \(TypeScript\)/);
  }
  assert.equal(checkTypeScript({ ...options, fixtures: [options.file('ts/message-valid.ts')] }), true);
});

test('lỗi không thuộc hợp đồng: original diagnostics, including a same-named local model (EC02)', async (t) => {
  const options = fixture(t);
  for (const file of ['internal-error.ts', 'local-model.ts', 'local-array.ts']) {
    options.logs.length = 0;
    assert.equal(await checkDrift({ ...options, fixtures: [options.file(`ts/${file}`)] }), false);
    assert.match(options.logs.join('\n'), /error TS/);
    assert.doesNotMatch(options.logs.join('\n'), /trường không có trong spec/);
  }
  await generate({ ...options, specRoot: path.join(ROOT, 'docs/api-design') });
  options.logs.length = 0;
  assert.equal(checkTypeScript({ ...options, fixtures: [options.file('ts/local-array.ts')] }), false);
  assert.match(options.logs.join('\n'), /error TS2339: Property 'fieldNotInSpec' does not exist on type 'string\[\]'/);
  assert.doesNotMatch(options.logs.join('\n'), /trường không có trong spec/);
});

test('spec lỗi cú pháp: fail and report the spec file (EC03)', async (t) => {
  const options = fixture(t);
  fs.copyFileSync(options.file('invalid-spec.yaml'), path.join(options.specRoot, 'internal/test.yaml'));
  assert.equal(await checkDrift({ ...options, fixtures: [options.file('ts/valid.ts')] }), false);
  assert.match(options.logs.join('\n'), /test.yaml/);
});

test('luôn sinh lại: stale or manually modified fixture output cannot hide drift (EC04)', async (t) => {
  const options = fixture(t);
  await generate(options);
  const output = path.join(options.workspace, 'libs/ts/contracts/src/generated/public.ts');
  // Deliberate corruption of a temporary generated fixture, never the repository output.
  fs.appendFileSync(output, '\nthis is not TypeScript;\n');
  assert.equal(await checkDrift({ ...options, fixtures: [options.file('ts/valid.ts')] }), true);
  assert.doesNotMatch(fs.readFileSync(output, 'utf8'), /this is not TypeScript/);
  fs.writeFileSync(output, fs.readFileSync(output, 'utf8').replace('id: string;', 'id: string; fieldNotInSpec?: string;'));
  assert.equal(await checkDrift({ ...options, fixtures: [options.file('ts/read-extra.ts')] }), false);
});

test('thiếu uv: TS is still checked; Python cannot report success (EC07)', async (t) => {
  const options = fixture(t);
  assert.equal(await checkDrift({ ...options, mode: 'all', env: { ...process.env, PATH: '', Path: '' } }), false);
  assert.match(options.logs.join('\n'), /TypeScript:/);
  assert.match(options.logs.join('\n'), /Python: thiếu uv/);
});

test('Python: trường không có trong mô hình sinh, valid payload and client, local errors (EC06)', async (t) => {
  if (spawnSync('uv', ['--version']).error) return t.skip('Python integration requires uv');
  // Keep generated fixtures separate from the workspace: Nx may run sires-common:test concurrently.
  const temporary = fixture(t);
  const source = path.join(temporary.workspace, 'libs/py/sires_common/src');
  fs.mkdirSync(path.join(source, 'sires_common'), { recursive: true });
  fs.writeFileSync(path.join(source, 'sires_common/__init__.py'), '');
  fs.copyFileSync(path.join(ROOT, 'pyproject.toml'), path.join(temporary.workspace, 'pyproject.toml'));
  await generate({ workspace: temporary.workspace, specRoot: path.join(ROOT, 'docs/api-design'), mode: 'python' });
  const logs = [];
  const options = { workspace: temporary.workspace, log: (line) => logs.push(line), fixtures: [],
    env: { ...process.env, MYPYPATH: [source, process.env.MYPYPATH].filter(Boolean).join(path.delimiter) } };
  options.fixtures = [path.join(FIXTURES, 'python/valid.py')];
  assert.equal(checkPython(options), true, logs.join('\n'));
  assert.equal(checkPython({ ...options, fixtures: [path.join(FIXTURES, 'python/write-valid.py')] }), true, logs.join('\n'));
  logs.length = 0;
  assert.equal(checkPython({ ...options, fixtures: [path.join(FIXTURES, 'python/write-extra.py')] }), false);
  const constructors = logs.filter((line) => line.includes('trường không có trong spec'));
  assert.equal(constructors.length, 2, logs.join('\n'));
  for (const [index, number] of [9, 10].entries()) {
    assert.match(constructors[index], new RegExp(`write-extra.py:${number}:[0-9]+: trường không có trong spec: 'fieldNotInSpec' — sires_common.generated.messages.Aggregate`));
  }
  for (const [file, model] of [['read-extra.py', 'AgentRunAssignment'], ['client-extra.py', 'AuthenticatedClient']]) {
    logs.length = 0;
    assert.equal(checkPython({ ...options, fixtures: [path.join(FIXTURES, 'python', file)] }), false);
    assert.match(logs.join('\n'), /trường không có trong spec: 'fieldNotInSpec'/);
    assert.match(logs.join('\n'), new RegExp(model));
  }
  logs.length = 0;
  assert.equal(checkPython({ ...options, fixtures: [path.join(FIXTURES, 'python/local-model.py')] }), false);
  assert.match(logs.join('\n'), /has no attribute/);
  assert.doesNotMatch(logs.join('\n'), /trường không có trong spec/);
  const directory = fs.mkdtempSync(path.join(temporary.workspace, '.nx/contracts/mypy-skip-'));
  fs.mkdirSync(path.join(directory, 'src'));
  fs.copyFileSync(path.join(FIXTURES, 'python/read-extra.py'), path.join(directory, 'src/consumer.py'));
  fs.writeFileSync(path.join(directory, 'pyproject.toml'), '[tool.mypy]\nstrict = true\n[[tool.mypy.overrides]]\nmodule = "sires_common.generated.*"\nfollow_imports = "skip"\n');
  const graph = { nodes: Object.fromEntries(['agent-core', 'knowledge', 'sires-common']
    .map((name) => [name, { data: { root: path.relative(temporary.workspace, directory) } }])) };
  logs.length = 0;
  assert.equal(checkPython({ ...options, fixtures: [], graph }), false);
  assert.match(logs.join('\n'), /trường không có trong spec: 'fieldNotInSpec'/);
});
