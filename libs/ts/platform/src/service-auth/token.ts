// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { decodeProtectedHeader, errors as joseErrors, jwtVerify } from 'jose';
import { ProblemException } from '../errors/problem.exception';
import {
  type ActorRef,
  type AgentName,
  type AgentScope,
  isServiceName,
  MAX_SERVICE_TOKEN_TTL_SECONDS,
  SERVICE_TOKEN_ISSUER,
  type ServiceName,
  type ServiceTokenClaims,
  serviceTokenClaimsSchema,
} from './claims';
import type { ServicePublicKeys, ServiceSigner } from './keys';

// Issuing and checking internal tokens (ServiceTokenClaims; PID-00003 H1–H4). Every refusal is
// `401 invalid_service_token`; only the caller list of a route answers 403 (guard.ts).

/** Clock skew accepted on `exp` and on the 5-minute lifetime, in seconds (EC04: chosen by Dev, see report.md). */
export const SERVICE_TOKEN_CLOCK_TOLERANCE_SECONDS = 30;

/** Why a token was refused. Logged and returned as `detail`; never contains the token. */
export type ServiceTokenFailure =
  | 'missing'
  | 'malformed'
  | 'unknown_kid'
  | 'bad_signature'
  | 'expired'
  | 'lifetime_too_long'
  | 'bad_issuer'
  | 'bad_claims'
  | 'subject_not_signer'
  | 'audience_mismatch'
  | 'audience_array_not_agent'
  | 'agent_audience_not_array'
  | 'agent_not_signed_by_orchestration'
  | 'agent_subject_not_agent_core'
  | 'agent_run_fields_missing'
  | 'apr_actor_not_gateway_researcher';

const FAILURE_DETAIL: Record<ServiceTokenFailure, string> = {
  missing: 'Thiếu header Authorization: Bearer',
  malformed: 'Token không đúng định dạng JWS ES256',
  unknown_kid: 'kid không có trong bộ khóa công khai',
  bad_signature: 'Chữ ký không khớp khóa công khai của kid',
  expired: 'Token hết hạn',
  lifetime_too_long: 'Hạn token xa hơn 5 phút',
  bad_issuer: 'iss không phải sires-internal',
  bad_claims: 'Claims không đúng ServiceTokenClaims',
  subject_not_signer: 'sub khác service ký',
  audience_mismatch: 'aud không phải service này',
  audience_array_not_agent: 'Chỉ token Agent Run có aud là mảng',
  agent_audience_not_array: 'Token Agent Run phải có aud là mảng',
  agent_not_signed_by_orchestration: 'Token agent không do orchestration ký',
  agent_subject_not_agent_core: 'Token agent phải có sub = agent-core',
  agent_run_fields_missing: 'Token agent thiếu agentRunId hoặc agentScope',
  apr_actor_not_gateway_researcher: 'Endpoint x-apr chỉ nhận Researcher do gateway ký',
};

/** A refused internal token. {@link toInvalidServiceToken} turns it into the HTTP answer. */
export class ServiceTokenError extends Error {
  constructor(
    readonly reason: ServiceTokenFailure,
    options?: { cause?: unknown },
  ) {
    super(FAILURE_DETAIL[reason], options);
    this.name = 'ServiceTokenError';
  }
}

/** Title of `401 invalid_service_token` (internal/responses.yaml#/InvalidServiceToken). */
export const INVALID_SERVICE_TOKEN_TITLE = 'Token nội bộ không hợp lệ';

/**
 * `401 invalid_service_token` for a refused token. The body never says why (PO, QC Lần 1 G2): the reason is only in
 * the `warn` log, so a caller cannot probe the checks one by one.
 */
export function toInvalidServiceToken(error: ServiceTokenError): ProblemException {
  return new ProblemException('invalid_service_token', { title: INVALID_SERVICE_TOKEN_TITLE, cause: error });
}

/** A token that passed every check of {@link verifyServiceToken}. */
export interface VerifiedServiceToken {
  /** The compact JWS as received, for forwarding an Agent Run or gateway token unchanged. */
  readonly token: string;
  /** Service whose key signed (`kid`). */
  readonly signer: ServiceName;
  readonly claims: ServiceTokenClaims;
}

export interface VerifyServiceTokenOptions {
  /** This service: the expected `aud`. */
  service: ServiceName;
  publicKeys: ServicePublicKeys;
  /** The route is an approval endpoint (`x-apr`): only a Researcher token signed by gateway passes (S03). */
  apr?: boolean;
  /** Current time in milliseconds; defaults to `Date.now()`. */
  now?: number;
}

/**
 * Checks an internal token: ES256 signature by the key of `kid`, `iss`, `exp` (still valid and at most 5 minutes
 * ahead), claims against ServiceTokenClaims, then the signer rules — `sub = kid` except for Agent Run tokens, `aud` =
 * this service except the two exceptions of H2 and H3. Throws {@link ServiceTokenError}.
 */
export async function verifyServiceToken(token: string, options: VerifyServiceTokenOptions): Promise<VerifiedServiceToken> {
  const nowMs = options.now ?? Date.now();
  let kid: unknown;
  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== 'ES256') throw new ServiceTokenError('malformed');
    kid = header.kid;
  } catch (error) {
    throw error instanceof ServiceTokenError ? error : new ServiceTokenError('malformed', { cause: error });
  }
  if (!isServiceName(kid)) throw new ServiceTokenError('unknown_kid');
  const key = options.publicKeys.get(kid);
  if (!key) throw new ServiceTokenError('unknown_kid');

  let payload: unknown;
  try {
    ({ payload } = await jwtVerify(token, key, {
      algorithms: ['ES256'],
      issuer: SERVICE_TOKEN_ISSUER,
      requiredClaims: ['exp'],
      clockTolerance: SERVICE_TOKEN_CLOCK_TOLERANCE_SECONDS,
      currentDate: new Date(nowMs),
    }));
  } catch (error) {
    throw new ServiceTokenError(joseFailure(error), { cause: error });
  }

  const parsed = serviceTokenClaimsSchema.safeParse(payload);
  if (!parsed.success) throw new ServiceTokenError('bad_claims', { cause: parsed.error });
  const claims = parsed.data;
  if (claims.exp - Math.floor(nowMs / 1000) > MAX_SERVICE_TOKEN_TTL_SECONDS + SERVICE_TOKEN_CLOCK_TOLERANCE_SECONDS) {
    throw new ServiceTokenError('lifetime_too_long');
  }
  checkSignerRules(kid, claims, options);
  return { token, signer: kid, claims };
}

function checkSignerRules(signer: ServiceName, claims: ServiceTokenClaims, options: VerifyServiceTokenOptions): void {
  const { service, apr = false } = options;
  if (claims.act.type === 'agent') {
    // Agent Run token (H1, H3): signed by orchestration for agent-core, scoped, aud lists the services it may read.
    if (signer !== 'orchestration') throw new ServiceTokenError('agent_not_signed_by_orchestration');
    if (claims.sub !== 'agent-core') throw new ServiceTokenError('agent_subject_not_agent_core');
    if (!claims.agentRunId || !claims.agentScope || claims.act.agentRunId !== claims.agentRunId) {
      throw new ServiceTokenError('agent_run_fields_missing');
    }
    if (apr) throw new ServiceTokenError('apr_actor_not_gateway_researcher'); // NFR-AUTHZ-001: no agent approval
    if (!Array.isArray(claims.aud)) throw new ServiceTokenError('agent_audience_not_array'); // P5, EC08
    if (!claims.aud.includes(service)) throw new ServiceTokenError('audience_mismatch');
    return;
  }
  if (claims.sub !== signer) throw new ServiceTokenError('subject_not_signer');
  if (Array.isArray(claims.aud)) throw new ServiceTokenError('audience_array_not_agent');
  if (apr) {
    // x-apr (H1, H2): Researcher signed by gateway, sent to this service or forwarded unchanged by orchestration.
    if (claims.act.type !== 'researcher' || signer !== 'gateway') {
      throw new ServiceTokenError('apr_actor_not_gateway_researcher');
    }
    if (claims.aud !== service && claims.aud !== 'orchestration') throw new ServiceTokenError('audience_mismatch');
    return;
  }
  if (claims.aud !== service) throw new ServiceTokenError('audience_mismatch');
}

function joseFailure(error: unknown): ServiceTokenFailure {
  if (error instanceof joseErrors.JWSSignatureVerificationFailed) return 'bad_signature';
  if (error instanceof joseErrors.JWTExpired) return 'expired';
  if (error instanceof joseErrors.JWTClaimValidationFailed) return error.claim === 'iss' ? 'bad_issuer' : 'bad_claims';
  return 'malformed';
}

export interface IssueServiceTokenInput {
  /** Service called. */
  audience: ServiceName;
  /** Researcher or system actor. Agent Run tokens are issued only by {@link issueAgentRunToken}. */
  actor: ActorRef;
  accountId?: string;
  projectId?: string;
  /** Lifetime, at most and by default 300 s. */
  ttlSeconds?: number;
  /** Current time in milliseconds; defaults to `Date.now()`. */
  now?: number;
}

/** Token for a call from the signer's service: `sub` = signer, `aud` = the service called, lifetime ≤ 5 minutes. */
export async function issueServiceToken(signer: ServiceSigner, input: IssueServiceTokenInput): Promise<string> {
  if (input.actor.type === 'agent') {
    throw new TypeError('issueServiceToken: act.type = agent is issued only by issueAgentRunToken (orchestration)');
  }
  return sign(signer, {
    sub: signer.service,
    aud: input.audience,
    act: input.actor,
    accountId: input.accountId,
    projectId: input.projectId,
  }, input);
}

export interface IssueAgentRunTokenInput {
  /** Services the Agent Run may read (H3); the token is refused by every other service. */
  audience: readonly ServiceName[];
  agentRunId: string;
  agentScope: AgentScope;
  agent?: AgentName;
  /** Only for agent = analysis (DEC-47). */
  instance?: 'A' | 'B';
  accountId?: string;
  projectId?: string;
  ttlSeconds?: number;
  now?: number;
}

/**
 * Agent Run token (H1, H3), signed by orchestration when the run starts and again on each heartbeat: `sub` =
 * agent-core, `act.type` = agent, `aud` = the services listed, lifetime ≤ 5 minutes.
 */
export async function issueAgentRunToken(signer: ServiceSigner, input: IssueAgentRunTokenInput): Promise<string> {
  if (signer.service !== 'orchestration') {
    throw new TypeError('issueAgentRunToken: only orchestration signs Agent Run tokens');
  }
  if (input.audience.length === 0) throw new TypeError('issueAgentRunToken: audience must list at least one service');
  const actor: ActorRef = {
    type: 'agent',
    agentRunId: input.agentRunId,
    ...(input.agent ? { agent: input.agent } : {}),
    ...(input.instance ? { instance: input.instance } : {}),
    ...(input.accountId ? { accountId: input.accountId } : {}),
  };
  return sign(signer, {
    sub: 'agent-core',
    aud: [...input.audience],
    act: actor,
    accountId: input.accountId,
    projectId: input.projectId,
    agentRunId: input.agentRunId,
    agentScope: input.agentScope,
  }, input);
}

async function sign(
  signer: ServiceSigner,
  fields: Omit<ServiceTokenClaims, 'iss' | 'exp'>,
  timing: { ttlSeconds?: number; now?: number },
): Promise<string> {
  const ttl = timing.ttlSeconds ?? MAX_SERVICE_TOKEN_TTL_SECONDS;
  if (!Number.isInteger(ttl) || ttl <= 0 || ttl > MAX_SERVICE_TOKEN_TTL_SECONDS) {
    throw new TypeError(`service token lifetime must be an integer in 1..${MAX_SERVICE_TOKEN_TTL_SECONDS} seconds`);
  }
  const iat = Math.floor((timing.now ?? Date.now()) / 1000);
  const claims = { iss: SERVICE_TOKEN_ISSUER, ...withoutUndefined(fields), iat, exp: iat + ttl };
  // Refuse to sign what the receiving guard would refuse as bad_claims.
  const checked = serviceTokenClaimsSchema.safeParse(claims);
  if (!checked.success) throw new TypeError(`service token claims invalid: ${checked.error.message}`);

  const header = { alg: 'ES256', typ: 'JWT', kid: signer.service };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = await signer.sign(Buffer.from(signingInput, 'ascii'));
  if (signature.length !== 64) throw new TypeError('ServiceSigner.sign must return the 64-byte r ‖ s of ES256');
  return `${signingInput}.${Buffer.from(signature).toString('base64url')}`;
}

function base64url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url');
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
