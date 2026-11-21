// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { AsyncLocalStorage } from 'node:async_hooks';
import {
  HttpStatus,
  Inject,
  Injectable,
  Module,
  SetMetadata,
  type CallHandler,
  type DynamicModule,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { from, lastValueFrom, map, type Observable } from 'rxjs';
import type { TenantDatabase, TenantTransaction } from '../tenancy/transaction';
import { parseIdempotencyKey, runIdempotent } from './idempotency';

// NestJS side of S03: `@Idempotent('<operationId>')` on a handler whose operation declares the IdempotencyKey parameter.
// The interceptor checks the header, opens the account transaction, claims the key, and runs the handler inside it;
// the handler writes through `idempotentTransaction()` so its changes and the key commit together.

const IDEMPOTENT_OPERATION = 'sires:idempotency:operation';

/** Marks a handler as an operation with the IdempotencyKey parameter; the argument is its operationId. */
export const Idempotent = (operationId: string) => SetMetadata(IDEMPOTENT_OPERATION, operationId);

export const IDEMPOTENCY_OPTIONS = Symbol('IDEMPOTENCY_OPTIONS');

export interface IdempotencyOptions {
  /** Drizzle database connected with the service's `_app` role. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema of the service
  db: TenantDatabase<any>;
  /** Account of the request (from the authenticated Researcher); undefined is a server error. */
  accountId(request: IdempotentHttpRequest): string | undefined;
}

export interface IdempotentHttpRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema of the service
const transactions = new AsyncLocalStorage<TenantTransaction<any>>();

/** Transaction of the idempotent command being handled; throws outside an `@Idempotent` handler. */
export function idempotentTransaction<TSchema extends Record<string, unknown> = Record<string, never>>(): TenantTransaction<TSchema> {
  const tx = transactions.getStore();
  if (!tx) throw new TypeError('idempotentTransaction: only inside an @Idempotent handler');
  return tx as TenantTransaction<TSchema>;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(IDEMPOTENCY_OPTIONS) private readonly options: IdempotencyOptions,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler();
    const operation = this.reflector.get<string | undefined>(IDEMPOTENT_OPERATION, handler);
    if (!operation) return next.handle();

    const request = context.switchToHttp().getRequest<IdempotentHttpRequest>();
    const key = parseIdempotencyKey(request.headers['idempotency-key']);
    const accountId = this.options.accountId(request);
    if (!accountId) throw new TypeError(`@Idempotent(${operation}): no account for the request`);
    // The status Nest will send (@HttpCode, else 201 for POST): stored with the body, and the same on a replay.
    const status =
      this.reflector.get<number | undefined>(HTTP_CODE_METADATA, handler) ?? (request.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK);

    const result = runIdempotent(this.options.db, { accountId, key, operation, body: request.body }, (tx) =>
      transactions.run(tx, async () => ({ status, body: await lastValueFrom(next.handle(), { defaultValue: undefined }) })),
    );
    return from(result).pipe(map((response) => response.body));
  }
}

@Module({})
export class IdempotencyModule {
  /** Global: every `@Idempotent` handler of the service goes through the interceptor. */
  static forRoot(options: IdempotencyOptions): DynamicModule {
    return {
      module: IdempotencyModule,
      global: true,
      providers: [
        { provide: IDEMPOTENCY_OPTIONS, useValue: options },
        IdempotencyInterceptor,
        { provide: APP_INTERCEPTOR, useExisting: IdempotencyInterceptor },
      ],
      exports: [IDEMPOTENCY_OPTIONS, IdempotencyInterceptor],
    };
  }
}
