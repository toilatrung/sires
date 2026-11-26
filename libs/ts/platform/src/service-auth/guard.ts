// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { type CanActivate, type ExecutionContext, Inject, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemException } from '../errors/problem.exception';
import { setLogContext } from '../logging/context';
import type { ServiceName } from './claims';
import { SERVICE_AUTH_REQUEST_KEY, serviceAuthContext, setServiceAuth } from './context';
import type { ServicePublicKeys, ServiceSigner } from './keys';
import { ServiceTokenError, toInvalidServiceToken, verifyServiceToken } from './token';

// Guard of internal endpoints (PID-00003 S02, S03; architecture 10.4: no internal endpoint trusts the internal
// network). Order: token (401 invalid_service_token), then the route's caller list (403 caller_not_allowed).

export const SERVICE_AUTH_OPTIONS = Symbol('SERVICE_AUTH_OPTIONS');

export interface ServiceAuthOptions {
  /** This service: `aud` it accepts, `sub` and `kid` it signs with. */
  service: ServiceName;
  publicKeys: ServicePublicKeys;
  /** Signs this service's outgoing calls (ServiceTokenClient); must belong to `service`. */
  signer: ServiceSigner;
}

const CALLERS_KEY = 'sires:service-auth:x-callers';
const APR_KEY = 'sires:service-auth:x-apr';

/** Title of `403 caller_not_allowed` (internal/responses.yaml#/CallerNotAllowed). */
export const CALLER_NOT_ALLOWED_TITLE = 'Service không được phép gọi endpoint này';

/**
 * `x-callers` of the operation: services allowed to call this route (method or controller; the method wins). Written
 * by the service from its contract (generation from the contract is PID-00007, PID-00008). A guarded route without
 * it refuses every caller (EC09).
 */
export const InternalCallers = (...callers: ServiceName[]) => SetMetadata(CALLERS_KEY, callers);

/**
 * `x-apr` of the operation (approval endpoint): only a Researcher token signed by gateway passes, sent to this service
 * or forwarded unchanged by orchestration (H1, H2).
 */
export const ApprovalEndpoint = () => SetMetadata(APR_KEY, true);

/** `Authorization: Bearer <token>`; undefined when absent or another scheme. */
export function bearerToken(header: string | string[] | undefined): string | undefined {
  if (typeof header !== 'string') return undefined;
  const match = /^Bearer[ \t]+([^\s]+)[ \t]*$/i.exec(header);
  return match?.[1];
}

/** Checks the internal token and the caller list of a route; put it on internal controllers with `@UseGuards`. */
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  private readonly logger = new Logger('ServiceAuthGuard');

  constructor(
    @Inject(SERVICE_AUTH_OPTIONS) private readonly options: ServiceAuthOptions,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const targets = [context.getHandler(), context.getClass()];
    const apr = this.reflector.getAllAndOverride<boolean | undefined>(APR_KEY, targets) === true;

    let verified;
    try {
      const token = bearerToken(request.headers['authorization']);
      if (!token) throw new ServiceTokenError('missing');
      verified = await verifyServiceToken(token, { service: this.options.service, publicKeys: this.options.publicKeys, apr });
    } catch (error) {
      if (!(error instanceof ServiceTokenError)) throw error;
      // The reason only: never the token (NFR-OBS-002).
      this.logger.warn({ reason: error.reason }, 'token nội bộ bị từ chối');
      throw toInvalidServiceToken(error);
    }

    const callers = this.reflector.getAllAndOverride<ServiceName[] | undefined>(CALLERS_KEY, targets);
    if (!callers?.includes(verified.claims.sub)) {
      // Who called and why in the log only; the body is the same for every refusal, as the Python guard and the
      // contract (PO, QC PID-00003 G8; same rule as the 401 of G2).
      this.logger.warn({ caller: verified.claims.sub, declared: callers !== undefined }, 'service không có trong x-callers');
      throw new ProblemException('caller_not_allowed', { title: CALLER_NOT_ALLOWED_TITLE });
    }

    const auth = serviceAuthContext(verified);
    (request as Record<string, unknown>)[SERVICE_AUTH_REQUEST_KEY] = auth;
    setServiceAuth(auth);
    const ids = { accountId: auth.accountId, projectId: auth.projectId, agentRunId: auth.agentRunId };
    setLogContext(Object.fromEntries(Object.entries(ids).filter(([, value]) => value !== undefined)));
    return true;
  }
}
