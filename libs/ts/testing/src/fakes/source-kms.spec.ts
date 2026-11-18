// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LocalKms, LocalKmsError } from './local-kms';
import { FakeSourceAdapter, SourceAdapterError, type NormalizedRecord } from './source-adapter.fake';

function record(n: number, title: string, author: string, year: number): NormalizedRecord {
  return {
    title,
    authors: [{ name: author }],
    year,
    identifiers: { sourceId: `W${n}`, url: `https://openalex.org/W${n}`, doi: `10.1234/fake.${n}` },
    abstractOrSnippet: `${title} — tóm tắt giả lập ${n}.`,
    source: 'openalex',
    retrievedAt: '2026-11-11T00:00:00Z',
  };
}

const RECORDS = [
  record(1, 'Retrieval augmented generation for theses', 'Trần Thị Mai', 2024),
  record(2, 'Graph retrieval for literature review', 'Lê Văn Nam', 2023),
  record(3, 'Citation intent classification', 'Trần Thị Mai', 2021),
];

describe('FakeSourceAdapter và LocalKms', () => {
  it('nguồn giả lập và KMS cục bộ (PID-00004-AC05)', async () => {
    // Scenario rate_limited: every call returns that error, with the retry hint, and is counted.
    const limited = new FakeSourceAdapter({ records: RECORDS, scenario: 'rate_limited', retryAfterSeconds: 30 });
    await expect(limited.search('retrieval')).rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: 30 });
    await expect(limited.getRecord('10.1234/fake.1')).rejects.toBeInstanceOf(SourceAdapterError);
    expect(limited.attempts()).toBe(2);
    expect(limited.calls.map((c) => c.outcome)).toEqual(['rate_limited', 'rate_limited']);

    // LocalKms decrypts exactly what it encrypted, bound to its AAD.
    const kms = new LocalKms();
    const secret = 'sk-test-0000000000000000';
    const aad = `${'0190a000-0000-7000-8000-000000000001'}|${'0190a000-0000-7000-8000-0000000000c1'}`;
    const ciphertext = await kms.encrypt(secret, aad);
    expect(ciphertext.toString('utf8')).not.toContain(secret);
    expect((await kms.decrypt(ciphertext, aad)).toString('utf8')).toBe(secret);
    await expect(kms.decrypt(ciphertext, 'other-account|other-connection')).rejects.toBeInstanceOf(LocalKmsError);
    await expect(new LocalKms().decrypt(ciphertext, aad)).rejects.toBeInstanceOf(LocalKmsError);
    const tampered = Buffer.from(ciphertext);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0xff;
    await expect(kms.decrypt(tampered, aad)).rejects.toBeInstanceOf(LocalKmsError);
  });

  it('kịch bản tiêm lỗi một lần rồi trả kết quả lặp lại được', async () => {
    const source = new FakeSourceAdapter({ key: 'scholar_intermediary', records: RECORDS, pageSize: 1 });
    source.failNext('provider_unavailable', { times: 2, operation: 'search' });
    await expect(source.search('retrieval')).rejects.toMatchObject({ code: 'provider_unavailable' });
    await expect(source.search('retrieval')).rejects.toMatchObject({ code: 'provider_unavailable' });
    const page1 = await source.search('retrieval');
    expect(page1.items.map((r) => r.identifiers.sourceId)).toEqual(['W1']);
    expect(page1.nextPage).toBe('1');
    const page2 = await source.search('retrieval', {}, page1.nextPage);
    expect(page2.items.map((r) => r.identifiers.sourceId)).toEqual(['W2']);
    expect(page2.nextPage).toBeUndefined();
    expect(await source.search('retrieval')).toEqual(page1);
    expect(source.attempts('search')).toBe(5);

    expect((await source.search('retrieval', { yearFrom: 2024 })).items).toHaveLength(1);
    expect((await source.getRecord('10.1234/fake.3')).title).toBe('Citation intent classification');
    await expect(source.getRecord('10.1234/missing')).rejects.toMatchObject({ code: 'no_results' });
    const byAuthor = await source.listAuthorPublications('Trần Thị Mai');
    expect(byAuthor.completeness).toBe('partial');
    expect(source.capabilities()).toMatchObject({ source: 'google_scholar', available: true, accessMethod: 'contracted_intermediary' });

    source.setScenario('provider_unavailable');
    expect(source.capabilities().available).toBe(false);
  });

  it('LocalKms xoay khóa: bản cũ vẫn giải mã, khóa cố định cho kết quả lặp lại', async () => {
    const key = randomBytes(32);
    const kms = new LocalKms({ keyId: 'kek-1', key });
    const old = await kms.encrypt('dek-1');
    kms.addKey('kek-2', undefined, true);
    const fresh = await kms.encrypt('dek-2');
    expect(kms.primaryKeyId).toBe('kek-2');
    expect((await kms.decrypt(old)).toString()).toBe('dek-1');
    expect((await kms.decrypt(fresh)).toString()).toBe('dek-2');
    expect((await new LocalKms({ keyId: 'kek-1', key }).decrypt(old)).toString()).toBe('dek-1');
  });
});
