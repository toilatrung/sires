// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Planning area (PID-00082, H6): Plan and Tasks of a project, Plan Version compare and approval, Task review, and the
// read-only Tasks of every project. Routes, messages and mocks go through the Feature contract of the shell.

import type { Feature } from '../../shell/feature';
import { ComparePage } from './ComparePage';
import { GlobalTasksPage } from './GlobalTasksPage';
import en from './i18n/en.json';
import vi from './i18n/vi.json';
import { PlanPage } from './PlanPage';
import { ReviewPage } from './ReviewPage';
import './planning.css';

export const feature: Feature = {
  id: 'planning',
  routes: [
    { path: 'tasks', element: <GlobalTasksPage /> },
    { path: 'projects/:projectId/plan', element: <PlanPage /> },
    { path: 'projects/:projectId/plan/versions/:versionId', element: <ComparePage /> },
    { path: 'projects/:projectId/tasks/:taskId', element: <ReviewPage /> },
  ],
  messages: { vi, en },
  // Same build-time guard as src/mocks/index.ts: DEV alone is true for a build run with NODE_ENV=development.
  mocks: import.meta.env.DEV && import.meta.env.MODE !== 'production' ? () => import('./__mocks__') : undefined,
};
