// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Run from the repository root after dependency installation. Exercises the actual Nx target and built CLI.
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sampleRequire = createRequire(resolve('libs/ts/sample-service/package.json'));
const { startPostgres } = sampleRequire('@sires/testing');
const { Pool } = sampleRequire('pg');

async function main() {
  const postgres = await startPostgres();
  const admin = new Pool({ connectionString: postgres.connectionUri });
  try {
    for (const suffix of ['owner', 'app', 'system', 'purge']) {
      await admin.query(`CREATE ROLE sires_sample_${suffix}`);
    }
    for (const expected of [1, 1]) {
      const exitCode = await new Promise((done, reject) => {
        const windows = process.platform === 'win32';
        const child = spawn(windows ? process.env.ComSpec : 'corepack', windows
          ? ['/d', '/s', '/c', 'pnpm nx run @sires/sample-service:migrate']
          : ['pnpm', 'nx', 'run', '@sires/sample-service:migrate'], {
          stdio: 'inherit', env: { ...process.env, NX_DAEMON: 'false', DATABASE_MIGRATOR_URL: postgres.connectionUri },
        });
        child.on('error', reject);
        child.on('exit', done);
      });
      assert.equal(exitCode, 0);
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n, expected);
    }
    process.stdout.write('Nx migrate: hai lần thành công, journal vẫn đúng một migration\n');
  } finally { await admin.end(); await postgres.stop(); }
}
main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
