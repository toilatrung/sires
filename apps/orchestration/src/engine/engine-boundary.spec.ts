// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00019-AC02, EC01: luật lint của apps/orchestration/eslint.config.mjs chặn module khác import file nội bộ của
// engine/. Chạy ESLint thật (Node API) trên đoạn mã mẫu, với cấu hình của app.

import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const APP_ROOT = join(__dirname, '..', '..');

async function lintAs(relativePath: string, code: string): Promise<string[]> {
  // enforce-module-boundaries của Nx cần project graph (không dựng được khi có .claude/worktrees); luật đó không
  // phải luật đang kiểm nên tắt riêng ở đây.
  const eslint = new ESLint({ cwd: APP_ROOT, overrideConfig: { rules: { '@nx/enforce-module-boundaries': 'off' } } });
  const [result] = await eslint.lintText(code, { filePath: join(APP_ROOT, relativePath) });
  return (result?.messages ?? []).map((m) => `${m.ruleId ?? 'fatal'}: ${m.message}`);
}

describe('engine-boundary', () => {
  it('luật chặn import nội bộ engine', async () => {
    const internal = await lintAs(
      'src/prompts/boundary-sample.ts',
      "import { EngineModule } from '../engine/engine.module';\nexport const used = EngineModule;\n",
    );
    expect(internal).toHaveLength(1);
    expect(internal[0]).toMatch(/^no-restricted-imports: .*engine\/index\.ts/);

    for (const deep of ["'../engine/workflow-engine.service'", "'../engine/sub/deep.js'", "'./engine/engine.module'"]) {
      const path = deep.startsWith("'./") ? 'src/sample.ts' : 'src/usage/boundary-sample.ts';
      expect(await lintAs(path, `import * as x from ${deep};\nexport const y = x;\n`), deep).toHaveLength(1);
    }
  }, 60_000);

  it('luật chặn import nội bộ engine — import qua engine/index.ts thì đạt', async () => {
    for (const [path, spec] of [
      ['src/prompts/boundary-sample.ts', "'../engine'"],
      ['src/deliberation/boundary-sample.ts', "'../engine/index'"],
      ['src/app.sample.ts', "'./engine'"],
    ] as const) {
      expect(await lintAs(path, `import { EngineModule } from ${spec};\nexport const used = EngineModule;\n`), spec).toEqual([]);
    }
    // Bên trong engine/ được import file của chính nó.
    expect(
      await lintAs('src/engine/sample.ts', "import { EngineModule } from './engine.module';\nexport const used = EngineModule;\n"),
    ).toEqual([]);
  }, 60_000);
});
