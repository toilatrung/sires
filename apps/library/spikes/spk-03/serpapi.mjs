// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { evidenceDir } from './free-sources.mjs';

const ACCOUNT_FIELDS = ['account_status', 'plan_name', 'plan_monthly_price', 'searches_per_month', 'plan_searches_left', 'total_searches_left', 'extra_credits', 'this_month_usage', 'this_hour_searches', 'account_rate_limit_per_hour'];
export const MAX_SEARCHES = 7;
export const EXAMPLE_PROFILE = 'https://scholar.google.com/citations?user=LSsXyncAAAAJ';

export function profileAuthorId(value) {
  const url = new URL(value);
  const id = url.searchParams.get('user');
  if (url.protocol !== 'https:' || url.host !== 'scholar.google.com' || url.username || url.password || !['/citations', '/citations/'].includes(url.pathname) || url.searchParams.getAll('user').length !== 1 || !/^[\w-]{6,64}$/.test(id ?? '')) {
    throw new Error('Expected a public HTTPS Google Scholar citations URL with one user ID');
  }
  return id;
}

export function assertFreeQuota(account, budget = MAX_SEARCHES) {
  const remainingHour = account.account_rate_limit_per_hour - account.this_hour_searches;
  if (account.account_status !== 'Active' || account.plan_monthly_price !== 0 || !/free/i.test(account.plan_name ?? '') || !Number.isSafeInteger(account.plan_searches_left) || !Number.isSafeInteger(account.total_searches_left) || account.plan_searches_left < budget || account.total_searches_left < budget || !Number.isSafeInteger(account.account_rate_limit_per_hour) || !Number.isSafeInteger(account.this_hour_searches) || remainingHour < budget) {
    throw new Error('A verified active free plan with sufficient monthly and hourly quota is required');
  }
}

export function trialPlan(profileUrl = EXAMPLE_PROFILE) {
  const authorId = profileAuthorId(profileUrl);
  const search = (id, q) => ({ id, params: { engine: 'google_scholar', q, num: '5', hl: 'en', no_cache: 'true' } });
  const profile = start => ({ id: `profile-${start}`, params: { engine: 'google_scholar_author', author_id: authorId, start: String(start), num: '20', hl: 'en', no_cache: 'true' } });
  return [
    search('keyword', 'graph neural networks'),
    search('title', '"Attention Is All You Need"'),
    search('author', 'author:"Yoshua Bengio"'),
    profile(0), profile(20),
    search('keyword-repeat', 'graph neural networks'),
    search('title-repeat', '"Attention Is All You Need"'),
  ];
}

export class SerpApiClient {
  #key;
  constructor(key, { fetcher = fetch, wait = sleep, now = Date.now } = {}) {
    if (!key) throw new Error('SERPAPI_API_KEY is required');
    this.#key = key;
    this.fetcher = fetcher;
    this.wait = wait;
    this.now = now;
    this.intervalMs = 15000;
    this.nextAt = 0;
    this.requests = [];
    this.searchAttempts = 0;
    this.stopped = false;
  }
  redact(value) {
    return value.split(this.#key).join('[REDACTED]').split(encodeURIComponent(this.#key)).join('[REDACTED]');
  }
  async request(path, params = {}, caseId = 'account') {
    if (this.stopped) throw new Error('Trial stopped; no more provider calls');
    if (!['account.json', 'search.json'].includes(path) || Object.hasOwn(params, 'api_key')) throw new Error('Unsupported SerpApi endpoint or authentication override');
    const isSearch = path === 'search.json';
    if (isSearch && this.searchAttempts >= MAX_SEARCHES) throw new Error('Trial request budget exhausted');
    await this.wait(Math.max(0, this.nextAt - this.now()));
    const start = this.now();
    this.nextAt = start + this.intervalMs;
    const url = new URL(`https://serpapi.com/${path}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    const request = { caseId, url: url.toString(), startedAt: new Date(start).toISOString() };
    this.requests.push(request);
    url.searchParams.set('api_key', this.#key);
    if (isSearch) this.searchAttempts++;
    try {
      const response = await this.fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(45000) });
      request.status = response.status;
      request.retryAfter = response.headers.get('retry-after');
      const text = this.redact(await response.text());
      let body;
      try { body = JSON.parse(text); } catch { throw new Error('Provider returned invalid JSON; account body omitted'); }
      if (!isSearch) {
        // Account API echoes the key and identity; retain only quota/plan data.
        body = Object.fromEntries(ACCOUNT_FIELDS.filter(field => Object.hasOwn(body, field)).map(field => [field, body[field]]));
      }
      request.body = JSON.stringify(body);
      if (!response.ok) throw new Error(`SerpApi HTTP ${response.status}`);
      if (isSearch && (body.error || body.search_metadata?.status !== 'Success')) throw new Error(String(body.error || 'Search did not return Success'));
      return body;
    } catch (error) {
      this.stopped = true;
      request.error = this.redact(error instanceof Error ? error.message : String(error));
      throw new Error(request.error);
    } finally { request.elapsedMs = this.now() - start; }
  }
}

export function summarizeTrial(profileUrl, results) {
  const authorId = profileAuthorId(profileUrl);
  const searches = results.filter(result => result.params.engine === 'google_scholar');
  const pages = results.filter(result => result.params.engine === 'google_scholar_author');
  const success = result => result.outcome === 'ok';
  const paperSignals = searches.filter(success).flatMap(result => result.data.organic_results ?? []);
  const articleIds = result => (result?.data?.articles ?? []).map(article => article.citation_id || article.link || `${article.title}|${article.year}`).filter(Boolean);
  const firstIds = new Set(articleIds(pages[0]));
  const newArticleCount = articleIds(pages[1]).filter(id => !firstIds.has(id)).length;
  const matchingIdentity = pages.length === 2 && pages.every(result => success(result) && result.data.search_parameters?.author_id === authorId && result.data.author?.name) && pages[0].data.author.name === pages[1].data.author.name;
  return {
    plannedSearches: results.length,
    successfulSearches: results.filter(success).length,
    cases: results.map(result => ({ id: result.id, outcome: result.outcome, results: (result.data?.organic_results ?? result.data?.articles ?? []).length, error: result.error })),
    asm01TechnicalSamplePassed: searches.length === 5 && searches.every(result => success(result) && result.data.organic_results?.length > 0),
    asm01Conclusion: 'Short technical sample only; long-term stability and applicable terms/contract require PO review',
    profile: { url: profileUrl, authorId, name: pages[0]?.data?.author?.name ?? null, pages: pages.map(page => ({ id: page.id, articles: page.data?.articles?.length ?? 0 })), matchingIdentity, secondPageNewArticles: newArticleCount },
    asm14TechnicalSamplePassed: !!(matchingIdentity && firstIds.size > 0 && newArticleCount > 0),
    metadataSignals: {
      occurrences: paperSignals.length,
      title: paperSignals.filter(paper => paper.title).length,
      sourceUrl: paperSignals.filter(paper => paper.link).length,
      snippet: paperSignals.filter(paper => paper.snippet).length,
      publicationSummary: paperSignals.filter(paper => paper.publication_info?.summary).length,
      linkedAuthorList: paperSignals.filter(paper => paper.publication_info?.authors?.length).length,
      yearInSummary: paperSignals.filter(paper => /\b(?:19|20)\d{2}\b/.test(paper.publication_info?.summary ?? '')).length,
      citationCount: paperSignals.filter(paper => Number.isInteger(paper.inline_links?.cited_by?.total)).length,
    },
  };
}

export async function runTrial(client, profileUrl = EXAMPLE_PROFILE) {
  const plan = trialPlan(profileUrl);
  let before = null;
  let after = null;
  let blockedReason = null;
  const results = [];
  try {
    before = await client.request('account.json');
    assertFreeQuota(before, plan.length);
    client.intervalMs = Math.max(client.intervalMs, Math.ceil(3600000 / before.account_rate_limit_per_hour) + 100);
  } catch (error) { blockedReason = error.message; }
  for (const item of plan) {
    if (blockedReason || client.stopped) {
      results.push({ ...item, outcome: 'not-attempted', error: blockedReason || 'Trial stopped after provider error' });
      continue;
    }
    try {
      results.push({ ...item, outcome: 'ok', data: await client.request('search.json', item.params, item.id) });
    } catch (error) { results.push({ ...item, outcome: 'error', error: error.message }); }
  }
  if (!blockedReason && !client.stopped) {
    try { after = await client.request('account.json', {}, 'account-after'); } catch { /* The request evidence records the failure. */ }
  }
  return { capturedAt: new Date().toISOString(), provider: 'SerpApi', profileUrl, budget: MAX_SEARCHES, intervalMs: client.intervalMs, before, after, blockedReason, results, requests: client.requests, summary: summarizeTrial(profileUrl, results) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const client = new SerpApiClient(process.env.SERPAPI_API_KEY);
  const evidence = await runTrial(client, process.env.SPK03_SCHOLAR_PROFILE_URL || EXAMPLE_PROFILE);
  const filename = `serpapi-trial-${evidence.capturedAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.json`;
  await writeFile(resolve(evidenceDir, filename), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify({ filename, before: evidence.before, after: evidence.after, blockedReason: evidence.blockedReason, ...evidence.summary }, null, 2) + '\n');
}
