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

/** psql trong container postgres, SQL đưa qua stdin; mặc định superuser sires; kết quả dạng -At. */
export function composePsql(database, sql, { user = 'sires' } = {}) {
  return composeRun(['exec', '-T', 'postgres', 'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database, '-f', '-'],
    { capture: true, input: sql });
}

/** Container postgres của compose đang chạy. */
export function postgresRunning() {
  const r = composeRun(['ps', '--status', 'running', '-q', 'postgres'], { capture: true });
  return r.status === 0 && r.stdout.trim() !== '';
}
