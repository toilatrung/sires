// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Global area (tickets 1.5): G1 Dashboard, G2 Projects (PID-00037); G9 Pending Actions, G10 Notifications,
// G6 Assistant, M1–M2 mobile (PID-00060).

import type { Feature } from '../../shell/feature';
import { AssistantPanel } from './assistant/AssistantPanel';
import { DashboardScreen } from './dashboard/DashboardScreen';
import en from './i18n/en.json';
import vi from './i18n/vi.json';
import { NotificationsScreen } from './notifications/NotificationsScreen';
import { PendingActionsScreen } from './pending/PendingActionsScreen';
import { PromptScreen } from './pending/PromptScreen';
import { ProjectsScreen } from './projects/ProjectsScreen';
import './global.css';

export const feature: Feature = {
  id: 'global',
  routes: [
    { path: 'dashboard', element: <DashboardScreen /> },
    { path: 'projects', element: <ProjectsScreen /> },
    { path: 'pending-actions', element: <PendingActionsScreen /> },
    // M2 MobilePrompt (PID-00060 H3): answers one prompt at any width; prompts open here on the phone.
    { path: 'pending-actions/prompts/:promptId', element: <PromptScreen /> },
    { path: 'notifications', element: <NotificationsScreen /> },
  ],
  messages: { vi, en },
  assistant: AssistantPanel,
  // Same guard as src/mocks/index.ts: a `vite build` (MODE production) never bundles the mocks, whatever NODE_ENV is.
  mocks: import.meta.env.DEV && import.meta.env.MODE !== 'production' ? () => import('./__mocks__') : undefined,
};
