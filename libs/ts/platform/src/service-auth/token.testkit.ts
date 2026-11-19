// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { generateServiceKeys, type ServiceSigner } from './keys';

// Test helpers: sign any header and claims, including the ones issueServiceToken refuses to produce.

export const keys = generateServiceKeys();

/** A UUIDv7-shaped id for claims. */
export const ACCOUNT_ID = '0193a5c2-7b1e-7c3a-9d2f-4e5b6a7c8d9e';
export const PROJECT_ID = '0193a5c2-7b1e-7c3a-9d2f-4e5b6a7c8d9f';
export const AGENT_RUN_ID = '0193a5c2-7b1e-7c3a-9d2f-4e5b6a7c8da0';

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** Signs `claims` as given with `signer`; `kid` defaults to the signer's service. */
export async function forge(
  signer: ServiceSigner,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = {},
): Promise<string> {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'ES256', typ: 'JWT', kid: signer.service, ...header })}.${encode(claims)}`;
  const signature = await signer.sign(Buffer.from(input));
  return `${input}.${Buffer.from(signature).toString('base64url')}`;
}

/** Claims of a valid Researcher token from `sub` to `aud`, expiring in 4 minutes. */
export function researcherClaims(sub: string, aud: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: 'sires-internal',
    sub,
    aud,
    exp: nowSeconds() + 240,
    act: { type: 'researcher', accountId: ACCOUNT_ID },
    accountId: ACCOUNT_ID,
    ...extra,
  };
}

/** Claims of a valid Agent Run token (signed by orchestration in tests). */
export function agentClaims(aud: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: 'sires-internal',
    sub: 'agent-core',
    aud,
    exp: nowSeconds() + 240,
    act: { type: 'agent', agent: 'synthesis', agentRunId: AGENT_RUN_ID, accountId: ACCOUNT_ID },
    accountId: ACCOUNT_ID,
    projectId: PROJECT_ID,
    agentRunId: AGENT_RUN_ID,
    agentScope: { read: ['evidence'], taskIds: [PROJECT_ID] },
    ...extra,
  };
}
