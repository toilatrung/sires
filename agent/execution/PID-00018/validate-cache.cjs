// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
// EC05: chỉ sửa DDL trong bản sao cô lập; không ghi docs/ của repo đang làm việc.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const workspace = fs.mkdtempSync(path.join(root, '.nx/audit-cache-'));
const copy = (file) => {
  const target = path.join(workspace,file);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.cpSync(path.join(root,file), target, {recursive:true, filter:(file)=>path.basename(file)!=='node_modules'});
};
for (const file of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','nx.json','tsconfig.base.json','eslint.config.mjs',
  'apps/audit','libs/ts/platform','libs/ts/contracts','libs/ts/testing','docs/database/ddl','docs/api-design']) copy(file);
for (const base of ['', 'apps/audit','libs/ts/platform','libs/ts/contracts','libs/ts/testing']) {
  fs.symlinkSync(path.join(root,base,'node_modules'), path.join(workspace,base,'node_modules'), process.platform==='win32'?'junction':'dir');
}
// Repo riêng để .gitignore của repo cha không loại toàn bộ bản sao nằm trong .nx/.
fs.writeFileSync(path.join(workspace,'.gitignore'), 'node_modules/\ndist/\n.nx/\n');
execFileSync('git',['init','-q',workspace]);
const nxPackage = require.resolve('nx/package.json', {paths:[root]});
const nxBin = path.resolve(path.dirname(nxPackage), JSON.parse(fs.readFileSync(nxPackage,'utf8')).bin.nx);
const run = () => spawnSync(process.execPath, [nxBin,'run','@sires/audit:test','--testNamePattern=schema','--outputStyle=stream'], {
  cwd:workspace,env:{...process.env,NX_DAEMON:'false',NX_NO_CLOUD:'true'},encoding:'utf8',maxBuffer:8e6,
});
const first = run();
if (first.status !== 0) { process.stderr.write(first.stdout+first.stderr); process.exit(1); }
assert.match(first.stdout.replace(/\x1b\[[0-9;]*m/g,''), /Tests\s+1 passed/);
const repeat = run();
assert.equal(repeat.status,0);
assert.match(repeat.stdout.replace(/\x1b\[[0-9;]*m/g,''), /nx run @sires\/audit:test[^\n]*cache/);
const ddl = path.join(workspace,'docs/database/ddl/audit.sql');
const original = fs.readFileSync(ddl,'utf8');
assert.ok(original.includes('length(summary) <= 2000'));
fs.writeFileSync(ddl, original.replace('length(summary) <= 2000','length(summary) <= 1999'));
const changed = run();
if (changed.status === 0) process.stderr.write(changed.stdout+changed.stderr);
assert.notEqual(changed.status,0);
assert.match(changed.stdout+changed.stderr, /1999/);
const result = {baselineExit:first.status,repeatExit:repeat.status,repeatUsedCache:true,modifiedDDLExit:changed.status,
  changedOnlyIsolatedCopy:true,sourceDDLUnchanged:fs.readFileSync(path.join(root,'docs/database/ddl/audit.sql'),'utf8')===original};
assert.ok(result.sourceDDLUnchanged);
fs.writeFileSync(path.join(__dirname,'cache-validation.json'),JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify(result)+'\n');
