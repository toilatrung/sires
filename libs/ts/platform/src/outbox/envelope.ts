// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import type { components } from '@sires/contracts';
import { z } from 'zod';
import { isUuid } from '../tenancy/uuid';

// Event envelope and routing keys of docs/api-design/events/asyncapi.yaml (PID-00002 S01). The envelope is
// internal/schemas.yaml#/EventEnvelope with `aggregate` required (H2, DBQ-04).

type Schemas = components['schemas'];
export type EventEnvelope = Schemas['EventEnvelope'];
export type EventAggregate = EventEnvelope['aggregate'];
export type ServiceName = Schemas['ServiceName'];
export type ActorRef = Schemas['ActorRef'];

const SERVICE_NAME_SET = {
  gateway: true,
  identity: true,
  workspace: true,
  planning: true,
  orchestration: true,
  library: true,
  research: true,
  manuscript: true,
  audit: true,
  'sandbox-runner': true,
  'agent-core': true,
  knowledge: true,
} as const satisfies Record<ServiceName, true>;

const AGENT_NAME_SET = {
  orchestrator: true,
  discovery: true,
  reference_processing: true,
  evidence_retrieval: true,
  synthesis: true,
  writing: true,
  verification: true,
  diagram: true,
  analysis: true,
} as const satisfies Record<Schemas['AgentName'], true>;

/** Services of internal/schemas.yaml#/ServiceName: the `producer` of an event. */
export const EVENT_PRODUCERS = Object.keys(SERVICE_NAME_SET) as ServiceName[];

const uuidSchema = z.string().refine(isUuid, { message: 'expected a UUID' });

/**
 * ActorRef (common.yaml) with the rules of CTX-AUDIT-001 and `app.is_actor_ref` of the DDL: a Researcher has
 * `accountId`; an agent has `agent` and `agentRunId`, and `instance` (A or B) exactly when it is `analysis`; a system
 * actor names its `component`.
 */
export const actorRefSchema = z
  .object({
    type: z.enum(['researcher', 'agent', 'system']),
    accountId: uuidSchema.optional(),
    agent: z.enum(Object.keys(AGENT_NAME_SET) as [Schemas['AgentName'], ...Schemas['AgentName'][]]).optional(),
    instance: z.enum(['A', 'B']).optional(),
    agentRunId: uuidSchema.optional(),
    component: z.string().min(1).optional(),
  })
  .superRefine((actor, ctx) => {
    const require = (field: keyof typeof actor, why: string) => {
      if (actor[field] === undefined) ctx.addIssue({ code: 'custom', path: [field], message: why });
    };
    if (actor.type === 'researcher') require('accountId', 'a researcher actor has accountId');
    if (actor.type === 'agent') {
      require('agent', 'an agent actor has agent');
      require('agentRunId', 'an agent actor has agentRunId');
      if ((actor.agent === 'analysis') !== (actor.instance !== undefined)) {
        ctx.addIssue({ code: 'custom', path: ['instance'], message: 'instance is set exactly for agent = analysis' });
      }
    }
    if (actor.type === 'system') require('component', 'a system actor has component');
  }) satisfies z.ZodType<ActorRef>;

export const aggregateSchema = z.object({
  type: z.string().min(1),
  id: uuidSchema,
  version: z.int().min(1),
}) satisfies z.ZodType<EventAggregate>;

/** `type` of an event or command: dotted lower-case words, as in asyncapi.yaml (`task.activated`, `agent.run`). */
export const MESSAGE_TYPE_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

/** EventEnvelope (internal/schemas.yaml): unknown top-level fields are kept for forward compatibility. */
export const eventEnvelopeSchema = z.looseObject({
  id: uuidSchema,
  type: z.string().regex(MESSAGE_TYPE_PATTERN),
  schemaVersion: z.int().min(1),
  producer: z.enum(EVENT_PRODUCERS as [ServiceName, ...ServiceName[]]),
  occurredAt: z.iso.datetime({ offset: true }),
  accountId: uuidSchema,
  projectId: uuidSchema.optional(),
  actor: actorRefSchema.optional(),
  aggregate: aggregateSchema,
  traceparent: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
}) satisfies z.ZodType<EventEnvelope>;

/**
 * Routing key of an event (asyncapi.yaml info.description): the event `type`, plus — for a state change, whose data
 * is a StateChange (`toState`) or carries `change` — one more word, the target state in lower case with spaces as `_`:
 * `workflow.status_changed` to Waiting for User → `workflow.status_changed.waiting_for_user`.
 */
export function eventRoutingKey(type: string, data: Readonly<Record<string, unknown>>): string {
  const target = typeof data['toState'] === 'string' ? data['toState'] : data['change'];
  if (typeof target !== 'string' || target.trim() === '') return type;
  return `${type}.${routingWord(target)}`;
}

function routingWord(state: string): string {
  const word = state.trim().toLowerCase().replace(/\s+/g, '_');
  // A dot, `*` or `#` would change the topic pattern a consumer binds to.
  if (!/^[\p{L}\p{N}_-]+$/u.test(word)) throw new TypeError(`eventRoutingKey: state “${state}” is not one routing word`);
  return word;
}

/** True when an AMQP topic `pattern` (`*` one word, `#` zero or more words) matches `routingKey`. */
export function topicMatches(pattern: string, routingKey: string): boolean {
  const words = routingKey.split('.');
  const parts = pattern.split('.');
  const match = (p: number, w: number): boolean => {
    if (p === parts.length) return w === words.length;
    if (parts[p] === '#') return match(p + 1, w) || (w < words.length && match(p, w + 1));
    if (w === words.length) return false;
    return (parts[p] === '*' || parts[p] === words[w]) && match(p + 1, w + 1);
  };
  return match(0, 0);
}
