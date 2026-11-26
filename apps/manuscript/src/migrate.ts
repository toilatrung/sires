// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Điểm vào của Job migration (PID-00010; PID-00030 S01, H3): node dist/migrate.js, DSN ở DATABASE_MIGRATOR_URL.
import { runMigrationCommand } from './db/migrate';

void runMigrationCommand({
  env: process.env,
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
}).then((code) => {
  process.exitCode = code;
});
