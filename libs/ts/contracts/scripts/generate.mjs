// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';
import ts from 'typescript';

// Reuse the resolver bundled with the pinned openapi-typescript toolchain.
const require = createRequire(import.meta.url);
const { BaseResolver, bundle, bundleFromString, createConfig } = require(
  require.resolve('@redocly/openapi-core', { paths: [require.resolve('openapi-typescript')] }),
);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SHARED = new Set(['schemas.yaml', 'responses.yaml']);

export const pascal = (name) => name.replace(/(^|[-_])([a-z])/g, (_, __, c) => c.toUpperCase());
const LICENSE = [
  '// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.',
  '// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.',
  '// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md',
].join('\n');
const header = (source) =>
  `${LICENSE}\n\n// Generated from docs/api-design/${source} by scripts/generate.mjs. Do not edit.\n\n`;

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message ?? ''}\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

async function checkedBundle(options) {
  const result = options.source ? await bundleFromString(options) : await bundle(options);
  const errors = result.problems.filter((problem) => problem.severity === 'error');
  if (errors.length) throw new Error(errors.map((problem) => problem.message).join('\n'));
  return result.bundle.parsed;
}

// An allOf containing only one $ref and annotations is a schema alias.
// Fold those aliases before client generation to avoid duplicate inline models.
function foldAliases(document) {
  const schemas = document.components?.schemas ?? {};
  const aliases = new Map(Object.entries(schemas).filter(([, schema]) =>
    schema.allOf?.length === 1 && schema.allOf[0].$ref
    && Object.keys(schema).every((key) => ['allOf', 'description', 'title'].includes(key)),
  ).map(([name, schema]) => [`#/components/schemas/${name}`, schema.allOf[0].$ref]));
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      const seen = new Set();
      while (aliases.has(value.$ref)) {
        if (seen.has(value.$ref)) throw new Error(`Cyclic schema alias: ${value.$ref}`);
        seen.add(value.$ref);
        value.$ref = aliases.get(value.$ref);
      }
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(document);
  for (const alias of aliases.keys()) delete schemas[alias.split('/').at(-1)];
  return document;
}

function messageDataTypes(ast, messageNames) {
  const components = ast.find((node) => ts.isInterfaceDeclaration(node) && node.name.text === 'components');
  const schemas = components?.members.find((node) => node.name?.text === 'schemas')?.type;
  if (!schemas || !ts.isTypeLiteralNode(schemas)) throw new Error('Missing generated event schemas');
  const members = new Map(schemas.members.map((member) => [member.name.text, member]));
  const data = (type, envelope = false, seen = new Set()) => {
    const result = { types: [], required: false };
    if (!type || seen.has(type)) return result;
    seen = new Set(seen).add(type);
    if (ts.isTypeLiteralNode(type)) {
      const property = type.members.find((member) => member.name?.text === 'data');
      if (property) {
        result.required = !property.questionToken;
        if (!envelope) result.types.push(property.type);
      }
    } else if (ts.isIntersectionTypeNode(type)) {
      for (const member of type.types) {
        const found = data(member, envelope, seen);
        result.types.push(...found.types);
        result.required ||= found.required;
      }
    } else if (ts.isIndexedAccessTypeNode(type) && ts.isLiteralTypeNode(type.indexType)) {
      const name = type.indexType.literal.text;
      return data(members.get(name)?.type, envelope || name === 'EventEnvelope', seen);
    }
    return result;
  };
  const replacements = new Map();
  for (const name of messageNames) {
    const member = members.get(name);
    if (!member) throw new Error(`Missing generated message: ${name}`);
    const found = data(member.type);
    if (!found.types.length) continue;
    // Replace inherited data instead of intersecting it with the envelope's index signature.
    const type = ts.factory.createIntersectionTypeNode([
      ts.factory.createTypeReferenceNode('Omit', [member.type,
        ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral('data'))]),
      ts.factory.createTypeLiteralNode([ts.factory.createPropertySignature(undefined, 'data',
        found.required ? undefined : ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        found.types.length === 1 ? found.types[0] : ts.factory.createIntersectionTypeNode(found.types))]),
    ]);
    replacements.set(member, ts.factory.updatePropertySignature(member, member.modifiers,
      member.name, member.questionToken, type));
  }
  const result = ts.transform(ast, [(context) => {
    const visit = (node) => replacements.get(node) ?? ts.visitEachChild(node, visit, context);
    return (node) => ts.visitNode(node, visit);
  }]);
  try { return astToString(result.transformed); }
  finally { result.dispose(); }
}

// Restore all previous outputs if publishing either language fails.
function publish(entries, stage) {
  const installed = [];
  const backups = [];
  try {
    for (const [source, target] of entries) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (fs.existsSync(target)) {
        const backup = path.join(stage, `backup-${backups.length}`);
        fs.renameSync(target, backup);
        backups.push([backup, target]);
      }
      fs.renameSync(source, target);
      installed.push(target);
    }
  } catch (error) {
    for (const target of installed.reverse()) fs.rmSync(target, { recursive: true, force: true });
    for (const [backup, target] of backups.reverse()) fs.renameSync(backup, target);
    throw error;
  }
}

export async function generate({ specRoot = path.join(root, 'docs/api-design'), workspace = root, mode = 'all' } = {}) {
  if (!['all', 'ts', 'python'].includes(mode)) throw new Error(`Unknown generation mode: ${mode}`);
  if (mode !== 'ts') {
    const uv = spawnSync('uv', ['--version'], { encoding: 'utf8' });
    if (uv.error || uv.status !== 0) throw new Error('Python generation requires uv. Install uv, or use --ts-only.');
  }
  const stagingRoot = path.join(workspace, '.nx/contracts');
  fs.mkdirSync(stagingRoot, { recursive: true });
  const stage = fs.mkdtempSync(path.join(stagingRoot, 'generate-'));
  try {
    const config = await createConfig({ rules: {} });
    const services = fs.readdirSync(path.join(specRoot, 'internal'))
      .filter((file) => file.endsWith('.yaml') && !SHARED.has(file)).sort();
    const asyncPath = path.join(specRoot, 'events/asyncapi.yaml');
    const document = await new BaseResolver().resolveDocument(null, asyncPath);
    if (document instanceof Error) throw document;
    const events = document.parsed;
    const messages = Object.entries(events.components.messages);
    const schemas = { ...events.components.schemas };
    for (const [name, message] of messages) {
      if (!message.payload) throw new Error(`${asyncPath}: message ${name} has no payload`);
      schemas[`${pascal(name)}Message`] = message.payload;
    }
    // Project schemas only; never change the source AsyncAPI contract.
    const eventSchema = await checkedBundle({
      source: JSON.stringify({ openapi: '3.1.0', info: events.info, paths: {}, components: { schemas } }),
      absoluteRef: asyncPath, config,
    });
    const ts = path.join(stage, 'ts');
    const py = path.join(stage, 'python');
    const entries = [];
    if (mode !== 'python') {
      fs.mkdirSync(path.join(ts, 'internal'), { recursive: true });
      const emit = async (source, target) => {
        const ast = await openapiTS(pathToFileURL(path.join(specRoot, source)));
        fs.writeFileSync(path.join(ts, target), header(source) + astToString(ast));
      };
      await emit('dist/openapi.bundled.yaml', 'public.ts');
      for (const file of services) await emit(`internal/${file}`, `internal/${file.replace('.yaml', '.ts')}`);
      fs.writeFileSync(path.join(ts, 'messages.ts'), header('events/asyncapi.yaml')
        + messageDataTypes(await openapiTS(eventSchema), messages.map(([name]) => `${pascal(name)}Message`))
        + '\nexport interface MessagePayloads {\n'
        + messages.map(([name]) => `  ${JSON.stringify(name)}: components['schemas']['${pascal(name)}Message'];`).join('\n')
        + '\n}\n'
        + messages.map(([name]) => `export type ${pascal(name)}Message = MessagePayloads[${JSON.stringify(name)}];`).join('\n') + '\n');
      fs.writeFileSync(path.join(ts, 'index.ts'), header('*') + [
        "export type * as PublicApi from './public';",
        ...services.map((file) => `export type * as ${pascal(file.replace('.yaml', ''))}Internal from './internal/${file.replace('.yaml', '')}';`),
        "export type * from './messages';",
      ].join('\n') + '\n');
      entries.push([ts, path.join(workspace, 'libs/ts/contracts/src/generated')]);
    }
    if (mode !== 'ts') {
      fs.mkdirSync(py, { recursive: true });
      const eventInput = path.join(stage, 'messages.json');
      fs.writeFileSync(eventInput, JSON.stringify(eventSchema));
      run('uv', ['tool', 'run', '--from', 'datamodel-code-generator==0.97.0', 'datamodel-codegen',
        '--input', eventInput, '--input-file-type', 'openapi', '--openapi-scopes', 'schemas',
        '--output', path.join(py, 'messages.py'), '--output-model-type', 'pydantic_v2.BaseModel',
        '--target-python-version', '3.12', '--disable-timestamp', '--use-standard-collections',
        '--field-constraints', '--formatters', 'builtin']);
      const clientConfig = path.join(stage, 'client-config.json');
      fs.writeFileSync(clientConfig, JSON.stringify({ post_hooks: [] }));
      for (const file of services) {
        const input = path.join(stage, file.replace('.yaml', '.json'));
        fs.writeFileSync(input, JSON.stringify(foldAliases(await checkedBundle({ ref: path.join(specRoot, 'internal', file), config }))));
        run('uv', ['tool', 'run', '--from', 'openapi-python-client==0.28.0', 'openapi-python-client',
          'generate', '--path', input, '--meta', 'none', '--config', clientConfig,
          '--fail-on-warning',
          '--output-path', path.join(py, file.replace('.yaml', '').replaceAll('-', '_'))]);
      }
      fs.writeFileSync(path.join(py, '__init__.py'), '# Generated from docs/api-design. Do not edit.\n');
      fs.writeFileSync(path.join(py, 'manifest.json'), JSON.stringify({
        services: services.map((file) => file.replace('.yaml', '').replaceAll('-', '_')),
        messages: messages.map(([name]) => `${pascal(name)}Message`),
      }, null, 2) + '\n');
      for (const file of fs.readdirSync(py, { recursive: true })) {
        if (file.endsWith('.py')) {
          const target = path.join(py, file);
          fs.writeFileSync(target, LICENSE.replaceAll('//', '#')
            + '\n# Generated from docs/api-design. Do not edit.\n\n' + fs.readFileSync(target, 'utf8'));
        }
      }
      entries.push([py, path.join(workspace, 'libs/py/sires_common/src/sires_common/generated')]);
    }
    publish(entries, stage);
    console.log(`contracts: generated ${mode}; ${services.length} internal APIs, ${messages.length} messages`);
  } catch (error) {
    throw new Error(`contracts generation failed (${specRoot}): ${error.message}`, { cause: error });
  } finally {
    // stage is always a freshly allocated child of workspace/.nx/contracts.
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => !['--ts-only', '--python-only'].includes(arg))) {
    console.error('Usage: node scripts/generate.mjs [--ts-only | --python-only]');
    process.exitCode = 1;
  } else {
    try {
      await generate({ mode: args.includes('--ts-only') ? 'ts' : args.includes('--python-only') ? 'python' : 'all' });
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
