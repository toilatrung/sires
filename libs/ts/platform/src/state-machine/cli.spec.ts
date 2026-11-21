// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runCli } from './cli';
import { defineStateMachine, type StateMachineDeclaration } from './define';

const TESTDATA = join(__dirname, 'testdata');
const MODULE = join(TESTDATA, 'state-machines.mjs');
const GOLDEN = readFileSync(join(TESTDATA, 'golden.txt'), 'utf8').replaceAll('\r', '');
const DECLARATIONS = JSON.parse(readFileSync(join(TESTDATA, 'golden-machines.json'), 'utf8')) as StateMachineDeclaration[];

const scratch = mkdtempSync(join(tmpdir(), 'sires-state-transition-sql-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function run(argv: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  const code = await runCli(argv, {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    cwd,
  });
  return { code, stdout, stderr };
}

describe('sires-state-transition-sql (runCli)', () => {
  it('in SQL', async () => {
    expect(await run([MODULE])).toEqual({ code: 0, stdout: GOLDEN, stderr: '' });
    expect(await run([MODULE, 'stateMachines'])).toEqual({ code: 0, stdout: GOLDEN, stderr: '' });
    // Relative path, resolved from the working directory.
    expect(await run(['testdata/state-machines.mjs'], __dirname)).toEqual({ code: 0, stdout: GOLDEN, stderr: '' });
  });

  it('in SQL từ module CommonJS chứa machine đã định nghĩa', async () => {
    // Shape of a service build (tsc, CommonJS): exports set on `exports`, items already passed through defineStateMachine.
    const defined = DECLARATIONS.map((d) => defineStateMachine(d));
    const file = join(scratch, 'machines.cjs');
    writeFileSync(
      file,
      `"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nexports.stateMachines = ${JSON.stringify(defined)};\n`,
    );
    expect(await run([file])).toEqual({ code: 0, stdout: GOLDEN, stderr: '' });
  });

  it('lỗi module', async () => {
    const cases: [string, string[], RegExp][] = [
      ['không có tham số', [], /sai tham số/],
      ['thừa tham số', [MODULE, 'stateMachines', 'x'], /sai tham số/],
      ['đường dẫn không có', [join(scratch, 'missing.js')], /không nạp được module/],
      ['export không có', [MODULE, 'missingExport'], /không có export "missingExport"/],
      ['export không phải mảng', [MODULE, 'notAList'], /không phải danh sách machine/],
      ['danh sách rỗng', [MODULE, 'emptyList'], /danh sách machine rỗng/],
      ['khai báo sai', [MODULE, 'wrongDeclaration'], /"Sample Task"/],
      ['hai machine trùng tên', [MODULE, 'duplicateNames'], /trùng tên/],
    ];
    for (const [name, argv, reason] of cases) {
      const result = await run(argv);
      expect(result.code, name).toBe(1);
      expect(result.stdout, name).toBe('');
      expect(result.stderr, name).toMatch(/^sires-state-transition-sql: /);
      expect(result.stderr, name).toMatch(reason);
    }

    const broken = join(scratch, 'broken.mjs');
    writeFileSync(broken, 'throw new Error("hỏng lúc nạp");\n');
    const result = await run([broken]);
    expect(result).toMatchObject({ code: 1, stdout: '' });
    expect(result.stderr).toContain('hỏng lúc nạp');
  });
});
