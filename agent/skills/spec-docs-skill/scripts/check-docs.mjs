#!/usr/bin/env node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md


// Check a spec-docs tree: duplicate ids in a page, broken relative links and anchors,
// unbalanced HTML tags, broken relative links in Markdown.
// Usage: node check-docs.mjs [dir-or-file ...] [--ids] [--skip <dir>]...
//   default target: docs/
//   --ids        also print the highest code in use and the next free one (OQ, DEC, ASM, FIG…);
//                docs_context.md is left out because it names the next codes before they exist
// Files named *.template.* are skipped: their links resolve only after rendering.
//   --skip <dir> skip a folder (repeatable), e.g. generated pages
// Exit 1 when an error is found.

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const showIds = args.includes('--ids');
const skip = new Set(['node_modules', '.git', 'dist']);
const targets = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ids') continue;
  if (args[i] === '--skip') { skip.add(path.resolve(args[++i])); continue; }
  targets.push(args[i]);
}
if (!targets.length) targets.push('docs');

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const errors = [];
const err = (file, msg) => errors.push(`${path.relative(process.cwd(), file)}: ${msg}`);

function* walk(p) {
  const abs = path.resolve(p);
  if (skip.has(abs) || skip.has(path.basename(abs))) return;
  const st = fs.statSync(abs);
  if (st.isFile()) { yield abs; return; }
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) yield* walk(path.join(abs, e.name));
}

// Markup without comments, scripts and styles; keeps line count so messages point at the right line.
const blank = (m) => m.replace(/[^\n]/g, ' ');
const strip = (html) => html
  .replace(/<!--[\s\S]*?-->/g, blank)
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, blank);
const lineOf = (s, i) => s.slice(0, i).split('\n').length;

const idCache = new Map();
function idsOf(file) {
  if (!idCache.has(file)) {
    const set = new Set();
    if (fs.existsSync(file)) for (const m of strip(fs.readFileSync(file, 'utf8')).matchAll(/\s(?:id|name)="([^"]+)"/g)) set.add(m[1]);
    idCache.set(file, set);
  }
  return idCache.get(file);
}

function checkLink(file, raw, line) {
  if (!raw || EXTERNAL.test(raw) || raw.startsWith('{')) return;
  const [pathPart, hash] = raw.split('#');
  const clean = decodeURIComponent(pathPart.split('?')[0]);
  const target = clean ? path.resolve(path.dirname(file), clean) : file;
  if (clean && !fs.existsSync(target)) return err(file, `dòng ${line}: liên kết hỏng ${raw}`);
  if (hash && /\.html?$/i.test(target) && fs.statSync(target).isFile() && !idsOf(target).has(decodeURIComponent(hash))) {
    err(file, `dòng ${line}: anchor không tồn tại ${raw}`);
  }
}

function checkHtml(file) {
  const src = strip(fs.readFileSync(file, 'utf8'));
  const seen = new Map();
  for (const m of src.matchAll(/\sid="([^"]+)"/g)) {
    if (seen.has(m[1])) err(file, `dòng ${lineOf(src, m.index)}: id trùng "${m[1]}" (lần đầu dòng ${seen.get(m[1])})`);
    else seen.set(m[1], lineOf(src, m.index));
  }
  for (const m of src.matchAll(/\s(?:href|src)="([^"]*)"/g)) checkLink(file, m[1], lineOf(src, m.index));

  const stack = [];
  for (const m of src.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g)) {
    const [, close, rawName, selfClose] = m;
    const name = rawName.toLowerCase();
    if (VOID.has(name) || selfClose) continue;
    const line = lineOf(src, m.index);
    if (!close) { stack.push({ name, line }); continue; }
    const at = stack.map((t) => t.name).lastIndexOf(name);
    if (at < 0) { err(file, `dòng ${line}: thẻ đóng </${name}> không có thẻ mở`); continue; }
    for (const t of stack.splice(at).slice(1)) err(file, `dòng ${t.line}: thẻ <${t.name}> chưa đóng trước </${name}> (dòng ${line})`);
  }
  for (const t of stack) err(file, `dòng ${t.line}: thẻ <${t.name}> chưa đóng`);
}

function checkMarkdown(file) {
  const src = fs.readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, blank).replace(/`[^`\n]*`/g, blank);
  for (const m of src.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) checkLink(file, m[1], lineOf(src, m.index));
}

// Codes with a running number; BL and TS keep their section prefix (BL-09-03, TS-02-06).
const CODE = /\b(OQ|DEC|ASM|RISK|FIG|ADR|SPK|AQ|GOAL|PRB|KPI|SCOPE|OOS|FUT|APR|WF|REL|SYNC|PC|F|BL-\d{2}|TS-\d{2})-(\d{1,3})\b/g;
const maxCode = new Map();

const files = targets.flatMap((t) => [...walk(t)]);
for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  if (/\.template\./i.test(path.basename(file))) continue;
  if (ext === '.html' || ext === '.htm') checkHtml(file);
  else if (ext === '.md') checkMarkdown(file);
  if (showIds && /\.(html?|md|ya?ml|mmd)$/i.test(ext) && path.basename(file) !== 'docs_context.md') {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(CODE)) {
      // "mã tiếp theo là OQ-103" announces a code that is not in use yet.
      if (/(tiếp theo|next)[^.<]{0,25}$/i.test(text.slice(Math.max(0, m.index - 40), m.index))) continue;
      const cur = maxCode.get(m[1]);
      const n = Number(m[2]);
      if (!cur || n > cur.n) maxCode.set(m[1], { n, width: m[2].length });
    }
  }
}

for (const e of errors) console.log(`✗ ${e}`);
console.log(`${files.length} file đã kiểm tra, ${errors.length} lỗi.`);
if (showIds) {
  console.log('\nMã đang dùng cao nhất → mã tiếp theo:');
  for (const [k, { n, width }] of [...maxCode].sort(([a], [b]) => a.localeCompare(b))) {
    const pad = (x) => String(x).padStart(width, '0');
    console.log(`  ${k.padEnd(6)} ${k}-${pad(n)} → ${k}-${pad(n + 1)}`);
  }
}
process.exit(errors.length ? 1 : 0);
