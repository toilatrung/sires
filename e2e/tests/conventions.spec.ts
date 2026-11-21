// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';

const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');

test('TS-00-02 lọc theo mã TS', () => {
  const list = (args: string[]) => JSON.parse(execFileSync(process.execPath,
    [cli, 'test', '--list', '--reporter=json', ...args], { encoding: 'utf8' }));
  const titles = (report: { suites: { specs: { title: string; tests: { projectName: string }[] }[] }[] }) =>
    report.suites.flatMap((suite) => suite.specs);
  const all = titles(list([]));
  expect(all.length).toBeGreaterThan(1);
  for (const spec of all) expect(spec.title).toMatch(/^TS-\d{2}-\d{2} /);
  const selected = titles(list(['--grep', 'TS-00-01']));
  expect(selected).toHaveLength(2);
  expect(new Set(selected.map((s) => s.title))).toEqual(new Set(['TS-00-01 web shell loads and redirects to the dashboard']));
  expect(selected.flatMap((s) => s.tests.map((t) => t.projectName)).sort()).toEqual(['en', 'vi']);
});
