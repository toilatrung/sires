// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Monitoring area (PID-00059 S01; H13): Agent Activity Global and per project, workflow detail, Agent Run route,
// Activity and History. The strings of the “Thảo luận” tab (PID-00083) join the namespace `monitoring` here.

import type { Feature } from '../../shell/feature';
import { ActivityPage } from './Activity';
import { AgentRunRoute } from './AgentRun';
import { deliberationMessages } from './deliberation';
import { HistoryPage } from './History';
import en from './i18n/en.json';
import vi from './i18n/vi.json';
import { WorkflowPage } from './Workflow';
import './monitoring.css';

export const feature: Feature = {
  id: 'monitoring',
  routes: [
    { path: 'activity', element: <ActivityPage scope="global" /> },
    { path: 'projects/:projectId/activity', element: <ActivityPage scope="project" /> },
    { path: 'projects/:projectId/activity/workflows/:workflowId', element: <WorkflowPage /> },
    { path: 'projects/:projectId/activity/agent-runs/:agentRunId', element: <AgentRunRoute /> },
    { path: 'projects/:projectId/history', element: <HistoryPage /> },
  ],
  messages: { vi: { ...vi, ...deliberationMessages.vi }, en: { ...en, ...deliberationMessages.en } },
  // Area mocks only in the dev server (dev:mock), never in a build (the shell's mock README, MODE guard).
  mocks: import.meta.env.DEV && import.meta.env.MODE !== 'production' ? () => import('./__mocks__') : undefined,
};
