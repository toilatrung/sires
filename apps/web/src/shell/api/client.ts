// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Typed client for the public API (docs/api-design/openapi.yaml, “Quy ước chung”): base /api/v1, session cookie,
// X-CSRF-Token on every write, Idempotency-Key on commands, If-Match/ETag on edits, problem+json errors.
// Path, parameters, body and response types come from PublicApi of @sires/contracts.

import type { PublicApi } from '@sires/contracts';
import { ApiError, errorFromResponse } from './errors';

export const API_BASE = '/api/v1';

type Paths = PublicApi.paths;
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
type WriteMethod = Exclude<HttpMethod, 'get'>;

type Operation<P extends keyof Paths, M extends HttpMethod> = Paths[P][M] extends infer Op
  ? Op extends { responses: unknown }
    ? Op
    : never
  : never;

/** Paths that have an operation for method M. */
export type PathsWith<M extends HttpMethod> = {
  [P in keyof Paths]: Paths[P][M] extends { responses: unknown } ? P : never;
}[keyof Paths];

type Defined<T> = Exclude<T, undefined>;
type Parameters<Op> = Op extends { parameters: infer Pr } ? Pr : never;
type PathParams<Op> = Defined<Parameters<Op> extends { path?: infer X } ? X : never>;
type QueryParams<Op> = Defined<Parameters<Op> extends { query?: infer X } ? X : never>;
type HeaderParams<Op> = Defined<Parameters<Op> extends { header?: infer X } ? X : never>;
type RequestBodyOf<Op> = Op extends { requestBody?: infer RB } ? Defined<RB> : never;
type BodyContent<Op> = [RequestBodyOf<Op>] extends [never] ? never : RequestBodyOf<Op> extends { content: infer C } ? C : never;

type JsonOf<R> = R extends { content: infer C } ? (C extends { 'application/json': infer T } ? T : undefined) : undefined;
type Responses<Op> = Op extends { responses: infer R } ? R : never;
/** JSON body of the first 2xx response (200, 201, 202), or undefined for 204. */
export type SuccessData<Op> = Responses<Op> extends infer R
  ? R extends { 200: infer X }
    ? JsonOf<X>
    : R extends { 201: infer X }
      ? JsonOf<X>
      : R extends { 202: infer X }
        ? JsonOf<X>
        : undefined
  : never;

type IsNever<T> = [T] extends [never] ? true : false;
type HasKey<T, K extends PropertyKey> = IsNever<T> extends true ? false : K extends keyof T ? true : false;

type PathPart<Op> = IsNever<PathParams<Op>> extends true ? { path?: never } : { path: PathParams<Op> };
type QueryPart<Op> = IsNever<QueryParams<Op>> extends true ? { query?: never } : { query?: QueryParams<Op> };
type BodyPart<Op> =
  IsNever<BodyContent<Op>> extends true
    ? { body?: never; contentType?: never }
    : HasKey<BodyContent<Op>, 'application/json'> extends true
      ? { body: BodyContent<Op>[keyof BodyContent<Op>]; contentType?: keyof BodyContent<Op> & string }
      : { body: BodyContent<Op>[keyof BodyContent<Op>]; contentType: keyof BodyContent<Op> & string };
type IdempotencyPart<Op> = HasKey<HeaderParams<Op>, 'Idempotency-Key'> extends true ? { idempotencyKey: string } : { idempotencyKey?: string };
type IfMatchPart<Op> = HasKey<HeaderParams<Op>, 'If-Match'> extends true ? { ifMatch: string } : { ifMatch?: string };

interface CommonOptions {
  signal?: AbortSignal;
  /** The initial session probe handles 401 itself instead of starting the session-expired flow. */
  skipUnauthenticatedHandler?: boolean;
}

/** Request options typed from the operation: path params, query, body, required Idempotency-Key and If-Match. */
export type RequestOptions<P extends keyof Paths, M extends HttpMethod> = CommonOptions &
  PathPart<Operation<P, M>> &
  QueryPart<Operation<P, M>> &
  BodyPart<Operation<P, M>> &
  IdempotencyPart<Operation<P, M>> &
  IfMatchPart<Operation<P, M>>;

export interface ApiResult<T> {
  data: T;
  status: number;
  /** ETag of the response (= rowVersion) for the next If-Match. */
  etag?: string;
}

// Options may be omitted when nothing in them is required.
type OptionalArg<P extends keyof Paths, M extends HttpMethod> =
  Record<never, never> extends RequestOptions<P, M> ? [options?: RequestOptions<P, M>] : [options: RequestOptions<P, M>];

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  fetch?: FetchLike;
  base?: string;
  /** Current CSRF token, fetched from GET /auth/session when missing (EC09). */
  csrfToken?: () => Promise<string>;
  /** Called once per 401 response, outside the initial session probe (EC08). */
  onUnauthenticated?: (error: ApiError) => void;
}

function fillPath(template: string, params: Record<string, unknown> | undefined): string {
  return template.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined || value === null) throw new Error(`Missing path parameter ${name} for ${template}`);
    return encodeURIComponent(String(value));
  });
}

function queryString(query: Record<string, unknown> | undefined): string {
  if (!query) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value.forEach((v) => search.append(key, String(v)));
    else search.append(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export class ApiClient {
  private readonly fetchImpl: FetchLike;
  private readonly base: string;
  private csrfProvider?: () => Promise<string>;
  private unauthenticatedHandler?: (error: ApiError) => void;

  constructor(options: ApiClientOptions = {}) {
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.base = options.base ?? API_BASE;
    this.csrfProvider = options.csrfToken;
    this.unauthenticatedHandler = options.onUnauthenticated;
  }

  /** Wired by the session controller. */
  setCsrfProvider(provider: () => Promise<string>): void {
    this.csrfProvider = provider;
  }

  setUnauthenticatedHandler(handler: (error: ApiError) => void): void {
    this.unauthenticatedHandler = handler;
  }

  /** Absolute path under the API base, for browser navigations (sign-in, sign-out). */
  url(path: string, query?: Record<string, unknown>): string {
    return `${this.base}${path}${queryString(query)}`;
  }

  get<P extends PathsWith<'get'>>(path: P, ...[options]: OptionalArg<P, 'get'>) {
    return this.request(path, 'get', options as RequestOptions<P, 'get'>);
  }

  post<P extends PathsWith<'post'>>(path: P, ...[options]: OptionalArg<P, 'post'>) {
    return this.request(path, 'post', options as RequestOptions<P, 'post'>);
  }

  put<P extends PathsWith<'put'>>(path: P, ...[options]: OptionalArg<P, 'put'>) {
    return this.request(path, 'put', options as RequestOptions<P, 'put'>);
  }

  patch<P extends PathsWith<'patch'>>(path: P, ...[options]: OptionalArg<P, 'patch'>) {
    return this.request(path, 'patch', options as RequestOptions<P, 'patch'>);
  }

  delete<P extends PathsWith<'delete'>>(path: P, ...[options]: OptionalArg<P, 'delete'>) {
    return this.request(path, 'delete', options as RequestOptions<P, 'delete'>);
  }

  async request<P extends keyof Paths, M extends HttpMethod>(
    path: P,
    method: M,
    options?: RequestOptions<P, M>,
  ): Promise<ApiResult<SuccessData<Operation<P, M>>>> {
    const opts = (options ?? {}) as CommonOptions & {
      path?: Record<string, unknown>;
      query?: Record<string, unknown>;
      body?: unknown;
      contentType?: string;
      idempotencyKey?: string;
      ifMatch?: string;
    };
    const headers: Record<string, string> = { Accept: 'application/json, application/problem+json' };
    const isWrite = method !== 'get';
    if (isWrite) {
      if (!this.csrfProvider) throw new Error('ApiClient: no CSRF provider for a write request');
      headers['X-CSRF-Token'] = await this.csrfProvider();
    }
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    if (opts.ifMatch) headers['If-Match'] = opts.ifMatch;
    let body: string | FormData | undefined;
    if (opts.body instanceof FormData) {
      // multipart/form-data operations (PDF upload, PID-00098): fetch sets the boundary itself.
      body = opts.body;
    } else if (opts.body !== undefined) {
      headers['Content-Type'] = opts.contentType ?? 'application/json';
      body = JSON.stringify(opts.body);
    }

    const url = `${this.base}${fillPath(String(path), opts.path)}${queryString(opts.query)}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: method.toUpperCase(),
        headers,
        body,
        credentials: 'same-origin',
        signal: opts.signal,
      });
    } catch {
      throw new ApiError('network');
    }

    if (!response.ok) {
      const error = await errorFromResponse(response);
      if (error.unauthenticated && !opts.skipUnauthenticatedHandler) this.unauthenticatedHandler?.(error);
      throw error;
    }

    const etag = response.headers.get('etag') ?? undefined;
    let data: unknown = undefined;
    if (response.status !== 204) {
      const type = response.headers.get('content-type') ?? '';
      if (type.includes('json')) {
        try {
          data = await response.json();
        } catch {
          throw new ApiError('http', { status: response.status });
        }
      }
    }
    return { data: data as SuccessData<Operation<P, M>>, status: response.status, etag };
  }
}

export type { WriteMethod };
