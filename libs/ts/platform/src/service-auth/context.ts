// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createParamDecorator, type ExecutionContext, type NestMiddleware } from '@nestjs/common';
import type { ActorRef, AgentScope, ServiceName } from './claims';
import type { VerifiedServiceToken } from './token';

// The caller of the request being handled, as checked by ServiceAuthGuard (P4): handlers read it with
// @ServiceAuth(), code further down (ServiceTokenClient, repositories) with currentServiceAuth().

/** Who is calling, from a token the guard accepted. */
export interface ServiceAuthContext {
  /** Service whose key signed the token (`kid`). */
  readonly signer: ServiceName;
  /** `sub`: the calling service, or agent-core for an Agent Run token. */
  readonly caller: ServiceName;
  readonly actor: ActorRef;
  /** Account of the request, for `withAccountTransaction` (PID-00001). */
  readonly accountId?: string;
  readonly projectId?: string;
  readonly agentRunId?: string;
  /** Agent Run scope; the service reading data applies it (N6). */
  readonly agentScope?: AgentScope;
  /** `aud` of the token: one service, or the services an Agent Run may read. */
  readonly audience: ServiceName | readonly ServiceName[];
  /** The token as received, for forwarding it unchanged (Agent Run, OQ-110). Never log it. */
  readonly token: string;
}

export function serviceAuthContext({ token, signer, claims }: VerifiedServiceToken): ServiceAuthContext {
  return {
    signer,
    caller: claims.sub,
    actor: claims.act,
    accountId: claims.accountId,
    projectId: claims.projectId,
    agentRunId: claims.agentRunId,
    agentScope: claims.agentScope,
    audience: claims.aud,
    token,
  };
}

interface Holder {
  auth?: ServiceAuthContext;
}

const storage = new AsyncLocalStorage<Holder>();

/** Opens one holder per HTTP request; ServiceAuthGuard fills it. */
export class ServiceAuthContextMiddleware implements NestMiddleware {
  use(_req: IncomingMessage, _res: ServerResponse, next: () => void): void {
    storage.run({}, next);
  }
}

/** The caller of the request being handled, or undefined outside a guarded request (job, consumer, public route). */
export function currentServiceAuth(): ServiceAuthContext | undefined {
  return storage.getStore()?.auth;
}

/** Records the caller in the current holder; false when there is none (ServiceAuthModule not imported). */
export function setServiceAuth(auth: ServiceAuthContext): boolean {
  const holder = storage.getStore();
  if (!holder) return false;
  holder.auth = auth;
  return true;
}

/** Runs `work` with `auth` as the current caller: for consumers that check a token outside an HTTP request. */
export function runWithServiceAuth<T>(auth: ServiceAuthContext | undefined, work: () => T): T {
  return storage.run({ auth }, work);
}

/** Request property where the guard also stores the caller. */
export const SERVICE_AUTH_REQUEST_KEY = 'serviceAuth';

/** Handler parameter: the {@link ServiceAuthContext} of a request that passed ServiceAuthGuard. */
export const ServiceAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ServiceAuthContext | undefined =>
    context.switchToHttp().getRequest<Record<string, ServiceAuthContext | undefined>>()[SERVICE_AUTH_REQUEST_KEY],
);
