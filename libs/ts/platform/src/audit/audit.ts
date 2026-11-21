// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import type { components } from '@sires/contracts';
import { isSpanContextValid, trace } from '@opentelemetry/api';
import { redactString } from '../logging/redact';
import { actorRefSchema, type ActorRef, type ServiceName } from '../outbox/envelope';
import { buildEnvelope, insertOutboxRow, type SqlExecutor } from '../outbox/outbox';
import { isUuid, uuidv7 } from '../tenancy/uuid';

// audit-emit (PID-00002 S04, ADR-23, CTX-AUDIT-001): the Audit Event is built in the source service and written as one
// `kind = audit` outbox row with routing key `audit.recorded`, in the same transaction as the change it records, so a
// rollback leaves neither (DATA-PERSIST-001, NFR-DUR-001). The envelope aggregate is the Audit Event itself (H3). This
// module only appends: there is no function to change or delete an Audit Event (CTX-AUDIT-001-AC04).

export type AuditEvent = components['schemas']['AuditEvent'];
export type AprCode = components['schemas']['AprCode'];

/** Routing key and message name of asyncapi.yaml#/components/messages/auditRecorded. */
export const AUDIT_RECORDED = 'audit.recorded';
/** `aggregate.type` of audit.recorded (H3). */
export const AUDIT_AGGREGATE_TYPE = 'audit_event';

export interface AuditInput {
  /** Service writing the Audit Event (envelope `producer`). */
  producer: ServiceName;
  accountId: string;
  projectId?: string;
  /** Required: Researcher (accountId), agent (agent, agentRunId) or System (component). */
  actor: ActorRef;
  /** e.g. `plan_version.approved`, `reference.revoked`. */
  action: string;
  objectType: string;
  objectId: string;
  objectVersion?: number;
  fromState?: string;
  toState?: string;
  /** Approval right exercised, when the action is one (3.3). */
  apr?: AprCode;
  /** Short human summary; strings that look like keys are masked. Never put key values here. */
  summary?: string;
}

/**
 * Writes an Audit Event in the caller's transaction and returns it: checks the actor (EC16, throws before any
 * INSERT), masks key-like strings in `summary` (EC17), sets `id` (UUIDv7, also the outbox row and message id),
 * `correlationId` (trace id of the active span) and `at`.
 */
export async function emitAudit(tx: SqlExecutor, input: AuditInput): Promise<AuditEvent> {
  const actor = actorRefSchema.safeParse(input.actor);
  if (!actor.success) {
    const fields = actor.error.issues.map((issue) => issue.path.join('.') || 'actor').join(', ');
    throw new TypeError(`emitAudit: actor is not valid for CTX-AUDIT-001 (${fields})`);
  }
  if (!input.action || !input.objectType) throw new TypeError('emitAudit: action and objectType are required');
  if (!isUuid(input.objectId)) throw new TypeError('emitAudit: objectId must be a UUID');

  const id = uuidv7();
  const correlationId = currentTraceId();
  const event: AuditEvent = {
    id,
    accountId: input.accountId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    actor: actor.data as ActorRef,
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    ...(input.objectVersion !== undefined ? { objectVersion: input.objectVersion } : {}),
    ...(input.fromState !== undefined ? { fromState: input.fromState } : {}),
    ...(input.toState !== undefined ? { toState: input.toState } : {}),
    ...(input.apr !== undefined ? { apr: input.apr } : {}),
    ...(input.summary !== undefined ? { summary: redactString(input.summary) } : {}),
    ...(correlationId !== undefined ? { correlationId } : {}),
    at: new Date().toISOString(),
  };
  const envelope = buildEnvelope({
    id,
    producer: input.producer,
    type: AUDIT_RECORDED,
    accountId: input.accountId,
    projectId: input.projectId,
    actor: event.actor,
    aggregate: { type: AUDIT_AGGREGATE_TYPE, id, version: 1 },
    data: event as unknown as Record<string, unknown>,
    occurredAt: new Date(event.at),
  });
  await insertOutboxRow(tx, {
    id,
    kind: 'audit',
    routingKey: AUDIT_RECORDED,
    accountId: input.accountId,
    aggregate: envelope.aggregate,
    payload: envelope,
    traceparent: envelope.traceparent,
  });
  return event;
}

function currentTraceId(): string | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext && isSpanContextValid(spanContext) ? spanContext.traceId : undefined;
}
