#!/usr/bin/env node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Sinh lại bảng ticket trong docs/tickets/issues/index.html từ PID-*/index.html và report.md (bản checkout và các nhánh origin/*).
// Dùng: node agent/skills/po/spec-clarify-skill/scripts/update-issues.mjs [--check] [--root <gốc kho>]
//   --check: không ghi, thoát 1 nếu bảng đang lệch.
// File rỗng hoặc chưa có: dựng từ assets/issues-index.template.html.
// File có nội dung mà thiếu dấu mốc: không ghi đè, thoát 2.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { latestReports, reportCell } from '../../../../../scripts/docs/update-tickets.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const check = args.includes('--check');
const rootIdx = args.indexOf('--root');
const root = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : resolve(HERE, '../../../../..');
const base = join(root, 'docs', 'tickets', 'issues');
const indexPath = join(base, 'index.html');
const START = '<!-- PID-LIST:START -->';
const END = '<!-- PID-LIST:END -->';

const text = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/&(?!amp;|lt;|gt;|quot;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const norm = (s) => s.replace(/\r\n/g, '\n');
const row = (html, key) => {
  const m = html.match(new RegExp(`<tr><th scope="row">${key}</th><td>([\\s\\S]*?)</td></tr>`));
  return m ? text(m[1]) : '';
};
// Hồ sơ mới chép từ khung còn chỗ giữ chỗ: vẫn liệt kê, không in nguyên văn khung mẫu.
const isDraft = (s) => /PID-NNNNN|PH-NN|&lt;|</.test(s);

if (!existsSync(base)) {
  console.error(`Không có ${base}`);
  process.exit(2);
}

const ids = readdirSync(base, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^PID-[A-Za-z0-9]+$/.test(d.name))
  .map((d) => d.name)
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

const reports = latestReports(root);

function result(id) {
  if (!reports.has(id)) return 'Chưa làm';
  const qc = existsSync(join(root, 'agent', 'execution', id, 'qc-report.md')) ? ` · <a href="../../../agent/execution/${id}/qc-report.md">QC</a>` : '';
  return `${reportCell(id, reports.get(id))}${qc}`;
}

const rows = ids.map((id) => {
  const p = join(base, id, 'index.html');
  if (!existsSync(p) || !readFileSync(p, 'utf8').trim()) {
    return `<tr><td>${id}</td><td>${id}/ (chưa có index.html)</td><td>—</td><td>—</td><td>Chưa sẵn sàng</td><td>${result(id)}</td></tr>`;
  }
  const html = readFileSync(p, 'utf8');
  const rawH1 = text((html.match(/<h1>([\s\S]*?)<\/h1>/) || [, id])[1]);
  const title = isDraft(rawH1) ? `${id} — đang lập` : rawH1;
  const clean = (key, fallback) => { const v = row(html, key); return v && !isDraft(v) ? esc(v) : fallback; };
  const rawStatus = row(html, 'Trạng thái');
  const status = rawStatus && !isDraft(rawStatus) && !rawStatus.includes('·') ? esc(rawStatus) : 'Chưa sẵn sàng — đang lập';
  return `<tr><td>${id}</td><td><a href="${id}/index.html">${esc(title)}</a></td><td>${clean('Luồng', '—')}</td><td>${clean('Giai đoạn', '—')}</td><td>${status}</td><td>${result(id)}</td></tr>`;
});

const table = `${START}
<div class="table-wrap"><table><thead><tr><th scope="col">Mã</th><th scope="col">Ticket</th><th scope="col">Luồng</th><th scope="col">Giai đoạn</th><th scope="col">Hồ sơ</th><th scope="col">Kết quả thực thi</th></tr></thead><tbody>
${rows.join('\n') || '<tr><td colspan="6">Chưa có ticket nào.</td></tr>'}
</tbody></table></div>
${END}`;

let cur = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
if (!cur.trim()) {
  if (check) { console.log('docs/tickets/issues/index.html: rỗng — chạy update-issues.mjs'); process.exit(1); }
  cur = readFileSync(resolve(HERE, '../assets/issues-index.template.html'), 'utf8');
}
const a = cur.indexOf(START), b = cur.indexOf(END);
if (a < 0 || b < 0) {
  console.error(`docs/tickets/issues/index.html có nội dung nhưng thiếu dấu mốc ${START} / ${END}; không ghi đè.`);
  process.exit(2);
}
const next = norm(cur.slice(0, a)) + table + norm(cur.slice(b + END.length));
const before = existsSync(indexPath) ? norm(readFileSync(indexPath, 'utf8')) : '';
if (check) {
  if (next !== before) { console.log('docs/tickets/issues/index.html: bảng ticket lệch — chạy update-issues.mjs'); process.exit(1); }
  console.log(`docs/tickets/issues/index.html: khớp (${ids.length} ticket).`);
} else {
  if (next !== before) writeFileSync(indexPath, next);
  console.log(`docs/tickets/issues/index.html: ${next !== before ? 'đã cập nhật' : 'không đổi'} (${ids.length} ticket: ${ids.join(', ') || '—'}).`);
}
