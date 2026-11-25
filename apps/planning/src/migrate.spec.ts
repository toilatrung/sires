// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00023 S07 (EC01, EC25): lệnh migrate của Job migration — cùng hàm mà src/migrate.ts (node dist/migrate.js)
// gọi — chạy được trên database rỗng chỉ với DSN ở DATABASE_MIGRATOR_URL, chạy lại không đổi gì. Cần Docker.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXPECTED_TABLES, listTables, type PlanningPostgres, startPlanningPostgres } from './db/database.testkit';
import { MIGRATIONS_FOLDER, MIGRATOR_URL_ENV, runMigrationCommand } from './db/migrate';

const APP_ROOT = join(__dirname, '..');

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: { stdout: (l: string) => stdout.push(l), stderr: (l: string) => stderr.push(l) } };
}

describe('lệnh migrate', () => {
  let pg: PlanningPostgres;
  const database = 'planning_migrate_command';

  beforeAll(async () => {
    pg = await startPlanningPostgres();
    await pg.createDatabase(database);
  }, 180_000);

  afterAll(async () => {
    await pg?.stop();
  });

  it('lệnh migrate trên database rỗng', async () => {
    const first = capture();
    expect(await runMigrationCommand({ env: { [MIGRATOR_URL_ENV]: pg.url(database) }, ...first.io })).toBe(0);
    expect(first.stderr).toEqual([]);
    expect(first.stdout).toEqual(['planning migrate: áp 3 migration mới, đã ghi sổ 3']);
    expect(await listTables(pg, database)).toEqual([...EXPECTED_TABLES]);
    const schema = await pg.dumpSchema(database);

    // Job migration chạy trước mỗi lần deploy: lần hai không áp gì, không lỗi, schema giữ nguyên (EC01).
    const second = capture();
    expect(await runMigrationCommand({ env: { [MIGRATOR_URL_ENV]: pg.url(database) }, ...second.io })).toBe(0);
    expect(second.stdout).toEqual(['planning migrate: áp 0 migration mới, đã ghi sổ 3']);
    expect(await pg.dumpSchema(database)).toBe(schema);
  });

  it('lệnh migrate trên database rỗng — thiếu DSN thì mã thoát 1', async () => {
    for (const env of [{}, { [MIGRATOR_URL_ENV]: '  ' }]) {
      const run = capture();
      expect(await runMigrationCommand({ env, ...run.io })).toBe(1);
      expect(run.stdout).toEqual([]);
      expect(run.stderr).toEqual([`planning migrate: thiếu biến môi trường ${MIGRATOR_URL_ENV} (DSN của vai trò migrator)`]);
    }
  });

  it('lệnh migrate trên database rỗng — image có đủ thứ lệnh cần (EC25)', () => {
    // Thư mục migrations của bản build (dist/db → gốc app) là thư mục migrations/ của app.
    expect(MIGRATIONS_FOLDER).toBe(join(APP_ROOT, 'migrations'));
    const pkg = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as {
      files: string[];
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    // pnpm deploy --prod chỉ chép `files` và phụ thuộc chạy: dist/, migrations/ (gồm meta/_journal.json),
    // drizzle-orm và pg có mặt; drizzle-kit chỉ ở devDependencies.
    expect(pkg.files).toEqual(expect.arrayContaining(['dist', 'migrations']));
    expect(Object.keys(pkg.dependencies)).toEqual(expect.arrayContaining(['drizzle-orm', 'pg']));
    expect(Object.keys(pkg.dependencies)).not.toContain('drizzle-kit');
    expect(Object.keys(pkg.devDependencies)).toContain('drizzle-kit');
    expect(pkg.scripts.migrate).toBe('node dist/migrate.js');

    const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as {
      entries: { tag: string }[];
    };
    expect(journal.entries.map((entry) => entry.tag)).toEqual(['0000_init', '0001_state_transition', '0002_ec09_jsonb_helpers']);

    // migration.command của deploy/values.yaml trùng script migrate (cùng điểm vào dist/migrate.js).
    const values = readFileSync(join(APP_ROOT, 'deploy', 'values.yaml'), 'utf8').replace(/\r\n/g, '\n');
    expect(values).toMatch(/^migration:\n {2}enabled: true\n {2}command: \["node", "dist\/migrate\.js"\]$/m);
  });
});
