// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// @vitest-environment node

// PID-00013 EC07: a production build contains no mock code and cannot turn the mock on, even with the flag set.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin, type Rollup } from 'vite';
import { afterAll, describe, expect, it, vi } from 'vitest';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outDirs: string[] = [];
afterAll(() => {
  vi.unstubAllEnvs();
  for (const dir of outDirs) fs.rmSync(dir, { recursive: true, force: true });
});

const MOCK_MODULE = /[\\/](shell[\\/]mock|__mocks__)[\\/]|[\\/]node_modules[\\/](\.pnpm[\\/])?msw/;
const MARKERS = ['x-sires-mock', 'mockServiceWorker', 'startMockWorker', 'setupWorker', 'Nguyễn Thị Minh Anh', 'mock-csrf-token'];

/** Builds apps/web like `pnpm nx run @sires/web:build` and returns the bundled module ids and the output dir. */
async function buildWeb(nodeEnv: string) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sires-web-build-'));
  outDirs.push(outDir);
  const modules: string[] = [];
  const capture: Plugin = {
    name: 'capture-modules',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk') modules.push(...Object.keys(chunk.modules));
    },
  };
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('VITE_SIRES_MOCK', '1');
  try {
    await build({
      root: webRoot, configFile: path.join(webRoot, 'vite.config.ts'), logLevel: 'silent',
      plugins: [capture], build: { outDir, emptyOutDir: true },
    });
  } finally {
    vi.unstubAllEnvs();
  }
  return { modules, outDir };
}

const fixtureArea = path.join(webRoot, 'src/shell/mock/__fixtures__/guarded-area');
const AREA_MARKER = 'SIRES_GUARDED_AREA_MOCK';

/** Builds the fixture area (mocks behind `mockEnabled`) and returns the code of every chunk. */
async function buildArea(nodeEnv: string, mode: string) {
  vi.stubEnv('NODE_ENV', nodeEnv);
  try {
    const result = await build({
      configFile: false, root: fixtureArea, logLevel: 'silent', mode,
      build: { write: false, minify: false, lib: { entry: path.join(fixtureArea, 'entry.ts'), formats: ['es'], fileName: 'entry' } },
    }) as Rollup.RollupOutput | Rollup.RollupOutput[];
    return (Array.isArray(result) ? result : [result]).flatMap((out) => out.output)
      .map((item) => (item.type === 'chunk' ? item.code : '')).join('\n');
  } finally {
    vi.unstubAllEnvs();
  }
}

describe('khu vực khai mock (S02)', () => {
  it.each(['production', 'development'])('mockEnabled bỏ mock của khu vực khỏi bản build (NODE_ENV=%s)', async (nodeEnv) => {
    expect(await buildArea(nodeEnv, 'production')).not.toContain(AREA_MARKER);
  }, 60_000);

  it('mockEnabled giữ mock của khu vực ở chế độ mock (đối chứng)', async () => {
    // Same fixture, mode mock with a non-production NODE_ENV (what the dev server runs): the mock chunk is there,
    // so the two cases above fail if the guard stops removing it.
    expect(await buildArea('development', 'mock')).toContain(AREA_MARKER);
  }, 60_000);

  it('mỗi khu vực khai mocks sau mockEnabled', () => {
    // `import.meta.env.DEV ? …` alone lets a build with NODE_ENV=development ship the area's mocks.
    const features = path.join(webRoot, 'src/features');
    for (const area of fs.readdirSync(features)) {
      const file = path.join(features, area, 'index.tsx');
      if (!fs.existsSync(file)) continue;
      for (const line of fs.readFileSync(file, 'utf8').split('\n').filter((text) => /^\s*mocks\s*:/.test(text))) {
        expect(line, area).toMatch(/mocks\s*:\s*(mockEnabled|import\.meta\.env\.DEV && import\.meta\.env\.MODE !== 'production')\s*\?/);
      }
    }
  });
});

describe('bản build (S02)', () => {
  // Vitest runs with NODE_ENV=test; the second case shows a non-production NODE_ENV still cannot bring the mock in.
  it.each(['production', 'development'])('bản build không có mock (NODE_ENV=%s)', async (nodeEnv) => {
    const { modules, outDir } = await buildWeb(nodeEnv);
    expect(modules.length).toBeGreaterThan(10);
    expect(modules.filter((id) => MOCK_MODULE.test(id))).toEqual([]);
    const files = fs.readdirSync(outDir, { recursive: true }).map(String);
    expect(files.filter((file) => /mockServiceWorker|__mocks__/.test(file))).toEqual([]);
    for (const file of files.filter((name) => /\.(js|html)$/.test(name))) {
      const text = fs.readFileSync(path.join(outDir, file), 'utf8');
      expect(MARKERS.filter((marker) => text.includes(marker)), file).toEqual([]);
    }
  }, 180_000);
});
