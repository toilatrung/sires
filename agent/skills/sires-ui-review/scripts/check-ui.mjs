#!/usr/bin/env node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Static check of UI code against the SIRes design tokens (docs/ui-design/design.md).
// Usage: node check-ui.mjs <file-or-dir> [...more]  [--json]
// Scans .css .scss .html .jsx .tsx .vue .svelte .astro .js .ts for colours, radii, shadows,
// gradients, fonts, Tailwind classes and motion that break the design. Exit code 1 when any error is found.

import fs from 'node:fs';
import path from 'node:path';

const EXT = new Set(['.css', '.scss', '.sass', '.less', '.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte', '.astro', '.js', '.ts', '.mjs']);
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'out', '.turbo']);

const PALETTE = new Set([
  '#F6F2EE', '#FCF9F5', '#E5DED5', '#EFEAE3', '#FFFFFF', '#DBD3C7', '#C7C7C7', '#1C1B18', '#4D4A44', '#7A756C',
  '#0277DD', '#025FAC', '#EAF4FE', '#80B9EE', '#CFE6FC', '#9A3412', '#BE123C', '#FFF1F2', '#9F1239', '#FFE4E6', '#0268BE',
  // dark (Agent List)
  '#12110F', '#2E2B26', '#3A372F', '#26241F', '#C9C2B6', '#3DA5FF', '#7CC0FF', '#0E2A45', '#F87171', '#3A1518', '#FCA5A5',
  '#000000'
]);
const RADIUS_OK = new Set(['0', '0px', '4px', '6px', '8px', '50%', '2px', 'inherit', 'var']);
const FONT_OK = /montserrat|jetbrains mono|times new roman|times|serif|monospace|system-ui|sans-serif|inherit|var\(|ui-monospace/i;

const findings = [];
const add = (level, file, line, rule, text, fix) => findings.push({ level, file, line, rule, text: text.trim().slice(0, 140), fix });

function norm(hex) {
  let h = hex.toUpperCase();
  if (h.length === 4) h = '#' + h.slice(1).split('').map((c) => c + c).join('');
  if (h.length === 9) h = h.slice(0, 7);
  return h;
}

function scan(file) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split(/\r?\n/);
  lines.forEach((ln, i) => {
    const n = i + 1;
    if (/^\s*(\/\/|\/\*|\*|<!--)/.test(ln) && !/style=/.test(ln)) return;

    for (const m of ln.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      if (![4, 7, 9].includes(m[0].length)) continue;
      if (!PALETTE.has(norm(m[0]))) add('error', file, n, 'colour', ln, `${m[0]} is not a SIRes token; use the nearest value in design.md §2.1`);
    }
    // Judge each radius inside its own declaration block (inline style or CSS rule on one line).
    for (const decl of ln.match(/style="[^"]*"|\{[^}]*\}|border-radius\s*:[^;"'}]+/gi) || []) {
      const m = decl.match(/border-radius\s*:\s*([^;"'}]+)/i);
      if (!m) continue;
      const dim = (p) => { const d = decl.match(new RegExp('(?:^|[;\\s"{])' + p + '\\s*:\\s*([\\d.]+)px')); return d ? +d[1] : null; };
      const h = dim('height'), w = dim('width') ?? dim('min-width');
      for (const v of m[1].trim().split(/\s+/)) {
        const key = v.startsWith('var(') ? 'var' : v;
        if (RADIUS_OK.has(key)) continue;
        const px = parseFloat(v);
        // Fully round dots, avatars, count badges and switch parts: radius ≥ half the height, not wider than 2× tall.
        if (h && px * 2 >= h - 1 && (!w || w <= h * 2)) continue;
        if (/9999|999px|100%/.test(v) || px >= 9) add('warn', file, n, 'radius', ln, `radius ${v}: allowed only on avatars and switch knobs; cards 8px, controls 6px, chips 4px`);
        else add('error', file, n, 'radius', ln, `radius ${v}: use 8px (cards), 6px (controls) or 4px (chips)`);
      }
    }
    if (/box-shadow\s*:\s*(?!none)/i.test(ln)) add('warn', file, n, 'shadow', ln, 'shadows only on menus, popovers and dialogs (0 4px 16px rgba(28,27,24,.10))');
    if (/(linear|radial|conic)-gradient\(/i.test(ln)) add('error', file, n, 'gradient', ln, 'no gradients; use a flat token colour');
    if (/backdrop-filter|filter\s*:\s*['"]?blur/i.test(ln)) add('error', file, n, 'glass', ln, 'no blur or glass (also not as a motion bridge); use an opaque surface and fade');

    // Motion (design.md §2.4, §2.4.1)
    if (/transition(-property)?\s*:[^;"}]*\b(width|height|top|left|right|bottom|margin[\w-]*)\b/i.test(ln)) add('warn', file, n, 'motion', ln, 'animate transform and opacity only; height only for a disclosure that must push content');
    if (/\bease-in\b(?!-out)|easeIn\b(?!Out)/.test(ln)) add('warn', file, n, 'motion', ln, 'no ease-in on what enters; use ease-out cubic-bezier(0.23, 1, 0.32, 1) or the soft curve');
    if (/rotate\(\s*360deg|\banimate-spin\b|@keyframes\s+[\w-]*spin/i.test(ln)) add('warn', file, n, 'spinner', ln, 'no spinning loaders; use a progress bar (data-progress) or the running dot with text');
    if (/\banimate-(bounce|ping)\b|rotateX\(|\bshimmer\b/i.test(ln)) add('warn', file, n, 'motion', ln, 'decorative motion (bounce, ping, tilt, shimmer) is not in design.md §2.4');
    if (/:hover[^{]*\{[^}]*transform\s*:\s*scale|\bhover:scale-|whileHover=\{\{[^}]*scale/.test(ln)) add('warn', file, n, 'motion', ln, 'nothing scales on hover; hover changes colour only');
    for (const m of ln.matchAll(/font-family\s*:\s*([^;"}]+)/gi)) {
      const first = m[1].split(',')[0].replace(/['"]/g, '').trim();
      if (!FONT_OK.test(first)) add('error', file, n, 'font', ln, `font "${first}": use Montserrat (JetBrains Mono for IDs/code)`);
    }
    if (/text-transform\s*:\s*uppercase/i.test(ln) || /\buppercase\b.*\btracking-/.test(ln)) add('warn', file, n, 'uppercase', ln, 'no uppercase tracked labels; sentence case');
    if (/letter-spacing\s*:\s*0?\.[05-9]|letter-spacing\s*:\s*[1-9]/i.test(ln)) add('warn', file, n, 'tracking', ln, 'no letter-spaced labels');

    // Tailwind
    for (const m of ln.matchAll(/\brounded(?:-[a-z]{1,2})?-(xl|2xl|3xl|full)\b|\brounded-(xl|2xl|3xl|full)\b/g)) add(m[0].includes('full') ? 'warn' : 'error', file, n, 'radius', ln, `${m[0]}: use rounded (4px chips), rounded-md (6px controls) or rounded-lg (8px cards); full only for avatars`);
    for (const m of ln.matchAll(/\bshadow(-(sm|md|lg|xl|2xl|inner))?\b(?!-none)/g)) if (!/shadow-none/.test(m[0])) add('warn', file, n, 'shadow', ln, `${m[0]}: shadows only on floating layers`);
    if (/\bbg-gradient-|\bfrom-[a-z]+-\d{2,3}\b.*\bto-[a-z]+-\d{2,3}\b/.test(ln)) add('error', file, n, 'gradient', ln, 'no gradients');
    if (/\bbackdrop-blur/.test(ln)) add('error', file, n, 'glass', ln, 'no backdrop blur');
    for (const m of ln.matchAll(/\b(?:bg|text|border|ring|fill|stroke)-(red|green|emerald|violet|purple|indigo|pink|fuchsia|rose|amber|yellow|lime|teal|cyan|sky|orange|slate|gray|zinc|neutral|stone)-\d{2,3}\b/g)) add('error', file, n, 'colour', ln, `${m[0]}: Tailwind palette colour; map SIRes tokens into the theme and use those`);

    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(ln)) add('error', file, n, 'emoji', ln, 'no emoji in UI; use words or an outline icon');
    if (/(sk-[A-Za-z0-9]{8,}|AIza[0-9A-Za-z_-]{20,})/.test(ln)) add('error', file, n, 'secret', ln, 'looks like an API key in UI code; never render keys');
  });
  // A file that animates must also handle reduced motion (CSS media query or Motion's helpers).
  const animates = lines.findIndex((ln) => /@keyframes|\banimation\s*:|<motion\.|\bmotion\.\w+\(|\banimate=\{/.test(ln));
  if (animates >= 0 && !/prefers-reduced-motion|motion\.css|ReducedMotionConfig|useShouldReduceMotion|useReducedMotion|motion-reduce:/.test(src)) {
    add('warn', file, animates + 1, 'reduced-motion', lines[animates], 'animation without a reduced-motion path: drop movement, keep fades, stop loops (design.md §2.4)');
  }
}

function walk(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(p)) if (!SKIP_DIR.has(f)) walk(path.join(p, f));
  } else if (EXT.has(path.extname(p).toLowerCase())) scan(p);
}

const args = process.argv.slice(2);
const json = args.includes('--json');
const targets = args.filter((a) => a !== '--json');
if (!targets.length) { console.error('Usage: node check-ui.mjs <file-or-dir> [...] [--json]'); process.exit(2); }
for (const t of targets) walk(path.resolve(t));

if (json) console.log(JSON.stringify(findings, null, 2));
else {
  for (const f of findings) console.log(`${f.level.toUpperCase().padEnd(5)} ${path.relative(process.cwd(), f.file)}:${f.line} [${f.rule}] ${f.fix}\n      ${f.text}`);
  const e = findings.filter((f) => f.level === 'error').length, w = findings.length - e;
  console.log(`\n${e} error(s), ${w} warning(s)`);
}
process.exit(findings.some((f) => f.level === 'error') ? 1 : 0);
