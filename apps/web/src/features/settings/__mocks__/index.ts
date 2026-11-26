// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Mocks of the settings area (PID-00036 S01, H10): the 16 operations the area owns, with a store that keeps
// changes for one dev session. getSession, getMe belong to the shell's mock; startLogin is a browser navigation.
//
// Dev scenarios: a Provider Connection whose key contains “wrong” (or “invalid”, “sai”) tests Invalid auth_failed;
// “timeout”, “quota”, “limit”, “denied”, “down” give the matching error code. Tests reset the store with
// resetSettingsMockState() and use mock.use() for 409, 412 and other one-off answers.

import { ACCOUNT_ID, defineMocks } from '../../../shell/mock';
import { operations } from './generated';
import {
  AGENTS,
  DEFAULT_THRESHOLDS,
  INDEXED_REFERENCES,
  defaultThresholds,
  addConnection,
  clearAssignment,
  current,
  initState,
  listAssignments,
  listConnections,
  removeConnection,
  setAssignment,
  testConnection,
  updateConnection,
} from './store';

export { CLAUDE_CONNECTION_ID, GEMINI_CONNECTION_ID, OPENAI_CONNECTION_ID, PROXY_CONNECTION_ID, resetSettingsMockState, scenarioForKey } from './store';

const TEST_DELAY_MS = 700;

const seed = () => initState({ accountId: ACCOUNT_ID });

const problem = (status: 404 | 409 | 422, code: 'not_found' | 'duplicate_name' | 'connection_in_use' | 'model_not_available', title: string) =>
  ({ type: `https://sires.example/problems/${code}`, title, status, code }) as const;

export default defineMocks({
  operations,
  overrides: {
    updateProfile: ({ body, fixtures }) => {
      const account = structuredClone(fixtures.Account?.find((row) => row.id === ACCOUNT_ID));
      if (!account) return { status: 401 };
      const version = account.rowVersion + 1;
      return {
        status: 200,
        body: { ...account, rowVersion: version, profile: { ...account.profile, ...(body ?? {}) } },
        headers: { ETag: `"${version}"` },
      };
    },
    updatePreferences: ({ body, fixtures }) => {
      const account = structuredClone(fixtures.Account?.find((row) => row.id === ACCOUNT_ID));
      if (!account) return { status: 400 };
      const version = account.rowVersion + 1;
      return {
        status: 200,
        body: { ...account, rowVersion: version, preferences: { ...account.preferences, ...(body ?? {}) } },
        headers: { ETag: `"${version}"` },
      };
    },
    getVerificationThresholds: () => {
      seed();
      const t = current().thresholds;
      return { status: 200, body: structuredClone(t), headers: { ETag: `"${t.updatedAt}"` } };
    },
    updateVerificationThresholds: ({ body }) => {
      seed();
      const s = current();
      const next = { ...s.thresholds, ...(body ?? {}), defaults: s.thresholds.defaults, updatedAt: new Date().toISOString() };
      next.isDefault = JSON.stringify({ claimSupport: next.claimSupport, citationMismatch: next.citationMismatch }) === JSON.stringify(DEFAULT_THRESHOLDS);
      s.thresholds = next;
      return { status: 200, body: structuredClone(next) };
    },
    resetVerificationThresholds: () => {
      seed();
      const s = current();
      s.thresholds = defaultThresholds();
      return { status: 200, body: structuredClone(s.thresholds) };
    },
    listProviderConnections: () => {
      seed();
      return { status: 200, body: { items: listConnections() } };
    },
    createProviderConnection: ({ body }) => {
      seed();
      if (!body) return { status: 400 };
      if (current().connections.some((c) => c.name.trim().toLowerCase() === body.name.trim().toLowerCase())) {
        return { status: 409, body: problem(409, 'duplicate_name', 'Tên kết nối đã có') };
      }
      const created = addConnection(body, ACCOUNT_ID);
      return { status: 201, body: created, headers: { ETag: `"${created.rowVersion}"`, Location: `/api/v1/provider-connections/${created.id}` } };
    },
    updateProviderConnection: ({ params, body }) => {
      seed();
      if (body?.name && current().connections.some((c) => c.id !== params.connectionId && c.name.trim().toLowerCase() === body.name?.trim().toLowerCase())) {
        // 409 is not declared for updateProviderConnection; a Response keeps the Problem body (report.md mục 6).
        return new Response(JSON.stringify(problem(409, 'duplicate_name', 'Tên kết nối đã có')), { status: 409, headers: { 'Content-Type': 'application/problem+json' } });
      }
      const updated = updateConnection(params.connectionId, body ?? {});
      return updated ? { status: 200, body: updated } : { status: 404, body: problem(404, 'not_found', 'Không có kết nối') };
    },
    testProviderConnection: ({ params }) => {
      seed();
      const tested = testConnection(params.connectionId);
      return tested ? { status: 200, body: tested, delayMs: TEST_DELAY_MS } : { status: 404, body: problem(404, 'not_found', 'Không có kết nối') };
    },
    deleteProviderConnection: ({ params, query }) => {
      seed();
      const result = removeConnection(params.connectionId, query.replacementConnectionId);
      if (result === 'not_found') return { status: 404, body: problem(404, 'not_found', 'Không có kết nối') };
      if (result === 'in_use') return { status: 409, body: problem(409, 'connection_in_use', 'Kết nối đang được gán cho agent') };
      return { status: 204 };
    },
    listAgents: () => ({ status: 200, body: { items: structuredClone(AGENTS) } }),
    listAgentModelAssignments: () => {
      seed();
      return { status: 200, body: { items: listAssignments() } };
    },
    setAgentModelAssignment: ({ params, query, body }) => {
      seed();
      if (!body) return { status: 400 };
      const result = setAssignment(params.agent as never, query.instance as 'A' | 'B' | undefined, body, ACCOUNT_ID);
      if (result === 'model_not_available') return { status: 422, body: problem(422, 'model_not_available', 'Model không có ở kết nối này') };
      return { status: 200, body: result };
    },
    clearAgentModelAssignment: ({ params, query }) => {
      seed();
      clearAssignment(params.agent as never, query.instance as 'A' | 'B' | undefined);
      return { status: 204 };
    },
    getEmbeddingSettings: () => {
      seed();
      const embedding = current().embedding;
      return embedding ? { status: 200, body: structuredClone(embedding) } : { status: 404, body: problem(404, 'not_found', 'Chưa cấu hình embedding model') };
    },
    setEmbeddingSettings: ({ body }) => {
      seed();
      const s = current();
      const connection = s.connections.find((c) => c.id === body?.providerConnectionId);
      if (!body || !connection || connection.testStatus !== 'Valid' || connection.provider === 'anthropic') {
        return { status: 422, body: problem(422, 'model_not_available', 'Embedding model không có ở kết nối này') };
      }
      const total = s.embedding ? INDEXED_REFERENCES : 0;
      s.embedding = { providerConnectionId: body.providerConnectionId, model: body.model, indexedReferenceCount: total, reindex: { total, queued: total, indexed: 0, failed: 0 } };
      return { status: 200, body: structuredClone(s.embedding) };
    },
  },
});
