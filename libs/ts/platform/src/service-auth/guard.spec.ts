// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Controller, Get, Module, Post, UseGuards } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServiceApp } from '../bootstrap';
import { PROBLEM_TYPE_BASE } from '../errors/catalog';
import { type ServiceAuthContext, currentServiceAuth, ServiceAuth } from './context';
import { ApprovalEndpoint, bearerToken, InternalCallers, ServiceAuthGuard } from './guard';
import { generateServiceKeys } from './keys';
import { ServiceAuthModule } from './service-auth.module';
import { issueServiceToken } from './token';
import { ACCOUNT_ID, AGENT_RUN_ID, agentClaims, forge, keys, nowSeconds, PROJECT_ID, researcherClaims } from './token.testkit';

// A planning service with three internal routes, checked over real HTTP on Fastify.

let handled = 0;

@Controller('internal')
@UseGuards(ServiceAuthGuard)
class PlanningInternalController {
  @Get('tasks')
  @InternalCallers('workspace', 'gateway', 'agent-core', 'orchestration')
  tasks(@ServiceAuth() auth: ServiceAuthContext): Record<string, unknown> {
    handled += 1;
    return { ...auth, token: undefined, sameAsAls: currentServiceAuth() === auth };
  }

  @Get('only-planning')
  @InternalCallers('planning')
  onlyPlanning(): { ok: true } {
    handled += 1;
    return { ok: true };
  }

  @Get('undeclared')
  undeclared(): { ok: true } {
    handled += 1;
    return { ok: true };
  }

  @Post('tasks/approve')
  @InternalCallers('gateway')
  @ApprovalEndpoint()
  approve(@ServiceAuth() auth: ServiceAuthContext): { signer: string } {
    handled += 1;
    return { signer: auth.signer };
  }
}

@Module({
  imports: [ServiceAuthModule.forRoot({ service: 'planning', publicKeys: keys.publicKeys, signer: keys.signer('planning') })],
  controllers: [PlanningInternalController],
})
class PlanningModule {}

const lines: string[] = [];
let app: NestFastifyApplication;
let url: string;

beforeAll(async () => {
  app = await createServiceApp(PlanningModule, { name: 'planning', port: 0 }, {
    logDestination: { write: (line: string) => void lines.push(line) },
  });
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

beforeEach(() => {
  handled = 0;
});

async function call(path: string, token?: string, init: RequestInit & { authorization?: string } = {}) {
  const authorization = init.authorization ?? (token === undefined ? undefined : `Bearer ${token}`);
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: authorization === undefined ? {} : { authorization },
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, type: res.headers.get('content-type') };
}

/** 401 invalid_service_token and the handler did not run. */
async function expect401(path: string, token: string | undefined, init: RequestInit & { authorization?: string } = {}) {
  const before = handled;
  const { status, body, type } = await call(path, token, init);
  expect({ path, status, code: body['code'] }).toEqual({ path, status: 401, code: 'invalid_service_token' });
  expect(body['type']).toBe(`${PROBLEM_TYPE_BASE}invalid_service_token`);
  // Title of the contract example; the body never says which check failed (QC Lần 1 G2, G3).
  expect(body['title']).toBe('Token nội bộ không hợp lệ');
  expect(body).not.toHaveProperty('detail');
  expect(type).toMatch(/^application\/problem\+json/);
  expect(handled).toBe(before);
}

const POST = { method: 'POST' } as const;
const gateway = keys.signer('gateway');
const orchestration = keys.signer('orchestration');

describe('ServiceAuthGuard', () => {
  it('hết hạn và sai chữ ký qua guard: handler không chạy (PID-00003-AC01)', async () => {
    await expect401('/internal/tasks', await forge(keys.signer('workspace'), researcherClaims('workspace', 'planning', { exp: nowSeconds() - 120 })));
    const stranger = generateServiceKeys(['workspace']).signer('workspace');
    await expect401('/internal/tasks', await forge(stranger, researcherClaims('workspace', 'planning')));
    // The refusal is logged with its reason, never with the token.
    const token = await forge(stranger, researcherClaims('workspace', 'planning'));
    await expect401('/internal/tasks', token);
    expect(lines.join('\n')).toContain('bad_signature');
    expect(lines.join('\n')).not.toContain(token.split('.')[2]);
  });

  it('service ngoài x-callers (PID-00003-AC02)', async () => {
    const library = await issueServiceToken(keys.signer('library'), { audience: 'planning', actor: { type: 'system', component: 'indexer' } });
    const refused = await call('/internal/only-planning', library);
    expect(refused).toMatchObject({ status: 403, body: { code: 'caller_not_allowed', status: 403, title: 'Service không được phép gọi endpoint này' } });
    expect(handled).toBe(0);
    const planning = await issueServiceToken(keys.signer('planning'), { audience: 'planning', actor: { type: 'system', component: 'readiness' } });
    expect(await call('/internal/only-planning', planning)).toMatchObject({ status: 200, body: { ok: true } });
    expect(handled).toBe(1);
  });

  it('thiếu token (EC05)', async () => {
    await expect401('/internal/tasks', undefined);
    const token = await issueServiceToken(keys.signer('workspace'), { audience: 'planning', actor: { type: 'system', component: 'x' } });
    await expect401('/internal/tasks', undefined, { authorization: `Basic ${token}` });
    await expect401('/internal/tasks', undefined, { authorization: 'Bearer' });
    await expect401('/internal/tasks', undefined, { authorization: `Bearer ${token} extra` });
    expect(bearerToken(`bearer ${token}`)).toBe(token);
    expect(bearerToken(['Bearer a', 'Bearer b'])).toBeUndefined();
  });

  it('route thiếu x-callers (EC09)', async () => {
    for (const service of ['planning', 'workspace', 'gateway'] as const) {
      const token = await issueServiceToken(keys.signer(service), { audience: 'planning', actor: { type: 'system', component: 'x' } });
      expect(await call('/internal/undeclared', token)).toMatchObject({ status: 403, body: { code: 'caller_not_allowed' } });
    }
    expect(handled).toBe(0);
  });

  it('gắn actor, tài khoản, Agent Run vào ngữ cảnh request (P4)', async () => {
    const token = await issueServiceToken(keys.signer('workspace'), {
      audience: 'planning',
      actor: { type: 'researcher', accountId: ACCOUNT_ID },
      accountId: ACCOUNT_ID,
      projectId: PROJECT_ID,
    });
    const before = lines.length;
    const { status, body } = await call('/internal/tasks', token);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      signer: 'workspace',
      caller: 'workspace',
      actor: { type: 'researcher', accountId: ACCOUNT_ID },
      accountId: ACCOUNT_ID,
      projectId: PROJECT_ID,
      audience: 'planning',
      sameAsAls: true,
    });
    // Correlation ids of the request log (PID-00001 log context); the line may be written after the response.
    const completedLine = () =>
      lines
        .slice(before)
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .find((l) => l['msg'] === 'request completed');
    await vi.waitFor(() => expect(completedLine()).toBeDefined());
    const completed = completedLine();
    expect(completed).toMatchObject({ project_id: PROJECT_ID });
    expect(completed?.['account_hash']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('luật token agent (PID-00003-AC04)', async () => {
    // Orchestration, sub = agent-core, agentRunId and agentScope: passes, scope in the request context.
    const ok = await call('/internal/tasks', await forge(orchestration, agentClaims(['planning', 'research'])));
    expect(ok).toMatchObject({
      status: 200,
      body: { signer: 'orchestration', caller: 'agent-core', agentRunId: AGENT_RUN_ID, agentScope: { read: ['evidence'] } },
    });
    // Signed by another service, even agent-core itself.
    for (const signer of ['agent-core', 'workspace', 'gateway'] as const) {
      await expect401('/internal/tasks', await forge(keys.signer(signer), agentClaims(['planning'])));
    }
    // sub other than agent-core.
    await expect401('/internal/tasks', await forge(orchestration, agentClaims(['planning'], { sub: 'orchestration' })));
    // act.agentRunId other than agentRunId.
    await expect401('/internal/tasks', await forge(orchestration, agentClaims(['planning'], { act: { type: 'agent', agentRunId: PROJECT_ID } })));
  });

  it('token agent thiếu agentScope (EC01)', async () => {
    await expect401('/internal/tasks', await forge(orchestration, agentClaims(['planning'], { agentScope: undefined })));
    await expect401('/internal/tasks', await forge(orchestration, agentClaims(['planning'], { agentRunId: undefined })));
    await expect401('/internal/tasks', await forge(orchestration, agentClaims(['planning'], { act: { type: 'agent' } })));
  });

  it('luật x-apr (PID-00003-AC05, NFR-AUTHZ-001-AC01)', async () => {
    // Researcher signed by gateway: passes.
    expect(await call('/internal/tasks/approve', await forge(gateway, researcherClaims('gateway', 'planning')), POST)).toMatchObject({
      status: 201,
      body: { signer: 'gateway' },
    });
    // An agent cannot approve (NFR-AUTHZ-001), not even with a valid Agent Run token for planning.
    await expect401('/internal/tasks/approve', await forge(orchestration, agentClaims(['planning'])), POST);
    // Neither can a system actor, even signed by gateway.
    await expect401(
      '/internal/tasks/approve',
      await issueServiceToken(gateway, { audience: 'planning', actor: { type: 'system', component: 'x' } }),
      POST,
    );
  });

  it('researcher không do gateway ký ở x-apr (EC02)', async () => {
    for (const signer of ['workspace', 'orchestration', 'identity'] as const) {
      const token = await forge(keys.signer(signer), researcherClaims(signer, 'planning'));
      await expect401('/internal/tasks/approve', token, POST);
      // The same token is fine on a route without x-apr (actor kept by service-to-service calls, AC06).
      if (signer !== 'identity') expect((await call('/internal/tasks', token)).status).toBe(200);
    }
  });

  it('token chuyển tiếp aud orchestration (PID-00003-AC07, EC07)', async () => {
    // Gateway → orchestration token, forwarded unchanged by orchestration to planning.
    const forwarded = await forge(gateway, researcherClaims('gateway', 'orchestration'));
    expect(await call('/internal/tasks/approve', forwarded, POST)).toMatchObject({ status: 201 });
    await expect401('/internal/tasks', forwarded);
    // Strict aud on x-apr otherwise: a gateway token for another service is refused.
    await expect401('/internal/tasks/approve', await forge(gateway, researcherClaims('gateway', 'workspace')), POST);
  });

  it('aud mảng (PID-00003-AC08, EC08)', async () => {
    const forResearchAndKnowledge = await forge(orchestration, agentClaims(['research', 'knowledge']));
    await expect401('/internal/tasks', forResearchAndKnowledge);
    expect((await call('/internal/tasks', await forge(orchestration, agentClaims(['research', 'planning'])))).status).toBe(200);
    // An Agent Run token has an array aud, even for a single service (P5, EC08; QC Lần 1 G1).
    await expect401('/internal/tasks', await forge(orchestration, agentClaims('planning')));
    expect((await call('/internal/tasks', await forge(orchestration, agentClaims(['planning'])))).status).toBe(200);
    // Arrays are for Agent Run tokens only.
    await expect401('/internal/tasks', await forge(keys.signer('workspace'), researcherClaims('workspace', ['planning'])));
    await expect401('/internal/tasks/approve', await forge(gateway, researcherClaims('gateway', ['planning'])), POST);
  });

  it('aud orchestration không do gateway ký (EC11)', async () => {
    // Signed by orchestration itself, act researcher, aud orchestration.
    await expect401('/internal/tasks/approve', await forge(orchestration, researcherClaims('orchestration', 'orchestration')), POST);
    // Signed by gateway but not a Researcher.
    await expect401(
      '/internal/tasks/approve',
      await forge(gateway, { ...researcherClaims('gateway', 'orchestration'), act: { type: 'system', component: 'session' } }),
      POST,
    );
    // Agent Run token listing orchestration.
    await expect401('/internal/tasks/approve', await forge(orchestration, agentClaims(['orchestration', 'planning'])), POST);
  });
});
