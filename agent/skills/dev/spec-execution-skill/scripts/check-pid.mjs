#!/usr/bin/env node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Kiểm hồ sơ ticket docs/tickets/issues/PID-NNNNN/ có đủ tối thiểu để spec-execution-skill chạy.
// Với --result: kiểm kết quả agent/execution/PID-NNNNN/ (report.md, implement.md, self-qc.md) đã ghi đủ.
// Dùng: node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00001 [--result] [--root <gốc kho>]
// Thoát 0 khi không có lỗi (cảnh báo vẫn cho chạy), 1 khi có lỗi, 2 khi sai tham số.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const id = args.find((a) => /^PID-[A-Za-z0-9]+$/.test(a));
const wantResult = args.includes('--result');
const rootIdx = args.indexOf('--root');
const root = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
if (!id) {
  console.error('Dùng: check-pid.mjs PID-NNNNN [--result] [--root <gốc kho>]');
  process.exit(2);
}
if (id === 'PID-Template') {
  console.error('PID-Template là khung mẫu ở agent/execution, không phải ticket.');
  process.exit(2);
}

const dir = join(root, 'docs', 'tickets', 'issues', id);
const out = join(root, 'agent', 'execution', id);
const errors = [];
const warns = [];
const oks = [];
const rel = (p) => relative(root, p).replaceAll('\\', '/');
const read = (p) => readFileSync(p, 'utf8');
const text = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const kv = (html, key) => {
  const m = html.match(new RegExp(`<tr><th scope="row">${key}</th><td>([\\s\\S]*?)</td></tr>`));
  return m ? text(m[1]) : '';
};
const rows = (html) => [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => c[1]));
const h2Body = (html, title) => {
  const m = html.match(new RegExp(`<h2[^>]*>\\s*${title}\\s*</h2>([\\s\\S]*?)(?=<h2|</main>|$)`));
  return m ? m[1] : null;
};
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

const WORDS = ['PID-NNNNN', 'PH-NN', 'CODE-NNN', 'dd/mm/yyyy'];

// Bỏ <pre>, <code>, chú thích HTML trước khi tìm chỗ giữ chỗ, để `&lt;script&gt;` trong code không bị bắt nhầm.
function placeholders(html) {
  const main = (html.match(/<main[^>]*>([\s\S]*?)<\/main>/) || [, html])[1];
  const t = main.replace(/<!--[\s\S]*?-->/g, '').replace(/<pre>[\s\S]*?<\/pre>/g, '').replace(/<code>[\s\S]*?<\/code>/g, '');
  const found = new Set();
  for (const m of t.matchAll(/&lt;[^&\n]{1,60}?&gt;/g)) found.add(m[0].replace('&lt;', '<').replace('&gt;', '>'));
  for (const w of WORDS) if (t.includes(w)) found.add(w);
  if (/<(td|li)>\s*…\s*<\/\1>/.test(t)) found.add('…');
  return [...found];
}

function mdPlaceholders(md) {
  const t = md.replace(/<!--[\s\S]*?-->/g, '').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const found = new Set();
  for (const m of t.matchAll(/<[^<>\n]{1,120}>/g)) found.add(m[0]);
  for (const w of WORDS) if (t.includes(w)) found.add(w);
  return [...found];
}

function finish(okLine, badLine) {
  for (const o of oks) console.log(`OK    ${o}`);
  for (const w of warns) console.log(`CẢNH  ${w}`);
  for (const e of errors) console.log(`LỖI   ${e}`);
  console.log(errors.length ? `\n${id}: ${badLine} (${errors.length} lỗi, ${warns.length} cảnh báo).` : `\n${id}: ${okLine} (${warns.length} cảnh báo).`);
  process.exit(errors.length ? 1 : 0);
}

// Mã AC và slice mà hồ sơ yêu cầu; dùng cho cả hai chế độ.
function ticketCodes() {
  const acs = new Set();
  const ecs = new Set();
  const acc = join(dir, 'specs', 'acceptance.html');
  if (existsSync(acc)) {
    for (const cells of rows(read(acc))) {
      const ac = text(cells[0] || '');
      if (/^[A-Z][A-Z0-9-]*-AC\d+$/.test(ac)) acs.add(ac);
    }
  }
  const scope = join(dir, 'specs', 'scope.html');
  if (existsSync(scope)) {
    for (const cells of rows(h2Body(read(scope), 'Edge case') || '')) {
      const ec = text(cells[0] || '');
      if (/^EC\d+$/.test(ec)) ecs.add(ec);
    }
  }
  const sliceDir = join(dir, 'specs', 'slices');
  const slices = existsSync(sliceDir) ? readdirSync(sliceDir).filter((f) => /^S\d{2}-.+\.html$/.test(f)).sort() : [];
  return { acs, ecs, slices, sliceIds: new Set(slices.map((f) => f.slice(0, 3))) };
}

function checkResult() {
  if (!existsSync(out)) {
    errors.push(`Không có ${rel(out)} — Dev chưa chạy spec-execution-skill ${id}.`);
    return finish('', 'KẾT QUẢ CHƯA ĐỦ');
  }
  const reportPath = join(out, 'report.md');
  if (!existsSync(reportPath)) {
    errors.push('Thiếu report.md');
    return finish('', 'KẾT QUẢ CHƯA ĐỦ');
  }
  const report = read(reportPath);
  const status = (report.match(/\*\*Trạng thái:\*\*\s*(.+)/) || [, ''])[1].trim();
  if (!status) errors.push('report.md thiếu dòng “**Trạng thái:**”');
  else if (status.includes(' | ')) errors.push(`report.md: trạng thái chưa chọn (“${status}”)`);
  else if (/^(Đang làm|Bị chặn|Xong — chờ QC)/.test(status)) oks.push(`trạng thái: ${status}`);
  else warns.push(`report.md: trạng thái lạ “${status}”`);
  const done = /^Xong/.test(status);
  // Chưa xong thì thiếu là bình thường; đã báo xong thì thiếu là lỗi.
  const flag = (msg) => (done ? errors : warns).push(msg);

  const files = { 'report.md': report };
  for (const f of ['implement.md', 'self-qc.md']) {
    const p = join(out, f);
    if (!existsSync(p)) { flag(`Thiếu ${f}`); continue; }
    files[f] = read(p);
  }
  for (const [f, s] of Object.entries(files)) {
    const ph = mdPlaceholders(s);
    if (ph.length) flag(`${f} còn chỗ giữ chỗ chưa điền: ${ph.slice(0, 5).join(', ')}`);
    else oks.push(f);
  }

  const { acs, ecs, sliceIds } = ticketCodes();
  for (const s of sliceIds) if (!report.includes(s)) flag(`${s} chưa có trong report.md mục 2`);

  const qc = files['self-qc.md'];
  if (qc !== undefined) {
    for (const ac of acs) if (!qc.includes(ac)) flag(`${ac} chưa có trong self-qc.md mục 2`);
    for (const ec of ecs) if (!qc.includes(ec)) flag(`${ec} chưa có trong self-qc.md mục 3`);
    const verdict = (qc.match(/\*\*Kết luận:\*\*\s*(.+)/) || [, ''])[1].trim();
    if (!verdict || verdict.includes(' | ')) flag('self-qc.md: kết luận chưa chọn');
    else if (done && !/^Đạt/.test(verdict)) errors.push(`report.md báo Xong nhưng self-qc.md kết luận “${verdict}”`);
    const unchecked = (qc.match(/^- \[ \] (?!.*không áp dụng)/gm) || []).length;
    if (unchecked) warns.push(`self-qc.md còn ${unchecked} mục tự kiểm chưa đánh dấu`);
  }

  const impl = files['implement.md'];
  if (impl !== undefined) {
    for (const h of ['Luồng đã triển khai', 'Hàm, thuật toán, class ảnh hưởng cao']) {
      if (!new RegExp(`^## .*${h}`, 'm').test(impl)) flag(`implement.md thiếu mục “${h}”`);
    }
  }

  const known = new Set(['report.md', 'implement.md', 'self-qc.md', 'qc-report.md', '.gitkeep']);
  const qcReportPath = join(out, 'qc-report.md');
  const mentions = report + (existsSync(qcReportPath) ? read(qcReportPath) : '');
  for (const f of walk(out)) {
    const r = relative(out, f).replaceAll('\\', '/');
    if (!known.has(r) && !mentions.includes(r)) warns.push(`${r} chưa được liệt kê (report.md mục 6, hoặc qc-report.md với file của QC)`);
  }
  if (existsSync(qcReportPath)) oks.push('có qc-report.md');
  finish('KẾT QUẢ ĐỦ', 'KẾT QUẢ CHƯA ĐỦ');
}

if (wantResult) checkResult();

if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`LỖI   Không có ${rel(dir)} — PO chưa tạo ticket ${id}.`);
  process.exit(1);
}

// 1. File bắt buộc
for (const f of ['index.html', 'specs/brief.html', 'specs/scope.html', 'specs/acceptance.html']) {
  const p = join(dir, f);
  if (!existsSync(p)) { errors.push(`Thiếu ${f}`); continue; }
  const ph = placeholders(read(p));
  if (ph.length) errors.push(`${f} còn chỗ giữ chỗ chưa điền: ${ph.slice(0, 5).join(', ')}`);
  else oks.push(f);
}
if (!existsSync(join(dir, 'specs', 'index.html'))) warns.push('Chưa có spec kỹ thuật specs/index.html — chỉ làm khi PO bảo làm thẳng từ ticket');

const { acs, slices, sliceIds } = ticketCodes();
const sliceDir = join(dir, 'specs', 'slices');
if (!slices.length) errors.push('specs/slices/ không có slice nào (cần ít nhất một SNN-<slug>.html)');

// 2. Trang ticket: trạng thái, liên kết, mọi file trong hồ sơ đều được liệt kê
const indexPath = join(dir, 'index.html');
if (existsSync(indexPath)) {
  const idx = read(indexPath);
  const st = kv(idx, 'Trạng thái');
  if (!st) errors.push('index.html thiếu dòng “Trạng thái”');
  else if (st.includes('·')) errors.push(`index.html: trạng thái chưa chọn (“${st}”)`);
  else if (/^Sẵn sàng/.test(st)) oks.push(`trạng thái: ${st}`);
  else errors.push(`index.html: ${st} — PO xử lý theo mục Cổng sẵn sàng, Còn mở rồi chạy lại spec-clarify-skill ${id}`);

  const hrefs = new Set();
  for (const m of idx.matchAll(/href="([^"#]+)(#[^"]*)?"/g)) {
    const h = m[1].split('?')[0];
    if (/^(https?:|mailto:)/.test(h)) continue;
    const target = resolve(dir, h);
    const inside = !h.startsWith('../');
    if (inside) hrefs.add(h);
    if (!existsSync(target)) (inside ? errors : warns).push(`index.html liên kết tới ${h} nhưng file không có`);
  }
  const listed = new Set([...idx.matchAll(/href="specs\/slices\/(S\d{2})-[^"]+"/g)].map((m) => m[1]));
  for (const s of sliceIds) if (!listed.has(s)) warns.push(`${s} có trong specs/slices/ nhưng index.html không liên kết tới`);
  for (const f of walk(dir)) {
    const r = relative(dir, f).replaceAll('\\', '/');
    if (r === 'index.html' || r.endsWith('.gitkeep') || /^specs\/\d{2}-/.test(r)) continue;
    if (!hrefs.has(r)) warns.push(`index.html chưa liên kết tới ${r} (mục “Tài liệu trong hồ sơ”)`);
  }
  const ticketAcs = new Set(idx.match(new RegExp(`${id}-AC\\d+`, 'g')) || []);
  if (!ticketAcs.size) warns.push(`index.html chưa nêu AC ${id}-ACNN nào`);
  const missing = [...ticketAcs].filter((a) => !acs.has(a));
  if (missing.length) warns.push(`AC của ticket chưa có trong acceptance.html: ${missing.join(', ')} — phải nằm ở “Ngoài phạm vi”`);
}

// 3. Từng slice: không còn chỗ giữ chỗ, có mục Kiểm
for (const f of slices) {
  const t = read(join(sliceDir, f));
  const ph = placeholders(t);
  if (ph.length) errors.push(`specs/slices/${f} còn chỗ giữ chỗ: ${ph.slice(0, 5).join(', ')}`);
  const kiem = h2Body(t, 'Kiểm');
  if (!kiem || !text(kiem)) errors.push(`specs/slices/${f} thiếu mục “Kiểm” (lệnh kiểm)`);
}

// 4. AC → slice (theo acceptance.html)
const accPath = join(dir, 'specs', 'acceptance.html');
if (existsSync(accPath)) {
  for (const cells of rows(read(accPath))) {
    const ac = text(cells[0] || '');
    if (!acs.has(ac)) continue;
    const refs = [...text(cells.slice(1).join(' ')).matchAll(/\bS\d{2}\b/g)].map((x) => x[0]);
    if (!refs.length) errors.push(`${ac} chưa thuộc slice nào (acceptance.html)`);
    for (const r of refs) if (!sliceIds.has(r)) errors.push(`${ac} trỏ tới ${r} nhưng specs/slices/ không có ${r}-*.html`);
  }
  if (!acs.size) errors.push('specs/acceptance.html không có dòng AC nào');
  else oks.push(`${acs.size} AC có slice`);
}

// 5. Phạm vi và EC → slice (theo scope.html)
const scopePath = join(dir, 'specs', 'scope.html');
if (existsSync(scopePath)) {
  const scope = read(scopePath);
  for (const h of ['Phạm vi', 'Ngoài phạm vi', 'Edge case']) if (h2Body(scope, h) === null) errors.push(`specs/scope.html thiếu mục “${h}”`);
  let ecs = 0;
  for (const cells of rows(h2Body(scope, 'Edge case') || '')) {
    const ec = text(cells[0] || '');
    if (!/^EC\d+$/.test(ec)) continue;
    ecs++;
    const refs = [...text(cells[cells.length - 1] || '').matchAll(/\bS\d{2}\b/g)].map((x) => x[0]);
    if (!refs.length) warns.push(`${ec} chưa thuộc slice nào (scope.html)`);
    for (const r of refs) if (!sliceIds.has(r)) errors.push(`${ec} trỏ tới ${r} nhưng specs/slices/ không có ${r}-*.html`);
  }
  if (!ecs) warns.push('specs/scope.html chưa có edge case nào — chắc chắn ticket không có trường hợp biên?');
  else oks.push(`${ecs} edge case`);
}

// 6. others/issues.html — phiếu vấn đề chưa chốt
const issuesPath = join(dir, 'others', 'issues.html');
if (existsSync(issuesPath)) {
  const html = read(issuesPath);
  for (const m of html.matchAll(/<article class="issue" id="[^"]*" data-issue="(I\d+)">([\s\S]*?)<\/article>/g)) {
    const st = kv(m[2], 'Trạng thái');
    const block = kv(m[2], 'Chặn');
    if (/^Đã chuyển/.test(st)) continue;
    if (/^có/.test(block)) errors.push(`others/issues.html ${m[1]} chưa chốt và chặn: ${block} — PO trả lời phiếu rồi chạy lại spec-clarify-skill ${id}`);
    else warns.push(`others/issues.html ${m[1]} còn mở (${st || 'không rõ trạng thái'}; không chặn slice)`);
  }
}

// 7. designs/
if (!existsSync(join(dir, 'designs', 'notes.html'))) warns.push('Thiếu designs/notes.html (ghi “Không có” nếu không có gì)');
if (existsSync(join(dir, 'designs', 'sketch.html'))) warns.push('designs/sketch.html là file mẫu — đổi tên theo màn hoặc xoá');

// 8. Kết quả đã có của lần trước
const prev = join(out, 'report.md');
if (existsSync(prev)) {
  const st = (read(prev).match(/\*\*Trạng thái:\*\*\s*(.+)/) || [, 'không rõ'])[1].trim();
  if (/^Xong/.test(st)) warns.push(`agent/execution/${id}/report.md: “${st}” — chỉ chạy lại khi có việc sửa (QC, PO); ghi “Lần N”`);
  else oks.push(`kết quả lần trước: ${st}`);
}
if (existsSync(join(out, 'qc-report.md'))) warns.push(`Có agent/execution/${id}/qc-report.md — đọc việc còn lại ở lần mới nhất trước khi làm`);

finish('ĐỦ để thực thi', 'CHƯA ĐỦ để thực thi');
