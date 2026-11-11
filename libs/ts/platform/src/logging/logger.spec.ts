// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { uuidv7 } from '../tenancy/uuid';
import { runWithLogContext, setLogContext } from './context';
import { createLogger } from './logger';
import { looksLikeSecret, REDACTED, redactString } from './redact';

const HASH_KEY = 'test-hash-key';

/** Sample secrets, generated per run so that no key-like literal sits in the repository. */
function sampleSecrets() {
  return {
    anthropic: `sk-ant-api03-${randomBytes(48).toString('base64url')}`,
    openai: `sk-proj-${randomBytes(36).toString('base64url')}`,
    google: `AIza${randomBytes(27).toString('base64url').slice(0, 35)}`,
    highEntropy: randomBytes(64).toString('base64url'),
    apiKeyField: 'short-but-secret-value',
    authorizationField: `Bearer ${randomBytes(24).toString('base64url')}`,
  };
}

function captureLogger() {
  const lines: string[] = [];
  const logger = createLogger({
    service: 'sample',
    level: 'debug',
    accountHashKey: HASH_KEY,
    destination: { write: (line: string) => void lines.push(line) },
  });
  const records = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  const text = () => lines.join('');
  return { logger, lines, records, text };
}

const hmac = (accountId: string) => createHmac('sha256', HASH_KEY).update(accountId).digest('hex');

describe('logger che dữ liệu', () => {
  it('che dữ liệu nhạy cảm', () => {
    const secrets = sampleSecrets();
    const accountId = uuidv7();
    const { logger, records, text } = captureLogger();

    logger.info(
      {
        accountId,
        api_key: secrets.apiKeyField,
        authorization: secrets.authorizationField,
        note: `entropy ${secrets.highEntropy}`,
      },
      `gọi provider với ${secrets.anthropic}, ${secrets.openai} và ${secrets.google}`,
    );

    const [record] = records();
    expect(record).toMatchObject({ service: 'sample', api_key: REDACTED, authorization: REDACTED });
    expect(record?.msg).toBe(`gọi provider với ${REDACTED}, ${REDACTED} và ${REDACTED}`);
    expect(record?.note).toBe(`entropy ${REDACTED}`);
    expect(record?.account_hash).toBe(hmac(accountId));
    expect(record).not.toHaveProperty('accountId');
    for (const value of [...Object.values(secrets), accountId]) {
      expect(text()).not.toContain(value);
    }
  });

  it('quét log bằng chuỗi mẫu không còn giá trị nhạy cảm (NFR-OBS-002-AC01)', () => {
    const secrets = sampleSecrets();
    const accountId = uuidv7();
    const { logger, lines, text } = captureLogger();

    logger.info('thông điệp %s và %o', secrets.anthropic, { key: secrets.openai });
    logger.child({ apiKey: secrets.apiKeyField, account_id: accountId }).warn('bindings của child logger');
    logger.error(new Error(`provider từ chối key ${secrets.google}`), 'lỗi provider');
    logger.error({ err: new Error(`Authorization: ${secrets.authorizationField}`) }, 'lỗi gọi HTTP');
    logger.debug({ headers: { 'x-api-key': secrets.apiKeyField, Authorization: secrets.authorizationField } });
    logger.info({ batch: [{ value: secrets.highEntropy }, [secrets.openai]] }, 'mảng lồng');
    logger.info({ token: secrets.highEntropy, password: 'p@ss', cookie: 'sires_session=abc' }, 'trường bí mật khác');

    expect(lines).toHaveLength(7);
    const hits = [...Object.values(secrets), accountId, 'p@ss', 'sires_session=abc'].filter((sample) => text().includes(sample));
    expect(hits).toEqual([]);
  });

  it('che trong object lồng', () => {
    const secrets = sampleSecrets();
    const accountId = uuidv7();
    const { logger, records } = captureLogger();

    logger.info(
      {
        provider: {
          connection: { apiKey: secrets.apiKeyField, owner: { accountId } },
          request: { headers: { Authorization: secrets.authorizationField } },
          detail: { deeper: { message: `upstream echoed ${secrets.anthropic}` } },
        },
      },
      'kết nối provider',
    );
    logger.error({ err: new Error(`invalid key ${secrets.openai}`) }, 'lỗi lồng trong chuỗi thông báo');

    const [nested, failure] = records();
    expect(nested?.provider).toEqual({
      connection: { apiKey: REDACTED, owner: { account_hash: hmac(accountId) } },
      request: { headers: { Authorization: REDACTED } },
      detail: { deeper: { message: `upstream echoed ${REDACTED}` } },
    });
    const err = failure?.err as { message: string; stack: string };
    expect(err.message).toBe(`invalid key ${REDACTED}`);
    expect(err.stack).not.toContain(secrets.openai);
  });

  it('gắn mã tương quan của NFR-OBS-001 khi có', () => {
    const { logger, records } = captureLogger();
    const ids = { accountId: uuidv7(), projectId: uuidv7(), taskId: uuidv7(), workflowId: uuidv7(), agentRunId: uuidv7(), buildId: uuidv7() };

    logger.info('ngoài ngữ cảnh');
    runWithLogContext({ projectId: ids.projectId }, () => {
      setLogContext({ accountId: ids.accountId, taskId: ids.taskId, workflowId: ids.workflowId });
      setLogContext({ agentRunId: ids.agentRunId, buildId: ids.buildId });
      logger.info('trong ngữ cảnh');
    });
    expect(setLogContext({ projectId: ids.projectId })).toBe(false);

    const [outside, inside] = records();
    expect(outside).not.toHaveProperty('project_id');
    expect(inside).toMatchObject({
      account_hash: hmac(ids.accountId),
      project_id: ids.projectId,
      task_id: ids.taskId,
      workflow_id: ids.workflowId,
      agent_run_id: ids.agentRunId,
      build_id: ids.buildId,
    });
  });

  it('giữ nguyên mã tương quan và định danh thường', () => {
    const id = uuidv7();
    const traceId = randomBytes(16).toString('hex');
    const plain = `task-1234567890abcdefghij project ${id} trace ${traceId} ContextSnapshotOutdatedEvent2026 risk-assessment-sk-like`;
    expect(redactString(plain)).toBe(plain);
    expect(looksLikeSecret('ReferenceIndexingStatusChanged01')).toBe(false);
  });

  it('thiếu khóa băm vẫn không ghi accountId dạng rõ', () => {
    const lines: string[] = [];
    const logger = createLogger({ service: 'sample', destination: { write: (line: string) => void lines.push(line) } });
    const accountId = uuidv7();
    logger.info({ accountId }, 'không có khóa');
    const [warning, record] = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(warning?.level).toBe(40);
    expect(record?.account_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(lines.join('')).not.toContain(accountId);
  });
});
