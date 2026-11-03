// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Generates TypeScript types from docs/api-design into src/generated (not committed).
// Public API: dist/openapi.bundled.yaml; internal API: internal/<service>.yaml.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = path.resolve(here, '../../../../docs/api-design');
const out = path.resolve(here, '../src/generated');
const SHARED = new Set(['schemas.yaml', 'responses.yaml']);

const pascal = (name) => name.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());
const LICENSE = [
  '// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.',
  '// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.',
  '// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md',
].join('\n');
const header = (source) =>
  `${LICENSE}\n\n// Generated from docs/api-design/${source} by scripts/generate.mjs. Do not edit.\n\n`;

async function emit(source, target) {
  const ast = await openapiTS(pathToFileURL(path.join(spec, source)));
  fs.mkdirSync(path.dirname(path.join(out, target)), { recursive: true });
  fs.writeFileSync(path.join(out, target), header(source) + astToString(ast));
}

fs.rmSync(out, { recursive: true, force: true });
await emit('dist/openapi.bundled.yaml', 'public.ts');
const services = fs.readdirSync(path.join(spec, 'internal'))
  .filter((f) => f.endsWith('.yaml') && !SHARED.has(f))
  .map((f) => f.replace(/\.yaml$/, ''))
  .sort();
for (const s of services) await emit(`internal/${s}.yaml`, `internal/${s}.ts`);

const index = [
  "export type * as PublicApi from './public';",
  ...services.map((s) => `export type * as ${pascal(s)}Internal from './internal/${s}';`),
].join('\n');
fs.writeFileSync(path.join(out, 'index.ts'), header('*') + index + '\n');
console.log(`contracts: public + ${services.length} internal specs -> src/generated`);
