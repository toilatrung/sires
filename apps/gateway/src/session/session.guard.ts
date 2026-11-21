// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ProblemException } from '@sires/platform';
import { sessionIdFromCookie } from './session.crypto';
import { type CurrentSession, SessionService } from './session.service';

const PUBLIC_PATHS = new Set(['/health', '/auth/login', '/auth/callback']);
export const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface SessionRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  accountId?: string;
  session?: CurrentSession;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const path = request.url.split('?')[0];
    if (PUBLIC_PATHS.has(path)) return true;
    const id = sessionIdFromCookie(request.headers.cookie);
    if (!id) throw new ProblemException('unauthenticated');
    const current = await this.sessions.find(id);
    request.accountId = current.accountId;
    request.session = current;
    if (WRITE_METHODS.has(request.method)) this.sessions.requireCsrf(current, id, request.headers['x-csrf-token']);
    if (request.method === 'GET' && path === '/auth/session') await this.sessions.renew(current);
    return true;
  }
}
