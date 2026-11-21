// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { evidenceDir } from './free-sources.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { Cite } = require('@citation-js/core');
require('@citation-js/plugin-bibtex');
require('@citation-js/plugin-ris');
const bibtex = require('bibtex-parse-js');

export function parseCitation(input, format) {
  // Explicit format prevents arbitrary URL/DOI resolution and auto-fetch plugins.
  return new Cite(input, { forceType: format === 'bib' ? '@bibtex/text' : '@ris/file' }).data;
}
export function parseBibtex(input) { return bibtex.toJSON(input); }
export async function fixtures() {
  const directory = new URL('./fixtures/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
  return Promise.all(manifest.map(async entry => ({ ...entry, input: await readFile(new URL(entry.file, directory), 'utf8') })));
}

export async function measureParsers() {
  const rows = [];
  const inputs = await fixtures();
  for (const fixture of inputs) {
    const format = fixture.file.endsWith('.bib') ? 'bib' : 'ris';
    for (const parser of ['citation-js', 'bibtex-parse-js']) {
      if (parser === 'bibtex-parse-js' && format === 'ris') {
        rows.push({ parser, file: fixture.file, outcome: 'unsupported' });
        continue;
      }
      const start = performance.now();
      try {
        const data = parser === 'citation-js' ? parseCitation(fixture.input, format) : parseBibtex(fixture.input);
        rows.push({ parser, file: fixture.file, outcome: 'ok', elapsedMs: performance.now() - start, data });
      } catch (error) {
        rows.push({ parser, file: fixture.file, outcome: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  for (const [name, input, format] of [
    ['truncated-bib', '@article{broken, title={unterminated', 'bib'],
    ['truncated-ris', 'TY  - JOUR\nTI  - Incomplete\n', 'ris'],
    ['junk', 'not a citation', 'ris'],
  ]) {
    for (const parser of ['citation-js', 'bibtex-parse-js']) {
      if (parser === 'bibtex-parse-js' && format === 'ris') continue;
      try {
        const data = parser === 'citation-js' ? parseCitation(input, format) : parseBibtex(input);
        rows.push({ parser, file: name, outcome: 'accepted', data });
      } catch (error) { rows.push({ parser, file: name, outcome: 'rejected', error: error instanceof Error ? error.message : String(error) }); }
    }
  }
  return rows;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = await measureParsers();
  const packages = Object.fromEntries(['@citation-js/core', '@citation-js/plugin-bibtex', '@citation-js/plugin-ris', 'bibtex-parse-js'].map(name => {
    const pkg = require(`${name}/package.json`);
    return [name, { version: pkg.version, license: pkg.license }];
  }));
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(resolve(evidenceDir, 'parsers.json'), JSON.stringify({ capturedAt: new Date().toISOString(), node: process.version, packages, rows }, null, 2) + '\n');
  process.stdout.write(JSON.stringify(rows.map(({ data, ...row }) => ({ ...row, records: data?.length })), null, 2) + '\n');
}
