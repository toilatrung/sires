// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

// Nine fixed queries, three disciplines. Coverage is nonempty top-5 / planned
// queries, NOT recall against all publications. Author search resolves an author
// ID first and counts publications only, never author records as papers.
// Title queries carry a reference DOI: the summary reports whether that DOI is in
// the top-5 (known-item check); it is not ground truth for the other query kinds.
export const queries = [
  { id: 'cs-keyword', kind: 'keyword', text: 'graph neural networks' },
  { id: 'cs-title', kind: 'title', text: 'Attention Is All You Need', doi: '10.48550/arXiv.1706.03762' },
  { id: 'cs-author', kind: 'author', text: 'Yoshua Bengio' },
  { id: 'bio-keyword', kind: 'keyword', text: 'CRISPR genome editing' },
  { id: 'bio-title', kind: 'title', text: 'A programmable dual-RNA-guided DNA endonuclease in adaptive bacterial immunity', doi: '10.1126/science.1225829' },
  { id: 'bio-author', kind: 'author', text: 'Jennifer Doudna' },
  { id: 'econ-keyword', kind: 'keyword', text: 'causal inference economics' },
  { id: 'econ-title', kind: 'title', text: 'The Economic Lives of the Poor', doi: '10.1257/jep.21.1.141' },
  { id: 'econ-author', kind: 'author', text: 'Esther Duflo' },
];
// DEC-60 (H3 of PID-00025, 22/11/2026): OpenAlex is the default discovery source and
// Semantic Scholar is out of scope. Its 19-21/11 evidence stays in agent/execution as
// history; the code that produced it is in Git history (commit f493221).
export const sources = ['openalex'];
export function assertSource(source) {
  if (!sources.includes(source)) throw new Error(`Unsupported source "${source}": only openalex is measured (DEC-60)`);
}
const root = fileURLToPath(new URL('.', import.meta.url));
export const evidenceDir = resolve(root, '../../../..', 'agent/execution/PID-00025/evidence');

export function abstractFromIndex(index) {
  if (!index) return null;
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) words[position] = word;
  }
  return words.join(' ').trim() || null;
}

export function normalize(source, paper) {
  assertSource(source);
  return {
    id: paper.id, title: paper.title,
    authors: (paper.authorships ?? []).map(a => a.author?.display_name).filter(Boolean),
    year: paper.publication_year,
    venue: paper.primary_location?.source?.display_name ?? null,
    url: paper.primary_location?.landing_page_url || paper.doi || paper.id,
    description: abstractFromIndex(paper.abstract_inverted_index),
    citations: paper.cited_by_count ?? null, doi: paper.doi ?? null,
    // A work can carry more than one DOI (e.g. a publisher alias): the primary `doi`
    // plus DOIs of its other locations. Kept for the known-item check only.
    locationDois: [...new Set((paper.locations ?? []).map(l => doiFromUrl(l?.landing_page_url)).filter(Boolean))],
  };
}

export function bareDoi(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:/, '');
}
function doiFromUrl(value) {
  return typeof value === 'string' && /^https?:\/\/(dx\.)?doi\.org\//i.test(value) ? bareDoi(value) : null;
}

export function completeness(papers) {
  const present = {
    title: p => typeof p.title === 'string' && !!p.title.trim(),
    authors: p => p.authors?.length > 0,
    year: p => Number.isInteger(p.year),
    url: p => typeof p.url === 'string' && /^https?:\/\//.test(p.url),
    description: p => typeof p.description === 'string' && !!p.description.trim(),
    venue: p => !!p.venue,
    citations: p => typeof p.citations === 'number',
  };
  const required = ['title', 'authors', 'year', 'url', 'description'];
  return {
    total: papers.length,
    complete: papers.filter(p => required.every(key => present[key](p))).length,
    fields: Object.fromEntries(Object.entries(present).map(([key, check]) => [key, papers.filter(check).length])),
  };
}

export class SourceStopped extends Error {}

export class PacedClient {
  constructor(source, { fetcher = fetch, wait = sleep, now = Date.now, intervalMs = 1500, headers = {}, secrets = [] } = {}) {
    this.source = source;
    this.fetcher = fetcher;
    this.wait = wait;
    this.now = now;
    this.intervalMs = intervalMs;
    this.headers = headers;
    this.secrets = secrets.filter(Boolean);
    this.nextAt = 0;
    this.stopped = false;
    this.requests = [];
  }
  async get(url) {
    if (this.stopped) throw new SourceStopped('source stopped; no further requests');
    await this.wait(Math.max(0, this.nextAt - this.now()));
    const started = this.now();
    this.nextAt = started + this.intervalMs;
    const request = { url: String(url), startedAt: new Date(started).toISOString() };
    this.requests.push(request);
    try {
      const response = await this.fetcher(url, { signal: AbortSignal.timeout(25000), headers: this.headers });
      request.status = response.status;
      request.headers = Object.fromEntries([...response.headers].filter(([key]) => /^(retry-after|x-ratelimit.*|ratelimit.*)$/.test(key)));
      request.body = this.redact(await response.text());
      if (response.status === 429 || response.status === 401 || response.status === 403) {
        this.stopped = true;
        throw new SourceStopped(`HTTP ${response.status}; stop without retry`);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return JSON.parse(request.body);
    } catch (error) {
      request.error = this.redact(error instanceof Error ? error.message : String(error));
      if (error instanceof SourceStopped) throw new SourceStopped(request.error);
      throw new Error(request.error);
    } finally {
      request.elapsedMs = this.now() - started;
    }
  }
  redact(value) {
    for (const secret of this.secrets) value = value.split(secret).join('[REDACTED]');
    return value;
  }
}

function endpoint(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}
export async function runSource(source, client, querySet = queries) {
  assertSource(source);
  const results = [];
  for (const query of querySet) {
    if (client.stopped) {
      results.push({ query, outcome: 'not-attempted-after-stop', papers: [] });
      continue;
    }
    try {
      let author = null;
      let params = { search: query.text, per_page: '5' };
      if (query.kind === 'author') {
        const found = await client.get(endpoint('https://api.openalex.org/authors', { search: query.text, per_page: '5' }));
        author = found.results?.[0] ?? null;
        if (!author) { results.push({ query, outcome: 'empty-author', papers: [] }); continue; }
        params = { filter: `author.id:${author.id}`, per_page: '5' };
      }
      const body = await client.get(endpoint('https://api.openalex.org/works', params));
      const papers = (body.results ?? []).map(p => normalize(source, p));
      results.push({ query, outcome: 'ok', author, papers, completeness: completeness(papers) });
    } catch (error) {
      results.push({ query, outcome: 'error', error: error.message, papers: [] });
    }
  }
  return { source, intervalMs: client.intervalMs, results, requests: client.requests };
}

// Known-item check for queries that carry a reference DOI: rank of that DOI in the
// returned top-5 (1-based), null when absent, 'not-measured' when the query failed.
// `matchedBy` says whether it matched the work's primary DOI or a location DOI.
export function knownItems(run) {
  return run.results.filter(row => row.query.doi).map(row => {
    const base = { id: row.query.id, doi: row.query.doi };
    if (row.outcome !== 'ok') return { ...base, rank: 'not-measured', matchedBy: null };
    const target = bareDoi(row.query.doi);
    const primary = row.papers.findIndex(paper => bareDoi(paper.doi) === target);
    if (primary !== -1) return { ...base, rank: primary + 1, matchedBy: 'primary-doi' };
    const location = row.papers.findIndex(paper => (paper.locationDois ?? []).includes(target));
    return location === -1 ? { ...base, rank: null, matchedBy: null } : { ...base, rank: location + 1, matchedBy: 'location-doi' };
  });
}

// Observed limit signals from OpenAlex x-ratelimit-* response headers: the server's
// own budget and per-request cost, not a threshold probed by bursting.
export function rateLimitSignals(run) {
  const withHeaders = run.requests.filter(r => r.headers?.['x-ratelimit-limit'] !== undefined);
  const number = value => (value === undefined ? null : Number(value));
  const pick = r => (r ? {
    limit: number(r.headers['x-ratelimit-limit']), remaining: number(r.headers['x-ratelimit-remaining']),
    limitUsd: number(r.headers['x-ratelimit-limit-usd']), remainingUsd: number(r.headers['x-ratelimit-remaining-usd']),
    resetSeconds: number(r.headers['x-ratelimit-reset']),
  } : null);
  const costs = {};
  for (const r of withHeaders) {
    const kind = new URL(r.url).searchParams.has('search') ? 'search' : 'filter';
    (costs[kind] ??= new Set()).add(number(r.headers['x-ratelimit-credits-used']));
  }
  return {
    requestsWithHeaders: withHeaders.length,
    first: pick(withHeaders[0]),
    last: pick(withHeaders.at(-1)),
    creditsUsedTotal: withHeaders.reduce((sum, r) => sum + (number(r.headers['x-ratelimit-credits-used']) ?? 0), 0),
    creditsPerRequest: Object.fromEntries(Object.entries(costs).map(([kind, set]) => [kind, [...set]])),
    retryAfter: run.requests.filter(r => r.headers?.['retry-after'] !== undefined).map(r => Number(r.headers['retry-after'])),
  };
}

export function summarize(run) {
  const papers = run.results.flatMap(row => row.papers);
  const starts = run.requests.map(r => Date.parse(r.startedAt));
  return {
    source: run.source,
    planned: run.results.length,
    successful: run.results.filter(r => r.outcome === 'ok').length,
    nonempty: run.results.filter(r => r.papers.length > 0).length,
    notAttempted: run.results.filter(r => r.outcome === 'not-attempted-after-stop').length,
    completeness: completeness(papers),
    minStartGapMs: starts.length > 1 ? Math.min(...starts.slice(1).map((start, i) => start - starts[i])) : null,
    statuses: run.requests.map(r => r.status ?? 'network-error'),
    knownItems: knownItems(run),
    rateLimit: rateLimitSignals(run),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await mkdir(evidenceDir, { recursive: true });
  // Never overwrite the first-run evidence (Lần 1): stop before any network call.
  if (existsSync(resolve(evidenceDir, 'free-sources.json'))) {
    throw new Error('evidence/free-sources.json already exists (Lần 1); re-measure with remeasure.mjs');
  }
  const runs = [];
  for (const source of sources) runs.push(await runSource(source, new PacedClient(source)));
  const evidence = { capturedAt: new Date().toISOString(), node: process.version, platform: process.platform, authentication: 'none', runs };
  await writeFile(resolve(evidenceDir, 'free-sources.json'), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  const summary = runs.map(summarize);
  await writeFile(resolve(evidenceDir, 'free-sources-summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}
