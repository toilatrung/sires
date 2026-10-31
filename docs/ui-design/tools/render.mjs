#!/usr/bin/env node
// Render the canvas sources (source/*.dc.html) into static HTML pages (pages/*.html)
// and rebuild index.html. Usage: node tools/render.mjs  (run from docs/ui-design)
//
// The .dc.html format is the Design canvas's component format: a template inside <x-dc>
// with {{holes}}, <sc-for>, <sc-if> and <dc-import>, plus a Component class whose
// renderVals() feeds the template. This renderer implements just that subset.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'source');
const OUT = path.join(ROOT, 'pages');
const LOGO_BLOB = '/_blob/4be6b6592c8839a5dc8538b3772a6df0';
const LOGO_LOCAL = '../assets/sires-logo.svg';
// Shared shells and the token sheet: rendered once, no variants.
const NO_VARIANTS = new Set(['TopBar', 'ProjectRail', 'Main', 'Components', 'States']);

class DCLogic {
  constructor(props) { this.props = props; this.state = {}; }
  setState(patch) { Object.assign(this.state, typeof patch === 'function' ? patch(this.state) : patch); }
  forceUpdate() {}
}

const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const raw = fs.readFileSync(path.join(SRC, name + '.dc.html'), 'utf8');
  const title = (raw.match(/<title>([\s\S]*?)<\/title>/) || [, name])[1].trim();
  const xdc = raw.match(/<x-dc>([\s\S]*?)<\/x-dc>/)[1];
  const helmet = (xdc.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ''])[1];
  const template = xdc.replace(/<helmet>[\s\S]*?<\/helmet>/, '');
  const sm = raw.match(/<script type="text\/x-dc" data-dc-script data-props='([^']*)'>([\s\S]*?)<\/script>/);
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

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
  const inst = new def.Component(props);
  return render(def.template, { ...inst.renderVals() }, ctx);
}

function defaults(def) {
  const p = {};
  for (const [k, v] of Object.entries(def.props)) if (!k.startsWith('$') && v && 'default' in v) p[k] = v.default;
  return p;
}

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

function page(def, variant, file) {
  const ctx = { helmets: new Set() };
  let body = renderComponent(def.name, variant.props, ctx);
  const fix = (s) => s.split(LOGO_BLOB).join(LOGO_LOCAL).replace(/href="([\w-]+)\.dc\.html"/g, 'href="$1.html"');
  const head = [...ctx.helmets].map(fix).join('\n');
  body = fix(body);
  const title = def.title + (variant.key ? ' · ' + variant.label : '');
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<!-- Generated by tools/render.mjs from source/${def.name}.dc.html. Edit the source, then re-run. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
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
const groups = canvas.pages.map((p) => ({ id: p.id, name: p.name, items: [] }));
const names = fs.readdirSync(SRC).filter((f) => f.endsWith('.dc.html')).map((f) => f.replace('.dc.html', ''));
let count = 0;
for (const name of names) {
  const def = load(name);
  const board = canvas.boards[name + '.dc.html'] || {};
  const item = { name, title: board.title || def.title, width: board.w || 1440, height: board.h || 900, fill: board.expand === 'fill', variants: [] };
  for (const v of variants(def)) {
    const file = name + (v.key ? '--' + v.key : '') + '.html';
    fs.writeFileSync(path.join(OUT, file), page(def, v, file));
    item.variants.push({ label: v.label, file: 'pages/' + file });
    count++;
  }
  (groups.find((g) => g.id === board.page) || groups[0]).items.push(item);
}
const order = (t) => { const m = t.match(/^([A-Z])(\d+)/); return m ? m[1] + String(m[2]).padStart(3, '0') : 'Z' + t; };
for (const g of groups) g.items.sort((a, b) => order(a.title).localeCompare(order(b.title)));

const tpl = fs.readFileSync(path.join(ROOT, 'tools', 'index.template.html'), 'utf8');
fs.writeFileSync(path.join(ROOT, 'index.html'), tpl.replace('/*__MANIFEST__*/null', JSON.stringify(groups)));
console.log(`Rendered ${count} pages from ${names.length} sources into pages/, rebuilt index.html`);
