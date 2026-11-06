#!/usr/bin/env node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Đồng bộ hai trang ở docs/tickets/issues/ khi thêm hoặc xóa thư mục PID-NNNNN:
//   index.html      file chỉ dẫn: file HTML và tiêu đề của từng PID (vùng PID-FILES);
//                   bảng ticket (vùng PID-LIST) do update-issues.mjs của spec-clarify-skill sinh.
//   taskboard.html  task đã đăng ký, đang chạy, chưa chạy (vùng TASKBOARD), từ sổ task-registry
//                   trong chính trang đó và agent/execution/PID-NNNNN/report.md, đọc từ bản checkout
//                   và mọi nhánh origin/* (chạy git fetch --prune origin trước; xem latestReports).
// update-index.mjs gọi file này; chạy riêng: node scripts/docs/update-tickets.mjs [--check] [--root <gốc kho>]
//   --check: không ghi, thoát 1 khi thư mục PID hoặc sổ đăng ký lệch với trang. Không kiểm trạng thái
//            chạy: report.md do Dev ghi, còn trang nằm trong docs/ chỉ PO cập nhật (R-01, R-03).
// Sổ đăng ký sai định dạng hoặc trang thiếu dấu mốc: thoát 2.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UPDATE_ISSUES = join(REPO, 'agent', 'skills', 'po', 'spec-clarify-skill', 'scripts', 'update-issues.mjs');
const COMMAND = 'node scripts/docs/update-index.mjs';
const SHARED_TRACKS = new Set(['platform', 'contracts', 'infra', 'eval', 'e2e']);
const FOLDER_ORDER = ['specs', 'designs', 'others'];
const TEMPLATE_DIR = 'PID-Template'; // khung mẫu ở agent/execution, không phải ticket
const FILES = { start: '<!-- PID-FILES:START -->', end: '<!-- PID-FILES:END -->' };
const BOARD = { start: '<!-- TASKBOARD:START -->', end: '<!-- TASKBOARD:END -->' };
const REGISTRY_RE = /<script type="application\/json" id="task-registry">([\s\S]*?)<\/script>/;
const REPORT_RE = new RegExp(`^agent/execution/((?!${TEMPLATE_DIR}/)PID-[A-Za-z0-9]+)/report\\.md$`);
const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;
const FINISHED_RE = /^(Xong|Hủy|Huỷ)(?!\p{L})/u;

const fail = (msg) => { console.error(msg); process.exit(2); };
const norm = (s) => s.replace(/\r\n/g, '\n');
const read = (p) => (existsSync(p) ? norm(readFileSync(p, 'utf8')) : '');
const text = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const esc = (s) => String(s).replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isDraft = (s) => /PID-NNNNN|PH-NN|&lt;|</.test(s);
const byId = (a, b) => a.localeCompare(b, 'en', { numeric: true });

const table = (cols, rows, empty) => `<div class="table-wrap"><table><thead><tr>${cols.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>
${rows.join('\n') || `<tr><td colspan="${cols.length}">${empty}</td></tr>`}
</tbody></table></div>`;

function region(html, { start, end }) {
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  return a < 0 || b < a ? null : html.slice(a + start.length, b);
}

function setRegion(html, { start, end }, body) {
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  return a < 0 || b < a ? null : `${html.slice(0, a)}${start}\n${body}\n${end}${html.slice(b + end.length)}`;
}

function pidDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^PID-[A-Za-z0-9]+$/.test(d.name) && d.name !== TEMPLATE_DIR)
    .map((d) => d.name)
    .sort(byId);
}

function walk(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`],
  );
}

// Trang chính lên đầu, rồi specs/, designs/, others/ theo thứ tự đọc của một hồ sơ.
function fileRank(file) {
  if (!file.includes('/')) return file === 'index.html' ? 0 : 1;
  const i = FOLDER_ORDER.indexOf(file.split('/')[0]);
  return i < 0 ? FOLDER_ORDER.length + 2 : i + 2;
}

function titleOf(path) {
  const html = read(path);
  if (!html.trim()) return 'File rỗng';
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = text(h1 ? h1[1] : t ? t[1].split(' | ')[0] : '');
  if (!title) return 'Chưa có tiêu đề';
  return isDraft(title) ? 'Đang lập' : esc(title);
}

function renderFiles(base, ids) {
  if (!ids.length) return '<p>Chưa có ticket nào.</p>';
  return ids.map((id) => {
    const head = `<h3 id="${id.toLowerCase()}">${id}</h3>`;
    const files = walk(join(base, id))
      .filter((f) => f.endsWith('.html') && !f.includes('.template.'))
      .sort((a, b) => fileRank(a) - fileRank(b) || byId(a, b));
    if (!files.length) return `${head}\n<p class="status">Chưa có file HTML.</p>`;
    const rows = files.map((f) => `<tr><td><a href="${esc(`${id}/${f}`)}">${esc(`${id}/${f}`)}</a></td><td>${titleOf(join(base, id, f))}</td></tr>`);
    return `${head}\n${table(['Đường dẫn', 'Tiêu đề'], rows)}`;
  }).join('\n');
}

const git = (root, args, timeout = 30000) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  timeout,
  maxBuffer: 64 * 1024 * 1024,
});
const lines = (s) => s.split('\n').filter(Boolean);

function fetchOrigin(root) {
  try {
    git(root, ['fetch', '--prune', '--quiet', 'origin'], 60000);
  } catch {
    console.warn('! Không fetch được origin: dùng các nhánh origin/* đang có trên máy, trạng thái chạy có thể cũ.');
  }
}

// Thời điểm commit gần nhất của từng report.md đang có trong một ref.
function reportTimes(root, ref) {
  const wanted = new Set(lines(git(root, ['ls-tree', '-r', '--name-only', ref, '--', 'agent/execution'])).filter((p) => REPORT_RE.test(p)));
  const times = new Map([...wanted].map((p) => [p.match(REPORT_RE)[1], 0]));
  if (!wanted.size) return times;
  let time = 0;
  for (const line of lines(git(root, ['log', '--format=@%ct', '--name-only', ref, '--', 'agent/execution']))) {
    if (line.startsWith('@')) time = Number(line.slice(1));
    else if (wanted.delete(line)) times.set(line.match(REPORT_RE)[1], time);
  }
  return times;
}

const statusOf = (md) => {
  const m = md.match(/\*\*Trạng thái:\*\*\s*(.+)/);
  return m ? m[1].trim() : 'Không rõ trạng thái';
};

// Bản report.md mới nhất của mỗi PID. Dev làm trên nhánh riêng nên report.md chỉ tới main khi pull request
// merge; vì vậy đọc cả bản checkout và mọi nhánh origin/*, lấy bản có commit mới nhất. File chưa commit trên
// máy đang chạy lệnh được ưu tiên. Trả về Map id → { status, branch } (branch rỗng khi là bản trên đĩa).
export function latestReports(root) {
  const execDir = join(root, 'agent', 'execution');
  const best = new Map();
  for (const id of pidDirs(execDir)) if (existsSync(join(execDir, id, 'report.md'))) best.set(id, { time: -1 });

  let branches = [];
  try {
    for (const [id, time] of reportTimes(root, 'HEAD')) if (best.has(id)) best.get(id).time = time;
    for (const line of lines(git(root, ['status', '--porcelain', '--untracked-files=all', '--', 'agent/execution']))) {
      const id = line.slice(3).match(REPORT_RE)?.[1];
      if (id && best.has(id)) best.get(id).time = Infinity;
    }
    branches = lines(git(root, ['for-each-ref', 'refs/remotes/origin', '--format=%(refname)'])).filter((r) => !r.endsWith('/HEAD'));
  } catch {
    // Không phải kho Git hoặc chưa có commit: chỉ còn bản trên đĩa.
  }
  // Nhánh rẽ từ main cũng chứa report đã merge, cùng thời điểm commit: khi hòa thì giữ main.
  branches.sort((a, b) => b.endsWith('/main') - a.endsWith('/main'));
  for (const ref of branches) {
    for (const [id, time] of reportTimes(root, ref)) {
      if (time > (best.get(id)?.time ?? -2)) best.set(id, { time, ref });
    }
  }

  const reports = new Map();
  for (const [id, { ref }] of best) {
    reports.set(id, ref
      ? { status: statusOf(git(root, ['show', `${ref}:agent/execution/${id}/report.md`])), branch: ref.replace('refs/remotes/origin/', '') }
      : { status: statusOf(read(join(execDir, id, 'report.md'))), branch: '' });
  }
  return reports;
}

// Bản trên đĩa thì liên kết tới file; bản trên nhánh khác không có file để liên kết nên ghi tên nhánh.
export function reportCell(id, report) {
  return report.branch
    ? `${esc(report.status)} · nhánh <code>${esc(report.branch)}</code>`
    : `<a href="../../../agent/execution/${id}/report.md">${esc(report.status)}</a>`;
}

function validTrack(root, track) {
  const [head, sub, ...rest] = String(track ?? '').split('/');
  if (rest.length) return false;
  if (sub !== undefined) return head === 'web' && sub !== '';
  return SHARED_TRACKS.has(head) || (head !== '' && existsSync(join(root, 'apps', head)));
}

function readRegistry(root, boardHtml) {
  const m = boardHtml.match(REGISTRY_RE);
  if (!m) fail('docs/tickets/issues/taskboard.html: thiếu khối task-registry.');
  let tasks;
  try {
    tasks = JSON.parse(m[1]);
  } catch (e) {
    fail(`docs/tickets/issues/taskboard.html: task-registry không phải JSON hợp lệ: ${e.message}`);
  }
  if (!Array.isArray(tasks)) fail('docs/tickets/issues/taskboard.html: task-registry phải là một mảng.');

  const seen = new Set();
  const errors = [];
  tasks.forEach((t, i) => {
    const where = t?.id || `dòng ${i + 1}`;
    if (!/^PID-\d{5}$/.test(t?.id ?? '')) errors.push(`${where}: id phải có dạng PID-NNNNN`);
    if (seen.has(t?.id)) errors.push(`${where}: trùng mã`);
    seen.add(t?.id);
    if (!String(t?.title ?? '').trim()) errors.push(`${where}: thiếu title`);
    if (!validTrack(root, t?.track)) errors.push(`${where}: track "${t?.track}" không phải luồng (apps/<service>, platform, contracts, infra, eval, e2e, web/<khu vực>)`);
    if (!/^PH-0[1-8]$/.test(t?.phase ?? '')) errors.push(`${where}: phase phải từ PH-01 đến PH-08`);
    if (!DATE_RE.test(t?.registered ?? '')) errors.push(`${where}: registered phải có dạng dd/mm/yyyy`);
    if (t?.cancelled && !DATE_RE.test(t.cancelled)) errors.push(`${where}: cancelled phải có dạng dd/mm/yyyy`);
  });
  if (errors.length) fail(`docs/tickets/issues/taskboard.html: sổ đăng ký sai:\n  ${errors.join('\n  ')}`);
  return [...tasks].sort((a, b) => byId(a.id, b.id));
}

function runState(task, reports) {
  if (task.cancelled) return { kind: 'ended', label: `Đã hủy ${esc(task.cancelled)}` };
  const report = reports.get(task.id);
  if (!report) return { kind: 'pending', label: 'Chưa chạy' };
  const cell = reportCell(task.id, report);
  return FINISHED_RE.test(report.status.normalize('NFC'))
    ? { kind: 'ended', label: cell }
    : { kind: 'running', label: 'Đang chạy', link: cell };
}

function dossier(base, id) {
  const html = read(join(base, id, 'index.html'));
  if (!html.trim()) return 'Chưa có hồ sơ';
  const m = html.match(/<tr><th scope="row">Trạng thái<\/th><td>([\s\S]*?)<\/td><\/tr>/);
  const raw = m ? text(m[1]) : '';
  return raw && !isDraft(raw) && !raw.includes('·') ? esc(raw) : 'Chưa sẵn sàng — đang lập';
}

function renderBoard(base, tasks, folders, reports) {
  const reported = [...reports.keys()];
  const registered = new Set(tasks.map((t) => t.id));
  const all = [...new Set([...registered, ...folders, ...reported])];
  const nextId = `PID-${String(Math.max(0, ...all.map((id) => Number(id.slice(4))).filter(Number.isFinite)) + 1).padStart(5, '0')}`;

  const views = tasks.map((t) => ({ ...t, run: runState(t, reports) }));
  const running = views.filter((t) => t.run.kind === 'running');
  const pending = views.filter((t) => t.run.kind === 'pending');
  const ended = views.filter((t) => t.run.kind === 'ended');

  const idCell = (id) => (read(join(base, id, 'index.html')).trim() ? `<a href="${id}/index.html">${id}</a>` : id);
  const common = (t) => `<td>${idCell(t.id)}</td><td>${esc(t.title)}</td><td><code>${esc(t.track)}</code></td><td>${t.phase}</td>`;
  const who = (t) => (t.assignee ? esc(t.assignee) : '—');

  const stray = all.filter((id) => !registered.has(id)).sort(byId).map((id) => {
    const found = [];
    if (folders.includes(id)) found.push(`có <a href="index.html#${id.toLowerCase()}">thư mục hồ sơ</a>`);
    if (reports.has(id)) {
      const { branch } = reports.get(id);
      found.push(branch ? `có report.md trên nhánh <code>${esc(branch)}</code>` : `có <a href="../../../agent/execution/${id}/report.md">report.md</a>`);
    }
    return `<tr><td>${id}</td><td>${found.join(', ')}</td><td>Đăng ký trước khi giao Dev, hoặc xóa thư mục nếu không dùng</td></tr>`;
  });

  return [
    '<h2 id="summary">Tổng quan</h2>',
    table(['<a href="#registered">Đã đăng ký</a>', '<a href="#running">Đang chạy</a>', '<a href="#not-started">Chưa chạy</a>', 'Xong hoặc hủy', 'Mã tiếp theo'],
      [`<tr><td>${views.length}</td><td>${running.length}</td><td>${pending.length}</td><td>${ended.length}</td><td>${nextId}</td></tr>`]),
    '<h2 id="registered">Task đã đăng ký</h2>',
    '<p>Mọi task PO đã đăng ký, gồm cả task đã xong hoặc đã hủy.</p>',
    table(['Mã', 'Task', 'Luồng', 'Giai đoạn', 'Ngày đăng ký', 'Giao cho', 'Tình trạng'],
      views.map((t) => `<tr data-pid="${t.id}">${common(t)}<td>${esc(t.registered)}</td><td>${who(t)}</td><td>${t.run.label}</td></tr>`),
      'Chưa có task nào được đăng ký.'),
    '<h2 id="running">Task đang chạy</h2>',
    table(['Mã', 'Task', 'Luồng', 'Giai đoạn', 'Giao cho', 'Trạng thái'],
      running.map((t) => `<tr>${common(t)}<td>${who(t)}</td><td>${t.run.link}</td></tr>`),
      'Không có task nào đang chạy.'),
    '<h2 id="not-started">Task chưa chạy</h2>',
    table(['Mã', 'Task', 'Luồng', 'Giai đoạn', 'Giao cho', 'Hồ sơ'],
      pending.map((t) => `<tr>${common(t)}<td>${who(t)}</td><td>${dossier(base, t.id)}</td></tr>`),
      'Không có task nào chưa chạy.'),
    '<h2 id="unregistered">Chưa đăng ký — cần PO xử lý</h2>',
    table(['Mã', 'Đang có', 'Cần làm'], stray, 'Không có.'),
  ].join('\n');
}

function logChanges(oldRegion, ids) {
  const before = new Set([...(oldRegion ?? '').matchAll(/<h3 id="(pid-[^"]+)"/g)].map((m) => m[1]));
  const now = new Set(ids.map((id) => id.toLowerCase()));
  for (const id of ids) if (!before.has(id.toLowerCase())) console.log(`+ thêm    ${id}/`);
  for (const id of before) if (!now.has(id)) console.log(`- xóa     ${id.toUpperCase()}/`);
}

// Trả về true khi --check thấy trang lệch.
export function syncTickets({ root = REPO, check = false } = {}) {
  const base = join(root, 'docs', 'tickets', 'issues');
  if (!existsSync(base)) return false;
  const indexPath = join(base, 'index.html');
  const boardPath = join(base, 'taskboard.html');
  const boardHtml = read(boardPath);
  const tasks = readRegistry(root, boardHtml);
  const ids = pidDirs(base);

  // Git không lưu thư mục rỗng: PID không có file nào sẽ mất ở bản checkout của CI.
  for (const id of ids) {
    if (!walk(join(base, id)).length) console.warn(`! ${id}/ không có file nào; Git không lưu thư mục rỗng nên CI sẽ báo lệch (thêm .gitkeep).`);
  }

  if (check) {
    let stale = false;
    const index = read(indexPath);
    if (setRegion(index, FILES, renderFiles(base, ids)) !== index) {
      console.log(`docs/tickets/issues/index.html: danh sách PID lệch với thư mục; chạy ${COMMAND}.`);
      stale = true;
    }
    const shown = region(boardHtml, BOARD);
    const shownIds = [...(shown ?? '').matchAll(/<tr data-pid="([^"]+)">/g)].map((m) => m[1]).join();
    if (shown === null || shownIds !== tasks.map((t) => t.id).join()) {
      console.log(`docs/tickets/issues/taskboard.html: bảng lệch với sổ đăng ký; chạy ${COMMAND}.`);
      stale = true;
    }
    if (!stale) console.log(`docs/tickets/issues: khớp (${ids.length} thư mục PID, ${tasks.length} task đã đăng ký).`);
    return stale;
  }

  fetchOrigin(root);

  // update-issues.mjs dựng index.html từ khung khi file còn rỗng, nên phải chạy trước.
  if (existsSync(UPDATE_ISSUES)) {
    try {
      execFileSync(process.execPath, [UPDATE_ISSUES, '--root', root], { stdio: 'inherit' });
    } catch {
      process.exit(2);
    }
  } else {
    console.warn(`! Không thấy ${UPDATE_ISSUES}; bảng ticket (PID-LIST) không được cập nhật.`);
  }

  const index = read(indexPath);
  const nextIndex = setRegion(index, FILES, renderFiles(base, ids));
  if (nextIndex === null) fail(`docs/tickets/issues/index.html: thiếu dấu mốc ${FILES.start} / ${FILES.end}; không ghi đè.`);
  logChanges(region(index, FILES), ids);
  if (nextIndex !== index) writeFileSync(indexPath, nextIndex);

  const nextBoard = setRegion(boardHtml, BOARD, renderBoard(base, tasks, ids, latestReports(root)));
  if (nextBoard === null) fail(`docs/tickets/issues/taskboard.html: thiếu dấu mốc ${BOARD.start} / ${BOARD.end}; không ghi đè.`);
  if (nextBoard !== boardHtml) writeFileSync(boardPath, nextBoard);

  console.log(`docs/tickets/issues: ${ids.length} thư mục PID, ${tasks.length} task đã đăng ký.`);
  return false;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const rootAt = args.indexOf('--root');
  const stale = syncTickets({ root: rootAt >= 0 ? resolve(args[rootAt + 1]) : REPO, check: args.includes('--check') });
  process.exit(stale ? 1 : 0);
}
