#!/usr/bin/env node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Bật, tắt môi trường cục bộ (infra/local/compose.yaml: PostgreSQL 16 + pgvector, RabbitMQ, MinIO).
// Linux, macOS: gọi docker compose trực tiếp. Windows: Docker Engine nằm trong WSL, nên chạy compose trong WSL;
// docker compose của Windows gửi đường dẫn bind mount kiểu H:\… mà dockerd trong Linux không hiểu.
// Dùng: node scripts/development/local-env.mjs up|down|ps|logs [tham số thêm cho docker compose]
//   SIRES_WSL_DISTRO: distro WSL (mặc định Ubuntu-24.04).

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMPOSE = 'infra/local/compose.yaml';
const ACTIONS = { up: ['up', '-d', '--wait'], down: ['down'], ps: ['ps'], logs: ['logs', '--tail', '100'] };

const [action, ...extra] = process.argv.slice(2);
if (!ACTIONS[action]) {
  console.error(`Dùng: node scripts/development/local-env.mjs ${Object.keys(ACTIONS).join('|')} [tham số docker compose]`);
  process.exit(2);
}

const args = ['compose', '-f', COMPOSE, ...ACTIONS[action], ...extra];
const [cmd, argv] = process.platform === 'win32'
  ? ['wsl.exe', ['-d', process.env.SIRES_WSL_DISTRO || 'Ubuntu-24.04', '--cd', REPO, '-e', 'docker', ...args]]
  : ['docker', args];

const r = spawnSync(cmd, argv, { cwd: REPO, stdio: 'inherit' });
if (r.error) {
  console.error(`Không chạy được ${cmd}: ${r.error.message}. Dựng môi trường bằng scripts/development/setup-windows.ps1 hoặc setup-wsl.sh.`);
  process.exit(1);
}
process.exit(r.status ?? 1);
