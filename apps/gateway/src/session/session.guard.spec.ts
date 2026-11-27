// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { ProblemException } from '@sires/platform';
import { describe, expect, it, vi } from 'vitest';
import { newSessionId } from './session.crypto';
import { SessionGuard } from './session.guard';
import type { CurrentSession, SessionService } from './session.service';

describe('SessionGuard — route đã khớp (H8/G3)', () => {
  const context = (method: string, route: string, url = route, cookie?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ method, routeOptions: { url: route }, url, headers: { cookie } }),
      }),
    }) as unknown as ExecutionContext;

  it('URL trông công khai không bỏ xác thực nếu route khớp là route tham số', async () => {
    const find = vi.fn();
    const guard = new SessionGuard({ find } as unknown as SessionService);
    await expect(guard.canActivate(context('GET', '/api/v1/auth/:action', '/api/v1/auth/login'))).rejects.toThrowError(
      ProblemException,
    );
    expect(find).not.toHaveBeenCalled();
  });

  it('route công khai đã khớp vẫn đi qua khi URL có query hoặc mã hóa', async () => {
    const guard = new SessionGuard({} as SessionService);
    expect(await guard.canActivate(context('GET', '/api/v1/auth/login', '/api/v1/auth/%6cogin?next=1'))).toBe(true);
    expect(await guard.canActivate(context('HEAD', '/health'))).toBe(true);
    await expect(guard.canActivate(context('POST', '/api/v1/auth/login'))).rejects.toThrowError(ProblemException);
  });

  it('gia hạn theo route session đã khớp và không gia hạn route tham số có URL giống session', async () => {
    const current = {} as CurrentSession;
    const renew = vi.fn();
    const guard = new SessionGuard({ find: vi.fn().mockResolvedValue(current), renew } as unknown as SessionService);
    const cookie = `sires_session=${newSessionId()}`;
    await guard.canActivate(context('GET', '/api/v1/auth/session', '/api/v1/auth/session?navigation=1', cookie));
    expect(renew).toHaveBeenCalledExactlyOnceWith(current);
    renew.mockClear();
    await guard.canActivate(context('GET', '/api/v1/auth/:action', '/api/v1/auth/session', cookie));
    expect(renew).not.toHaveBeenCalled();
  });
});
