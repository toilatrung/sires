// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, randomBytes } from 'node:crypto';
import { isSpanContextValid, trace } from '@opentelemetry/api';

// Correlation ids of NFR-OBS-001 with the log field names of architecture 11.4: request_id, trace_id,
// account_hash, project_id, task_id, workflow_id, agent_run_id, build_id. request_id comes from pino-http,
// trace_id/span_id from the active OpenTelemetry span, the rest from the log context below.

/** Correlation ids known while handling one request, message or job; set what is known, when it is known. */
export interface LogContext {
  accountId?: string;
  projectId?: string;
  taskId?: string;
  workflowId?: string;
  agentRunId?: string;
  buildId?: string;
}

const FIELD_NAMES: Readonly<Record<Exclude<keyof LogContext, 'accountId'>, string>> = {
  projectId: 'project_id',
  taskId: 'task_id',
  workflowId: 'workflow_id',
  agentRunId: 'agent_run_id',
  buildId: 'build_id',
};

const storage = new AsyncLocalStorage<LogContext>();

/** Runs `work` with its own log context, starting from `fields`; ids set inside do not leak to the caller. */
export function runWithLogContext<T>(fields: LogContext, work: () => T): T {
  return storage.run({ ...(storage.getStore() ?? {}), ...fields }, work);
}

/**
 * Adds correlation ids to the current log context (one per HTTP request, see LoggingModule; or one opened with
 * {@link runWithLogContext}). Returns false when there is no current context, in which case nothing is recorded.
 */
export function setLogContext(fields: LogContext): boolean {
  const store = storage.getStore();
  if (!store) return false;
  Object.assign(store, fields);
  return true;
}

/** Keyed hash of an account id, as logged in `account_hash`: HMAC-SHA256, lower-case hex. */
export type AccountHasher = (accountId: string) => string;

/**
 * Builds the account hasher from the configured key. Without a key the hash uses a random key of this process:
 * account ids still never appear in logs, but hashes are comparable only within one process.
 */
export function createAccountHasher(key: string | undefined): { hash: AccountHasher; configured: boolean } {
  const configured = key !== undefined && key !== '';
  const secret = configured ? key : randomBytes(32);
  return {
    configured,
    hash: (accountId) => createHmac('sha256', secret).update(accountId.trim().toLowerCase()).digest('hex'),
  };
}

/** Fields that pino's `mixin` adds to every log record made in the current async context. */
export function correlationFields(hashAccount: AccountHasher): Record<string, string> {
  const fields: Record<string, string> = {};
  const span = trace.getActiveSpan();
  if (span) {
    const spanContext = span.spanContext();
    if (isSpanContextValid(spanContext)) {
      fields.trace_id = spanContext.traceId;
      fields.span_id = spanContext.spanId;
    }
  }
  const context = storage.getStore();
  if (context) {
    if (context.accountId) fields.account_hash = hashAccount(context.accountId);
    for (const [key, name] of Object.entries(FIELD_NAMES) as [keyof typeof FIELD_NAMES, string][]) {
      const value = context[key];
      if (value) fields[name] = value;
    }
  }
  return fields;
}
