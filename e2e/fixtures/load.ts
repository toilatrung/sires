// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import type { PublicApi } from '@sires/contracts';
import type { AccountLabel, FixtureData } from './generate.ts';

type Operations = PublicApi.operations;
type JsonBody<K extends keyof Operations> = Operations[K] extends {
  requestBody: { content: { 'application/json': infer Body } };
} ? Body : never;

export interface LoadCall {
  account: AccountLabel;
  operationId: keyof Operations;
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  capture?: string;
}

/** Lời gọi dùng ID do server trả, không gửi UUID fixture như ID của entity mới. */
export function createLoadPlan(data: FixtureData): LoadCall[] {
  const calls: LoadCall[] = [];
  const add = (call: Omit<LoadCall, 'account'>, account: AccountLabel = 'A') => calls.push({ account, ...call });
  for (const { label } of data.accounts) {
    add({ operationId: 'getSession', method: 'GET', path: '/auth/session', capture: `${label}.session` }, label);
    add({ operationId: 'getMe', method: 'GET', path: '/me', capture: `${label}.account` }, label);
  }
  const csrf = { 'X-CSRF-Token': '${A.session.csrfToken}' };
  for (const { label, input, project } of data.projects) {
    const body: JsonBody<'createProject'> = input;
    add({ operationId: 'createProject', method: 'POST', path: '/projects', body,
      headers: { ...csrf, 'Idempotency-Key': project.id }, capture: label });
  }
  for (const connection of data.connections) {
    const body: JsonBody<'createProviderConnection'> = {
      name: connection.name, provider: connection.provider,
      apiKey: connection.apiKeyEnv ? `\${env.${connection.apiKeyEnv}}` : connection.invalidKey!,
    };
    const capture = `connection.${connection.id}`;
    add({ operationId: 'createProviderConnection', method: 'POST', path: '/provider-connections', body,
      headers: csrf, capture });
    add({ operationId: 'testProviderConnection', method: 'POST', path: `/provider-connections/\${${capture}.id}/test`, headers: csrf });
  }
  for (const { input, reference, pdfBase64 } of data.references) {
    const body: JsonBody<'createReferenceManually'> = input;
    const capture = `reference.${reference.id}`;
    add({ operationId: 'createReferenceManually', method: 'POST', path: '/references', body,
      headers: { ...csrf, 'Idempotency-Key': reference.id }, capture });
    if (pdfBase64) add({ operationId: 'uploadReferenceDocument', method: 'PUT',
      path: `/references/\${${capture}.items[0].id}/document`, headers: csrf,
      body: { file: { fileName: reference.document!.fileName, mimeType: 'application/pdf', base64: pdfBase64 } } });
  }
  for (let offset = 0; offset < data.references.length; offset += 200) {
    const body: JsonBody<'decideReferences'> = { decisions: data.references.slice(offset, offset + 200).map(({ reference }) => ({
      referenceId: `\${reference.${reference.id}.items[0].id}`, decision: 'approve', metadataVersion: 1,
    })) };
    add({ operationId: 'decideReferences', method: 'POST', path: '/references/approvals', body,
      headers: { ...csrf, 'Idempotency-Key': `fixtures-${data.projects[0].project.id}-approve-${offset}` } });
  }
  for (const { label } of data.projects) {
    const body: JsonBody<'selectReferencesForProject'> = {
      referenceIds: data.references.slice(0, data.profile === 'scale' ? 500 : 3)
        .map(({ reference }) => `\${reference.${reference.id}.items[0].id}`),
    };
    add({ operationId: 'selectReferencesForProject', method: 'POST', path: `/projects/\${${label}.id}/references`, body, headers: csrf });
  }
  return calls;
}

/** PID-00034 chỉ chạy thử; việc thực thi trên staging thuộc PID cổng sau. */
export function loadFixtures(data: FixtureData, options: {
  baseURL?: string;
  dryRun?: boolean;
  write?: (line: string) => void;
} = {}): LoadCall[] {
  const baseURL = new URL(options.baseURL ?? process.env.E2E_BASE_URL ?? 'http://localhost:5173');
  if (!['http:', 'https:'].includes(baseURL.protocol) || baseURL.username || baseURL.password || baseURL.search || baseURL.hash) {
    throw new Error('E2E_BASE_URL phải là URL HTTP(S), không chứa credentials, query hoặc fragment.');
  }
  if (options.dryRun === false) {
    throw new Error('Từ chối nạp thật: PID-00034 chỉ chạy thử, kể cả khi E2E_BASE_URL trỏ production.');
  }
  const calls = createLoadPlan(data);
  for (const call of calls) {
    // Chỉ in kế hoạch đã che key; không đọc biến môi trường chứa key hay gửi request.
    options.write?.(JSON.stringify({ ...call, url: `${baseURL.origin}/api/v1${call.path}` }));
  }
  return calls;
}
