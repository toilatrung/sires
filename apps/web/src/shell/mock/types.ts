// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Types of the mock API, all derived from PublicApi (@sires/contracts), so an override that drifts from the
// public OpenAPI fails typecheck (PID-00013 AC01).

import type { PublicApi } from '@sires/contracts';

type Operations = PublicApi.operations;
export type OperationId = keyof Operations & string;
export type Schemas = PublicApi.components['schemas'];

type Parameters<K extends OperationId> = Operations[K] extends { parameters: infer P } ? P : never;
type Responses<K extends OperationId> = Operations[K] extends { responses: infer R } ? R : never;
type Content<R> = R extends { content: infer C } ? C[keyof C] : undefined;
type QueryValue<V> = NonNullable<V> extends readonly unknown[] ? string[] : string;
type Strings<T> = [T] extends [never] ? Record<string, never> : T extends object ? { [P in keyof T]?: QueryValue<T[P]> } : Record<string, never>;

/** Path parameters of an operation, as the router matched them. */
export type PathParams<K extends OperationId> = Parameters<K> extends { path: infer P } ? { [X in keyof P]: string } : Record<string, never>;
/** Query parameters as sent (strings; parse numbers yourself); array parameters as string[], whatever their serialization. */
export type QueryParams<K extends OperationId> = Parameters<K> extends { query?: infer Q } ? Strings<Q> : Record<string, never>;
/** JSON request body as the client sent it, typed by the contract (not validated). */
export type RequestBody<K extends OperationId> = Operations[K] extends { requestBody?: { content: infer C } } ? C[keyof C] | undefined : undefined;
/** Declared HTTP statuses of an operation. */
export type Status<K extends OperationId> = keyof Responses<K> & number;
/** Body of response `S` of operation `K`. */
export type ResponseBodyOf<K extends OperationId, S extends Status<K>> = Content<Responses<K>[S]>;

/**
 * What an override returns: a declared status and, optionally, its body (typed by status). Without `body`, the
 * generated sample for that status is sent. A raw `Response` is sent as is.
 */
export type MockReply<K extends OperationId> =
  | { [S in Status<K>]: { status: S; body?: ResponseBodyOf<K, S>; headers?: Record<string, string>; delayMs?: number } }[Status<K>]
  | Response;

export interface MockRequest<K extends OperationId> {
  operationId: K;
  params: PathParams<K>;
  query: QueryParams<K>;
  body: RequestBody<K>;
  request: Request;
  /** Fresh copy of the generated sample body for a declared status. */
  generated: <S extends Status<K>>(status: S) => ResponseBodyOf<K, S>;
  /** Shared demo data merged from shell/mock/fixtures and every area's fixtures. */
  fixtures: Fixtures;
}

export type Resolver<K extends OperationId> = (request: MockRequest<K>) => MockReply<K> | Promise<MockReply<K>>;
export type Overrides = { [K in OperationId]?: Resolver<K> };

/** Demo rows keyed by component schema name (`ResearchProject`, `Task`, …). */
export type Fixtures = { [N in keyof Schemas]?: readonly Schemas[N][] };

/** Shape of a generated operation descriptor (`<dir>/generated/index.ts`). */
export interface OperationDescriptor {
  readonly operationId: string;
  readonly method: string;
  readonly path: string;
  readonly success: number | null;
  readonly resource?: {
    readonly schema: string;
    readonly kind: 'item' | 'page' | 'list';
    readonly idParam?: string;
    readonly scope: readonly string[];
  };
  /** Array query parameters and how they are serialized (OpenAPI `style`, `explode`). */
  readonly query?: readonly { readonly name: string; readonly style: string; readonly explode: boolean }[];
  readonly responses: { readonly [status: number]: { readonly contentType: string | null; readonly headers?: readonly string[]; readonly body?: () => unknown } };
}
export type GeneratedOperations = { readonly [operationId: string]: OperationDescriptor };

/**
 * What an area's `features/<area>/__mocks__/index.ts` exports by default. The area claims every operation of its
 * generated module and every override key; two areas claiming one operation is an error (EC10).
 */
export interface FeatureMocks {
  operations?: GeneratedOperations;
  overrides?: Overrides;
  fixtures?: Fixtures;
}
