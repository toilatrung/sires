// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { decodeJwt, decodeProtectedHeader } from 'jose';
import { describe, expect, it } from 'vitest';
import { deriveDevServiceKeys, generateServiceKeys, publicJwk, serviceAuthKeysFromEnv, servicePublicKeys, servicePublicKeysFromJwks } from './keys';
import {
  issueAgentRunToken,
  issueServiceToken,
  type ServiceTokenFailure,
  verifyServiceToken,
  type VerifyServiceTokenOptions,
} from './token';
import { ACCOUNT_ID, AGENT_RUN_ID, agentClaims, forge, keys, nowSeconds, PROJECT_ID, researcherClaims } from './token.testkit';

const workspace: VerifyServiceTokenOptions = { service: 'workspace', publicKeys: keys.publicKeys };

async function refusal(token: string, options: VerifyServiceTokenOptions = workspace): Promise<ServiceTokenFailure> {
  const outcome = await verifyServiceToken(token, options).then(
    () => 'accepted' as const,
    (error: { name?: string; reason?: ServiceTokenFailure }) => {
      expect(error.name).toBe('ServiceTokenError');
      return error.reason as ServiceTokenFailure;
    },
  );
  if (outcome === 'accepted') throw new Error('token was accepted');
  return outcome;
}

describe('phát và kiểm token nội bộ', () => {
  it('token do hàm phát tạo qua được hàm kiểm của service nhận', async () => {
    const token = await issueServiceToken(keys.signer('planning'), {
      audience: 'workspace',
      actor: { type: 'researcher', accountId: ACCOUNT_ID },
      accountId: ACCOUNT_ID,
      projectId: PROJECT_ID,
    });
    expect(decodeProtectedHeader(token)).toEqual({ alg: 'ES256', typ: 'JWT', kid: 'planning' });
    const { signer, claims } = await verifyServiceToken(token, workspace);
    expect(signer).toBe('planning');
    expect(claims).toMatchObject({
      iss: 'sires-internal',
      sub: 'planning',
      aud: 'workspace',
      act: { type: 'researcher', accountId: ACCOUNT_ID },
      accountId: ACCOUNT_ID,
      projectId: PROJECT_ID,
    });
    expect(claims.exp - nowSeconds()).toBeLessThanOrEqual(300);
  });

  it('hết hạn và sai chữ ký (PID-00003-AC01)', async () => {
    const planning = keys.signer('planning');
    expect(await refusal(await forge(planning, researcherClaims('planning', 'workspace', { exp: nowSeconds() - 60 })))).toBe(
      'expired',
    );
    // Within the 30 s clock tolerance a just-expired token still passes.
    await verifyServiceToken(await forge(planning, researcherClaims('planning', 'workspace', { exp: nowSeconds() - 5 })), workspace);

    // Signed with another key than the one of its kid.
    const other = generateServiceKeys(['planning']).signer('planning');
    expect(await refusal(await forge(other, researcherClaims('planning', 'workspace')))).toBe('bad_signature');
    // Payload changed after signing.
    const [header, , signature] = (await forge(planning, researcherClaims('planning', 'workspace'))).split('.');
    const tampered = Buffer.from(JSON.stringify(researcherClaims('planning', 'workspace', { accountId: PROJECT_ID }))).toString(
      'base64url',
    );
    expect(await refusal(`${header}.${tampered}.${signature}`)).toBe('bad_signature');
    // Empty signature, alg other than ES256 (including none), or not a JWS at all.
    expect(await refusal(`${header}.${tampered}.`)).toBe('bad_signature');
    expect(await refusal(await forge(planning, researcherClaims('planning', 'workspace'), { alg: 'HS256' }))).toBe('malformed');
    expect(await refusal(await forge(planning, researcherClaims('planning', 'workspace'), { alg: 'none' }))).toBe('malformed');
    expect(await refusal('not-a-token')).toBe('malformed');
    expect(await refusal(await forge(planning, researcherClaims('planning', 'workspace', { iss: 'eTroy' })))).toBe('bad_issuer');
  });

  it('sub khác service ký (PID-00003-AC03)', async () => {
    // Key of workspace, sub = gateway.
    const token = await forge(keys.signer('workspace'), researcherClaims('gateway', 'planning'));
    expect(await refusal(token, { service: 'planning', publicKeys: keys.publicKeys })).toBe('subject_not_signer');
  });

  it('kid lạ (EC03)', async () => {
    const onlyGateway = { service: 'workspace' as const, publicKeys: generateServiceKeys(['gateway']).publicKeys };
    expect(await refusal(await forge(keys.signer('planning'), researcherClaims('planning', 'workspace')), onlyGateway)).toBe(
      'unknown_kid',
    );
    expect(await refusal(await forge(keys.signer('planning'), researcherClaims('planning', 'workspace'), { kid: 'eTroy' }))).toBe(
      'unknown_kid',
    );
    expect(
      await refusal(await forge(keys.signer('planning'), researcherClaims('planning', 'workspace'), { kid: undefined })),
    ).toBe('unknown_kid');
  });

  it('hạn quá 5 phút (EC04)', async () => {
    const planning = keys.signer('planning');
    expect(await refusal(await forge(planning, researcherClaims('planning', 'workspace', { exp: nowSeconds() + 3600 })))).toBe(
      'lifetime_too_long',
    );
    expect(await refusal(await forge(planning, researcherClaims('planning', 'workspace', { exp: nowSeconds() + 340 })))).toBe(
      'lifetime_too_long',
    );
    // 5 minutes plus the 30 s tolerance still passes.
    await verifyServiceToken(await forge(planning, researcherClaims('planning', 'workspace', { exp: nowSeconds() + 320 })), workspace);
    expect(await refusal(await forge(planning, { ...researcherClaims('planning', 'workspace'), exp: undefined }))).toBe('bad_claims');
    await expect(
      issueServiceToken(planning, { audience: 'workspace', actor: { type: 'system', component: 'x' }, ttlSeconds: 301 }),
    ).rejects.toThrow(TypeError);
  });

  it('aud sai (EC06)', async () => {
    const planning = keys.signer('planning');
    expect(await refusal(await forge(planning, researcherClaims('planning', 'library')))).toBe('audience_mismatch');
    expect(await refusal(await forge(planning, researcherClaims('planning', 'eTroy')))).toBe('bad_claims');
    expect(await refusal(await forge(planning, researcherClaims('planning', ['workspace'])))).toBe('audience_array_not_agent');
  });

  it('claims sai schema', async () => {
    const planning = keys.signer('planning');
    for (const extra of [{ act: { type: 'robot' } }, { accountId: 'không-phải-uuid' }, { act: undefined }, { sub: 'eTroy' }]) {
      expect(await refusal(await forge(planning, researcherClaims('planning', 'workspace', extra)))).toBe('bad_claims');
    }
  });

  it('phát token Agent Run (PID-00003-AC08)', async () => {
    const orchestration = keys.signer('orchestration');
    const issue = () =>
      issueAgentRunToken(orchestration, {
        audience: ['research', 'knowledge'],
        agentRunId: AGENT_RUN_ID,
        agentScope: { read: ['evidence'] },
        agent: 'synthesis',
        accountId: ACCOUNT_ID,
        projectId: PROJECT_ID,
      });
    // First issue and refresh on heartbeat: same shape, each with exp ≤ 5 minutes.
    for (const token of [await issue(), await issue()]) {
      const claims = decodeJwt(token);
      expect(decodeProtectedHeader(token).kid).toBe('orchestration');
      expect(claims).toMatchObject({
        sub: 'agent-core',
        aud: ['research', 'knowledge'],
        act: { type: 'agent', agent: 'synthesis', agentRunId: AGENT_RUN_ID, accountId: ACCOUNT_ID },
        agentRunId: AGENT_RUN_ID,
        agentScope: { read: ['evidence'] },
      });
      expect((claims.exp ?? Infinity) - nowSeconds()).toBeLessThanOrEqual(300);
      const verified = await verifyServiceToken(token, { service: 'research', publicKeys: keys.publicKeys });
      expect(verified.claims.agentScope).toEqual({ read: ['evidence'] });
    }

    // Only orchestration issues them; the generic issuer never signs act.type = agent.
    await expect(
      issueAgentRunToken(keys.signer('gateway'), { audience: ['research'], agentRunId: AGENT_RUN_ID, agentScope: {} }),
    ).rejects.toThrow(/only orchestration/);
    await expect(
      issueAgentRunToken(orchestration, { audience: [], agentRunId: AGENT_RUN_ID, agentScope: {} }),
    ).rejects.toThrow(TypeError);
    await expect(
      issueServiceToken(keys.signer('research'), { audience: 'knowledge', actor: { type: 'agent', agentRunId: AGENT_RUN_ID } }),
    ).rejects.toThrow(/issueAgentRunToken/);
    // A valid Agent Run token, forged directly, is accepted the same way.
    await verifyServiceToken(await forge(orchestration, agentClaims(['knowledge'])), { service: 'knowledge', publicKeys: keys.publicKeys });
  });
});

describe('bộ khóa', () => {
  it('JWKS công khai và khóa dev dẫn xuất từ seed', async () => {
    const dev = deriveDevServiceKeys('sires-local-development-seed');
    const again = deriveDevServiceKeys('sires-local-development-seed');
    // Same seed, same keys: two processes started by pnpm local:up verify each other's tokens.
    const token = await issueServiceToken(dev.signer('gateway'), {
      audience: 'planning',
      actor: { type: 'researcher', accountId: ACCOUNT_ID },
    });
    await verifyServiceToken(token, { service: 'planning', publicKeys: again.publicKeys });
    // Another seed is another key set.
    const otherSeed = deriveDevServiceKeys('another-development-seed');
    expect(await refusal(token, { service: 'planning', publicKeys: otherSeed.publicKeys })).toBe('bad_signature');

    // JWKS round trip carries public parts only.
    const jwks = { keys: [...dev.privateKeys].map(([service, key]) => publicJwk(service, key)) };
    expect(JSON.stringify(jwks)).not.toContain('"d"');
    await verifyServiceToken(token, { service: 'planning', publicKeys: servicePublicKeysFromJwks(JSON.stringify(jwks)) });
    expect(() => servicePublicKeysFromJwks({ keys: [{ ...jwks.keys[0], kid: 'eTroy' }] })).toThrow(/not a service name/);
    expect(() => deriveDevServiceKeys('short')).toThrow(TypeError);
  });

  it('nạp khóa từ biến môi trường', async () => {
    const dev = deriveDevServiceKeys('sires-local-development-seed', ['gateway', 'planning']);
    const fromSeed = serviceAuthKeysFromEnv('gateway', { SERVICE_AUTH_DEV_SEED: 'sires-local-development-seed' });
    const token = await issueServiceToken(fromSeed.signer, { audience: 'planning', actor: { type: 'system', component: 'test' } });
    await verifyServiceToken(token, { service: 'planning', publicKeys: dev.publicKeys });

    const privateJwk = JSON.stringify(dev.privateKeys.get('gateway')?.export({ format: 'jwk' }));
    const jwks = JSON.stringify({ keys: [...dev.privateKeys].map(([service, key]) => publicJwk(service, key)) });
    const fromJwk = serviceAuthKeysFromEnv('gateway', { SERVICE_AUTH_PRIVATE_KEY: privateJwk, SERVICE_AUTH_PUBLIC_KEYS: jwks });
    await verifyServiceToken(
      await issueServiceToken(fromJwk.signer, { audience: 'planning', actor: { type: 'system', component: 'test' } }),
      { service: 'planning', publicKeys: fromJwk.publicKeys },
    );

    expect(() => serviceAuthKeysFromEnv('gateway', {})).toThrow(/missing/);
    // Half a configuration never falls back to the seed (QC Lần 1 G5).
    const seed = 'sires-local-development-seed';
    expect(() => serviceAuthKeysFromEnv('gateway', { SERVICE_AUTH_PRIVATE_KEY: privateJwk, SERVICE_AUTH_DEV_SEED: seed })).toThrow(
      /SERVICE_AUTH_PUBLIC_KEYS is missing/,
    );
    expect(() => serviceAuthKeysFromEnv('gateway', { SERVICE_AUTH_PUBLIC_KEYS: jwks, SERVICE_AUTH_DEV_SEED: seed })).toThrow(
      /SERVICE_AUTH_PRIVATE_KEY is missing/,
    );
    // A value that is not a JWK: the error names the variable, never quotes the value (QC Lần 1 G4).
    const pasted = 'MHcCAQEEIBsecretsecretsecret';
    for (const env of [
      { SERVICE_AUTH_PRIVATE_KEY: pasted, SERVICE_AUTH_PUBLIC_KEYS: jwks },
      { SERVICE_AUTH_PRIVATE_KEY: JSON.stringify({ kty: 'EC', crv: 'P-256', d: pasted }), SERVICE_AUTH_PUBLIC_KEYS: jwks },
      { SERVICE_AUTH_PRIVATE_KEY: privateJwk, SERVICE_AUTH_PUBLIC_KEYS: pasted },
    ]) {
      let message = '';
      try {
        serviceAuthKeysFromEnv('gateway', env);
      } catch (error) {
        message = String(error);
      }
      expect(message).toMatch(/SERVICE_AUTH_(PRIVATE_KEY|PUBLIC_KEYS) is not/);
      expect(message).not.toContain('MHcC');
    }
    expect(() =>
      serviceAuthKeysFromEnv('gateway', { SERVICE_AUTH_DEV_SEED: 'sires-local-development-seed', NODE_ENV: 'production' }),
    ).toThrow(/refused/);
  });
  it('bộ khóa công khai từ chối JWK riêng có "d", lỗi không nêu giá trị khóa', () => {
    const dev = generateServiceKeys(['gateway', 'planning']);
    const privateJwk = { ...dev.privateKeys.get('gateway')?.export({ format: 'jwk' }), kid: 'gateway' };
    const secret = String(privateJwk.d);
    const publicOnly = publicJwk('planning', dev.privateKeys.get('planning') as never);
    const jwks = JSON.stringify({ keys: [publicOnly, privateJwk] });

    let message = '';
    try {
      servicePublicKeysFromJwks(jwks);
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/kid “gateway” is a private JWK/);
    expect(message).not.toContain(secret);

    // From the environment the error names the variable and the kid, never the value.
    const signer = JSON.stringify(dev.privateKeys.get('gateway')?.export({ format: 'jwk' }));
    message = '';
    try {
      serviceAuthKeysFromEnv('gateway', { SERVICE_AUTH_PRIVATE_KEY: signer, SERVICE_AUTH_PUBLIC_KEYS: jwks });
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/SERVICE_AUTH_PUBLIC_KEYS is not a valid JWKS: kid “gateway” is a private JWK/);
    expect(message).not.toContain(secret);

    // A JWK handed to servicePublicKeys directly is refused the same way; KeyObjects (dev key sets) still work.
    expect(() => servicePublicKeys({ gateway: privateJwk })).toThrow(/“gateway” is a private JWK/);
    expect(servicePublicKeys({ gateway: dev.privateKeys.get('gateway') }).get('gateway')?.type).toBe('public');
  });
});
