// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Stateful mock store of the settings area (PID-00036 S01, H10): Provider Connections, Agent Models, embedding
// model and verification thresholds keep their changes for one dev session, so the screens can be tried end to end.
// The store never keeps an API key: only how the mock should answer a test of that key (H7).

import type { PublicApi } from '@sires/contracts';

type Schemas = PublicApi.components['schemas'];
export type Connection = Schemas['ProviderConnection'];
export type Assignment = Schemas['AgentModelAssignment'];
export type AgentDefinition = Schemas['AgentDefinition'];
export type EmbeddingSettings = Schemas['EmbeddingSettings'];
export type Thresholds = Schemas['VerificationThresholds'];
export type ProviderName = Schemas['ProviderName'];
export type ProviderErrorCode = Schemas['ProviderErrorCode'];

/** How a test of a connection answers in the mock: chosen from the key when it is entered, never stored as the key. */
export type TestScenario = 'valid' | ProviderErrorCode;

/** Keys containing these words make the mock test fail with that code (dev scenarios, S03). */
const KEY_SCENARIOS: Array<[RegExp, ProviderErrorCode]> = [
  [/wrong|invalid|sai/i, 'auth_failed'],
  [/denied/i, 'permission_denied'],
  [/timeout/i, 'timeout'],
  [/quota/i, 'quota_exceeded'],
  [/limit/i, 'rate_limited'],
  [/down/i, 'provider_unavailable'],
];

export function scenarioForKey(apiKey: string): TestScenario {
  return KEY_SCENARIOS.find(([pattern]) => pattern.test(apiKey))?.[1] ?? 'valid';
}

export const OFFICIAL_BASE_URL: Record<ProviderName, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com',
};

/** Models a Valid test returns per provider, as on SettingsAgents (embedding models only for OpenAI and Gemini, OQ-051). */
export const MODELS: Record<ProviderName, Schemas['ModelInfo'][]> = {
  anthropic: [
    { id: 'claude-sonnet-5-5', capabilities: ['tool_use', 'structured_output', 'long_context', 'vision'], verified: true },
    { id: 'claude-opus-5-5', capabilities: ['tool_use', 'structured_output', 'long_context', 'vision'], verified: true },
    { id: 'claude-haiku-5-5', capabilities: ['tool_use', 'structured_output'], verified: true },
    { id: 'claude-sonnet-4-5', capabilities: ['tool_use', 'structured_output', 'long_context'], verified: true },
  ],
  openai: [
    { id: 'gpt-5', capabilities: ['tool_use', 'structured_output', 'long_context', 'vision'], verified: true },
    { id: 'gpt-5-mini', capabilities: ['tool_use', 'structured_output', 'long_context'], verified: true },
    { id: 'gpt-5-nano', capabilities: ['tool_use', 'structured_output'], verified: true },
    { id: 'text-embedding-3-small', capabilities: ['embedding'], verified: true },
    { id: 'text-embedding-3-large', capabilities: ['embedding'], verified: true },
  ],
  google: [
    { id: 'gemini-2.5-pro', capabilities: ['tool_use', 'structured_output', 'long_context', 'vision'], verified: true },
    { id: 'gemini-2.5-flash', capabilities: ['tool_use', 'structured_output'], verified: true },
    { id: 'gemini-embedding-001', capabilities: ['embedding'], verified: true },
  ],
};

export const ERROR_MESSAGES: Record<ProviderErrorCode, string> = {
  auth_failed: 'Provider từ chối key (401).',
  permission_denied: 'Key không có quyền dùng model này (403).',
  model_not_found: 'Không tìm thấy model ở base URL này (404).',
  rate_limited: 'Provider giới hạn tốc độ (429).',
  quota_exceeded: 'Hết hạn mức của tài khoản provider.',
  context_too_long: 'Yêu cầu quá dài.',
  content_refused: 'Provider từ chối nội dung.',
  timeout: 'Provider không trả lời trong thời gian chờ.',
  provider_unavailable: 'Provider tạm thời không khả dụng (503).',
  invalid_response: 'Phản hồi không đúng API chính thức của provider.',
  network_error: 'Không kết nối được tới base URL.',
  interrupted: 'Bị gián đoạn.',
};

/** Fixed ids of the mock rows the area adds (uuid-shaped, distinct from the shell's demo ids). */
export const PROXY_CONNECTION_ID = '5e771165-0036-4000-8000-000000000001';
export const CLAUDE_CONNECTION_ID = '5e771165-0036-4000-8000-000000000002';
export const OPENAI_CONNECTION_ID = '5e771165-0036-4000-8000-000000000003';
export const GEMINI_CONNECTION_ID = '5e771165-0036-4000-8000-000000000004';
const ACCOUNT_REF = { type: 'researcher' as const };

/** Agent registry (AGENT-REGISTRY-001): Orchestrator and eight Specialist Agents; Analysis Agent has instances A, B. */
export const AGENTS: AgentDefinition[] = [
  { agent: 'orchestrator', displayName: 'Orchestrator', role: 'Điều phối, giao việc cho agent', requiredCapabilities: ['tool_use', 'structured_output'] },
  { agent: 'discovery', displayName: 'Discovery Agent', role: 'Tìm tài liệu học thuật', requiredCapabilities: ['tool_use'] },
  { agent: 'reference_processing', displayName: 'Reference Processing Agent', role: 'Chuẩn hóa metadata, chuẩn bị duyệt, indexing', requiredCapabilities: ['structured_output'] },
  { agent: 'evidence_retrieval', displayName: 'Evidence Retrieval Agent', role: 'Truy xuất evidence từ nguồn đã duyệt', requiredCapabilities: ['long_context'] },
  { agent: 'synthesis', displayName: 'Synthesis Agent', role: 'Tổng hợp, lập ma trận so sánh', requiredCapabilities: ['long_context', 'structured_output'] },
  { agent: 'writing', displayName: 'Writing Agent', role: 'Soạn và sửa section LaTeX', requiredCapabilities: ['long_context'] },
  { agent: 'verification', displayName: 'Verification Agent', role: 'Kiểm chứng claim và citation', requiredCapabilities: ['structured_output'] },
  { agent: 'diagram', displayName: 'Diagram Agent', role: 'Vẽ sơ đồ và hình minh họa', requiredCapabilities: ['vision'] },
  { agent: 'analysis', displayName: 'Analysis Agent', role: 'Đề xuất và phản biện trong phiên thảo luận', requiredCapabilities: ['structured_output'], instances: ['A', 'B'] },
];

/** Default thresholds of the mock: the proposal of PC-06 D1 (0.80 / 0.50 / 0.60); the web never hard-codes them (H16). */
export const DEFAULT_THRESHOLDS = { claimSupport: { supported: 0.8, partiallySupported: 0.5 }, citationMismatch: { mismatch: 0.6 } };

interface State {
  connections: Connection[];
  scenarios: Map<string, TestScenario>;
  assignments: Assignment[];
  embedding: EmbeddingSettings | null;
  thresholds: Thresholds;
}

let state: State | null = null;
let seq = 0;

function now(): string {
  return new Date().toISOString();
}

function newId(): string {
  seq += 1;
  return `5e771165-0036-4000-8000-${String(100 + seq).padStart(12, '0')}`;
}

type Seeded = Omit<Connection, 'accountId' | 'createdAt' | 'createdBy' | 'rowVersion' | 'assignedAgents'>;

/**
 * Connections of the reference screens (SettingsProviders, SettingsAgents): Claude cá nhân and OpenAI cá nhân Valid,
 * Gemini cá nhân Invalid auth_failed, and the demo proxy (D-KEY) on a reserved example domain, never a real host.
 */
function referenceConnections(): Seeded[] {
  const tested = now();
  return [
    { id: CLAUDE_CONNECTION_ID, name: 'Claude cá nhân', provider: 'anthropic', baseUrl: OFFICIAL_BASE_URL.anthropic, keyHint: '7b2e', testStatus: 'Valid', lastTestedAt: tested, availableModels: structuredClone(MODELS.anthropic) },
    { id: OPENAI_CONNECTION_ID, name: 'OpenAI cá nhân', provider: 'openai', baseUrl: OFFICIAL_BASE_URL.openai, keyHint: '41c8', testStatus: 'Valid', lastTestedAt: tested, availableModels: structuredClone(MODELS.openai) },
    { id: GEMINI_CONNECTION_ID, name: 'Gemini cá nhân', provider: 'google', baseUrl: OFFICIAL_BASE_URL.google, keyHint: 'k9Zq', testStatus: 'Invalid', lastTestedAt: tested, lastError: { code: 'auth_failed', message: ERROR_MESSAGES.auth_failed }, availableModels: [] },
    { id: PROXY_CONNECTION_ID, name: 'Proxy OpenAI tương thích', provider: 'openai', baseUrl: 'https://llm-proxy.example/v1', keyHint: '9c1d', testStatus: 'Valid', lastTestedAt: tested, availableModels: MODELS.openai.filter((m) => m.id !== 'text-embedding-3-large') },
  ];
}

/** Assignments of SettingsAgents: default on Claude, a few agents on their own model, Analysis A and B on the same one. */
const REFERENCE_ASSIGNMENTS: Array<[Assignment['agent'], 'A' | 'B' | null, string, string]> = [
  ['default', null, CLAUDE_CONNECTION_ID, 'claude-sonnet-5-5'],
  ['discovery', null, OPENAI_CONNECTION_ID, 'gpt-5-mini'],
  ['reference_processing', null, OPENAI_CONNECTION_ID, 'gpt-5-mini'],
  ['verification', null, CLAUDE_CONNECTION_ID, 'claude-opus-5-5'],
  ['analysis', 'A', OPENAI_CONNECTION_ID, 'gpt-5'],
  ['analysis', 'B', OPENAI_CONNECTION_ID, 'gpt-5'],
  ['diagram', null, GEMINI_CONNECTION_ID, 'gemini-2.5-pro'],
];

export function initState(seed: { accountId: string }): State {
  if (state) return state;
  const created = now();
  const base = { accountId: seed.accountId, createdAt: created, createdBy: ACCOUNT_REF, rowVersion: 1 };
  const connections: Connection[] = referenceConnections().map((c) => ({ ...base, ...c, assignedAgents: [] }));
  const assignments: Assignment[] = REFERENCE_ASSIGNMENTS.map(([agent, instance, providerConnectionId, model]) => ({
    ...base,
    id: newId(),
    agent,
    instance,
    providerConnectionId,
    model,
    effective: true,
  }));
  state = {
    connections,
    scenarios: new Map(connections.map((c) => [c.id, c.testStatus === 'Invalid' ? (c.lastError?.code ?? 'auth_failed') : 'valid'])),
    assignments,
    embedding: { providerConnectionId: OPENAI_CONNECTION_ID, model: 'text-embedding-3-small' },
    thresholds: { ...structuredClone(DEFAULT_THRESHOLDS), isDefault: true, updatedAt: now() },
  };
  return state;
}

/** Drop the store so the next request seeds it again (tests reset between cases). */
export function resetSettingsMockState(): void {
  state = null;
  seq = 0;
}

export function current(): State {
  if (!state) throw new Error('settings mock store used before initState');
  return state;
}

/** Connections with `assignedAgents` recomputed from the assignments (the backend keeps them consistent). */
export function listConnections(): Connection[] {
  const s = current();
  return s.connections.map((c) => ({
    ...c,
    assignedAgents: s.assignments.filter((a) => a.providerConnectionId === c.id).map((a) => a.agent),
  }));
}

export function addConnection(body: Schemas['ProviderConnectionCreate'], accountId: string): Connection {
  const s = current();
  const connection: Connection = {
    id: newId(),
    accountId,
    createdAt: now(),
    createdBy: ACCOUNT_REF,
    rowVersion: 1,
    name: body.name,
    provider: body.provider,
    baseUrl: body.baseUrl || OFFICIAL_BASE_URL[body.provider],
    keyHint: body.apiKey.slice(-4),
    testStatus: 'Untested',
    assignedAgents: [],
  };
  s.connections.push(connection);
  s.scenarios.set(connection.id, scenarioForKey(body.apiKey));
  return connection;
}

export function updateConnection(id: string, body: Schemas['ProviderConnectionUpdate']): Connection | undefined {
  const s = current();
  const index = s.connections.findIndex((c) => c.id === id);
  if (index < 0) return undefined;
  const old = s.connections[index];
  const resets = body.baseUrl !== undefined || body.apiKey !== undefined;
  const next: Connection = {
    ...old,
    name: body.name ?? old.name,
    baseUrl: body.baseUrl ?? old.baseUrl,
    keyHint: body.apiKey ? body.apiKey.slice(-4) : old.keyHint,
    rowVersion: old.rowVersion + 1,
    updatedAt: now(),
    ...(resets ? { testStatus: 'Untested' as const, lastError: undefined, availableModels: undefined } : {}),
  };
  if (body.apiKey) s.scenarios.set(id, scenarioForKey(body.apiKey));
  s.connections[index] = next;
  return next;
}

export function testConnection(id: string): Connection | undefined {
  const s = current();
  const index = s.connections.findIndex((c) => c.id === id);
  if (index < 0) return undefined;
  const old = s.connections[index];
  // A custom base URL is a compatible proxy (D-KEY): it validates like the official endpoint.
  const scenario = s.scenarios.get(id) ?? 'valid';
  const next: Connection =
    scenario === 'valid'
      ? { ...old, testStatus: 'Valid', lastTestedAt: now(), lastError: undefined, availableModels: structuredClone(MODELS[old.provider]) }
      : {
          ...old,
          testStatus: 'Invalid',
          lastTestedAt: now(),
          lastError: { code: scenario, message: ERROR_MESSAGES[scenario] },
          availableModels: [],
        };
  s.connections[index] = { ...next, rowVersion: old.rowVersion + 1 };
  return listConnections()[index];
}

export function removeConnection(id: string, replacementId?: string): 'ok' | 'not_found' | 'in_use' {
  const s = current();
  if (!s.connections.some((c) => c.id === id)) return 'not_found';
  const users = s.assignments.filter((a) => a.providerConnectionId === id);
  if (users.length && !replacementId) return 'in_use';
  if (replacementId) {
    const replacement = s.connections.find((c) => c.id === replacementId);
    if (!replacement || replacement.testStatus !== 'Valid') return 'in_use';
    const model = replacement.availableModels?.find((m) => !m.capabilities?.every((c) => c === 'embedding'))?.id ?? 'gpt-5-mini';
    for (const a of users) Object.assign(a, { providerConnectionId: replacementId, model });
  }
  s.connections = s.connections.filter((c) => c.id !== id);
  s.scenarios.delete(id);
  if (s.embedding?.providerConnectionId === id) s.embedding = null;
  return 'ok';
}

/** Assignment rows with `sameModelWarning` on Analysis Agent rows when A and B share provider and model (ORCH-DELIB-005). */
export function listAssignments(): Assignment[] {
  const s = current();
  const provider = (id: string) => s.connections.find((c) => c.id === id)?.provider;
  const effective = (instance: 'A' | 'B') => s.assignments.find((a) => a.agent === 'analysis' && a.instance === instance) ?? s.assignments.find((a) => a.agent === 'default');
  const a = effective('A');
  const b = effective('B');
  const same = !!a && !!b && provider(a.providerConnectionId) === provider(b.providerConnectionId) && a.model === b.model;
  return s.assignments.map((row) => (row.agent === 'analysis' ? { ...row, sameModelWarning: same } : row));
}

export function setAssignment(agent: Assignment['agent'], instance: 'A' | 'B' | undefined, body: { providerConnectionId: string; model: string }, accountId: string): Assignment | 'model_not_available' {
  const s = current();
  const connection = s.connections.find((c) => c.id === body.providerConnectionId);
  if (!connection || connection.testStatus !== 'Valid') return 'model_not_available';
  const listed = connection.availableModels ?? [];
  if (listed.length && !listed.some((m) => m.id === body.model)) return 'model_not_available';
  const model = listed.find((m) => m.id === body.model);
  const needs = AGENTS.find((d) => d.agent === agent)?.requiredCapabilities ?? [];
  const missing = model ? needs.filter((cap) => !(model.capabilities ?? []).includes(cap as never)) : [];
  const row: Assignment = {
    id: newId(),
    accountId,
    createdAt: now(),
    createdBy: ACCOUNT_REF,
    rowVersion: 1,
    agent,
    instance: agent === 'analysis' ? (instance ?? null) : null,
    providerConnectionId: body.providerConnectionId,
    model: body.model,
    effective: true,
    capabilityWarnings: missing.map((capability) => ({ capability, message: `Model không có năng lực ${capability}.` })),
  };
  s.assignments = s.assignments.filter((a) => !(a.agent === agent && (agent !== 'analysis' || a.instance === row.instance)));
  s.assignments.push(row);
  return listAssignments().find((a) => a.id === row.id) ?? row;
}

export function clearAssignment(agent: Assignment['agent'], instance?: 'A' | 'B'): void {
  const s = current();
  s.assignments = s.assignments.filter((a) => !(a.agent === agent && (agent !== 'analysis' || a.instance === instance)));
}
