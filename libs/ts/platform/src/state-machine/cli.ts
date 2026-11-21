#!/usr/bin/env node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// sires-state-transition-sql <module.js> [export]: prints the sync SQL of the machines exported by a built JS module,
// to paste into a migration (PID-00158 S04, spec 4.4). Writes nothing else: the migration file belongs to the service.

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureStateMachine, show } from './define';
import { renderStateTransitionSql } from './sql';

/** Export read when the command gets no second argument. */
export const STATE_MACHINES_EXPORT = 'stateMachines';

export interface StateTransitionCliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  /** Base of a relative module path; defaults to process.cwd(). */
  readonly cwd?: string;
}

const USAGE = `Cách dùng: sires-state-transition-sql <module.js> [tên export, mặc định ${STATE_MACHINES_EXPORT}]`;

const PROCESS_IO: StateTransitionCliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Loads the module with import(), reads the export (each item a machine from defineStateMachine or a data declaration
 * of the same shape, passed through defineStateMachine) and writes renderStateTransitionSql to stdout. Returns the exit
 * code: 0, or 1 with the reason on stderr and nothing on stdout.
 */
export async function runCli(argv: readonly string[], io: StateTransitionCliIo = PROCESS_IO): Promise<number> {
  const fail = (reason: string): number => {
    io.stderr(`sires-state-transition-sql: ${reason}\n`);
    return 1;
  };
  if (argv.length < 1 || argv.length > 2 || !argv[0] || argv[1] === '') return fail(`sai tham số.\n${USAGE}`);
  const [modulePath, exportName = STATE_MACHINES_EXPORT] = argv as [string, string?];
  const file = resolve(io.cwd ?? process.cwd(), modulePath);

  let namespace: Record<string, unknown>;
  try {
    namespace = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  } catch (error) {
    return fail(`không nạp được module ${file}: ${messageOf(error)}`);
  }
  // A CommonJS module (the build output of a service) may expose its exports only on `default`.
  const fallback = namespace['default'];
  const value =
    exportName in namespace
      ? namespace[exportName]
      : typeof fallback === 'object' && fallback !== null && exportName in fallback
        ? (fallback as Record<string, unknown>)[exportName]
        : undefined;
  if (value === undefined) return fail(`module ${file} không có export ${show(exportName)}`);
  if (!Array.isArray(value)) {
    return fail(`export ${show(exportName)} của ${file} không phải danh sách machine (nhận ${typeof value})`);
  }

  let sql: string;
  try {
    sql = renderStateTransitionSql(value.map((item: unknown) => ensureStateMachine(item)));
  } catch (error) {
    return fail(`export ${show(exportName)} của ${file} không phải danh sách machine hợp lệ: ${messageOf(error)}`);
  }
  io.stdout(sql);
  return 0;
}

// Run only when this file is the entry point (bin or `node dist/state-machine/cli.js`), not when imported.
if (require.main === module) {
  void runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
