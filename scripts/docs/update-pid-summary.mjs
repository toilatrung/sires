#!/usr/bin/env node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Tổng hợp mọi PID vào docs/tickets/index.html (vùng PID-SUMMARY): số lượng theo giai đoạn, sơ đồ làn
// có PID, đợt song song, chuỗi dài nhất, danh sách đầy đủ. Dữ liệu đọc từ docs/tickets/issues/PID-*/index.html.
// Đợt tính từ dòng “Phụ thuộc PID”: đợt = 1 + đợt lớn nhất của các PID phụ thuộc; ghi lại vào dòng “Đợt song song”.
// update-index.mjs gọi file này; chạy riêng: node scripts/docs/update-pid-summary.mjs [--check] [--root <gốc kho>]
//   --check: không ghi, thoát 1 khi trang hoặc dòng đợt lệch.
// Phụ thuộc trỏ tới PID không có, có chu trình, hoặc trang thiếu dấu mốc: thoát 2.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMMAND = 'node scripts/docs/update-index.mjs';
const MARK = { start: '<!-- PID-SUMMARY:START -->', end: '<!-- PID-SUMMARY:END -->' };
const FIG_LANES = ['platform', 'contracts', 'infra', 'web', 'gateway', 'identity', 'workspace', 'audit', 'orchestration', 'agent-core', 'planning', 'library', 'knowledge', 'research', 'manuscript', 'sandbox-runner', 'eval', 'e2e'];
const CELLS = { 'Khung, spike': 'K', 'Xây với stub': 'X', 'Hội tụ trên staging': 'H', 'Duy trì, hỗ trợ': 'D', 'Ổn định, nghiệm thu': 'O', 'Triển khai, trực': 'T' };
const PHASES = ['PH-01', 'PH-02', 'PH-03', 'PH-04', 'PH-05', 'PH-06', 'PH-07', 'PH-08'];

const fail = (msg) => { console.error(msg); process.exit(2); };
const norm = (s) => s.replace(/\r\n/g, '\n');
const text = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const esc = (s) => String(s).replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rowRe = (key) => new RegExp(`<tr><th scope="row">${key}</th><td>([\\s\\S]*?)</td></tr>`);
const short = (id) => id.replace('PID-', '');
const link = (id) => `<a href="issues/${id}/index.html">${short(id)}</a>`;
const table = (cols, rows, cls = '') => `<div class="table-wrap"><table${cls ? ` class="${cls}"` : ''}><thead><tr>${cols.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>\n${rows.join('\n')}\n</tbody></table></div>`;

function readPids(base) {
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^PID-\d{5}$/.test(d.name) && existsSync(join(base, d.name, 'index.html')))
    .map((d) => {
      const path = join(base, d.name, 'index.html');
      const html = norm(readFileSync(path, 'utf8'));
      const row = (key) => { const m = html.match(rowRe(key)); return m ? text(m[1]) : ''; };
      const cell = row('Ô trên FIG-301');
      return {
        id: d.name,
        path,
        html,
        title: text((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [, d.name])[1]).replace(`${d.name} — `, ''),
        track: row('Luồng'),
        phase: row('Giai đoạn'),
        cell,
        cellClass: CELLS[cell.split(':')[0].trim()] || '',
        deps: [...row('Phụ thuộc PID').matchAll(/PID-\d{5}/g)].map((m) => m[0]),
        status: row('Trạng thái'),
      };
    })
    .filter((p) => p.track && p.phase)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function computeWaves(pids) {
  const byId = new Map(pids.map((p) => [p.id, p]));
  const wave = new Map();
  const visit = (id, trail) => {
    if (trail.includes(id)) fail(`docs/tickets/issues: phụ thuộc có chu trình: ${[...trail, id].join(' → ')}`);
    if (wave.has(id)) return wave.get(id);
    const p = byId.get(id);
    if (!p) fail(`docs/tickets/issues/${trail.at(-1)}/index.html: phụ thuộc ${id} không có.`);
    const w = 1 + Math.max(0, ...p.deps.map((d) => visit(d, [...trail, id])));
    wave.set(id, w);
    return w;
  };
  for (const p of pids) p.wave = visit(p.id, []);
  return byId;
}

function longestChain(pids, byId) {
  if (!pids.length) return [];
  let cur = pids.reduce((a, b) => (b.wave > a.wave ? b : a));
  const chain = [cur];
  while (cur.deps.length) {
    cur = cur.deps.map((d) => byId.get(d)).reduce((a, b) => (b.wave > a.wave ? b : a));
    chain.unshift(cur);
  }
  return chain;
}

function render(pids, byId) {
  if (!pids.length) return '<p>Chưa có PID nào.</p>';
  const lane = (p) => p.track.split('/')[0];
  const count = (list, c) => list.filter((p) => p.cellClass === c).length;
  const phaseRows = PHASES.map((ph) => {
    const list = pids.filter((p) => p.phase === ph);
    return `<tr><td><a href="sections/02-phases-and-gates.html#${ph.toLowerCase()}">${ph}</a></td><td>${list.length}</td>${['K', 'X', 'H', 'D', 'O', 'T'].map((c) => `<td>${count(list, c) || '—'}</td>`).join('')}</tr>`;
  });
  const swim = FIG_LANES.map((l) => {
    const cells = PHASES.map((ph) => {
      const list = pids.filter((p) => lane(p) === l && p.phase === ph);
      if (!list.length) return '<td class="st-E"></td>';
      return `<td class="st-${list[0].cellClass || 'E'}">${list.map((p) => link(p.id)).join(' ')}</td>`;
    }).join('');
    return `<tr><th scope="row"><code>${l}</code></th>${cells}</tr>`;
  });
  const waves = [...new Set(pids.map((p) => p.wave))].sort((a, b) => a - b).map((w) => {
    const list = pids.filter((p) => p.wave === w);
    const groups = FIG_LANES.filter((l) => list.some((p) => lane(p) === l)).map((l) => `<code>${l}</code>: ${list.filter((p) => lane(p) === l).map((p) => link(p.id)).join(' ')}`);
    return `<tr><td>Đ${w}</td><td>${list.length}</td><td>${groups.join(' · ')}</td></tr>`;
  });
  const chain = longestChain(pids, byId);
  const all = pids.map((p) => `<tr><td><a href="issues/${p.id}/index.html">${p.id}</a></td><td>${esc(p.title)}</td><td><code>${esc(p.track)}</code></td><td>${p.phase}</td><td>${esc(p.cell.split(':')[0])}</td><td>Đ${p.wave}</td><td>${p.deps.map(link).join(' ') || '—'}</td></tr>`);
  return [
    `<p>${pids.length} PID, xếp thành ${new Set(pids.map((p) => p.wave)).size} đợt song song. Mỗi PID thuộc đúng một luồng và một giai đoạn, nên nằm đúng một ô của sơ đồ làn; không PID nào sửa mã của luồng khác.</p>`,
    '<h3 id="pid-phases">Theo giai đoạn</h3>',
    table(['Giai đoạn', 'PID', 'Khung', 'Xây', 'Hội tụ', 'Duy trì', 'Ổn định', 'Triển khai'], phaseRows),
    '<h3 id="fig-302">Sơ đồ làn có PID</h3>',
    table(['Luồng', ...PHASES], swim, 'swimlane'),
    '<p class="status">FIG-302 — Vị trí từng PID trên FIG-301 (ghi 5 chữ số cuối của mã). Sinh tự động từ hồ sơ PID.</p>',
    '<h3 id="pid-waves">Đợt song song</h3>',
    '<p>Đợt là thời điểm sớm nhất một PID bắt đầu được: mọi PID nó phụ thuộc đã xong. Các PID cùng đợt chạy song song được. Luồng gọi nhau dùng stub theo hợp đồng nên không phải chờ nhau; chỉ PID kiểm cổng mới chờ các luồng đã xong. Ít người hơn số PID trong đợt thì ưu tiên giai đoạn nhỏ trước.</p>',
    table(['Đợt', 'PID', 'PID theo luồng'], waves),
    '<p class="status">FIG-303 — Đợt song song. Sinh tự động từ dòng “Phụ thuộc PID” của từng hồ sơ.</p>',
    '<h3 id="pid-chain">Chuỗi dài nhất</h3>',
    `<p>Chuỗi này quyết định số đợt tối thiểu; chậm ở đây là chậm cả kế hoạch: ${chain.map((p) => `${link(p.id)} (<code>${esc(p.track)}</code>)`).join(' → ')}.</p>`,
    '<h3 id="pid-list">Danh sách đầy đủ</h3>',
    table(['Mã', 'Task', 'Luồng', 'Giai đoạn', 'Ô', 'Đợt', 'Phụ thuộc'], all),
  ].join('\n');
}

// Trả về true khi --check thấy trang lệch.
export function syncPidSummary({ root = REPO, check = false } = {}) {
  const base = join(root, 'docs', 'tickets', 'issues');
  const pagePath = join(root, 'docs', 'tickets', 'index.html');
  if (!existsSync(pagePath)) return false;
  const pids = readPids(base);
  const byId = computeWaves(pids);
  let stale = false;

  for (const p of pids) {
    const next = p.html.replace(rowRe('Đợt song song'), `<tr><th scope="row">Đợt song song</th><td>Đ${p.wave}</td></tr>`);
    if (next === p.html) continue;
    stale = true;
    if (check) console.log(`docs/tickets/issues/${p.id}/index.html: dòng Đợt song song lệch; chạy ${COMMAND}.`);
    else writeFileSync(p.path, next);
  }

  const page = norm(readFileSync(pagePath, 'utf8'));
  const a = page.indexOf(MARK.start);
  const b = page.indexOf(MARK.end);
  if (a < 0 || b < a) fail(`docs/tickets/index.html: thiếu dấu mốc ${MARK.start} / ${MARK.end}; không ghi đè.`);
  const nextPage = `${page.slice(0, a)}${MARK.start}\n${render(pids, byId)}\n${MARK.end}${page.slice(b + MARK.end.length)}`;
  if (nextPage !== page) {
    stale = true;
    if (check) console.log(`docs/tickets/index.html: danh sách PID lệch với hồ sơ; chạy ${COMMAND}.`);
    else writeFileSync(pagePath, nextPage);
  }
  if (!stale || !check) console.log(`docs/tickets/index.html: ${pids.length} PID, ${new Set(pids.map((p) => p.wave)).size} đợt.`);
  return check && stale;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const rootAt = args.indexOf('--root');
  const stale = syncPidSummary({ root: rootAt >= 0 ? resolve(args[rootAt + 1]) : REPO, check: args.includes('--check') });
  process.exit(stale ? 1 : 0);
}
