// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import type { PublicApi } from '@sires/contracts';
import { z } from 'zod';
import { isUuid } from '../tenancy/uuid';

// Claims of the internal JWT (docs/api-design/internal/schemas.yaml › ServiceTokenClaims, ServiceName; ADR-20).
// ServiceTokenClaims and ServiceName are not referenced by any operation, so no type is generated for them: the
// service list is copied here from the contract. ActorRef, AgentName and AgentInstance come from the generated types,
// and the records below must name every value exactly once (`satisfies Record<…>`).

type Schemas = PublicApi.components['schemas'];

/** `ServiceName` (architecture 3.2): also the `kid` of each service's signing key and the `sub` it signs with. */
export const SERVICE_NAMES = [
  'gateway',
  'identity',
  'workspace',
  'planning',
  'orchestration',
  'library',
  'research',
  'manuscript',
  'audit',
  'sandbox-runner',
  'agent-core',
  'knowledge',
] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];

export function isServiceName(value: unknown): value is ServiceName {
  return typeof value === 'string' && (SERVICE_NAMES as readonly string[]).includes(value);
}

/** `iss` of every internal token: one value for all services, as in the schema example. */
export const SERVICE_TOKEN_ISSUER = 'sires-internal';

/** Longest lifetime of an internal token, in seconds (ServiceTokenClaims: “hạn ≤ 5 phút”). */
export const MAX_SERVICE_TOKEN_TTL_SECONDS = 300;

export type ActorRef = Schemas['ActorRef'];
export type AgentName = Schemas['AgentName'];

const AGENT_NAMES = {
  orchestrator: true,
  discovery: true,
  reference_processing: true,
  evidence_retrieval: true,
  synthesis: true,
  writing: true,
  verification: true,
  diagram: true,
  analysis: true,
} as const satisfies Record<AgentName, true>;

const AGENT_INSTANCES = { A: true, B: true } as const satisfies Record<Schemas['AgentInstance'], true>;
const ACTOR_TYPES = { researcher: true, agent: true, system: true } as const satisfies Record<ActorRef['type'], true>;

const keysOf = <T extends Record<string, true>>(record: T) => Object.keys(record) as [keyof T & string, ...(keyof T & string)[]];

const id = z.string().refine(isUuid, { message: 'expected a UUID' });
const serviceName = z.enum(SERVICE_NAMES);

export const actorRefSchema = z.object({
  type: z.enum(keysOf(ACTOR_TYPES)),
  accountId: id.optional(),
  agent: z.enum(keysOf(AGENT_NAMES)).optional(),
  instance: z.enum(keysOf(AGENT_INSTANCES)).optional(),
  agentRunId: id.optional(),
  component: z.string().min(1).optional(),
});

export const agentScopeSchema = z.object({
  read: z.array(z.string()).optional(),
  taskIds: z.array(id).optional(),
});

/** `ServiceTokenClaims`; registered claims a JWT library adds (`iat`, `nbf`, `jti`) are allowed and ignored. */
export const serviceTokenClaimsSchema = z.object({
  iss: z.string(),
  sub: serviceName,
  aud: z.union([serviceName, z.array(serviceName).min(1)]),
  exp: z.int(),
  act: actorRefSchema,
  accountId: id.optional(),
  projectId: id.optional(),
  agentRunId: id.optional(),
  agentScope: agentScopeSchema.optional(),
});

export type AgentScope = z.infer<typeof agentScopeSchema>;
export type ServiceTokenClaims = z.infer<typeof serviceTokenClaimsSchema>;

// The Zod actor must stay assignable to the contract's ActorRef.
const actorMatchesContract: (actor: z.infer<typeof actorRefSchema>) => ActorRef = (actor) => actor;
void actorMatchesContract;
