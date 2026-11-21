// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { isSpanContextValid, trace } from '@opentelemetry/api';
import { sql, type SQLWrapper } from 'drizzle-orm';
import { isUuid, uuidv7 } from '../tenancy/uuid';
import {
  eventEnvelopeSchema,
  eventRoutingKey,
  type ActorRef,
  type EventAggregate,
  type EventEnvelope,
  type ServiceName,
} from './envelope';

// Writing app.outbox inside the caller's transaction (PID-00002 S01, database 9.2, DATA-PERSIST-001). The `_app` role
// only has INSERT on app.outbox: no RETURNING, ids are generated here (UUIDv7) and are the AMQP message id.

/** Anything that runs SQL in the caller's transaction: a Drizzle transaction or database (`execute`). */
export interface SqlExecutor {
  execute(query: SQLWrapper | string): Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

/** Command queues of asyncapi.yaml: published to the queue of the same name through the default exchange. */
export const COMMAND_QUEUES = ['agent.run', 'knowledge.index', 'sandbox.build'] as const;
export type CommandQueue = (typeof COMMAND_QUEUES)[number];

/** Exchange of events and Audit Events (asyncapi.yaml channel `events`). */
export const EVENTS_EXCHANGE = 'sires.events';

export interface OutboxEventInput {
  /** Service writing the event (`producer`). */
  producer: ServiceName;
  /** Message name of asyncapi.yaml, e.g. `task.activated`, `workflow.status_changed`. */
  type: string;
  accountId: string;
  projectId?: string;
  actor?: ActorRef;
  /** Required (H2): the entity changed and its `row_version` after the change. */
  aggregate: EventAggregate;
  data: Record<string, unknown>;
  /** Defaults to 1; raised only for a breaking payload change (architecture 3.6). */
  schemaVersion?: number;
  /** Defaults to a new UUIDv7; becomes the outbox row id and the AMQP message id. */
  id?: string;
  /** Defaults to now. */
  occurredAt?: Date;
}

export interface OutboxCommandInput {
  queue: CommandQueue;
  /** The command body as in asyncapi.yaml (AgentRunAssignment, SandboxJob…), sent as is. */
  payload: Record<string, unknown>;
  /** Account the command belongs to, when there is one. */
  accountId?: string;
  /** Optional for commands (H2). */
  aggregate?: EventAggregate;
  id?: string;
}

/**
 * Writes an event in the caller's transaction: builds the EventEnvelope (id UUIDv7, current `traceparent`), checks it
 * — a missing or partial `aggregate` throws before any INSERT (EC05) — and inserts one `kind = event` row whose
 * routing key carries the target state of a state change (EC04). Returns the envelope.
 */
export async function writeEvent(tx: SqlExecutor, input: OutboxEventInput): Promise<EventEnvelope> {
  const envelope = buildEnvelope(input);
  await insertOutboxRow(tx, {
    id: envelope.id,
    kind: 'event',
    routingKey: eventRoutingKey(envelope.type, envelope.data),
    accountId: envelope.accountId,
    aggregate: envelope.aggregate,
    payload: envelope,
    traceparent: envelope.traceparent,
  });
  return envelope;
}

/** Writes a command (`agent.run`, `knowledge.index`, `sandbox.build`) in the caller's transaction. Returns its id. */
export async function writeCommand(tx: SqlExecutor, input: OutboxCommandInput): Promise<string> {
  if (!(COMMAND_QUEUES as readonly string[]).includes(input.queue)) {
    throw new TypeError(`writeCommand: unknown command queue “${input.queue}”`);
  }
  if (input.accountId !== undefined && !isUuid(input.accountId)) throw new TypeError('writeCommand: accountId must be a UUID');
  const id = input.id ?? uuidv7();
  if (!isUuid(id)) throw new TypeError('writeCommand: id must be a UUID');
  await insertOutboxRow(tx, {
    id,
    kind: 'command',
    routingKey: input.queue,
    accountId: input.accountId,
    aggregate: input.aggregate,
    payload: input.payload,
    traceparent: currentTraceparent(),
  });
  return id;
}

/** Envelope of {@link writeEvent}; also used by audit-emit (S04). Throws a TypeError when it breaks EventEnvelope. */
export function buildEnvelope(input: OutboxEventInput): EventEnvelope {
  const candidate = {
    id: input.id ?? uuidv7(),
    type: input.type,
    schemaVersion: input.schemaVersion ?? 1,
    producer: input.producer,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    accountId: input.accountId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.actor !== undefined ? { actor: input.actor } : {}),
    aggregate: input.aggregate,
    ...withTraceparent(currentTraceparent()),
    data: input.data,
  };
  const parsed = eventEnvelopeSchema.safeParse(candidate);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.') || '(root)').join(', ');
    throw new TypeError(`writeEvent: ${input.type} is not a valid EventEnvelope (${fields})`);
  }
  return parsed.data as EventEnvelope;
}

/** W3C `traceparent` of the active span, or undefined outside a span. */
export function currentTraceparent(): string | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext || !isSpanContextValid(spanContext)) return undefined;
  return `00-${spanContext.traceId}-${spanContext.spanId}-${spanContext.traceFlags.toString(16).padStart(2, '0')}`;
}

function withTraceparent(traceparent: string | undefined): { traceparent?: string } {
  return traceparent === undefined ? {} : { traceparent };
}

export interface OutboxRow {
  id: string;
  kind: 'event' | 'audit' | 'command';
  routingKey: string;
  accountId?: string;
  aggregate?: EventAggregate;
  payload: unknown;
  traceparent?: string;
}

/** Public function that writes each kind of row, for error messages. */
const WRITER_BY_KIND: Readonly<Record<OutboxRow['kind'], string>> = { event: 'writeEvent', audit: 'emitAudit', command: 'writeCommand' };

/**
 * INSERT of one app.outbox row (no RETURNING: `_app` has INSERT only). A row with an account must belong to the
 * account of the transaction when it has one (see {@link assertTransactionAccount}); it throws before the INSERT.
 */
export async function insertOutboxRow(tx: SqlExecutor, row: OutboxRow): Promise<void> {
  if (row.accountId !== undefined) await assertTransactionAccount(tx, row.kind, row.accountId);
  await tx.execute(sql`
    INSERT INTO app.outbox (id, account_id, kind, routing_key, aggregate_type, aggregate_id, aggregate_version, payload, traceparent)
    VALUES (${row.id}, ${row.accountId ?? null}, ${row.kind}, ${row.routingKey}, ${row.aggregate?.type ?? null},
            ${row.aggregate?.id ?? null}, ${row.aggregate?.version ?? null}, ${JSON.stringify(row.payload)}::jsonb,
            ${row.traceparent ?? null})`);
}

/**
 * Account boundary of the outbox (S04: `accountId` from the context). app.outbox has no RLS, so in a transaction
 * scoped to an account — `app.account_id` set by withAccountTransaction, role `_app` — a row of another account would
 * be written and then audited and streamed as that account's. Such a row throws a TypeError instead. Transactions
 * without the setting (role `_system`: consumers, jobs) write rows of the account of the event they handle.
 */
async function assertTransactionAccount(tx: SqlExecutor, kind: OutboxRow['kind'], accountId: string): Promise<void> {
  const { rows } = await tx.execute(sql`SELECT app.current_account_id() AS account_id`);
  const current = (rows[0] as { account_id: string | null } | undefined)?.account_id ?? null;
  if (current !== null && current.toLowerCase() !== accountId.toLowerCase()) {
    throw new TypeError(`${WRITER_BY_KIND[kind]}: accountId is not the account of the transaction (app.account_id)`);
  }
}
