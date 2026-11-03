#!/usr/bin/env node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Scaffold a style-neutral ui-design folder from templates/ui-design.
// Usage: node scaffold.mjs <target-dir> [--title "Name"] [--port 5178] [--lang vi] [--force]
//   Copies the template tree, fills __UI_TITLE__, __UI_PORT__ and __UI_LANG__, and refuses a
//   non-empty target unless --force (then existing files with the same path are overwritten).
//   Does not run render; run <target>/tools/render.mjs afterwards.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'ui-design');
const TEXT = new Set(['.html', '.md', '.json', '.mjs', '.js', '.css', '.svg']);

const args = process.argv.slice(2);
const flags = { force: false };
let target;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--force') flags.force = true;
  else if (args[i].startsWith('--')) flags[args[i].slice(2)] = args[++i];
  else target ??= args[i];
}
const opt = (name, fallback) => flags[name] || fallback;
if (!target) {
  console.error('Usage: node scaffold.mjs <target-dir> [--title "Name"] [--port 5178] [--lang vi] [--force]');
  process.exit(2);
}
const values = {
  __UI_TITLE__: opt('title', 'UI design'),
  __UI_PORT__: String(Number(opt('port', '5178')) || 5178),
  __UI_LANG__: opt('lang', 'vi'),
};
const dest = path.resolve(target);
if (fs.existsSync(dest) && fs.readdirSync(dest).length && !flags.force) {
  console.error(`Refusing to write into non-empty ${dest} (pass --force to overwrite matching files).`);
  process.exit(1);
}

// Template files carry the repo's license notice with a LICENSES.md link relative to the template.
// Re-point it from each copied file to the nearest LICENSES.md above the target (left as is if none).
let licenses = null;
for (let d = dest; ; d = path.dirname(d)) {
  if (fs.existsSync(path.join(d, 'LICENSES.md'))) { licenses = path.join(d, 'LICENSES.md'); break; }
  if (path.dirname(d) === d) break;
}
const relink = (s, out) => licenses
  ? s.replace(/\]\((?:\.\.\/)+LICENSES\.md\)/g, () => '](' + path.relative(path.dirname(out), licenses).split(path.sep).join('/') + ')')
  : s;

const written = [];
(function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name), out = path.join(to, entry.name);
    if (entry.isDirectory()) { copy(src, out); continue; }
    if (TEXT.has(path.extname(entry.name))) {
      let s = fs.readFileSync(src, 'utf8');
      for (const [k, v] of Object.entries(values)) s = s.split(k).join(v);
      fs.writeFileSync(out, relink(s, out));
    } else fs.copyFileSync(src, out);
    written.push(path.relative(dest, out).split(path.sep).join('/'));
  }
})(TEMPLATE, dest);
fs.mkdirSync(path.join(dest, 'pages'), { recursive: true });

console.log(`Scaffolded ${written.length} files into ${dest}:`);
for (const f of written) console.log('  ' + f);
console.log(`\nNext:\n  node "${path.join(dest, 'tools', 'render.mjs')}"\n  node "${path.join(dest, 'tools', 'serve.mjs')}"   # http://localhost:${values.__UI_PORT__}/`);
