// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import { describe, expect, it } from 'vitest';
import { abstractFromIndex, bareDoi, completeness, normalize, PacedClient, queries, runSource, sources, summarize } from './free-sources.mjs';

const work = (id: string, extra: object = {}) => ({
  id: `https://openalex.org/${id}`, title: `Paper ${id}`, publication_year: 2026,
  authorships: [{ author: { display_name: 'Author' } }], cited_by_count: 0,
  primary_location: { landing_page_url: `https://example.org/${id}`, source: null },
  abstract_inverted_index: null, doi: null, ...extra,
});

describe('PID-00025-AC01 — phép đo và INT-SCHOLAR-003', () => {
  it('DEC-60: chỉ đo OpenAlex; Semantic Scholar bị từ chối trước khi gọi mạng', async () => {
    expect(sources).toEqual(['openalex']);
    let calls = 0;
    const client = new PacedClient('semantic-scholar', { wait: async () => {}, fetcher: async () => { calls++; return new Response('{}'); } });
    await expect(runSource('semantic-scholar', client)).rejects.toThrow('DEC-60');
    expect(() => normalize('semantic-scholar', {})).toThrow('DEC-60');
    expect(calls).toBe(0);
  });

  it('đo tiếp tập query còn thiếu vẫn giữ đúng mẫu số, provenance và abstract thực', async () => {
    let calls = 0;
    const client = new PacedClient('openalex', {
      wait: async () => {},
      fetcher: async () => {
        calls++;
        return new Response(JSON.stringify({ results: [work('W1')] }));
      },
    });
    const subset = queries.filter(query => query.kind === 'keyword').slice(1);
    const run = await runSource('openalex', client, subset);
    expect(calls).toBe(2);
    expect(run.results.map(row => row.query.id)).toEqual(['bio-keyword', 'econ-keyword']);
    expect(summarize(run)).toMatchObject({ planned: 2, successful: 2, nonempty: 2, completeness: { total: 2, complete: 0 } });
  });

  it('key chỉ ở header; bằng chứng và lỗi che key nếu server phản chiếu', async () => {
    const key = 'fake-test-key-123';
    let sentHeaders: object | undefined;
    const client = new PacedClient('openalex', {
      headers: { Authorization: `Bearer ${key}` }, secrets: [key], wait: async () => {},
      fetcher: async (_url, options) => {
        sentHeaders = options.headers;
        return new Response(JSON.stringify({ message: key }), { status: 429 });
      },
    });
    await expect(client.get('https://example.org')).rejects.toThrow('HTTP 429');
    expect(sentHeaders).toEqual({ Authorization: `Bearer ${key}` });
    expect(JSON.stringify(client.requests)).not.toContain(key);
    expect(client.requests[0].body).toContain('[REDACTED]');
    const failed = new PacedClient('openalex', {
      secrets: [key], wait: async () => {},
      fetcher: async () => { throw new Error(`Failed ${key}`); },
    });
    await expect(failed.get('https://example.org')).rejects.toThrow('Failed [REDACTED]');
    expect(JSON.stringify(failed.requests)).not.toContain(key);
  });

  it('đếm abstract bắt buộc; venue và citation tùy chọn, citation 0 vẫn có dữ liệu', () => {
    const paper = normalize('openalex', {
      id: 'https://openalex.org/W1', title: 'Paper', publication_year: 2020,
      authorships: [{ author: { display_name: 'Author' } }], cited_by_count: 0,
      abstract_inverted_index: { World: [1], Hello: [0] },
    });
    expect(abstractFromIndex({ World: [1], Hello: [0] })).toBe('Hello World');
    expect(completeness([paper])).toEqual({ total: 1, complete: 1, fields: { title: 1, authors: 1, year: 1, url: 1, description: 1, venue: 0, citations: 1 } });
    expect(completeness([{ ...paper, description: null }]).complete).toBe(0);
    expect(completeness([]).complete).toBe(0);
  });

  it('EC01: 429 dừng nguồn, lưu Retry-After và không gọi truy vấn tiếp', async () => {
    let calls = 0;
    const client = new PacedClient('openalex', {
      fetcher: async () => { calls++; return new Response('{"message":"throttled"}', { status: 429, headers: { 'Retry-After': '60' } }); },
      wait: async () => {},
    });
    const run = await runSource('openalex', client);
    expect(calls).toBe(1);
    expect(run.results[0].outcome).toBe('error');
    expect(run.results.slice(1).every(row => row.outcome === 'not-attempted-after-stop')).toBe(true);
    expect(run.requests[0].headers['retry-after']).toBe('60');
    expect(summarize(run)).toMatchObject({ planned: 9, successful: 0, nonempty: 0, notAttempted: 8, rateLimit: { requestsWithHeaders: 0, retryAfter: [60] } });
    expect(summarize(run).knownItems.every(item => item.rank === 'not-measured')).toBe(true);
    await expect(client.get('https://example.org')).rejects.toThrow('source stopped');
  });

  it('known-item theo DOI của query tiêu đề và tín hiệu hạn mức từ header x-ratelimit-*', async () => {
    const limit = (remaining: number, used: number) => ({
      'x-ratelimit-limit': '1000', 'x-ratelimit-remaining': String(remaining), 'x-ratelimit-credits-used': String(used),
      'x-ratelimit-limit-usd': '0.1', 'x-ratelimit-remaining-usd': String(remaining / 10000), 'x-ratelimit-reset': '3600',
    });
    let remaining = 1000;
    const client = new PacedClient('openalex', {
      wait: async () => {},
      fetcher: async url => {
        const search = new URL(String(url)).searchParams.has('search');
        const used = search ? 10 : 1;
        remaining -= used;
        const results = String(url).includes('/authors?')
          ? [{ id: 'https://openalex.org/A1' }]
          : [
            work('W1', { doi: 'https://doi.org/10.1126/SCIENCE.1225829' }),
            // Publisher DOI alias: the reference DOI is only one of the work's location DOIs.
            work('W2', { doi: 'https://doi.org/10.1257/089533007780095556', locations: [
              { landing_page_url: 'https://doi.org/10.1257/jep.21.1.141' }, { landing_page_url: 'http://www.aeaweb.org/articles' },
            ] }),
          ];
        return new Response(JSON.stringify({ results }), { headers: limit(remaining, used) });
      },
    });
    const run = await runSource('openalex', client);
    const summary = summarize(run);
    expect(bareDoi('https://doi.org/10.1126/SCIENCE.1225829')).toBe('10.1126/science.1225829');
    expect(run.results[0].papers[1].locationDois).toEqual(['10.1257/jep.21.1.141']);
    expect(summary.knownItems).toEqual([
      { id: 'cs-title', doi: '10.48550/arXiv.1706.03762', rank: null, matchedBy: null },
      { id: 'bio-title', doi: '10.1126/science.1225829', rank: 1, matchedBy: 'primary-doi' },
      { id: 'econ-title', doi: '10.1257/jep.21.1.141', rank: 2, matchedBy: 'location-doi' },
    ]);
    expect(summary.rateLimit).toMatchObject({
      requestsWithHeaders: 12, creditsUsedTotal: 93, creditsPerRequest: { search: [10], filter: [1] },
      first: { limit: 1000, remaining: 990 }, last: { remaining: 907 }, retryAfter: [],
    });
  });

  it('xếp tuần tự cách nhau ít nhất 1500ms; không dò ngưỡng bằng burst', async () => {
    let now = 10000;
    const starts: number[] = [];
    const client = new PacedClient('openalex', {
      now: () => now,
      wait: async ms => { now += ms; },
      fetcher: async () => { starts.push(now); return new Response('{"results":[]}'); },
    });
    await client.get('https://example.org');
    await client.get('https://example.org');
    await client.get('https://example.org');
    expect(starts).toEqual([10000, 11500, 13000]);
  });

  it('tìm tác giả dùng author ID để lấy công bố, không tính author là paper', async () => {
    const urls: string[] = [];
    const client = new PacedClient('openalex', {
      wait: async () => {},
      fetcher: async url => {
        urls.push(String(url));
        return new Response(JSON.stringify({ results: String(url).includes('/authors?') ? [{ id: 'https://openalex.org/A1', display_name: 'Resolved author' }] : [] }));
      },
    });
    const run = await runSource('openalex', client);
    expect(urls.filter(url => url.includes('/authors?'))).toHaveLength(3);
    expect(urls.filter(url => url.includes('author.id%3Ahttps'))).toHaveLength(3);
    expect(summarize(run).completeness.total).toBe(0);
  });
});
