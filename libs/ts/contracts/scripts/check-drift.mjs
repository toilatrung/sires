// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { generate } from './generate.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const require = createRequire(import.meta.url);
const PYTHON_PROJECTS = ['agent-core', 'knowledge', 'sires-common'];

function invoke(command, args, cwd, env = process.env) {
  return spawnSync(command, args, { cwd, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

export function readGraph(workspace) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sires-drift-graph-'));
  try {
    const file = path.join(directory, 'graph.json');
    const nx = path.join(path.dirname(require.resolve('nx/package.json')), 'dist/bin/nx.js');
    const result = invoke(process.execPath, [nx, 'graph', '--file', file], workspace,
      { ...process.env, NX_DAEMON: 'false' });
    if (result.error || result.status !== 0) throw new Error(`Nx graph: ${result.error?.message ?? ''}${result.stdout}${result.stderr}`);
    return JSON.parse(fs.readFileSync(file, 'utf8')).graph;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

export function contractProjects(graph) {
  const depends = (name, visited = new Set()) => {
    if (name === '@sires/contracts') return true;
    if (visited.has(name)) return false;
    visited.add(name);
    return (graph.dependencies[name] ?? []).some(({ target }) => depends(target, visited));
  };
  return Object.entries(graph.nodes).filter(([name, node]) =>
    node.data.tags?.includes('lang:ts') && depends(name),
  ).map(([name, node]) => ({ name, root: node.data.root })).sort((a, b) => a.name.localeCompare(b.name));
}

function generatedSchema(type, generated, seen = new Set()) {
  if (!type || seen.has(type)) return undefined;
  seen.add(type);
  for (const symbol of [type.getSymbol(), type.aliasSymbol]) {
    for (const declaration of symbol?.declarations ?? []) {
      const file = path.resolve(declaration.getSourceFile().fileName);
      if (!file.startsWith(generated + path.sep)) continue;
      for (let node = declaration; node; node = node.parent) {
        if ((ts.isPropertySignature(node) || ts.isInterfaceDeclaration(node)
          || ts.isTypeAliasDeclaration(node)) && node.name) return node.name.getText();
      }
    }
  }
  for (const member of type.types ?? []) {
    const name = generatedSchema(member, generated, seen);
    if (name) return name;
  }
  return undefined;
}

export function typescriptDiagnostics(files, options, workspace) {
  const program = ts.createProgram(files, { ...options, noEmit: true, rootDir: undefined });
  const checker = program.getTypeChecker();
  const generated = path.join(workspace, 'libs/ts/contracts/src/generated');
  return ts.getPreEmitDiagnostics(program).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      const field = message.match(/(?:[Pp]roperty\s+|and\s+)'([^']+)' does not exist/)?.[1];
      let schema;
      if (field && diagnostic.file && diagnostic.start !== undefined) {
        const token = ts.getTokenAtPosition(diagnostic.file, diagnostic.start);
        for (let node = token; node && !schema; node = node.parent) {
          if (ts.isPropertyAccessExpression(node)) {
            schema = generatedSchema(checker.getTypeAtLocation(node.expression), generated);
          } else if (ts.isObjectLiteralExpression(node)) {
            schema = generatedSchema(checker.getContextualType(node), generated);
          }
        }
      }
      if (schema) {
        const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        return `${path.relative(workspace, diagnostic.file.fileName)}:${line + 1}:${character + 1}: trường không có trong spec: '${field}' — ${schema} (TypeScript)`;
      }
      return ts.formatDiagnostics([diagnostic], {
        getCurrentDirectory: () => workspace, getCanonicalFileName: (name) => name, getNewLine: () => '\n',
      }).trimEnd();
    });
}

function sourcePaths(graph, workspace) {
  const paths = {};
  for (const [name, node] of Object.entries(graph.nodes)) {
    const index = path.join(workspace, node.data.root, 'src/index.ts');
    if (name.startsWith('@sires/') && fs.existsSync(index)) paths[name] = [index];
  }
  return paths;
}

export function checkTypeScript({ workspace = ROOT, graph, fixtures = [], log = console.log }) {
  const errors = [];
  const projects = fixtures.length ? [] : contractProjects(graph);
  const paths = sourcePaths(graph, workspace);
  const configs = projects.map((project) => ({ ...project, config: path.join(workspace, project.root, 'tsconfig.json') }));
  if (fixtures.length) configs.push({ name: `fixtures: ${fixtures.join(', ')}`, config: path.join(workspace, 'tsconfig.base.json'), files: fixtures });
  for (const project of configs) {
    log(`TypeScript: ${project.name}`);
    const config = ts.readConfigFile(project.config, ts.sys.readFile);
    if (config.error) {
      errors.push(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
      continue;
    }
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(project.config), undefined, project.config);
    const options = { ...parsed.options, paths: { ...parsed.options.paths, ...paths } };
    // Resolve fresh workspace sources instead of potentially stale dist/*.d.ts.
    errors.push(...typescriptDiagnostics(project.files ?? parsed.fileNames, options, workspace));
    errors.push(...parsed.errors.filter((error) => !project.files || error.code !== 18003)
      .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')));
  }
  for (const error of errors) log(error);
  return errors.length === 0;
}

export function checkPython({ workspace = ROOT, graph, fixtures = [], log = console.log, env = process.env }) {
  const helper = fileURLToPath(new URL('./check-drift-python.py', import.meta.url));
  const projects = fixtures.length ? [{ name: 'fixtures Python', root: '.' }]
    : PYTHON_PROJECTS.map((name) => {
      if (!graph.nodes[name]) throw new Error(`Python project missing from Nx graph: ${name}`);
      return { name, root: graph.nodes[name].data.root };
    });
  let success = true;
  for (const project of projects) {
    log(`Python: ${project.name}`);
    const result = invoke('uv', ['run', '--project', ROOT, '--all-packages', 'python', helper, '--workspace', workspace,
      ...(fixtures.length ? ['--fixture', ...fixtures] : ['src'])], path.join(workspace, project.root), env);
    if (result.error) throw result.error;
    if (result.stderr) log(result.stderr.trimEnd());
    if (!result.stdout && result.status !== 0) {
      log(`mypy failed (${result.status})`);
      success = false;
      continue;
    }
    let diagnostics;
    try { diagnostics = JSON.parse(result.stdout); }
    catch { throw new Error(`Invalid mypy result: ${result.stdout}`); }
    for (const error of diagnostics.errors) log(error);
    if (diagnostics.status !== 0 || result.status !== 0) success = false;
  }
  return success;
}

export async function checkDrift({ workspace = ROOT, specRoot = path.join(workspace, 'docs/api-design'),
  mode = 'all', fixtures = [], graph, log = console.log, env = process.env } = {}) {
  if (!['all', 'ts', 'python'].includes(mode)) throw new Error(`Unknown mode: ${mode}`);
  graph ??= readGraph(workspace);
  const typed = fixtures.filter((file) => /\.[cm]?tsx?$/.test(file)).map((file) => path.resolve(file));
  const python = fixtures.filter((file) => file.endsWith('.py')).map((file) => path.resolve(file));
  if (fixtures.some((file) => !/\.(?:[cm]?tsx?|py)$/.test(file))) throw new Error('Fixtures must be TypeScript or Python files');
  if ((mode === 'ts' && python.length) || (mode === 'python' && typed.length)) throw new Error('Fixture language does not match selected mode');
  let success = true;
  if (mode !== 'python' && (!fixtures.length || typed.length)) {
    try {
      await generate({ workspace, specRoot, mode: 'ts' });
      success = checkTypeScript({ workspace, graph, fixtures: typed, log }) && success;
    } catch (error) { log(error.message); success = false; }
  }
  if (mode !== 'ts' && (!fixtures.length || python.length)) {
    const uv = invoke('uv', ['--version'], workspace, env);
    if (uv.error || uv.status !== 0) {
      log('Python: thiếu uv; chưa kiểm Python. Cài uv hoặc dùng --ts-only.');
      success = false;
    } else {
      try {
        await generate({ workspace, specRoot, mode: 'python' });
        success = checkPython({ workspace, graph, fixtures: python, log, env }) && success;
      } catch (error) { log(error.message); success = false; }
    }
  }
  log(success ? 'check-drift: đạt' : 'check-drift: lỗi');
  return success;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const flags = args.filter((arg) => arg.startsWith('--'));
  if (flags.some((arg) => !['--ts-only', '--python-only'].includes(arg)) || flags.length > 1) {
    console.error('Usage: node scripts/check-drift.mjs [--ts-only | --python-only] [fixture.ts | fixture.py ...]');
    process.exitCode = 1;
  } else {
    try {
      const success = await checkDrift({ mode: flags[0] === '--ts-only' ? 'ts' : flags[0] === '--python-only' ? 'python' : 'all',
        fixtures: args.filter((arg) => !arg.startsWith('--')) });
      process.exitCode = success ? 0 : 1;
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
