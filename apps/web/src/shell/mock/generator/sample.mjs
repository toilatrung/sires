// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Deterministic data from a JSON Schema (OpenAPI 3.1): an example in the spec wins; otherwise the value is built
// from the schema (PID-00013 EC01, EC02). Every value is a pure function of (seed key, schema), so generating twice,
// or generating a subset of operations, gives the same data (EC03).

import { createHash } from 'node:crypto';
import { deref } from './openapi.mjs';
import { genericPhrases, stringFor } from './vocabulary.mjs';

const MAX_DEPTH = 7;
const BASE_TIME = Date.parse('2026-11-20T08:30:00.000Z');
/** Account of the demo session; shell/mock/fixtures use the same id so generated rows belong to the signed-in user. */
export const DEMO_ACCOUNT_ID = '5b0e7c2a-4f1d-4c8e-9a6b-2d3f8e1a7c90';
// Optional fields that only exist in a later or failed state; a sample in its normal state leaves them out.
const CONDITIONAL = /deleted|archived|purge|BeforeDeletion|cancel|fail|error|retract|supersed|revoked|expired|discarded|rejected|interrupted/i;

const digest = (key) => createHash('sha256').update(key).digest();
const number = (key) => digest(key).readUInt32BE(0);

export function uuid(key) {
  const h = digest(`uuid:${key}`).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Merges `allOf` members into one schema; conflicting properties become a nested `allOf`. The name is the
 * component the schema itself refers to (its own `$ref`, else the first named member), never the parent's.
 */
function flatten(doc, schema, name) {
  const resolved = deref(doc, schema, name);
  schema = resolved.schema;
  name = resolved.name;
  if (!schema?.allOf) return { schema, name };
  const merged = { ...schema, allOf: undefined, properties: { ...(schema.properties ?? {}) }, required: [...(schema.required ?? [])] };
  for (const member of schema.allOf) {
    const part = flatten(doc, member, name);
    name = name ?? part.name;
    for (const [key, value] of Object.entries(part.schema)) {
      if (key === 'properties') {
        for (const [property, propertySchema] of Object.entries(value)) {
          merged.properties[property] = merged.properties[property]
            ? { allOf: [merged.properties[property], propertySchema] } : propertySchema;
        }
      } else if (key === 'required') merged.required.push(...value);
      else if ((key === 'items' || key === 'additionalProperties') && isObject(merged[key]) && isObject(value)) {
        merged[key] = { allOf: [merged[key], value] };
      } else if (merged[key] === undefined) merged[key] = value;
    }
  }
  if (!Object.keys(merged.properties).length) delete merged.properties;
  merged.required = [...new Set(merged.required)];
  delete merged.allOf;
  return { schema: merged, name };
}

export function createSampler(doc) {
  function sample(input, key, context = {}) {
    const { depth = 0, property, owner } = context;
    const flat = flatten(doc, input ?? {});
    const schema = flat.schema;
    const name = flat.name ?? owner;
    const pick = (list, salt = '') => list[number(`${key}${salt}`) % list.length];
    if (schema.const !== undefined) return schema.const;
    if (Array.isArray(schema.examples) && schema.examples.length) return structuredClone(schema.examples[0]);
    if (schema.example !== undefined) return structuredClone(schema.example);
    const branches = schema.oneOf ?? schema.anyOf;
    if (branches) {
      const choices = branches.filter((branch) => deref(doc, branch).schema?.type !== 'null');
      const rest = Object.fromEntries(Object.entries(schema).filter(([keyword]) => keyword !== 'oneOf' && keyword !== 'anyOf'));
      const branch = flatten(doc, choices[0] ?? branches[0], name);
      const value = sample({ allOf: [rest, branch.schema] }, key, { depth, property, owner: branch.name ?? name });
      const mapping = schema.discriminator;
      if (mapping?.propertyName && isObject(value)) {
        const entry = Object.entries(mapping.mapping ?? {}).find(([, ref]) => ref === (choices[0] ?? branches[0]).$ref);
        if (entry) value[mapping.propertyName] = entry[0];
      }
      return value;
    }
    if (Array.isArray(schema.enum) && schema.enum.length) {
      return schema.default !== undefined && schema.enum.includes(schema.default) ? schema.default : pick(schema.enum);
    }
    const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
    const type = types.find((t) => t !== 'null')
      ?? (types.includes('null') ? 'null' : schema.properties ? 'object' : schema.items ? 'array' : undefined);
    switch (type) {
      case 'null': return null;
      case 'object': return object(schema, key, depth, name);
      case 'array': return array(schema, key, depth, property, name);
      case 'string': return string(schema, key, property, name, pick);
      case 'integer':
      case 'number': return numeric(schema, key, property, type);
      case 'boolean': return schema.default ?? number(key) % 2 === 0;
      default: return schema.default ?? {};
    }
  }

  function object(schema, key, depth, owner) {
    const value = {};
    const required = new Set(schema.required ?? []);
    for (const [property, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (deref(doc, propertySchema).schema?.writeOnly) continue;
      if (!required.has(property) && (depth >= MAX_DEPTH || CONDITIONAL.test(property))) continue;
      value[property] = sample(propertySchema, `${key}.${property}`, { depth: depth + 1, property, owner });
    }
    if (!schema.properties && isObject(schema.additionalProperties) && depth < MAX_DEPTH) {
      const entry = deref(doc, schema.additionalProperties).schema;
      const mapKey = entry?.type === 'string' ? 'vi' : 'total';
      value[mapKey] = sample(schema.additionalProperties, `${key}.${mapKey}`, { depth: depth + 1, owner });
    }
    return refine(owner, value, required);
  }

  function array(schema, key, depth, property, owner) {
    const min = schema.minItems ?? 0;
    const max = schema.maxItems ?? Infinity;
    const count = Math.min(max, Math.max(min, depth >= MAX_DEPTH ? 0 : depth > 3 ? 1 : 2));
    const items = [];
    for (let index = 0; items.length < count && index < count + 8; index++) {
      const item = sample(schema.items ?? {}, `${key}[${index}]`, { depth: depth + 1, property, owner });
      if (schema.uniqueItems && items.some((existing) => JSON.stringify(existing) === JSON.stringify(item))) continue;
      items.push(item);
    }
    return items;
  }

  function string(schema, key, property, owner, pick) {
    const at = (offsetDays) => new Date(BASE_TIME - offsetDays * 86_400_000 - (number(`${key}:t`) % 36_000) * 1000);
    let value;
    switch (schema.format) {
      case 'uuid': value = property === 'accountId' ? DEMO_ACCOUNT_ID : uuid(key); break;
      case 'date-time': value = at(number(`${key}:d`) % 30).toISOString(); break;
      case 'date': value = at(number(`${key}:d`) % 365).toISOString().slice(0, 10); break;
      case 'email': value = stringFor('email', owner, pick); break;
      case 'uri':
      case 'url':
      case 'uri-reference':
        value = /avatar|image|picture/i.test(property ?? '') ? `https://cdn.sires.example/avatars/${number(key) % 12 + 1}.png`
          : /scholar/i.test(property ?? '') ? 'https://scholar.google.com/citations?user=sires-demo'
            : `https://doi.org/10.5555/sires.${number(key) % 9000 + 1000}`;
        break;
      case 'byte': value = Buffer.from('SIRes').toString('base64'); break;
      default:
        value = schema.default ?? stringFor(property, owner, pick)
          ?? (/hash|checksum/i.test(property ?? '') ? digest(key).toString('hex')
            : property === 'accountId' ? DEMO_ACCOUNT_ID
              : /(^|[a-z])Id$|^id$/.test(property ?? '') ? uuid(key)
                : /name|label|title|text|note/i.test(property ?? '') ? pick(genericPhrases)
                  : `${(property ?? 'value').replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}-${number(key) % 90 + 10}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) value = patterned(schema.pattern, key, value);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) value = value.slice(0, schema.maxLength);
    if (schema.minLength !== undefined && value.length < schema.minLength) value = value.padEnd(schema.minLength, 'x');
    return value;
  }

  return { sample, uuid };
}

// Keeps values that the schema allows but the domain does not combine (ActorRef.type vs agent fields, 18.1).
function refine(owner, value, required) {
  if (owner === 'ActorRef' && typeof value.type === 'string') {
    const keep = value.type === 'researcher' ? ['type', 'accountId']
      : value.type === 'agent' ? ['type', 'agent', 'agentRunId', ...(value.agent === 'analysis' ? ['instance'] : [])]
        : ['type', 'component'];
    for (const property of Object.keys(value)) if (!keep.includes(property) && !required.has(property)) delete value[property];
    if (value.type === 'system' && 'component' in value) value.component = 'readiness';
  } else if (typeof value.agent === 'string' && value.agent !== 'analysis' && 'instance' in value && !required.has('instance')) {
    delete value.instance;
  }
  return value;
}

// Patterns used by the public contract; anything else keeps the plain value, and the schema test reports it.
function patterned(pattern, key, fallback) {
  if (pattern.startsWith('^https://')) return `https://sires.example/${number(key) % 1000}`;
  if (pattern.startsWith('^/')) return '/dashboard';
  if (/^\^\[a-z/.test(pattern)) return `sires_${number(key) % 1000}`;
  return fallback;
}

function numeric(schema, key, property, type) {
  if (schema.default !== undefined) return schema.default;
  const name = property ?? '';
  let min = schema.minimum ?? (schema.exclusiveMinimum !== undefined ? schema.exclusiveMinimum + (type === 'integer' ? 1 : 0.01) : undefined);
  let max = schema.maximum ?? (schema.exclusiveMaximum !== undefined ? schema.exclusiveMaximum - (type === 'integer' ? 1 : 0.01) : undefined);
  if (/rowVersion|attempt|revisionNumber|versionNumber|order|round/i.test(name)) { min ??= 1; max ??= 3; }
  if (/year/i.test(name)) { min ??= 2016; max ??= 2025; }
  if (/page/i.test(name)) { min ??= 1; max ??= 24; }
  if (/score|confidence|ratio|rate|similarity|threshold/i.test(name) && type === 'number') { min ??= 0.6; max ??= 0.97; }
  if (/tokens/i.test(name)) { min ??= 800; max ??= 12_000; }
  if (/bytes|size/i.test(name)) { min ??= 120_000; max ??= 4_800_000; }
  min ??= 0;
  max ??= Math.max(min, 0) + 12;
  const span = max - min;
  const raw = min + ((number(key) % 10_000) / 10_000) * span;
  if (type === 'integer') return Math.round(raw);
  return Math.round(raw * 100) / 100;
}
