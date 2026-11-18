// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Inject, Injectable } from '@nestjs/common';
import type { ActorRef, ServiceName } from './claims';
import { currentServiceAuth, type ServiceAuthContext } from './context';
import { SERVICE_AUTH_OPTIONS, type ServiceAuthOptions } from './guard';
import type { ServiceSigner } from './keys';
import { issueServiceToken } from './token';

// Outgoing calls (PID-00003 S04): a new token per call, `sub` = this service, `aud` = the service called, lifetime
// 5 minutes. Signing ES256 costs well under a millisecond, so tokens are not cached (report.md).

/**
 * How to authenticate one outgoing call.
 * - omitted: on behalf of the request being handled — its actor, accountId and projectId (Researcher or system).
 * - `component`: as this service itself, `act.type = system` with that component. Required for jobs and consumers
 *   with no incoming request (EC10), and for the service's own work while handling an Agent Run (OQ-110); accountId
 *   and projectId default to those of the request being handled.
 * - `forwardAgentRunToken`: the incoming Agent Run token unchanged, to fetch data returned to the agent (OQ-110);
 *   the service called must be in its `aud`.
 */
export type OutgoingCallAuth =
  | { component?: undefined; forwardAgentRunToken?: false }
  | { component: string; accountId?: string; projectId?: string; forwardAgentRunToken?: false }
  | { forwardAgentRunToken: true; component?: undefined };

/** Builds `Authorization` headers for calls to other services and sends them. */
@Injectable()
export class ServiceTokenClient {
  private readonly signer: ServiceSigner;

  constructor(@Inject(SERVICE_AUTH_OPTIONS) options: Pick<ServiceAuthOptions, 'signer'>) {
    this.signer = options.signer;
  }

  /** `Bearer <token>` for a call to `target`. */
  async authorization(target: ServiceName, auth: OutgoingCallAuth = {}): Promise<string> {
    return `Bearer ${await this.token(target, auth)}`;
  }

  /** `fetch` with the `Authorization` header of {@link authorization}. */
  async fetch(target: ServiceName, url: string | URL, init: RequestInit = {}, auth: OutgoingCallAuth = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('authorization', await this.authorization(target, auth));
    return fetch(url, { ...init, headers });
  }

  private async token(target: ServiceName, auth: OutgoingCallAuth): Promise<string> {
    const incoming = currentServiceAuth();
    if (auth.forwardAgentRunToken) return forwardAgentRunToken(incoming, target);

    if (auth.component !== undefined) {
      return issueServiceToken(this.signer, {
        audience: target,
        actor: { type: 'system', component: auth.component },
        accountId: auth.accountId ?? incoming?.accountId,
        projectId: auth.projectId ?? incoming?.projectId,
      });
    }

    if (!incoming) {
      throw new TypeError(
        'ServiceTokenClient: no request being handled — a job or consumer passes { component } (act.type = system)',
      );
    }
    if (incoming.actor.type === 'agent') {
      // Never sign act.type = agent here (only orchestration issues Agent Run tokens): the caller decides (OQ-110).
      throw new TypeError(
        'ServiceTokenClient: the request carries an Agent Run token — pass { forwardAgentRunToken: true } or { component }',
      );
    }
    return issueServiceToken(this.signer, {
      audience: target,
      actor: incoming.actor satisfies ActorRef,
      accountId: incoming.accountId,
      projectId: incoming.projectId,
    });
  }
}

function forwardAgentRunToken(incoming: ServiceAuthContext | undefined, target: ServiceName): string {
  if (incoming?.actor.type !== 'agent') {
    throw new TypeError('ServiceTokenClient: forwardAgentRunToken needs a request carrying an Agent Run token');
  }
  const audience: readonly ServiceName[] = Array.isArray(incoming.audience) ? incoming.audience : [incoming.audience];
  if (!audience.includes(target)) {
    throw new TypeError(`ServiceTokenClient: ${target} is not in the aud of the Agent Run token`);
  }
  return incoming.token;
}
