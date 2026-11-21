// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import { describe, expect, it } from 'vitest';
import { assertFreeQuota, EXAMPLE_PROFILE, MAX_SEARCHES, profileAuthorId, runTrial, SerpApiClient, summarizeTrial } from './serpapi.mjs';

const freeAccount = {
  account_status: 'Active', plan_name: 'Free Plan', plan_monthly_price: 0,
  plan_searches_left: 250, total_searches_left: 250, this_hour_searches: 0,
  account_rate_limit_per_hour: 250,
};

describe('PID-00025 bổ sung — thử SerpApi trong quota miễn phí', () => {
  it('ASM-14: chỉ tách ID từ URL Scholar hợp lệ; từ chối host giả và user trùng', () => {
    expect(profileAuthorId(EXAMPLE_PROFILE)).toBe('LSsXyncAAAAJ');
    expect(() => profileAuthorId('https://scholar.google.com.evil.test/citations?user=LSsXyncAAAAJ')).toThrow();
    expect(() => profileAuthorId(`${EXAMPLE_PROFILE}&user=OtherUser123`)).toThrow();
    expect(() => profileAuthorId('http://scholar.google.com/citations?user=LSsXyncAAAAJ')).toThrow();
  });

  it('không gọi search nếu gói trả phí, thiếu quota hoặc chưa xác nhận hạn giờ', async () => {
    expect(() => assertFreeQuota({ ...freeAccount, plan_monthly_price: 25 })).toThrow();
    expect(() => assertFreeQuota({ ...freeAccount, plan_searches_left: 6 })).toThrow();
    expect(() => assertFreeQuota({ ...freeAccount, this_hour_searches: 249 })).toThrow();
    expect(() => assertFreeQuota({ ...freeAccount, account_rate_limit_per_hour: undefined })).toThrow();
    let calls = 0;
    const client = new SerpApiClient('test-secret', {
      wait: async () => {},
      fetcher: async () => { calls++; return new Response(JSON.stringify({ ...freeAccount, plan_monthly_price: 25 })); },
    });
    const evidence = await runTrial(client);
    expect(calls).toBe(1);
    expect(client.searchAttempts).toBe(0);
    expect(evidence.results.every(result => result.outcome === 'not-attempted')).toBe(true);
  });

  it('giới hạn 7 search, pace theo gói, không lưu key/identity tài khoản, kiểm hai trang khác nhau', async () => {
    const key = 'test-serpapi-private-key';
    let now = 10000;
    let searches = 0;
    const starts: number[] = [];
    const client = new SerpApiClient(key, {
      now: () => now, wait: async ms => { now += ms; },
      fetcher: async (url, options) => {
        expect(url.hostname).toBe('serpapi.com');
        expect(url.searchParams.get('api_key')).toBe(key);
        expect(options.redirect).toBe('error');
        starts.push(now);
        if (url.pathname === '/account.json') return new Response(JSON.stringify({ ...freeAccount, total_searches_left: 250 - searches, plan_searches_left: 250 - searches, api_key: key, account_email: 'private@example.test', account_id: 'private-account' }));
        searches++;
        expect(url.searchParams.get('no_cache')).toBe('true');
        if (url.searchParams.get('engine') === 'google_scholar_author') return new Response(JSON.stringify({ search_metadata: { status: 'Success' }, search_parameters: { author_id: 'LSsXyncAAAAJ' }, author: { name: 'Example Researcher' }, articles: [{ citation_id: `paper-${url.searchParams.get('start')}`, title: 'Paper' }] }));
        return new Response(JSON.stringify({ search_metadata: { status: 'Success' }, organic_results: [{ title: 'Paper', link: 'https://example.org/paper', snippet: 'Description', publication_info: { summary: 'Author — Journal, 2026', authors: [{ name: 'Author' }] }, inline_links: { cited_by: { total: 0 } } }] }));
      },
    });
    const evidence = await runTrial(client);
    expect(searches).toBe(MAX_SEARCHES);
    expect(starts.every((start, index) => index === 0 || start - starts[index - 1] >= 15000)).toBe(true);
    expect(evidence.summary).toMatchObject({ successfulSearches: 7, asm01TechnicalSamplePassed: true, asm14TechnicalSamplePassed: true, profile: { secondPageNewArticles: 1 }, metadataSignals: { occurrences: 5, citationCount: 5 } });
    const saved = JSON.stringify(evidence);
    expect(saved).not.toContain(key);
    expect(saved).not.toContain('private@example.test');
    expect(saved).not.toContain('private-account');
    await expect(client.request('search.json')).rejects.toThrow('budget exhausted');
    expect(searches).toBe(7);
  });

  it('429 dừng toàn trial và không retry hoặc gọi thêm account sau lỗi', async () => {
    const key = 'test-secret-429';
    let calls = 0;
    const client = new SerpApiClient(key, {
      wait: async () => {},
      fetcher: async () => {
        calls++;
        return calls === 1 ? new Response(JSON.stringify(freeAccount)) : new Response(JSON.stringify({ error: `Throttled ${key}` }), { status: 429 });
      },
    });
    const evidence = await runTrial(client);
    expect(calls).toBe(2);
    expect(evidence.results[0].outcome).toBe('error');
    expect(evidence.results.slice(1).every(result => result.outcome === 'not-attempted')).toBe(true);
    expect(JSON.stringify(evidence)).not.toContain(key);
    expect(evidence.after).toBeNull();
  });

  it('ASM-14 không đạt nếu provider lặp lại cùng trang, dù hai response đều Success', () => {
    const page = start => ({ id: `profile-${start}`, params: { engine: 'google_scholar_author' }, outcome: 'ok', data: { search_parameters: { author_id: 'LSsXyncAAAAJ' }, author: { name: 'Example' }, articles: [{ citation_id: 'same-paper' }] } });
    expect(summarizeTrial(EXAMPLE_PROFILE, [page(0), page(20)]).asm14TechnicalSamplePassed).toBe(false);
  });
});
