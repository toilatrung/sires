// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Phần dùng chung của local-env.mjs và local-services.mjs: danh sách service có database, tên vai trò, DSN cục bộ
// và cách gọi docker compose (qua WSL khi ở Windows).

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const COMPOSE = 'infra/local/compose.yaml';

/** Khóa service trong tên database và vai trò, cùng thứ tự với 02-roles.sql (database 3.1). */
export const DB_SERVICES = ['gateway', 'identity', 'workspace', 'planning', 'orchestration', 'library', 'research',
  'manuscript', 'audit', 'agent_core', 'knowledge'];

/** Mật khẩu cục bộ của mọi vai trò LOGIN (02-roles.sql); chỉ cho máy phát triển. */
export const LOCAL_PASSWORD = 'sires-local';

/** `agent-core` → `agent_core`. */
export const dbKey = (service) => service.replace(/-/g, '_');
export const dbName = (key) => `sires_${dbKey(key)}`;
export const roleName = (key, kind) => `sires_${dbKey(key)}_${kind}`;

/** DSN cục bộ mặc định của một vai trò, tới database của service, qua cổng 5432 của compose. */
export function localDsn(key, kind) {
  return `postgresql://${roleName(key, kind)}:${LOCAL_PASSWORD}@localhost:5432/${dbName(key)}`;
}

/** Tham số `docker compose` chung: file compose và, khi có, project thay thế (SIRES_LOCAL_PROJECT). */
function composeArgs(args) {
  const project = process.env.SIRES_LOCAL_PROJECT?.trim();
  return ['compose', '-f', COMPOSE, ...(project ? ['-p', project] : []), ...args];
}

/**
 * Chạy `docker compose …` từ gốc repo. Windows: trong distro WSL (SIRES_WSL_DISTRO, mặc định Ubuntu-24.04).
 * `capture` trả stdout, stderr thay vì in ra; `input` đưa vào stdin.
 */
export function composeRun(args, { capture = false, input } = {}) {
  const argv = composeArgs(args);
  const [cmd, cmdArgs] = process.platform === 'win32'
    ? ['wsl.exe', ['-d', process.env.SIRES_WSL_DISTRO || 'Ubuntu-24.04', '--cd', REPO, '-e', 'docker', ...argv]]
    : ['docker', argv];
  const r = spawnSync(cmd, cmdArgs, {
    cwd: REPO,
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: capture || input !== undefined ? ['pipe', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'] : 'inherit',
  });
  if (r.error) {
    console.error(`Không chạy được ${cmd}: ${r.error.message}. Dựng môi trường bằng scripts/development/setup-windows.ps1 hoặc setup-wsl.sh.`);
    process.exit(1);
  }
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/**
 * psql trong container postgres, SQL đưa qua stdin; mặc định superuser sires qua socket; kết quả dạng -At. Nêu `host`
 * và `password` thì đăng nhập qua TCP bằng mật khẩu (pg_hba của image tin kết nối socket, loopback).
 */
export function composePsql(database, sql, { user = 'sires', host, password } = {}) {
  const env = password === undefined ? [] : ['-e', `PGPASSWORD=${password}`];
  const tcp = host === undefined ? [] : ['-h', host];
  return composeRun(['exec', '-T', ...env, 'postgres', 'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', ...tcp, '-U', user, '-d', database, '-f', '-'],
    { capture: true, input: sql });
}

/** Địa chỉ không phải loopback của container postgres (để kiểm đăng nhập bằng mật khẩu qua TCP). */
export function postgresAddress() {
  const r = composeRun(['exec', '-T', 'postgres', 'hostname', '-i'], { capture: true });
  const address = r.stdout.trim().split(/s+/)[0];
  if (r.status !== 0 || !address) throw new Error(`không lấy được địa chỉ của container postgres: ${r.stderr.trim()}`);
  return address;
}

/**
 * Chờ PostgreSQL thật nhận kết nối TCP (tối đa `timeoutMs`). Lúc chạy init, entrypoint dùng một server tạm chỉ nghe
 * socket rồi dừng nó để khởi động server thật; áp vai trò trong khoảng đó sẽ chạy chồng với init (QC #125 G1).
 */
export function waitForPostgres(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const r = composeRun(['exec', '-T', 'postgres', 'pg_isready', '-q', '-h', '127.0.0.1', '-U', 'sires'], { capture: true });
    if (r.status === 0) return true;
    if (Date.now() > deadline) return false;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  }
}

/** Container postgres của compose đang chạy. */
export function postgresRunning() {
  const r = composeRun(['ps', '--status', 'running', '-q', 'postgres'], { capture: true });
  return r.status === 0 && r.stdout.trim() !== '';
}
