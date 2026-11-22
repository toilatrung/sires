// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Service token cho mọi route của workspace trừ /health (PID-00017 S05; kiến trúc 10.4; PID-00003): guard toàn cục
// gọi ServiceAuthGuard của @sires/platform — thiếu hay sai token → 401 invalid_service_token, người gọi ngoài
// x-callers của route → 403 caller_not_allowed. /health (probe của chart, PID-00010 AC03) không cần token.
// Workspace không gọi service khác (kế hoạch 3.5): chỉ nạp bộ khóa công khai của môi trường, không cấu hình khóa ký;
// signer bắt buộc của ServiceAuthModule là một signer luôn từ chối.

import {
  type CanActivate,
  type DynamicModule,
  type ExecutionContext,
  Inject,
  Injectable,
  Module,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  deriveDevServiceKeys,
  HealthController,
  SERVICE_AUTH_ENV,
  ServiceAuthGuard,
  ServiceAuthModule,
  servicePublicKeysFromJwks,
  type ServiceAuthOptions,
  type ServicePublicKeys,
  type ServiceSigner,
} from '@sires/platform';

/** Tên service: `aud` mà workspace nhận. */
export const WORKSPACE_SERVICE = 'workspace' as const;

/** Signer bắt buộc của ServiceAuthModule; workspace không gọi đi nên mọi lần ký bị từ chối. */
export const NO_OUTGOING_SIGNER: ServiceSigner = {
  service: WORKSPACE_SERVICE,
  sign: () => Promise.reject(new Error('workspace không gọi service khác: không có khóa ký')),
};

/** Cấu hình service-auth sai hay thiếu: nêu tên biến, không nêu giá trị. */
export class ServiceAuthConfigError extends Error {
  override readonly name = 'ServiceAuthConfigError';
}

/**
 * Bộ khóa công khai của môi trường: SERVICE_AUTH_PUBLIC_KEYS (JWKS), hoặc — chỉ ngoài production —
 * SERVICE_AUTH_DEV_SEED (cùng seed với các service khác khi chạy pnpm local:up). Thiếu thì workspace không khởi động.
 */
export function workspaceServiceAuthOptions(env: NodeJS.ProcessEnv = process.env): ServiceAuthOptions {
  const jwks = env[SERVICE_AUTH_ENV.publicKeys]?.trim();
  let publicKeys: ServicePublicKeys;
  if (jwks) {
    try {
      publicKeys = servicePublicKeysFromJwks(jwks);
    } catch {
      throw new ServiceAuthConfigError(`workspace: ${SERVICE_AUTH_ENV.publicKeys} không phải JWKS hợp lệ`);
    }
  } else {
    const seed = env[SERVICE_AUTH_ENV.devSeed]?.trim();
    if (!seed) {
      throw new ServiceAuthConfigError(
        `workspace: thiếu ${SERVICE_AUTH_ENV.publicKeys} (hoặc ${SERVICE_AUTH_ENV.devSeed} khi chạy cục bộ)`,
      );
    }
    if (env.NODE_ENV === 'production') {
      throw new ServiceAuthConfigError(`workspace: ${SERVICE_AUTH_ENV.devSeed} bị từ chối khi NODE_ENV=production`);
    }
    try {
      publicKeys = deriveDevServiceKeys(seed).publicKeys;
    } catch {
      throw new ServiceAuthConfigError(`workspace: ${SERVICE_AUTH_ENV.devSeed} phải có ít nhất 16 ký tự`);
    }
  }
  return { service: WORKSPACE_SERVICE, publicKeys, signer: NO_OUTGOING_SIGNER };
}

/** Guard toàn cục: /health đi qua, mọi route khác qua ServiceAuthGuard. */
@Injectable()
export class WorkspaceServiceAuthGuard implements CanActivate {
  constructor(@Inject(ServiceAuthGuard) private readonly serviceAuth: ServiceAuthGuard) {}

  canActivate(context: ExecutionContext): Promise<boolean> | boolean {
    if (context.getClass() === HealthController) return true;
    return this.serviceAuth.canActivate(context);
  }
}

@Module({})
export class WorkspaceAuthModule {
  /** ServiceAuthModule với khóa công khai của môi trường và guard toàn cục; `options` thay cấu hình (test). */
  static forRoot(options: ServiceAuthOptions = workspaceServiceAuthOptions()): DynamicModule {
    return {
      module: WorkspaceAuthModule,
      imports: [ServiceAuthModule.forRoot(options)],
      providers: [{ provide: APP_GUARD, useClass: WorkspaceServiceAuthGuard }],
    };
  }
}
