// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import { appendFileSync, readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const report = readJson(process.argv[2]);
const exceptions = readJson(new URL('./dependency-exceptions.json', import.meta.url));
for (const entry of exceptions) {
  if (![entry.id, entry.package, entry.reason].every((value) => typeof value === 'string' && value.trim())) {
    throw new Error('Ngoại lệ cần id, package và reason.');
  }
}

const results = report.Results ?? [];
for (const lockfile of ['pnpm-lock.yaml', 'uv.lock']) {
  if (!results.some(({ Target }) => Target === lockfile || Target.startsWith(`${lockfile} (`))) {
    throw new Error(`Báo cáo Trivy thiếu kết quả cho ${lockfile}.`);
  }
}

const escape = (cell) => String(cell ?? '—').replace(/[\r\n]+/g, ' ').replaceAll('|', '&#124;').replaceAll('<', '&lt;');
const lines = [
  '| Lock file | Mã | Gói | Phiên bản | Mức | Bản sửa | Quyết định |',
  '| --- | --- | --- | --- | --- | --- | --- |',
];
let blocked = false;
for (const { Target, Vulnerabilities } of results) {
  for (const finding of Vulnerabilities ?? []) {
    const { VulnerabilityID: id, PkgName: name, InstalledVersion: version, Severity: severity, FixedVersion: fix } = finding;
    const exception = exceptions.find((entry) => entry.id === id && entry.package === name);
    const required = ['HIGH', 'CRITICAL'].includes(severity) && Boolean(fix?.trim());
    blocked ||= required && !exception;
    lines.push(`| ${[Target, id, name, version, severity, fix || 'Chưa có', exception?.reason ?? (required ? 'Chặn' : 'Thông tin')].map(escape).join(' | ')} |`);
  }
}
const summary = lines.join('\n') + '\n';
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
else console.log(summary);
if (blocked) {
  console.error('Có lỗ hổng High hoặc Critical đã có bản sửa và chưa có ngoại lệ.');
  process.exitCode = 1;
}
