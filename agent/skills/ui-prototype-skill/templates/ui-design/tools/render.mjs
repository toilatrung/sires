#!/usr/bin/env node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Render the design sources (source/*.dc.html) into static HTML pages (pages/*.html)
// and rebuild index.html. Usage: node tools/render.mjs  (from any directory)
//
// The .dc.html format is the Design canvas's component format: a template inside <x-dc>
// with {{holes}}, <sc-for>, <sc-if> and <dc-import>, plus a Component class whose
// renderVals() feeds the template. This renderer implements just that subset.
// Settings live in tools/ui.config.json; this file carries no product style.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'source');
const OUT = path.join(ROOT, 'pages');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'ui.config.json'), 'utf8'));
const NO_VARIANTS = new Set(config.noVariants || []);
const SHARED = config.sharedCss || [];
const REWRITES = Object.entries(config.assetRewrites || {});

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Shared CSS (config.sharedCss) is the single source of truth. The canvas cannot load ../assets, so every
// source carries a verbatim copy in <style data-ui-shared="<file>"> inside its helmet. This script refreshes
// those copies before rendering and strips them from the helmets it collects, so each page links the file
// exactly once and never carries a second inline copy.
const sharedRe = (file) => new RegExp('<style data-ui-shared="' + reEsc(file) + '">[\\s\\S]*?<\\/style>\\r?\\n?');
const ANY_SHARED_RE = /<style data-ui-shared="[^"]*">[\s\S]*?<\/style>\r?\n?/g;
function syncShared(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let next = raw;
  for (const rel of SHARED) {
    const css = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n').trim().split('\n').join(eol);
    const block = '<style data-ui-shared="' + rel + '">' + eol + '/* Bản chép từ ' + rel + ' do tools/render.mjs tạo; sửa file gốc rồi chạy lại render. */' + eol + css + eol + '</style>' + eol;
    const re = sharedRe(rel);
    if (re.test(next)) next = next.replace(re, () => block);
    else if (/<helmet>/.test(next)) next = next.replace(/<helmet>\r?\n?/, (m) => m + block);
    else next = next.replace(/<x-dc>\r?\n?/, (m) => m + '<helmet>' + eol + block + '</helmet>' + eol);
  }
  if (next !== raw) fs.writeFileSync(file, next);
  return next !== raw;
}

class DCLogic {
  constructor(props) { this.props = props; this.state = {}; }
  setState(patch) { Object.assign(this.state, typeof patch === 'function' ? patch(this.state) : patch); }
  forceUpdate() {}
}

const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const file = path.join(SRC, name + '.dc.html');
  if (!fs.existsSync(file)) throw new Error('missing source: source/' + name + '.dc.html');
  const raw = fs.readFileSync(file, 'utf8');
  const title = (raw.match(/<title>([\s\S]*?)<\/title>/) || [, name])[1].trim();
  const xdc = (raw.match(/<x-dc>([\s\S]*?)<\/x-dc>/) || [])[1];
  if (xdc == null) throw new Error('source/' + name + '.dc.html: no <x-dc> template');
  const helmet = (xdc.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ''])[1].replace(ANY_SHARED_RE, '');
  const template = xdc.replace(/<helmet>[\s\S]*?<\/helmet>/, '');
  const sm = raw.match(/<script type="text\/x-dc" data-dc-script data-props='([^']*)'>([\s\S]*?)<\/script>/);
  if (!sm) throw new Error('source/' + name + '.dc.html: no <script type="text/x-dc" data-dc-script data-props=\'…\'>');
  const props = JSON.parse(sm[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
  const Component = new Function('DCLogic', sm[2] + '\nreturn Component;')(DCLogic);
  const def = { name, title, helmet, template, props, Component };
  cache.set(name, def);
  return def;
}

function lookup(expr, scope) {
  expr = expr.trim();
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  if (expr === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
  if (/^(['"]).*\1$/.test(expr)) return expr.slice(1, -1);
  return expr.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
}

function attrs(open) {
  const out = {};
  for (const m of open.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function attrValue(v, scope) {
  const whole = v.match(/^\{\{([^}]*)\}\}$/);
  if (whole) return lookup(whole[1], scope);
  return v.replace(/\{\{([^}]*)\}\}/g, (_, e) => String(lookup(e, scope) ?? ''));
}

// Holes in a fragment that contains no structural tags.
function holes(seg, scope) {
  seg = seg.replace(/(\s)([\w:-]+)="\{\{([^}]*)\}\}"/g, (m, sp, name, e) => {
    const v = lookup(e, scope);
    if (v === true) return sp + name;
    if (v === false || v == null) return '';
    return sp + name + '="' + esc(v) + '"';
  });
  return seg.replace(/\{\{([^}]*)\}\}/g, (_, e) => esc(lookup(e, scope) ?? ''));
}

function findClose(tpl, tag, from) {
  const re = new RegExp('<' + tag + '\\b|</' + tag + '>', 'g');
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(tpl))) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return m.index;
  }
  throw new Error('unclosed <' + tag + '>');
}

function render(tpl, scope, ctx) {
  const m = tpl.match(/<(sc-for|sc-if|dc-import)\b[^>]*>/);
  if (!m) return holes(tpl, scope);
  const tag = m[1], start = m.index, openEnd = start + m[0].length;
  const close = findClose(tpl, tag, openEnd);
  const inner = tpl.slice(openEnd, close);
  const after = tpl.slice(close + tag.length + 3);
  const a = attrs(m[0]);
  let out = '';
  if (tag === 'sc-for') {
    const list = attrValue(a.list, scope) || [];
    list.forEach((item, i) => { out += render(inner, { ...scope, [a.as]: item, $index: i }, ctx); });
  } else if (tag === 'sc-if') {
    if (attrValue(a.value, scope)) out = render(inner, scope, ctx);
  } else {
    const props = {};
    for (const [k, v] of Object.entries(a)) {
      if (k === 'name' || k.startsWith('hint-')) continue;
      props[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = attrValue(v, scope);
    }
    out = renderComponent(a.name, props, ctx);
  }
  return holes(tpl.slice(0, start), scope) + out + render(after, scope, ctx);
}

function renderComponent(name, props, ctx) {
  const def = load(name);
  ctx.helmets.add(def.helmet.trim());
  const inst = new def.Component({ ...defaults(def), ...props });
  return render(def.template, { ...inst.renderVals() }, ctx);
}

function defaults(def) {
  const p = {};
  for (const [k, v] of Object.entries(def.props)) if (!k.startsWith('$') && v && 'default' in v) p[k] = v.default;
  return p;
}

// One page per enum option other than the default, one per boolean flipped from its default.
function variants(def) {
  const list = [{ key: '', label: 'Mặc định', props: defaults(def) }];
  if (NO_VARIANTS.has(def.name)) return list;
  for (const [k, v] of Object.entries(def.props)) {
    if (!v || k.startsWith('$')) continue;
    if (v.editor === 'enum') for (const o of v.options) if (o !== v.default) list.push({ key: k + '-' + o, label: k + ': ' + o, props: { ...defaults(def), [k]: o } });
    if (v.editor === 'boolean') list.push({ key: k, label: k + ': ' + (!v.default ? 'bật' : 'tắt'), props: { ...defaults(def), [k]: !v.default } });
  }
  return list;
}

const fix = (s) => REWRITES.reduce((acc, [from, to]) => acc.split(from).join(to), s).replace(/href="([\w-]+)\.dc\.html"/g, 'href="$1.html"');
const banner = (config.banner || []).length ? '<!--\n' + config.banner.map((l) => '  ' + l).join('\n') + '\n-->\n' : '';

function page(def, variant) {
  const ctx = { helmets: new Set() };
  const body = fix(renderComponent(def.name, variant.props, ctx));
  const head = [...ctx.helmets].filter(Boolean).map(fix).join('\n');
  const links = SHARED.map((rel) => `<link rel="stylesheet" href="../${rel}">`).join('\n');
  const title = def.title + (variant.key ? ' · ' + variant.label : '');
  return `<!doctype html>
${banner}<html lang="${esc(config.lang || 'vi')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<!-- Generated by tools/render.mjs from source/${def.name}.dc.html. Edit the source, then re-run. -->
${links}
${head}
</head>
<body>
${body.trim()}
</body>
</html>
`;
}

// Build
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.html')) fs.rmSync(path.join(OUT, f));
const canvas = JSON.parse(fs.readFileSync(path.join(SRC, 'canvas.json'), 'utf8'));
const groups = (canvas.pages || [{ id: 'all', name: 'Màn hình' }]).map((p) => ({ id: p.id, name: p.name, items: [] }));
const names = fs.readdirSync(SRC).filter((f) => f.endsWith('.dc.html')).map((f) => f.replace('.dc.html', ''));
const synced = names.filter((n) => syncShared(path.join(SRC, n + '.dc.html')));
if (synced.length) console.log(`Refreshed shared CSS copies in ${synced.length} source(s)`);
let count = 0;
for (const name of names) {
  const def = load(name);
  const board = (canvas.boards || {})[name + '.dc.html'];
  if (!board) console.warn(`warn: source/${name}.dc.html has no board in canvas.json (shown in the first group at 1440×900)`);
  const b = board || {};
  const item = { name, title: b.title || def.title, width: b.w || 1440, height: b.h || 900, fill: b.expand === 'fill', variants: [] };
  for (const v of variants(def)) {
    const file = name + (v.key ? '--' + v.key : '') + '.html';
    fs.writeFileSync(path.join(OUT, file), page(def, v));
    item.variants.push({ label: v.label, file: 'pages/' + file });
    count++;
  }
  (groups.find((g) => g.id === b.page) || groups[0]).items.push(item);
}
// Screen codes (A1, G10, P3) sort by letter then number; untitled items go last.
const order = (t) => { const m = t.match(/^([A-Z])(\d+)/); return m ? m[1] + String(m[2]).padStart(3, '0') : 'Z' + t; };
for (const g of groups) g.items.sort((a, b) => order(a.title).localeCompare(order(b.title)));

const view = { title: config.title || 'UI design', defaultScreen: config.defaultScreen || null };
const tpl = fs.readFileSync(path.join(ROOT, 'tools', 'index.template.html'), 'utf8');
fs.writeFileSync(path.join(ROOT, 'index.html'), tpl
  .replace('/*__MANIFEST__*/null', () => JSON.stringify(groups))
  .replace('/*__CONFIG__*/null', () => JSON.stringify(view)));
console.log(`Rendered ${count} pages from ${names.length} sources into pages/, rebuilt index.html`);
