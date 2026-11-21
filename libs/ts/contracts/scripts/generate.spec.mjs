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
import ts from 'typescript';
import { generate } from './generate.mjs';

function fixture(t) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'sires-contracts-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const specRoot = path.join(workspace, 'spec');
  for (const dir of ['dist', 'internal', 'events']) fs.mkdirSync(path.join(specRoot, dir), { recursive: true });
  const api = { openapi: '3.1.0', info: { title: 'Test', version: '1' }, paths: {} };
  fs.writeFileSync(path.join(specRoot, 'dist/openapi.bundled.yaml'), JSON.stringify(api));
  fs.writeFileSync(path.join(specRoot, 'internal/test.yaml'), JSON.stringify(api));
  const events = { asyncapi: '3.0.0', info: api.info, components: { messages: {
    first: { payload: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
    agentRunRequested: { payload: {
      type: 'object', required: ['agentRunId', 'workflowId', 'stepId', 'accountId', 'agent', 'attempt'],
      properties: {
        agentRunId: { type: 'string' }, workflowId: { type: 'string' },
        stepId: { type: 'string' }, accountId: { type: 'string' },
        agent: { type: 'string', enum: ['orchestrator'] }, attempt: { type: 'integer' },
      },
    } },
  } } };
  fs.writeFileSync(path.join(specRoot, 'events/asyncapi.yaml'), JSON.stringify(events));
  return { workspace, specRoot, mode: 'ts', events };
}

test('AC01: adding a message produces an exported payload type after regeneration', async (t) => {
  const options = fixture(t);
  await generate(options);
  options.events.components.messages.second = { payload: { type: 'object', properties: { count: { type: 'integer' } } } };
  fs.writeFileSync(path.join(options.specRoot, 'events/asyncapi.yaml'), JSON.stringify(options.events));
  await generate(options);
  const output = fs.readFileSync(path.join(options.workspace, 'libs/ts/contracts/src/generated/messages.ts'), 'utf8');
  assert.match(output, /export type SecondMessage/);
  assert.match(output, /count\?: number/);
  const src = path.join(options.workspace, 'libs/ts/contracts/src');
  for (const file of ['index.ts', 'messages.check.ts']) {
    fs.copyFileSync(fileURLToPath(new URL(`../src/${file}`, import.meta.url)), path.join(src, file));
  }
  const program = ts.createProgram([path.join(src, 'messages.check.ts')], {
    noEmit: true, strict: true, skipLibCheck: true, types: [],
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  });
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')), [],
  'the actual messages.check.ts must still compile after adding a message to the contract');
});

test('H5: message data through refs/allOf replaces envelope data while preserving required fields', async (t) => {
  const options = fixture(t);
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
  options.events.components.schemas = {
    EventEnvelope: { type: 'object', required: ['id', 'data'], properties: {
      id: { type: 'string' }, data: { type: 'object', additionalProperties: true },
    } },
    Envelope: { allOf: [ref('EventEnvelope')] },
    Data: { allOf: [{ type: 'object', required: ['provider'], properties: { provider: { type: 'string' } } },
      { type: 'object', required: ['model'], properties: { model: { type: 'string' } } }] },
    Fields: { type: 'object', properties: { data: ref('Data') } },
    Payload: { allOf: [ref('Fields'), ref('Envelope')] },
  };
  options.events.components.messages.composed = { payload: ref('Payload') };
  const input = path.join(options.specRoot, 'events/asyncapi.yaml');
  const source = JSON.stringify(options.events);
  fs.writeFileSync(input, source);
  await generate(options);
  assert.equal(fs.readFileSync(input, 'utf8'), source);
  const directory = path.join(options.workspace, 'libs/ts/contracts/src/generated');
  const consumer = path.join(directory, 'consumer.ts');
  fs.writeFileSync(consumer, `import type { ComposedMessage, components } from './messages';
declare const message: ComposedMessage;
export const valid: ComposedMessage = { id: 'one', data: { provider: 'p', model: 'm' } };
export const provider: string = message.data.provider;
export const model: string = message.data.model;
declare const envelope: components['schemas']['EventEnvelope'];
export const generic: unknown = envelope.data.anyField;
message.data.fieldNotInSpec;
message.data.fieldNotInSpec = true;
message.data = { provider: 'p', model: 'm', fieldNotInSpec: true };
export const missingData: ComposedMessage = { id: 'one' };
export const missingId: ComposedMessage = { data: { provider: 'p', model: 'm' } };
`);
  const program = ts.createProgram([consumer], { strict: true, noEmit: true, skipLibCheck: true, types: [] });
  const errors = ts.getPreEmitDiagnostics(program).map((error) => ({
    line: error.file?.getLineAndCharacterOfPosition(error.start).line + 1,
    message: ts.flattenDiagnosticMessageText(error.messageText, '\n'),
  }));
  assert.deepEqual(errors.map(({ line }) => line), [8, 9, 10, 11, 12], JSON.stringify(errors));
  for (const { message } of errors.slice(0, 3)) assert.match(message, /fieldNotInSpec/);
  assert.match(errors[3].message, /data.*missing/);
  assert.match(errors[4].message, /id.*missing/);
});

test('EC01: invalid spec preserves the entire previous output and reports the source file', async (t) => {
  const options = fixture(t);
  await generate(options);
  const output = path.join(options.workspace, 'libs/ts/contracts/src/generated/messages.ts');
  const before = fs.readFileSync(output, 'utf8');
  fs.writeFileSync(path.join(options.specRoot, 'internal/test.yaml'), 'openapi: [unterminated');
  await assert.rejects(generate(options), /test.yaml/);
  assert.equal(fs.readFileSync(output, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(path.join(options.workspace, '.nx/contracts')), []);
});

test('EC02: missing uv gives an actionable error; TS-only works without uv', (t) => {
  const options = fixture(t);
  const script = fileURLToPath(new URL('./generate.mjs', import.meta.url));
  const env = { ...process.env, PATH: '', Path: '' };
  const missing = spawnSync(process.execPath, [script], { encoding: 'utf8', env });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /requires uv.*--ts-only/);
  // Import the generator with fixture paths so no real output is changed.
  const source = `import { generate } from ${JSON.stringify(new URL('./generate.mjs', import.meta.url).href)}; await generate(${JSON.stringify(options)});`;
  const tsOnly = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', env });
  assert.equal(tsOnly.status, 0, tsOnly.stderr);
});
