// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AuditPostgres, startAuditPostgres } from './db/database.testkit';
import { runMigrationCommand } from './db/migrate';

const exec = promisify(execFile);
const entry = join(__dirname, '..', 'dist', 'migrate.js');

describe('migrate CLI audit — EC13', () => {
  let pg: AuditPostgres;
  beforeAll(async () => {
    pg = await startAuditPostgres();
    await pg.createDatabase('audit_cli');
  }, 180_000);
  afterAll(async () => { await pg?.stop(); });

  it('lệnh migrate áp lên database rỗng', async () => {
    const options = {cwd:tmpdir(), env:{...process.env, DATABASE_MIGRATOR_URL:pg.url('audit_cli','migrator')}};
    const first = await exec(process.execPath, [entry], options);
    expect(first.stdout).toContain('áp 1 migration mới, đã ghi sổ 1');
    expect(first.stderr).toBe('');
    expect(await pg.query('audit_cli', "SELECT count(*)::integer AS n FROM pg_tables WHERE schemaname='app'")).toEqual([{n:8}]);
    const second = await exec(process.execPath, [entry], options);
    expect(second.stdout).toContain('áp 0 migration mới, đã ghi sổ 1');
  });

  it('thiếu cấu hình hoặc kết nối lỗi trả exit 1, không in DSN', async () => {
    const stderr: string[] = [];
    const stdout: string[] = [];
    const io = {env:{}, stdout:(line: string) => stdout.push(line), stderr:(line: string) => stderr.push(line)};
    expect(await runMigrationCommand(io)).toBe(1);
    expect(stderr.join('\n')).toContain('DATABASE_MIGRATOR_URL');
    expect(await runMigrationCommand({...io, env:{DATABASE_MIGRATOR_URL:'postgres://user:known-secret@127.0.0.1:1/absent'}})).toBe(1);
    expect(stderr.join('\n')).not.toContain('known-secret');
    expect(stdout).toEqual([]);
    await expect(exec(process.execPath, [entry], {cwd:tmpdir(), env:{...process.env,DATABASE_MIGRATOR_URL:''}})).rejects.toMatchObject({code:1});
  });
});
