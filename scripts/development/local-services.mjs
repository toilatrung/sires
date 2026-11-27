// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Chạy cả hệ thống trên máy (PC-05 P27): `pnpm local:migrate` áp migration của mọi service có database bằng vai trò
// migrator; `pnpm local:services` build rồi chạy service với cổng theo apps/<service>/deploy/values.yaml và đợi
// /health. Biến môi trường lấy từ infra/local/.env.example, ghi đè bằng infra/local/.env (không commit) và biến của
// shell; khóa cục bộ để trống thì sinh ngẫu nhiên một lần và ghi vào infra/local/.env.

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { DB_SERVICES, REPO, dbKey, localDsn, postgresRunning } from './local-lib.mjs';

const ENV_EXAMPLE = join(REPO, 'infra', 'local', '.env.example');
const ENV_LOCAL = join(REPO, 'infra', 'local', '.env');
const HEALTH_TIMEOUT_MS = 120_000;
const DSN_KEY = /^([A-Z0-9_]+)_DATABASE_(APP|SYSTEM|MIGRATOR)_URL$/;

/** Khóa cục bộ sinh khi để trống: định dạng theo nơi đọc (identity local-kms.ts, platform service-auth, logging). */
const GENERATED = {
  IDENTITY_LOCAL_KEK: () => randomBytes(32).toString('base64'),
  SERVICE_AUTH_DEV_SEED: () => randomBytes(32).toString('base64url'),
  LOG_ACCOUNT_HASH_KEY: () => randomBytes(32).toString('hex'),
  GATEWAY_CSRF_KEY: () => randomBytes(32).toString('hex'),
};

/**
 * Service chạy được: thư mục apps/<service> có deploy/values.yaml (cổng). Node: lệnh migrate là script `migrate`
 * của package.json; Python: có alembic.ini, ứng dụng ASGI lấy từ target `dev` của project.json.
 */
export function catalog() {
  const list = [];
  for (const name of readdirSync(join(REPO, 'apps'))) {
    const dir = join(REPO, 'apps', name);
    const values = join(dir, 'deploy', 'values.yaml');
    if (!existsSync(values)) continue;
    const port = Number(readFileSync(values, 'utf8').match(/^port:\s*(\d+)/m)?.[1]);
    const key = dbKey(name);
    const entry = { name, dir, port, key, hasDb: DB_SERVICES.includes(key) };
    if (existsSync(join(dir, 'pyproject.toml'))) {
      const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
      const asgi = project.targets?.dev?.options?.command?.match(/uvicorn\s+(\S+)/)?.[1];
      list.push({ ...entry, lang: 'python', project: project.name, asgi, migrates: existsSync(join(dir, 'alembic.ini')) });
    } else {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      list.push({ ...entry, lang: 'node', project: pkg.name, migrates: Boolean(pkg.scripts?.migrate) });
    }
  }
  return list.sort((a, b) => a.port - b.port);
}

function select(list, names) {
  if (names.length === 0) return list;
  const unknown = names.filter((n) => !list.some((s) => s.name === n || s.key === n));
  if (unknown.length > 0) {
    console.error(`Không có service: ${unknown.join(', ')}. Có: ${list.map((s) => s.name).join(', ')}`);
    process.exit(2);
  }
  return list.filter((s) => names.includes(s.name) || names.includes(s.key));
}

function parseEnv(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) values[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

/** Giá trị: .env.example < infra/local/.env < shell. Khóa trống được sinh và ghi vào infra/local/.env. */
export function loadLocalEnv() {
  const values = { ...parseEnv(ENV_EXAMPLE), ...parseEnv(ENV_LOCAL) };
  for (const key of Object.keys(values)) if (process.env[key]) values[key] = process.env[key];
  const generated = [];
  for (const [key, make] of Object.entries(GENERATED)) {
    if (values[key]) continue;
    values[key] = make();
    generated.push(`${key}=${values[key]}`);
  }
  if (generated.length > 0) {
    if (!existsSync(ENV_LOCAL)) {
      writeFileSync(ENV_LOCAL, '# Giá trị cục bộ của máy này (không commit; xem .env.example). Do local-env.mjs tạo.\n');
    }
    appendFileSync(ENV_LOCAL, `${generated.join('\n')}\n`);
    console.log(`Đã sinh ${generated.map((l) => l.split('=')[0]).join(', ')} vào infra/local/.env (giữ nguyên cho lần sau).`);
  }
  return values;
}

/** Môi trường của tiến trình service: biến chung, cổng, và DSN của đúng service đó dưới tên không tiền tố. */
function serviceEnv(service, values, kinds) {
  const env = { ...process.env };
  for (const name of ['DATABASE_URL', 'DATABASE_APP_URL', 'DATABASE_SYSTEM_URL', 'DATABASE_MIGRATOR_URL']) delete env[name];
  // POSTGRES_URL là DSN superuser của compose, cho công cụ: không đưa vào tiến trình service.
  for (const [key, value] of Object.entries(values)) if (!DSN_KEY.test(key) && key !== 'POSTGRES_URL') env[key] = value;
  env.PORT = String(service.port);
  if (service.hasDb) {
    const prefix = service.key.toUpperCase();
    for (const kind of kinds) {
      env[`DATABASE_${kind.toUpperCase()}_URL`] = values[`${prefix}_DATABASE_${kind.toUpperCase()}_URL`] || localDsn(service.key, kind);
    }
    // gateway (PID-00014) đọc DSN của vai trò _app ở DATABASE_URL.
    if (service.name === 'gateway' && env.DATABASE_APP_URL) env.DATABASE_URL = env.DATABASE_APP_URL;
  }
  return env;
}

function build(services) {
  const projects = services.filter((s) => s.lang === 'node').map((s) => s.project);
  if (projects.length === 0) return 0;
  console.log(`Build ${projects.length} service Node: nx run-many -t build`);
  // nx của workspace (devDependencies gốc), gọi bằng node để không cần shell cho pnpm.cmd trên Windows.
  const nxPackage = createRequire(join(REPO, 'package.json')).resolve('nx/package.json');
  const nx = join(dirname(nxPackage), JSON.parse(readFileSync(nxPackage, 'utf8')).bin.nx);
  const r = spawnSync(process.execPath, [nx, 'run-many', '-t', 'build', `--projects=${projects.join(',')}`, '--outputStyle=static'],
    { cwd: REPO, stdio: 'inherit' });
  return r.status ?? 1;
}

/** Áp migration của service có database (mặc định mọi service), bằng vai trò migrator; `--no-build` bỏ bước build. */
export async function migrate(args) {
  const names = args.filter((a) => !a.startsWith('-'));
  const selected = select(catalog().filter((s) => s.hasDb), names);
  const runnable = selected.filter((s) => s.migrates);
  for (const s of selected.filter((x) => !x.migrates)) console.log(`bỏ qua ${s.name}: chưa có lệnh migrate`);
  if (!args.includes('--no-build') && build(runnable) !== 0) return 1;
  const values = loadLocalEnv();
  const failed = [];
  for (const s of runnable) {
    console.log(`\n== migrate ${s.name}`);
    const env = serviceEnv(s, values, ['migrator']);
    const r = s.lang === 'node'
      ? spawnSync(process.execPath, [join(s.dir, 'dist', 'migrate.js')], { cwd: s.dir, env, stdio: 'inherit' })
      : spawnSync('uv', ['run', '--no-sync', 'python', '-m', 'alembic', '-c', `apps/${s.name}/alembic.ini`, 'upgrade', 'head'],
        { cwd: REPO, env, stdio: 'inherit' });
    if (r.error || r.status !== 0) failed.push(s.name);
  }
  console.log(failed.length === 0
    ? `\nmigrate: xong ${runnable.length} service.`
    : `\nmigrate: lỗi ở ${failed.join(', ')} (${failed.length}/${runnable.length}).`);
  return failed.length === 0 ? 0 : 1;
}

async function healthy(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2_000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}

/**
 * Build rồi chạy service (mặc định cả 12), đợi /health 200. `--check`: dừng mọi service sau khi kiểm và trả mã thoát
 * (0 khi mọi service đạt); không có thì chạy tới khi Ctrl+C. `--no-build` bỏ bước build.
 */
export async function services(args) {
  const check = args.includes('--check');
  const selected = select(catalog(), args.filter((a) => !a.startsWith('-')));
  if (!postgresRunning()) console.warn('Cảnh báo: PostgreSQL của compose chưa chạy (pnpm local:up); service sẽ lỗi khi truy vấn database.');
  if (!args.includes('--no-build') && build(selected) !== 0) return 1;
  const values = loadLocalEnv();

  const running = [];
  for (const s of selected) {
    if (await healthy(s.port)) {
      running.push({ s, child: null, logs: [], failed: `cổng ${s.port} đã có tiến trình khác trả /health` });
      continue;
    }
    const env = serviceEnv(s, values, ['app', 'system']);
    const [cmd, argv] = s.lang === 'node'
      ? [process.execPath, ['dist/main.js']]
      : ['uv', ['run', '--no-sync', 'python', '-m', 'uvicorn', s.asgi, '--host', '127.0.0.1', '--port', String(s.port)]];
    const child = spawn(cmd, argv, { cwd: s.dir, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const entry = { s, child, logs: [], failed: null };
    const onData = (chunk) => {
      for (const line of chunk.toString('utf8').split(/\r?\n/).filter(Boolean)) {
        entry.logs.push(line);
        if (entry.logs.length > 40) entry.logs.shift();
        if (!check) console.log(`[${s.name}] ${line}`);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (error) => { entry.failed = `không chạy được ${cmd}: ${error.message}`; });
    child.on('exit', (code) => { entry.failed ??= `thoát với mã ${code}`; });
    running.push(entry);
  }

  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  await Promise.all(running.map(async (entry) => {
    while (!entry.failed && !entry.ok) {
      if (await healthy(entry.s.port)) entry.ok = true;
      else if (Date.now() > deadline) entry.failed = `/health chưa trả 200 sau ${HEALTH_TIMEOUT_MS / 1000} s`;
      else await new Promise((r) => setTimeout(r, 500));
    }
  }));

  console.log('\nService   Cổng   /health');
  for (const { s, ok, failed, logs } of running) {
    console.log(`${s.name.padEnd(15)} ${String(s.port).padEnd(6)} ${ok ? '200' : `LỖI — ${failed}`}`);
    if (!ok && logs.length > 0) console.log(logs.map((l) => `    [${s.name}] ${l}`).join('\n'));
  }
  const failedCount = running.filter((e) => !e.ok).length;
  const stopAll = () => running.forEach((e) => e.child && stop(e.child));
  if (check || failedCount === running.length) {
    stopAll();
    console.log(failedCount === 0 ? `\nservices: ${running.length} service trả /health 200; đã dừng.` : `\nservices: ${failedCount} service LỖI; đã dừng.`);
    return failedCount === 0 ? 0 : 1;
  }
  console.log(`\n${running.length - failedCount}/${running.length} service đang chạy. Ctrl+C để dừng.`);
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  stopAll();
  return failedCount === 0 ? 0 : 1;
}
