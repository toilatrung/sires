// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { evidenceDir, PacedClient, runSource, sources, summarize } from './free-sources.mjs';

// A separate, much slower observation after the first run's cooldown. Each
// source still stops on its first 429; no route switching or automatic retry.
const intervalMs = 20000;
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
await mkdir(evidenceDir, { recursive: true });
const summaries = await Promise.all(sources.map(async source => {
  const key = source === 'openalex' ? process.env.OPENALEX_API_KEY : process.env.SEMANTIC_SCHOLAR_API_KEY;
  const headers = key ? (source === 'openalex' ? { Authorization: `Bearer ${key}` } : { 'x-api-key': key }) : {};
  const secrets = key ? [key, encodeURIComponent(key)] : [];
  const run = await runSource(source, new PacedClient(source, { intervalMs, headers, secrets }));
  const summary = summarize(run);
  const filename = `free-sources-followup-${runId}-${source}.json`;
  const evidence = {
    capturedAt: new Date().toISOString(), node: process.version, platform: process.platform,
    authentication: key ? 'environment-key-header' : 'none',
    runId, runs: [run], summary,
  };
  await writeFile(resolve(evidenceDir, filename), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify({ filename, ...summary }) + '\n');
  return { filename, ...summary };
}));
await writeFile(resolve(evidenceDir, `free-sources-followup-${runId}-summary.json`), JSON.stringify(summaries, null, 2) + '\n', { flag: 'wx' });
