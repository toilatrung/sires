#!/usr/bin/env node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Tìm nơi định nghĩa và nơi nhắc tới một mã trong docs/.
// Usage: node agent/skills/dev/spec-read-skill/scripts/locate.mjs <MÃ> [<MÃ> ...] [--root <repo>] [--refs]
//   TK-NNN           → thư mục ticket (docs/tickets/**/TK-NNN/), tài liệu chính, spec-docs/index.html, others/
//   mã khác          → file#anchor có id="<mã viết thường>" hoặc id="req-<mã viết thường>" (nơi định nghĩa);
//                      AC (…-ACNN) còn tìm dòng <strong>MÃ</strong> trong danh sách AC
//   --refs           → thêm các file có nhắc tới mã (tối đa 20)
// Bỏ qua file sinh tự động: docs/ui-design/pages/, docs/api-design/dist/.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const rootAt = args.indexOf('--root');
const ROOT = path.resolve(rootAt >= 0 ? args[rootAt + 1] : '.');
const showRefs = args.includes('--refs');
const codes = args.filter((a, i) => !a.startsWith('--') && (rootAt < 0 || i !== rootAt + 1));
const DOCS = path.join(ROOT, 'docs');
if (!codes.length || !fs.existsSync(DOCS)) {
  console.error('Usage: locate.mjs <MÃ> [...] [--refs] [--root <repo>]  (chạy ở gốc kho, cần thư mục docs/)');
  process.exit(2);
}

const GENERATED = new Set(['ui-design/pages', 'api-design/dist'].map((p) => path.join(DOCS, p)));
const files = [];
const ticketDirs = new Map();
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (GENERATED.has(p)) continue;
      if (/^TK-\d{3}$/.test(e.name)) ticketDirs.set(e.name, p);
      walk(p);
    } else if (/\.(html|md|ya?ml|sql|mmd)$/.test(e.name)) files.push(p);
  }
})(DOCS);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const text = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));

let missing = 0;
for (const raw of codes) {
  const code = raw.toUpperCase();
  console.log(`\n${code}`);
  const tk = code.match(/^(TK-\d{3})(?:-AC\d{2})?$/);
  if (tk) {
    const dir = ticketDirs.get(tk[1]);
    if (!dir) { console.log('  không tìm thấy thư mục ticket dưới docs/tickets/'); missing++; continue; }
    const main = fs.readdirSync(dir).find((f) => new RegExp(`^${tk[1]}-.+\\.html$`).test(f));
    const spec = path.join(dir, 'spec-docs', 'index.html');
    console.log(`  ticket : ${main ? rel(path.join(dir, main)) : `(thiếu tài liệu chính trong ${rel(dir)})`}`);
    console.log(`  spec   : ${fs.existsSync(spec) ? rel(spec) : '(chưa có spec-docs/index.html)'}`);
    const others = path.join(dir, 'others');
    const extra = fs.existsSync(others) ? fs.readdirSync(others).filter((f) => f !== '.gitkeep') : [];
    if (extra.length) console.log(`  others : ${extra.join(', ')}`);
    if (!code.includes('-AC')) continue;
  }
  const id = code.toLowerCase();
  const defs = [];
  for (const [f, s] of text) {
    if (s.includes(`id="${id}"`)) defs.push(`${rel(f)}#${id}`);
    else if (s.includes(`id="req-${id}"`)) defs.push(`${rel(f)}#req-${id}`);
    else if (code.includes('-AC') && s.includes(`<strong>${code}</strong>`)) defs.push(`${rel(f)} (trong danh sách AC)`);
  }
  if (defs.length) defs.forEach((d) => console.log(`  định nghĩa: ${d}`));
  else if (!tk) { console.log('  không thấy nơi định nghĩa (id="…")'); missing++; }
  if (showRefs) {
    const re = new RegExp(`(^|[^A-Z0-9-])${code.replace(/[-.]/g, '\\$&')}(?![0-9]|-[0-9])`);
    const refs = [...text].filter(([, s]) => re.test(s)).map(([f]) => rel(f));
    refs.slice(0, 20).forEach((r) => console.log(`  nhắc tới: ${r}`));
    if (refs.length > 20) console.log(`  … và ${refs.length - 20} file khác`);
  }
}
process.exit(missing ? 1 : 0);
