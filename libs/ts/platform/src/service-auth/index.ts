// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

export {
  isServiceName,
  MAX_SERVICE_TOKEN_TTL_SECONDS,
  SERVICE_NAMES,
  SERVICE_TOKEN_ISSUER,
  serviceTokenClaimsSchema,
  type ActorRef,
  type AgentName,
  type AgentScope,
  type ServiceName,
  type ServiceTokenClaims,
} from './claims';
export { ServiceTokenClient, type OutgoingCallAuth } from './client';
export {
  currentServiceAuth,
  runWithServiceAuth,
  ServiceAuth,
  serviceAuthContext,
  type ServiceAuthContext,
} from './context';
export {
  ApprovalEndpoint,
  bearerToken,
  InternalCallers,
  SERVICE_AUTH_OPTIONS,
  ServiceAuthGuard,
  type ServiceAuthOptions,
} from './guard';
export {
  deriveDevServiceKeys,
  generateServiceKeys,
  localServiceSigner,
  publicJwk,
  SERVICE_AUTH_ENV,
  serviceAuthKeysFromEnv,
  servicePublicKeys,
  servicePublicKeysFromJwks,
  type ServiceJwks,
  type ServicePublicKeys,
  type ServiceSigner,
} from './keys';
export { ServiceAuthModule } from './service-auth.module';
export {
  issueAgentRunToken,
  issueServiceToken,
  SERVICE_TOKEN_CLOCK_TOLERANCE_SECONDS,
  ServiceTokenError,
  toInvalidServiceToken,
  verifyServiceToken,
  type IssueAgentRunTokenInput,
  type IssueServiceTokenInput,
  type ServiceTokenFailure,
  type VerifiedServiceToken,
  type VerifyServiceTokenOptions,
} from './token';
