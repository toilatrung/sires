// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import type { LibraryInternal, PublicApi } from '@sires/contracts';

// Scripted academic source for tests (PID-00004 S03). Shape follows the SourceAdapter port of architecture 8.7;
// records are ReferenceMetadata (schema 17.6) and failures use the codes of `unavailable.code` in
// internal/library.yaml (searchSourcesTool). Answers come only from the given records, so results repeat exactly.

export type NormalizedRecord = PublicApi.components['schemas']['ReferenceMetadata'];
export type SourceCapabilities = PublicApi.components['schemas']['DiscoverySource'];
export type SourceSearchFilters = NonNullable<PublicApi.components['schemas']['DiscoverySearchRequest']['filters']>;
type SourceUnavailable = NonNullable<
  LibraryInternal.operations['searchSourcesTool']['responses'][200]['content']['application/json']['unavailable']
>;
export type SourceErrorCode = NonNullable<SourceUnavailable['code']>;
export type SourceAdapterKey = 'scholar_intermediary' | 'openalex' | 'semantic_scholar';
export type SourceOperation = 'search' | 'getRecord' | 'listAuthorPublications';

export interface SourcePage {
  items: NormalizedRecord[];
  completeness: 'complete' | 'partial';
  nextPage?: string;
}

/** Port shape from architecture 8.7. */
export interface SourceAdapter {
  readonly key: SourceAdapterKey;
  capabilities(): SourceCapabilities;
  search(query: string, filters?: SourceSearchFilters, page?: string): Promise<SourcePage>;
  getRecord(identifier: string): Promise<NormalizedRecord>;
  listAuthorPublications(author: string): Promise<SourcePage>;
}

export class SourceAdapterError extends Error {
  override readonly name = 'SourceAdapterError';

  constructor(
    readonly code: SourceErrorCode,
    readonly retryAfterSeconds?: number,
  ) {
    super(`source adapter error: ${code}`);
  }
}

/** `ok` answers from the records; any error code makes every call fail with it. */
export type SourceScenario = 'ok' | SourceErrorCode;

export interface FakeSourceAdapterOptions {
  key?: SourceAdapterKey;
  records?: readonly NormalizedRecord[];
  scenario?: SourceScenario;
  /** Carried on SourceAdapterError for the scenario (e.g. rate_limited). */
  retryAfterSeconds?: number;
  /** Items per page; default 20 (DiscoverySearchRequest.maxResults default). */
  pageSize?: number;
  capabilities?: Partial<SourceCapabilities>;
}

export interface SourceCall {
  readonly operation: SourceOperation;
  readonly args: readonly unknown[];
  readonly outcome: 'ok' | SourceErrorCode;
}

const SOURCE_NAME: Record<SourceAdapterKey, string> = {
  scholar_intermediary: 'google_scholar',
  openalex: 'openalex',
  semantic_scholar: 'semantic_scholar',
};

export class FakeSourceAdapter implements SourceAdapter {
  readonly key: SourceAdapterKey;
  /** Every call in order, with its outcome; use it to count attempts. */
  readonly calls: SourceCall[] = [];
  private readonly records: NormalizedRecord[];
  private readonly pageSize: number;
  private readonly extraCapabilities: Partial<SourceCapabilities>;
  private scenario: SourceScenario;
  private retryAfterSeconds?: number;
  private readonly oneShot: { code: SourceErrorCode; retryAfterSeconds?: number; operation?: SourceOperation }[] = [];

  constructor(options: FakeSourceAdapterOptions = {}) {
    this.key = options.key ?? 'openalex';
    this.records = structuredClone([...(options.records ?? [])]);
    this.pageSize = options.pageSize ?? 20;
    this.extraCapabilities = options.capabilities ?? {};
    this.scenario = options.scenario ?? 'ok';
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  /** Switches the persistent scenario. */
  setScenario(scenario: SourceScenario, retryAfterSeconds?: number): void {
    this.scenario = scenario;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** Makes the next `times` calls (optionally of one operation) fail with `code`, before the scenario applies. */
  failNext(code: SourceErrorCode, options: { times?: number; retryAfterSeconds?: number; operation?: SourceOperation } = {}): void {
    for (let i = 0; i < (options.times ?? 1); i += 1) {
      this.oneShot.push({ code, retryAfterSeconds: options.retryAfterSeconds, operation: options.operation });
    }
  }

  attempts(operation?: SourceOperation): number {
    return operation ? this.calls.filter((c) => c.operation === operation).length : this.calls.length;
  }

  capabilities(): SourceCapabilities {
    return {
      source: SOURCE_NAME[this.key],
      available: this.scenario !== 'provider_unavailable',
      accessMethod: this.key === 'scholar_intermediary' ? 'contracted_intermediary' : 'official_api',
      supportedFilters: ['title', 'author', 'keywords', 'yearFrom', 'yearTo'],
      supportsAuthorSearch: true,
      hasFullText: false,
      ...this.extraCapabilities,
    };
  }

  async search(query: string, filters: SourceSearchFilters = {}, page?: string): Promise<SourcePage> {
    this.gate('search', [query, filters, page]);
    const terms = words(query);
    const matches = this.records.filter(
      (r) => terms.every((t) => haystack(r).includes(t)) && matchesFilters(r, filters),
    );
    return this.paginate(matches, page, 'complete');
  }

  async getRecord(identifier: string): Promise<NormalizedRecord> {
    const found = this.records.find((r) => Object.values(r.identifiers).includes(identifier));
    this.gate('getRecord', [identifier], found ? undefined : 'no_results');
    return structuredClone(found as NormalizedRecord);
  }

  async listAuthorPublications(author: string): Promise<SourcePage> {
    this.gate('listAuthorPublications', [author]);
    const needle = author.toLowerCase();
    const matches = this.records.filter((r) => r.authors.some((a) => a.name.toLowerCase().includes(needle)));
    // Author listings are partial by nature (architecture 8.7).
    return this.paginate(matches, undefined, 'partial');
  }

  /** Records the call and throws the scripted failure, if any. */
  private gate(operation: SourceOperation, args: unknown[], fallback?: SourceErrorCode): void {
    const index = this.oneShot.findIndex((f) => f.operation === undefined || f.operation === operation);
    const injected = index >= 0 ? this.oneShot.splice(index, 1)[0] : undefined;
    const failure = injected
      ? new SourceAdapterError(injected.code, injected.retryAfterSeconds)
      : this.scenario !== 'ok'
        ? new SourceAdapterError(this.scenario, this.retryAfterSeconds)
        : fallback
          ? new SourceAdapterError(fallback)
          : undefined;
    this.calls.push({ operation, args: structuredClone(args), outcome: failure ? failure.code : 'ok' });
    if (failure) throw failure;
  }

  private paginate(matches: NormalizedRecord[], page: string | undefined, completeness: SourcePage['completeness']): SourcePage {
    const offset = page ? Number.parseInt(page, 10) : 0;
    if (!Number.isInteger(offset) || offset < 0) throw new RangeError(`invalid page token: ${page}`);
    const end = offset + this.pageSize;
    return {
      items: structuredClone(matches.slice(offset, end)),
      completeness,
      ...(end < matches.length ? { nextPage: String(end) } : {}),
    };
  }
}

function words(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}

function haystack(r: NormalizedRecord): string {
  return [r.title, r.abstractOrSnippet ?? '', ...r.authors.map((a) => a.name)].join(' ').toLowerCase();
}

function matchesFilters(r: NormalizedRecord, f: SourceSearchFilters): boolean {
  if (f.title && !r.title.toLowerCase().includes(f.title.toLowerCase())) return false;
  if (f.author && !r.authors.some((a) => a.name.toLowerCase().includes((f.author ?? '').toLowerCase()))) return false;
  if (f.keywords && !f.keywords.every((k) => haystack(r).includes(k.toLowerCase()))) return false;
  if (f.yearFrom !== undefined && (r.year === undefined || r.year < f.yearFrom)) return false;
  if (f.yearTo !== undefined && (r.year === undefined || r.year > f.yearTo)) return false;
  return true;
}
