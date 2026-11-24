// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
const { createRequire } = require('node:module');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { existsSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '../../..');
const prod = join(root, '.nx/pid00018-prod');
const req = createRequire(join(root, 'apps/audit/package.json'));
const { startPostgres } = req('@sires/testing');
const { Client } = req('pg');
const exec = promisify(execFile);

(async () => {
  assert.equal(existsSync(join(prod, 'node_modules/drizzle-kit')), false);
  assert.ok(existsSync(join(prod, 'migrations/meta/_journal.json')));
  const server = await startPostgres({extensions:[]});
  const admin = new Client({connectionString:server.connectionUri});
  try {
    await admin.connect();
    await admin.query(`CREATE ROLE sires_audit_owner NOLOGIN;
      CREATE ROLE sires_audit_app LOGIN PASSWORD 'test-only';
      CREATE ROLE sires_audit_system LOGIN BYPASSRLS PASSWORD 'test-only';
      CREATE ROLE sires_audit_purge LOGIN BYPASSRLS;
      CREATE ROLE sires_audit_migrator LOGIN PASSWORD 'test-only';
      GRANT sires_audit_owner TO sires_audit_migrator;
      ALTER ROLE sires_audit_migrator SET role = 'sires_audit_owner';`);
    await admin.query('CREATE DATABASE audit_production OWNER sires_audit_owner');
    const url = new URL(server.connectionUri);
    url.username = 'sires_audit_migrator'; url.password = 'test-only'; url.pathname = '/audit_production';
    const options = {cwd:tmpdir(), env:{...process.env,DATABASE_MIGRATOR_URL:url.toString()}};
    const first = await exec(process.execPath, [join(prod,'dist/migrate.js')], options);
    const second = await exec(process.execPath, [join(prod,'dist/migrate.js')], options);
    assert.match(first.stdout, /áp 1 migration mới/);
    assert.match(second.stdout, /áp 0 migration mới/);
    assert.equal(first.stderr + second.stderr, '');
    const prodRequire = createRequire(join(prod,'package.json'));
    const {createServiceApp} = prodRequire('@sires/platform');
    const {AppModule} = require(join(prod,'dist/app.module.js'));
    const serviceUrl = (role) => { const value = new URL(url); value.username='sires_audit_'+role; return value.toString(); };
    process.env.DATABASE_APP_URL = serviceUrl('app');
    process.env.DATABASE_SYSTEM_URL = serviceUrl('system');
    process.env.DATABASE_MIGRATOR_URL = url.toString();
    const app = await createServiceApp(AppModule,{name:'audit',port:0},{logDestination:{write:()=>{}}});
    try {
      await app.listen(0,'127.0.0.1');
      const response = await fetch((await app.getUrl())+'/health');
      assert.equal(response.status,200);
      assert.deepEqual(await response.json(),{service:'audit',status:'ok'});
    } finally { await app.close(); }
    const result = {node:process.version, platform:process.platform, drizzleKitAbsent:true, migrationsIncluded:true,
      first:first.stdout.trim(),second:second.stdout.trim(),healthStatus:200,exitCode:0};
    writeFileSync(join(__dirname,'production-validation.json'), JSON.stringify(result,null,2)+'\n');
    process.stdout.write(JSON.stringify(result)+'\n');
  } finally { await admin.end(); await server.stop(); }
})().catch((error) => { process.stderr.write(String(error)+'\n'); process.exitCode=1; });
