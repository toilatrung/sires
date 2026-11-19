// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Controller, Get, Inject, Module, Query, UseGuards } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { decodeJwt } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServiceApp } from '../bootstrap';
import { type OutgoingCallAuth, ServiceTokenClient } from './client';
import { type ServiceAuthContext, ServiceAuth } from './context';
import { InternalCallers, ServiceAuthGuard } from './guard';
import { ServiceAuthModule } from './service-auth.module';
import { verifyServiceToken } from './token';
import { ACCOUNT_ID, agentClaims, forge, keys, nowSeconds, PROJECT_ID, researcherClaims } from './token.testkit';

// Two services over real HTTP: workspace handles a request and calls planning through ServiceTokenClient; planning
// checks the call with ServiceAuthGuard and answers with the caller it saw.

@Controller('internal')
@UseGuards(ServiceAuthGuard)
class PlanningController {
  @Get('whoami')
  // agent-core: a forwarded Agent Run token keeps sub = agent-core (OQ-110: agent-core must be in x-callers).
  @InternalCallers('workspace', 'agent-core')
  whoami(@ServiceAuth() auth: ServiceAuthContext): Record<string, unknown> {
    const { iat, exp } = decodeJwt(auth.token);
    return { ...auth, token: undefined, iat, exp };
  }
}

@Module({
  imports: [ServiceAuthModule.forRoot({ service: 'planning', publicKeys: keys.publicKeys, signer: keys.signer('planning') })],
  controllers: [PlanningController],
})
class PlanningModule {}

let planningUrl = '';

@Controller('internal')
@UseGuards(ServiceAuthGuard)
class WorkspaceController {
  constructor(@Inject(ServiceTokenClient) private readonly client: ServiceTokenClient) {}

  /** Calls planning on behalf of the request being handled; `mode` picks the OutgoingCallAuth. */
  @Get('relay')
  @InternalCallers('gateway', 'agent-core')
  async relay(@Query('mode') mode?: string): Promise<unknown> {
    const auth: OutgoingCallAuth =
      mode === 'forward' ? { forwardAgentRunToken: true } : mode === 'system' ? { component: 'project-metadata' } : {};
    try {
      const res = await this.client.fetch('planning', `${planningUrl}/internal/whoami`, {}, auth);
      return { status: res.status, body: await res.json() };
    } catch (error) {
      return { thrown: (error as Error).message };
    }
  }
}

@Module({
  imports: [ServiceAuthModule.forRoot({ service: 'workspace', publicKeys: keys.publicKeys, signer: keys.signer('workspace') })],
  controllers: [WorkspaceController],
})
class WorkspaceModule {}

const quiet = { logDestination: { write: () => undefined } };
let planning: NestFastifyApplication;
let workspace: NestFastifyApplication;
let workspaceUrl = '';

beforeAll(async () => {
  planning = await createServiceApp(PlanningModule, { name: 'planning', port: 0 }, quiet);
  await planning.listen(0, '127.0.0.1');
  planningUrl = await planning.getUrl();
  workspace = await createServiceApp(WorkspaceModule, { name: 'workspace', port: 0 }, quiet);
  await workspace.listen(0, '127.0.0.1');
  workspaceUrl = await workspace.getUrl();
});

afterAll(async () => {
  await workspace?.close();
  await planning?.close();
});

async function relay(token: string, mode = ''): Promise<Record<string, unknown>> {
  const res = await fetch(`${workspaceUrl}/internal/relay?mode=${mode}`, { headers: { authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

describe('ServiceTokenClient', () => {
  it('lời gọi đi qua guard (PID-00003-AC06)', async () => {
    // Gateway called workspace for a Researcher; workspace calls planning.
    const incoming = await forge(keys.signer('gateway'), researcherClaims('gateway', 'workspace', { projectId: PROJECT_ID }));
    const before = nowSeconds();
    const { status, body } = (await relay(incoming)) as { status: number; body: Record<string, unknown> };
    expect(status).toBe(200);
    expect(body).toMatchObject({
      signer: 'workspace',
      caller: 'workspace',
      audience: 'planning',
      actor: { type: 'researcher', accountId: ACCOUNT_ID },
      accountId: ACCOUNT_ID,
      projectId: PROJECT_ID,
    });
    const after = nowSeconds();
    const iat = body['iat'] as number;
    const exp = body['exp'] as number;
    expect(iat).toBeGreaterThanOrEqual(before);
    expect(iat).toBeLessThanOrEqual(after);
    expect(exp - iat).toBeLessThanOrEqual(300);
    expect(exp - iat).toBeGreaterThan(240);
  });

  it('lời gọi từ job (EC10)', async () => {
    // No incoming request: the job names its component.
    const client = new ServiceTokenClient({ signer: keys.signer('workspace') });
    const header = await client.authorization('planning', { component: 'outbox-relay', accountId: ACCOUNT_ID });
    const { signer, claims } = await verifyServiceToken(header.replace(/^Bearer /, ''), {
      service: 'planning',
      publicKeys: keys.publicKeys,
    });
    expect({ signer, sub: claims.sub, aud: claims.aud, act: claims.act, accountId: claims.accountId }).toEqual({
      signer: 'workspace',
      sub: 'workspace',
      aud: 'planning',
      act: { type: 'system', component: 'outbox-relay' },
      accountId: ACCOUNT_ID,
    });
    const res = await client.fetch('planning', `${planningUrl}/internal/whoami`, {}, { component: 'outbox-relay' });
    expect(await res.json()).toMatchObject({ caller: 'workspace', actor: { type: 'system', component: 'outbox-relay' } });
    // Without a component there is no actor to sign for.
    await expect(client.authorization('planning')).rejects.toThrow(/component/);
  });

  it('request mang token Agent Run: bên gọi chọn chuyển tiếp hoặc tự ký (OQ-110)', async () => {
    const agentRun = await forge(keys.signer('orchestration'), agentClaims(['workspace', 'planning']));
    // Default refuses to guess, and never signs act.type = agent.
    expect(await relay(agentRun)).toMatchObject({ thrown: expect.stringMatching(/Agent Run token/) });
    // Forwarded unchanged: planning sees the Agent Run token itself.
    expect(await relay(agentRun, 'forward')).toMatchObject({
      status: 200,
      body: { signer: 'orchestration', caller: 'agent-core', agentScope: { read: ['evidence'] } },
    });
    // Own work: system actor of workspace, account and project from the incoming token.
    expect(await relay(agentRun, 'system')).toMatchObject({
      status: 200,
      body: { signer: 'workspace', actor: { type: 'system', component: 'project-metadata' }, accountId: ACCOUNT_ID, projectId: PROJECT_ID },
    });
    // planning not in aud: forwarding is refused before sending.
    const notForPlanning = await forge(keys.signer('orchestration'), agentClaims(['workspace', 'research']));
    expect(await relay(notForPlanning, 'forward')).toMatchObject({ thrown: expect.stringMatching(/not in the aud/) });
    // Forwarding a non-agent token is refused.
    const researcher = await forge(keys.signer('gateway'), researcherClaims('gateway', 'workspace'));
    expect(await relay(researcher, 'forward')).toMatchObject({ thrown: expect.stringMatching(/needs a request carrying/) });
  });

  it('module từ chối signer của service khác', () => {
    expect(() =>
      ServiceAuthModule.forRoot({ service: 'planning', publicKeys: keys.publicKeys, signer: keys.signer('workspace') }),
    ).toThrow(/signer of “workspace”/);
  });
});
