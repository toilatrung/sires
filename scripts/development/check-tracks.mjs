#!/usr/bin/env node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Lists the delivery-plan tracks a change touches and warns when more than one is involved
// (rule 1.4.1, docs/tickets/sections/01-tracks-and-boundaries.html).
// Usage: node scripts/development/check-tracks.mjs [--base <ref> | --stdin] [--strict]
//   --base    compare HEAD with this ref (default origin/main).
//   --stdin   read changed paths from stdin instead, e.g. git diff --name-only --cached | ... --stdin
//   --strict  exit 1 instead of warning (enable once CODEOWNERS is filled, rule 1.4.12).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'origin/main';
const strict = args.includes('--strict');
const fromStdin = args.includes('--stdin');

const SHARED = [
  [/^libs\/(ts\/(platform|testing)|py\/sires_common)\//, 'platform'],
  [/^libs\/ts\/contracts\//, 'contracts'],
  [/^(infra\/|\.github\/workflows\/|scripts\/development\/)/, 'infra'],
  [/^(package\.json|pnpm-workspace\.yaml|pnpm-lock\.yaml|nx\.json|tsconfig\.base\.json|eslint\.config\.mjs|pyproject\.toml|uv\.lock|\.nvmrc|\.python-version)$/, 'infra'],
  [/^eval\//, 'eval'],
  [/^e2e\//, 'e2e'],
  [/^docs\/api-design\//, 'contracts-spec'],
  [/^docs\//, 'docs'],
];

export function trackOf(file) {
  const web = file.match(/^apps\/web\/src\/features\/([^/]+)\//);
  if (web) return `web/${web[1]}`;
  if (file.startsWith('apps/web/')) return 'web/shell';
  const app = file.match(/^apps\/([^/]+)\//);
  if (app) return app[1];
  for (const [re, track] of SHARED) if (re.test(file)) return track;
  return 'repo';
}

function changedFiles() {
  if (fromStdin) return fs.readFileSync(0, 'utf8').split(/\r?\n/).filter(Boolean);
  try {
    return execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const files = changedFiles();
const tracks = [...new Set(files.map(trackOf))].sort();
// A contract PR edits the spec and regenerated types together (rule 1.4.1 exception).
const counted = tracks.filter((t) => !['docs', 'repo'].includes(t) && !(t === 'contracts' && tracks.includes('contracts-spec')));
console.log(`tracks touched: ${tracks.join(', ') || '(none)'}`);
if (counted.length > 1) {
  const msg = `PR touches ${counted.length} tracks (${counted.join(', ')}); rule 1.4.1 expects one.`;
  console.log(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `warning: ${msg}`);
  if (strict) process.exit(1);
}
