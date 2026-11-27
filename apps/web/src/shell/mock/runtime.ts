// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Turns generated operation descriptors, area overrides and shared fixtures into MSW handlers (PID-00013 S02).
// Handlers are stateless: every request gets a fresh copy of the sample data; behaviour with state (create then
// list, 409, 412, paging scenarios) is an area override in features/<area>/__mocks__/ (EC09).

import { delay, http, HttpResponse, type HttpHandler } from 'msw';
import { operations as allOperations, source } from './generated';
import type {
  FeatureMocks, Fixtures, GeneratedOperations, MockRequest, OperationDescriptor, OperationId, Overrides,
} from './types';

export const MOCK_HEADER = 'x-sires-mock';
export const basePath: string = source.basePath;

/** Typed identity: lets an area write its mock module with checked overrides. */
export function defineMocks(mocks: FeatureMocks): FeatureMocks {
  return mocks;
}

/** One source of mocks: the shell or a feature area. */
export interface MockSource {
  name: string;
  mocks: FeatureMocks;
}

/** Operations each source claims; throws when two sources claim one operation (EC10). */
export function claims(sources: readonly MockSource[]): Map<string, string> {
  const owner = new Map<string, string>();
  for (const { name, mocks } of sources) {
    const ids = new Set([...Object.keys(mocks.operations ?? {}), ...Object.keys(mocks.overrides ?? {})]);
    for (const id of ids) {
      if (!(id in allOperations)) throw new Error(`Mock of ${name} names an unknown operation: ${id}`);
      const previous = owner.get(id);
      if (previous) throw new Error(`Mock operation ${id} is claimed by two areas: ${previous} and ${name}`);
      owner.set(id, name);
    }
  }
  return owner;
}

type Row = Record<string, unknown> & { id?: unknown };

/** Merges fixtures by schema; an area replaces a shell row with the same id, two areas with one id is an error. */
export function mergeFixtures(base: Fixtures, sources: readonly MockSource[]): Fixtures {
  const merged = new Map<string, Map<unknown, { row: Row; from: string }>>();
  const add = (fixtures: Fixtures | undefined, from: string) => {
    for (const [schema, rows] of Object.entries(fixtures ?? {})) {
      const table = merged.get(schema) ?? new Map<unknown, { row: Row; from: string }>();
      merged.set(schema, table);
      for (const [index, row] of (rows as readonly Row[]).entries()) {
        const id = row.id ?? `${from}#${index}`;
        const previous = table.get(id);
        if (previous && previous.from !== 'shell') {
          throw new Error(`Fixture ${schema} ${String(id)} is defined by two areas: ${previous.from} and ${from}`);
        }
        table.set(id, { row, from });
      }
    }
  };
  add(base, 'shell');
  for (const { name, mocks } of sources) add(mocks.fixtures, name);
  return Object.fromEntries([...merged].map(([schema, table]) => [schema, [...table.values()].map((entry) => entry.row)])) as Fixtures;
}

const clone = <T>(value: T): T => structuredClone(value);
const toPattern = (route: string) => `*${basePath}${route.replace(/\{([^}]+)\}/g, ':$1')}`;

// Literal segments before parameters, so /plan/versions/compare is tried before /plan/versions/{id}.
function specificity(route: string) {
  return route.split('/').map((segment) => (segment.startsWith('{') ? '1' : '0')).join('');
}

function generatedBody(descriptor: OperationDescriptor, status: number): unknown {
  const body = descriptor.responses[status]?.body;
  return body ? body() : undefined;
}

function problem(descriptor: OperationDescriptor, status: number, detail?: string): Response {
  const body = (generatedBody(descriptor, status) ?? {
    type: 'https://sires.etroy.local/problems/not_found', title: 'Không tìm thấy', status, code: 'not_found',
  }) as Record<string, unknown>;
  return HttpResponse.json(detail ? { ...body, detail } : body, {
    status, headers: { 'Content-Type': 'application/problem+json', [MOCK_HEADER]: descriptor.operationId },
  });
}

// Binary and text placeholders for non-JSON success responses (EC04): never a JSON body, never a redirect to eTroy.
const PLACEHOLDERS: Record<string, () => BodyInit> = {
  'text/plain': () => '% SIRes mock\n\\documentclass{article}\n\\begin{document}\nMock content.\n\\end{document}\n',
  'text/csv': () => 'id,type,at\nmock-1,project.lifecycle_changed,2026-11-20T08:30:00Z\n',
  'image/svg+xml': () => '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#EFEAE3"/><text x="24" y="96" font-family="sans-serif" font-size="18" fill="#4D4A44">SIRes mock diagram</text></svg>',
  'application/pdf': () => '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n',
};

function nonJson(descriptor: OperationDescriptor, status: number, request: Request): Response {
  const entry = descriptor.responses[status];
  const headers: Record<string, string> = { [MOCK_HEADER]: descriptor.operationId };
  if (status === 204 || status === 205) return new HttpResponse(null, { status, headers });
  if (status >= 300 && status < 400) {
    // A mocked redirect stays inside the app; the mock never sends the browser to eTroy OIDC.
    const returnTo = new URL(request.url).searchParams.get('returnTo');
    return new HttpResponse(null, { status, headers: { ...headers, Location: returnTo?.startsWith('/') ? returnTo : '/' } });
  }
  const type = entry?.contentType ?? 'application/octet-stream';
  const body = PLACEHOLDERS[type]?.() ?? new Uint8Array([0x53, 0x49, 0x52, 0x65, 0x73]);
  return new HttpResponse(body, { status, headers: { ...headers, 'Content-Type': type } });
}

/** Gives the sample the ids the request named, so a detail screen shows the row the user opened. */
function align(value: unknown, params: Record<string, string>, idParam?: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const row = value as Row;
  for (const [name, param] of Object.entries(params)) {
    if (name in row && typeof row[name] === 'string') row[name] = param;
  }
  if (idParam && params[idParam] && typeof row.id === 'string') row.id = params[idParam];
  return row;
}

function matches(row: Row, params: Record<string, string>, scope: readonly string[]) {
  return scope.every((name) => !(name in row) || row[name] === params[name]);
}

const DELIMITERS: Record<string, string> = { form: ',', spaceDelimited: ' ', pipeDelimited: '|' };

/**
 * Query of a request as the contract declares it: array parameters (descriptor.query) become string[] split by their
 * style when explode is false (`status=A,B`), repeated keys are collected too (`status=A&status=B`), so either form
 * filters the same. Other parameters keep their last value.
 */
export function readQuery(descriptor: Pick<OperationDescriptor, 'query'>, url: URL): Record<string, string | string[]> {
  const arrays = new Map((descriptor.query ?? []).map((parameter) => [parameter.name, parameter]));
  const query: Record<string, string | string[]> = {};
  for (const name of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(name);
    const parameter = arrays.get(name);
    if (!parameter) {
      query[name] = values[values.length - 1];
      continue;
    }
    const delimiter = parameter.explode ? undefined : DELIMITERS[parameter.style];
    query[name] = values.flatMap((value) => (delimiter ? value.split(delimiter) : [value])).filter((value) => value !== '');
  }
  return query;
}

/** A row field equals a query value; array fields (tags, types) match when they contain it. */
function sameValue(field: unknown, value: string): boolean {
  return Array.isArray(field) ? field.some((item) => String(item) === value) : String(field) === value;
}

/** Answers a GET from fixtures when the shared demo data has rows of the returned schema. */
function fromFixtures(descriptor: OperationDescriptor, fixtures: Fixtures, params: Record<string, string>, url: URL): Response | undefined {
  const resource = descriptor.resource;
  const rows = resource && (fixtures as Record<string, readonly Row[] | undefined>)[resource.schema];
  if (!resource || !rows?.length || descriptor.success === null) return undefined;
  const headers = { [MOCK_HEADER]: descriptor.operationId };
  const scoped = rows.filter((row) => matches(row, params, resource.scope));
  if (resource.kind === 'item') {
    const id = resource.idParam ? params[resource.idParam] : undefined;
    const row = id === undefined ? scoped[0] : scoped.find((candidate) => candidate.id === id || candidate[resource.idParam!] === id);
    if (!row) return descriptor.responses[404] ? problem(descriptor, 404) : undefined;
    const itemHeaders: Record<string, string> = { ...headers };
    if (descriptor.responses[descriptor.success]?.headers?.includes('ETag')) itemHeaders.ETag = `"${String(row.rowVersion ?? 1)}"`;
    return HttpResponse.json(clone(row), { status: descriptor.success, headers: itemHeaders });
  }
  // One filter per parameter; an array parameter keeps the rows matching any of its values (status=A,B → A or B).
  const filters = Object.entries(readQuery(descriptor, url)).filter(([name]) => !['limit', 'cursor', 'sort', 'order', 'q'].includes(name));
  const filtered = scoped.filter((row) => filters.every(([name, value]) => {
    if (!(name in row)) return true;
    const values = Array.isArray(value) ? value : [value];
    if (!values.length) return true;
    return values.some((one) => (one === 'deleted' ? Boolean(row.deletedAt) : sameValue(row[name], one)));
  }));
  if (resource.kind === 'list') return HttpResponse.json(clone(filtered), { status: descriptor.success, headers });
  const limit = Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50);
  const start = Math.max(0, Number(url.searchParams.get('cursor') ?? 0) || 0);
  const page = filtered.slice(start, start + limit);
  const nextCursor = start + limit < filtered.length ? String(start + limit) : null;
  const sample = generatedBody(descriptor, descriptor.success) as Record<string, unknown>;
  // Counts next to the page (listPendingActions.openCount, listNotifications.unreadCount) count the filtered rows.
  const counts = Object.fromEntries(Object.keys(sample).filter((name) => /Count$/.test(name) && typeof sample[name] === 'number')
    .map((name) => [name, filtered.length]));
  return HttpResponse.json({ ...sample, ...counts, items: clone(page), nextCursor }, { status: descriptor.success, headers });
}

// Shallow echo of scalar fields the client sent, so a created or edited row shows what the user typed.
function echo(body: unknown, sent: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !sent || typeof sent !== 'object') return body;
  const row = body as Row;
  for (const [name, value] of Object.entries(sent as Row)) {
    if (name in row && value !== null && typeof value === typeof row[name] && typeof value !== 'object') row[name] = value;
  }
  return row;
}

async function readBody(request: Request): Promise<unknown> {
  const type = request.headers.get('content-type') ?? '';
  if (!/json/.test(type)) return undefined;
  try {
    return await request.clone().json();
  } catch {
    return undefined;
  }
}

/** Default reply: fixtures for GET, else the generated sample aligned to the request. */
async function respond(descriptor: OperationDescriptor, request: Request, params: Record<string, string>, fixtures: Fixtures): Promise<Response> {
  const status = descriptor.success;
  if (status === null) return problem(descriptor, 500);
  const entry = descriptor.responses[status];
  if (!entry?.body) return nonJson(descriptor, status, request);
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const answered = fromFixtures(descriptor, fixtures, params, url);
    if (answered) return answered;
  }
  let body = align(generatedBody(descriptor, status), params, descriptor.resource?.idParam);
  if (request.method !== 'GET') body = echo(body, await readBody(request));
  const headers: Record<string, string> = { [MOCK_HEADER]: descriptor.operationId };
  if (entry.headers?.includes('ETag')) headers.ETag = `"${String((body as Row | undefined)?.rowVersion ?? 1)}"`;
  if (entry.headers?.includes('Location')) headers.Location = url.pathname;
  return HttpResponse.json(body as never, { status, headers: { ...headers, 'Content-Type': entry.contentType ?? 'application/json' } });
}

/** MockReply of any operation, as the runtime sees it after the typed override returned. */
type AnyReply = Response | { status: number; body?: unknown; headers?: Record<string, string>; delayMs?: number };

async function toResponse(descriptor: OperationDescriptor, reply: AnyReply, request: Request, params: Record<string, string>): Promise<Response> {
  if (reply instanceof Response) return reply;
  if (reply.delayMs) await delay(reply.delayMs);
  const status = reply.status as number;
  const entry = descriptor.responses[status];
  const headers = { [MOCK_HEADER]: descriptor.operationId, ...reply.headers };
  const body = 'body' in reply && reply.body !== undefined ? reply.body : align(generatedBody(descriptor, status), params);
  if (body === undefined || !entry?.contentType || !/json/.test(entry.contentType)) {
    return entry?.contentType && !/json/.test(entry.contentType) ? nonJson(descriptor, status, request) : new HttpResponse(null, { status, headers });
  }
  return HttpResponse.json(body as never, { status, headers: { 'Content-Type': entry.contentType, ...headers } });
}

type Emit = MockRequest<OperationId>['emit'];

function handlerFor(descriptor: OperationDescriptor, fixtures: () => Fixtures, emit: Emit, override?: Overrides[OperationId]): HttpHandler {
  const method = descriptor.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
  return http[method](toPattern(descriptor.path), async ({ request, params }) => {
    const path = Object.fromEntries(Object.entries(params).map(([name, value]) => [name, String(value)]));
    if (!override) return respond(descriptor, request, path, fixtures());
    const context: MockRequest<OperationId> = {
      operationId: descriptor.operationId as OperationId,
      params: path as never,
      query: readQuery(descriptor, new URL(request.url)) as never,
      body: (await readBody(request)) as never,
      request,
      generated: ((status: number) => generatedBody(descriptor, status)) as never,
      fixtures: fixtures(),
      emit,
    };
    const reply = await (override as (request: MockRequest<OperationId>) => AnyReply | Promise<AnyReply>)(context);
    return toResponse(descriptor, reply, request, path);
  });
}

export interface ComposeOptions {
  /** Shell mocks (session, events) first, then each area; claims must not overlap (EC10). */
  sources: readonly MockSource[];
  fixtures: Fixtures;
  /** Extra handlers placed before everything else (the /events stream). */
  before?: readonly HttpHandler[];
  /** Add the generated fallback for unclaimed operations and a 404 for unknown paths (default true). */
  fallback?: boolean;
  /** Event sink for overrides (`MockRequest.emit`), usually the /events stream. */
  emit?: Emit;
}

/** Every handler, most specific first: claimed operations, then the generated fallback for the rest. */
export function composeHandlers({ sources, fixtures: base, before = [], fallback = true, emit = () => undefined }: ComposeOptions): HttpHandler[] {
  const owner = claims(sources);
  const fixtures = mergeFixtures(base, sources);
  const read = () => fixtures;
  const claimed: { descriptor: OperationDescriptor; override?: Overrides[OperationId] }[] = [];
  for (const { mocks } of sources) {
    const generated: GeneratedOperations = mocks.operations ?? {};
    const ids = new Set([...Object.keys(generated), ...Object.keys(mocks.overrides ?? {})]);
    for (const id of ids) {
      const descriptor = generated[id] ?? (allOperations as GeneratedOperations)[id]!;
      claimed.push({ descriptor, override: mocks.overrides?.[id as OperationId] as Overrides[OperationId] });
    }
  }
  const rest = Object.values(allOperations as GeneratedOperations)
    .filter((descriptor) => fallback && !owner.has(descriptor.operationId))
    .map((descriptor) => ({ descriptor, override: undefined }));
  const ordered = [...claimed, ...rest].sort((a, b) => specificity(a.descriptor.path).localeCompare(specificity(b.descriptor.path)));
  const notFound = http.all(`*${basePath}/*`, () => HttpResponse.json(
    { type: 'https://sires.etroy.local/problems/not_found', title: 'Không tìm thấy', status: 404, code: 'not_found' },
    { status: 404, headers: { 'Content-Type': 'application/problem+json', [MOCK_HEADER]: 'not_found' } },
  ));
  return [...before, ...ordered.map(({ descriptor, override }) => handlerFor(descriptor, read, emit, override)), ...(fallback ? [notFound] : [])];
}
