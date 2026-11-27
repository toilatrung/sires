// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Demo data of the settings area (/settings/*): the signed-in researcher, Provider Connections, Agent Models.

import type { Fixtures, Schemas } from '../types';
import { ACCOUNT_ID, ago, id, meta } from './ids';

export const account: Schemas['Account'] = {
  ...meta('connection', 0, { hours: 24 * 90, version: 4 }),
  id: ACCOUNT_ID,
  authIdentity: { issuer: 'https://id.etroy.example', subject: 'etroy|minhanh.nguyen' },
  profile: {
    displayName: 'Nguyễn Thị Minh Anh',
    email: 'minhanh.nguyen@university.example',
    affiliation: 'Viện Công nghệ Thông tin và Truyền thông, Trường Đại học Bách khoa Hà Nội',
    researchField: 'Xử lý ngôn ngữ tự nhiên trong y sinh',
    googleScholarProfileUrl: 'https://scholar.google.com/citations?user=SIRES_DEMO',
  },
  preferences: {
    uiLanguage: 'vi',
    defaultAgentLanguage: 'en',
    includeResearchFieldInContext: true,
    timezone: 'Asia/Ho_Chi_Minh',
    debugMode: false,
  },
  setup: { hasValidProviderConnection: true, hasEmbeddingSettings: true },
};

const connections: Schemas['ProviderConnection'][] = [
  {
    ...meta('connection', 1, { hours: 24 * 30, version: 2 }),
    name: 'OpenAI — tài khoản cá nhân',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keyHint: '3f9a',
    testStatus: 'Valid',
    lastTestedAt: ago(5),
    availableModels: [
      { id: 'gpt-4.1-mini', capabilities: ['tool_use', 'structured_output', 'long_context'], verified: true },
      { id: 'text-embedding-3-small', capabilities: ['embedding'], verified: true },
    ],
    assignedAgents: ['discovery', 'reference_processing', 'evidence_retrieval'],
  },
  {
    ...meta('connection', 2, { hours: 24 * 21 }),
    name: 'Anthropic — nhóm nghiên cứu',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    keyHint: 'a71c',
    testStatus: 'Valid',
    lastTestedAt: ago(5),
    availableModels: [{ id: 'claude-sonnet-4-5', capabilities: ['tool_use', 'structured_output', 'long_context', 'vision'], verified: true }],
    assignedAgents: ['orchestrator', 'synthesis', 'writing', 'verification'],
  },
  {
    ...meta('connection', 3, { hours: 24 * 3 }),
    name: 'Google AI Studio',
    provider: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com',
    keyHint: 'k2Qe',
    testStatus: 'Invalid',
    lastTestedAt: ago(26),
    lastError: { code: 'auth_failed', message: 'Provider từ chối key (401). Kiểm tra lại key trong Google AI Studio.' },
    assignedAgents: [],
  },
];

const assignment = (n: number, agentName: Schemas['AgentName'], connection: number, model: string): Schemas['AgentModelAssignment'] => ({
  ...meta('assignment', n, { hours: 24 * 20 }),
  agent: agentName,
  providerConnectionId: id('connection', connection),
  model,
  effective: true,
});

const assignments: Schemas['AgentModelAssignment'][] = [
  assignment(1, 'orchestrator', 2, 'claude-sonnet-4-5'),
  assignment(2, 'discovery', 1, 'gpt-4.1-mini'),
  assignment(3, 'reference_processing', 1, 'gpt-4.1-mini'),
  assignment(4, 'evidence_retrieval', 1, 'gpt-4.1-mini'),
  assignment(5, 'synthesis', 2, 'claude-sonnet-4-5'),
  assignment(6, 'writing', 2, 'claude-sonnet-4-5'),
  assignment(7, 'verification', 2, 'claude-sonnet-4-5'),
  {
    ...assignment(8, 'diagram', 1, 'gpt-4.1-mini'),
    capabilityWarnings: [{ capability: 'vision', message: 'Model không hỗ trợ đọc ảnh; sơ đồ chỉ kiểm bằng văn bản.' }],
  },
];

export const settings: Fixtures = {
  Account: [account],
  ProviderConnection: connections,
  AgentModelAssignment: assignments,
};
