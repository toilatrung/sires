// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import { describe, expect, it } from 'vitest';
import { abstractFromIndex, completeness, normalize, PacedClient, runSource, summarize } from './free-sources.mjs';

describe('PID-00025-AC01 — phép đo và INT-SCHOLAR-003', () => {
  it('key chỉ ở header; bằng chứng và lỗi che key nếu server phản chiếu', async () => {
    const key = 'fake-test-key-123';
    let sentHeaders: object | undefined;
    const client = new PacedClient('semantic-scholar', {
      headers: { 'x-api-key': key }, secrets: [key], wait: async () => {},
      fetcher: async (_url, options) => {
        sentHeaders = options.headers;
        return new Response(JSON.stringify({ message: key }), { status: 429 });
      },
    });
    await expect(client.get('https://example.org')).rejects.toThrow('HTTP 429');
    expect(sentHeaders).toEqual({ 'x-api-key': key });
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

  it('EC01/EC02: 429 dừng nguồn, lưu Retry-After và không gọi truy vấn tiếp', async () => {
    let calls = 0;
    const client = new PacedClient('semantic-scholar', {
      fetcher: async () => { calls++; return new Response('{"message":"throttled"}', { status: 429, headers: { 'Retry-After': '60' } }); },
      wait: async () => {},
    });
    const run = await runSource('semantic-scholar', client);
    expect(calls).toBe(1);
    expect(run.results[0].outcome).toBe('error');
    expect(run.results.slice(1).every(row => row.outcome === 'not-attempted-after-stop')).toBe(true);
    expect(run.requests[0].headers['retry-after']).toBe('60');
    expect(summarize(run)).toMatchObject({ planned: 9, successful: 0, nonempty: 0, notAttempted: 8 });
    await expect(client.get('https://example.org')).rejects.toThrow('source stopped');
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
