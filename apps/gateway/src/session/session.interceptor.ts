// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { type CallHandler, type ExecutionContext, Inject, Injectable, type NestInterceptor } from '@nestjs/common';
import { mergeMap, type Observable } from 'rxjs';
import { type SessionRequest, WRITE_METHODS } from './session.guard';
import { SessionService } from './session.service';

/** All guards and the handler must accept a write before it can extend the idle window. */
@Injectable()
export class SessionActivityInterceptor implements NestInterceptor {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<SessionRequest>();
    const current = request.session;
    if (!current || !WRITE_METHODS.has(request.method)) return next.handle();
    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        if (http.getResponse<{ statusCode: number }>().statusCode < 400) await this.sessions.renew(current);
        return body;
      }),
    );
  }
}
