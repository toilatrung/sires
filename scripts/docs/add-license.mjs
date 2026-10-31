#!/usr/bin/env node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Add the LICENSES.md notice to every file in the repository (documents and source code), in each
// file type's comment syntax. Idempotent: files that already carry the SPDX identifier are left alone.
// Usage: node scripts/docs/add-license.mjs [--check]
//   --check  list files missing the notice and exit 1, without writing.
// Files with no comment syntax (JSON, lock files, binaries) are skipped; LICENSES.md still covers them.
// Generated pages (docs/ui-design/pages, its index.html) get the notice from tools/render.mjs and
// index.template.html.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ID = 'LicenseRef-eTroy-NC-1.0';
const LINES = [
  'SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.',
  'Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.',
  `SPDX-License-Identifier: ${ID} — see LICENSES.md`,
];
const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.next', '.turbo', 'build', 'target', 'coverage', 'vendor']);
const SKIP_FILES = new Set(['LICENSES.md']);
const check = process.argv.includes('--check');

const rel = (file) => path.relative(path.dirname(file), path.join(ROOT, 'LICENSES.md')).split(path.sep).join('/');

const block = (open, prefix, close) => [open, ...LINES.map((l) => prefix + l), close].filter((l) => l !== null).join('\n') + '\n';

// OpenAPI info.license: keep in sync with LICENSES.md (identifier and url are mutually exclusive in 3.1).
const yamlLicense = (s) => s.replace(
  /(\n(\s*)license:\n)\s*name: [^\n]*\n\s*identifier: [^\n]*\n/g,
  (_, head, indent) => `${head}${indent}  name: eTroy Non-Commercial License 1.0 (see LICENSES.md)\n${indent}  identifier: ${ID}\n`,
);

// Line comments go after a shebang or <?php opener, which must stay on the first line.
const lineComment = (prefix) => (s) => {
  const m = s.match(/^(#!|<\?php).*\r?\n/);
  const head = m ? m[0] : '';
  return head + block(null, prefix, null) + '\n' + s.slice(head.length);
};

// Markup comments go after a doctype or XML declaration.
const markupComment = (s) => {
  const m = s.match(/^(<!doctype html>|<\?xml[^>]*>)\r?\n/i);
  const head = m ? m[0] : '';
  return head + block('<!--', '  ', '-->') + s.slice(head.length);
};

const handlers = {
  '.html'(s, file) {
    // Visible notice in document footers (PRD, architecture, docs hub).
    return markupComment(s).replace(/<footer>([\s\S]*?)<\/footer>/, (_, inner) =>
      `<footer>${inner.trim()} · © 2026 eTroy · <a href="${rel(file)}">Non-commercial license</a></footer>`);
  },
  '.yaml': (s) => yamlLicense(block(null, '# ', null) + (s.startsWith('#') ? '' : '\n') + s),
  '.yml': (s) => handlers['.yaml'](s),
  '.mmd': (s) => block(null, '%% ', null) + s,
  '.svg': (s) => s.replace(/(<svg\b[^>]*>\r?\n?)/, (open) => open + block('<!--', '  ', '-->')),
  '.md': (s, file) => s.replace(/\s*$/, '\n') + `\n---\n\n<!-- SPDX-License-Identifier: ${ID} -->\n` +
    `SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. ` +
    `Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](${rel(file)}).\n`,
};

// Source code, by comment syntax.
const LINE = {
  '// ': ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.go', '.java', '.kt', '.kts', '.scala', '.rs',
    '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.swift', '.dart', '.php', '.proto', '.prisma', '.gradle'],
  '# ': ['.py', '.pyi', '.sh', '.bash', '.zsh', '.ps1', '.rb', '.r', '.toml', '.ini', '.cfg', '.conf', '.tf', '.hcl', '.dockerfile'],
  '-- ': ['.sql', '.lua', '.hs'],
  '% ': ['.tex', '.sty', '.cls', '.bib'],
};
for (const [prefix, exts] of Object.entries(LINE)) for (const e of exts) handlers[e] = lineComment(prefix);
for (const e of ['.css', '.scss', '.less']) handlers[e] = (s) => block('/*', ' * ', ' */') + s;
for (const e of ['.vue', '.svelte', '.xml']) handlers[e] = markupComment;

// Files named by convention rather than extension (Dockerfile, Dockerfile.dev, .gitignore, ...).
const BY_NAME = Object.fromEntries(
  ['Dockerfile', 'Makefile', 'Procfile', '.gitignore', '.dockerignore', '.editorconfig', '.env.example'].map((n) => [n, lineComment('# ')]),
);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* walk(path.join(dir, e.name)); }
    else yield path.join(dir, e.name);
  }
}

const missing = [];
for (const file of walk(ROOT)) {
  const base = path.basename(file);
  const handler = BY_NAME[base] || BY_NAME[base.split('.')[0]] || handlers[path.extname(file)];
  if (!handler || SKIP_FILES.has(base)) continue;
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes(ID)) continue;
  missing.push(path.relative(ROOT, file));
  if (!check) fs.writeFileSync(file, handler(src, file));
}

for (const f of missing) console.log(`${check ? '! thiếu' : '+ thêm '}  ${f}`);
console.log(`${missing.length} file ${check ? 'chưa có' : 'đã được thêm'} thông báo giấy phép.`);
if (check && missing.length) process.exit(1);
