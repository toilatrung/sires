// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Project area (PID-00058): Overview and Project AI Chat of a project, inside the shell's frame with the ProjectRail.

import type { Feature } from '../../shell';
import { ChatScreen } from './Chat';
import { OverviewScreen } from './Overview';
import en from './i18n/en.json';
import vi from './i18n/vi.json';
import './project.css';

export const feature: Feature = {
  id: 'project',
  routes: [
    { path: 'projects/:projectId/overview', element: <OverviewScreen /> },
    { path: 'projects/:projectId/chat', element: <ChatScreen /> },
  ],
  messages: { vi, en },
  // Same build-time guard as src/mocks/index.ts: `vite build` drops the mocks even when NODE_ENV is not production.
  mocks: import.meta.env.DEV && import.meta.env.MODE !== 'production' ? () => import('./__mocks__') : undefined,
};
