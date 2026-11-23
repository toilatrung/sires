// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nx = require.resolve('nx/bin/nx.js');
const [target, selected = ''] = process.argv.slice(2);
const affected = new Set(selected.split(',').filter(Boolean));
const candidates = JSON.parse(execFileSync(process.execPath, [
  nx, 'show', 'projects', '--with-target', target, '--json',
], { encoding: 'utf8' }));
const projects = candidates.filter((project) => affected.has(project));
if (projects.length) {
  const result = spawnSync(process.execPath, [
    nx, 'run-many', '-t', target, '--projects', projects.join(','),
  ], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  console.log(`Không có project bị ảnh hưởng khai target ${target}.`);
}
