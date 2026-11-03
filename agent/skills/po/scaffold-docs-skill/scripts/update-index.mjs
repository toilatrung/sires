#!/usr/bin/env node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md


// Sync docs/index.html with the folders under docs/: add an entry for each new folder,
// drop entries whose folder was deleted, keep hand-edited entries untouched.
// Usage: node update-index.mjs [--check] [--root <repo>]   (root defaults to the current directory)
//   --check  report changes and exit 1 if the index is out of date, without writing.
//
// The managed list sits between <!-- docs-index:start ... --> and <!-- docs-index:end -->
// in docs/index.html; each entry is a <li data-folder="name"> ... </li> block.

import fs from 'node:fs';
import path from 'node:path';

const rootArg = process.argv.indexOf('--root');
const REPO = path.resolve(rootArg > 0 ? process.argv[rootArg + 1] : '.');
const DOCS = path.join(REPO, 'docs');
const INDEX = path.join(DOCS, 'index.html');
const START_RE = /<!-- docs-index:start[\s\S]*?-->\n?/;
const END_MARK = '<!-- docs-index:end -->';
const ENTRY_RE = /<li data-folder="([^"]+)">[\s\S]*?<\/li>\n?/g;
// Folders that are never documentation sets.
const IGNORE = new Set(['node_modules', 'assets', 'dist']);

const check = process.argv.includes('--check');

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const decodeHtml = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const stripTags = (s) => decodeHtml(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

function scanFolders() {
  return fs
    .readdirSync(DOCS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_') && !IGNORE.has(d.name))
    .map((d) => d.name)
    .sort();
}

// Title and description for a new entry: index.html first, then README.md.
function describe(folder) {
  const dir = path.join(DOCS, folder);
  const has = (f) => fs.existsSync(path.join(dir, f));
  let target = null;
  let title = '';
  let desc = '';

  if (has('index.html')) {
    target = 'index.html';
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const m = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
    title = h1 ? stripTags(h1[1]) : t ? stripTags(t[1]).split(' | ')[0] : '';
    desc = m ? decodeHtml(m[1]).trim() : '';
  }
  if (has('README.md') && (!title || !desc)) {
    target ??= 'README.md';
    const md = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    const heading = md.match(/^#\s+(.+)$/m);
    const para = md
      .split(/\r?\n\s*\r?\n/)
      .map((b) => b.trim())
      .find((b) => b && !/^[#>|`\-*]/.test(b));
    title ||= heading ? heading[1].trim() : '';
    desc ||= para ? para.replace(/\s+/g, ' ').replace(/[*_`]/g, '') : '';
  }
  return { target, title: title || folder, desc };
}

function renderEntry(folder) {
  const { target, title, desc } = describe(folder);
  const href = target ? `${folder}/${target}` : `${folder}/`;
  const lines = [
    `<li data-folder="${escapeHtml(folder)}">`,
    `<p class="eyebrow">${escapeHtml(folder)}/</p>`,
    `<h2><a href="${escapeHtml(href)}">${escapeHtml(title)}</a></h2>`,
  ];
  if (desc) lines.push(`<p>${escapeHtml(desc)}</p>`);
  if (target !== 'index.html') lines.push('<p class="status">Chưa có index.html</p>');
  lines.push('</li>');
  return { html: lines.join('\n') + '\n', target };
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const page = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');
const start = page.match(START_RE);
const endAt = page.indexOf(END_MARK);
if (!start || endAt < 0 || endAt < start.index) {
  console.error('docs/index.html thiếu cặp marker docs-index:start / docs-index:end.');
  process.exit(2);
}
const blockStart = start.index + start[0].length;
const block = page.slice(blockStart, endAt);

const existing = new Map();
for (const m of block.matchAll(ENTRY_RE)) existing.set(m[1], m[0].endsWith('\n') ? m[0] : m[0] + '\n');

const folders = scanFolders();
const present = new Set(folders);
const removed = [...existing.keys()].filter((f) => !present.has(f));
const added = folders.filter((f) => !existing.has(f));
const warnings = [];

// Keep the hand-curated order of existing entries; append new folders alphabetically.
let body = [...existing].filter(([f]) => present.has(f)).map(([, html]) => html).join('');
for (const f of added) {
  const { html, target } = renderEntry(f);
  if (target !== 'index.html') warnings.push(`${f}/ chưa có index.html${target ? `, liên kết tới ${target}` : ''}`);
  body += html;
}

for (const f of added) console.log(`+ thêm    ${f}/`);
for (const f of removed) console.log(`- xóa     ${f}/`);
for (const w of warnings) console.warn(`! ${w}`);

if (!added.length && !removed.length) {
  console.log('docs/index.html đã khớp với các thư mục trong docs/.');
  process.exit(0);
}
if (check) {
  console.log('docs/index.html chưa cập nhật; chạy lại không kèm --check để ghi.');
  process.exit(1);
}

const next = (page.slice(0, blockStart) + body + page.slice(endAt)).replace(
  /(<span>Cập nhật )\d{2}\/\d{2}\/\d{4}(<\/span>)/,
  `$1${today()}$2`,
);
fs.writeFileSync(INDEX, next);
console.log(`Đã cập nhật docs/index.html (${added.length} thêm, ${removed.length} xóa).`);
