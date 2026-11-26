// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Reads the public OpenAPI bundle: the same file @sires/contracts turns into PublicApi
// (libs/ts/contracts/scripts/generate.mjs emits public.ts from dist/openapi.bundled.yaml), so mock data and
// types never come from two different documents (PID-00013 EC13).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
export const defaultSpec = path.join(workspaceRoot, 'docs/api-design/dist/openapi.bundled.yaml');

const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'];

export function loadSpec(file = defaultSpec) {
  const doc = parse(fs.readFileSync(file, 'utf8'));
  if (!doc?.openapi || !doc.paths) throw new Error(`${file}: not an OpenAPI document`);
  return doc;
}

/** Base path of the first server (`https://{host}/api/v1` → `/api/v1`). */
export function basePath(doc) {
  const url = doc.servers?.[0]?.url ?? '';
  const pathname = url.replace(/^[a-z]+:\/\/[^/]+/i, '');
  return pathname.replace(/\/$/, '');
}

const decode = (token) => token.replace(/~1/g, '/').replace(/~0/g, '~');

/**
 * Resolves a local `#/…` reference. A reference the bundler left relative (for example `common.yaml#/Id` inside an
 * `x-` extension) falls back to the component schema with the same last segment, so it still means the schema the
 * source file pointed at.
 */
export function resolveRef(doc, ref) {
  const [file, pointer = ''] = ref.split('#');
  if (!file) {
    let node = doc;
    for (const token of pointer.split('/').slice(1).map(decode)) {
      node = node?.[token];
      if (node === undefined) throw new Error(`Unresolved reference ${ref}`);
    }
    return node;
  }
  const name = pointer.split('/').filter(Boolean).at(-1);
  const schema = name && doc.components?.schemas?.[name];
  if (!schema) throw new Error(`Unresolved external reference ${ref}`);
  return schema;
}

/** Name of the component schema a `$ref` points at, if any. */
export function refName(ref) {
  const [file, pointer = ''] = ref.split('#');
  if (!file && !pointer.startsWith('/components/schemas/')) return undefined;
  return decode(pointer.split('/').filter(Boolean).at(-1) ?? '') || undefined;
}

/** Follows `$ref` chains; returns the target and the last component name seen. */
export function deref(doc, schema, name) {
  const seen = new Set();
  while (schema && typeof schema === 'object' && schema.$ref) {
    if (seen.has(schema.$ref)) throw new Error(`Cyclic reference ${schema.$ref}`);
    seen.add(schema.$ref);
    name = refName(schema.$ref) ?? name;
    schema = resolveRef(doc, schema.$ref);
  }
  return { schema, name };
}

export function listOperations(doc) {
  const operations = [];
  for (const [route, item] of Object.entries(doc.paths)) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op?.operationId) continue;
      const parameters = [...(item.parameters ?? []), ...(op.parameters ?? [])]
        .map((parameter) => (parameter.$ref ? resolveRef(doc, parameter.$ref) : parameter));
      operations.push({ operationId: op.operationId, method: method.toUpperCase(), path: route, tags: op.tags ?? [], op, parameters });
    }
  }
  const ids = new Set();
  for (const { operationId } of operations) {
    if (ids.has(operationId)) throw new Error(`Duplicate operationId ${operationId}`);
    ids.add(operationId);
  }
  return operations;
}

/** Responses of an operation with `$ref` resolved, keyed by status code string. */
export function responsesOf(doc, op) {
  return Object.fromEntries(Object.entries(op.responses ?? {})
    .map(([status, response]) => [status, response.$ref ? resolveRef(doc, response.$ref) : response]));
}
