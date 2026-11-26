// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import type { FeatureMocks } from './mock/types';

export type Locale = 'vi' | 'en';
export type Messages = Record<string, string>;

/** Contract between the shell and a feature area (delivery plan 1.5). */
export interface Feature {
  /** Folder name under src/features and i18n namespace. */
  id: string;
  /**
   * Routes of the area, relative to the root (e.g. `dashboard`, `projects/:projectId/chat`). They render inside the
   * shell frame (TopBar, ProjectRail in Project context); `sign-in` renders without the frame.
   */
  routes: RouteObject[];
  messages: Record<Locale, Messages>;
  /**
   * Content of the Assistant panel opened from the TopBar in the Global context (UX-LAYOUT-002). Only the global
   * area provides it (PID-00060); without it the shell shows a placeholder.
   */
  assistant?: ComponentType;
  /**
   * Mocks of the area (PID-00013), loaded only by the dev mock and tests. Write
   * `mocks: mockEnabled ? () => import('./__mocks__') : undefined` (`mockEnabled` from the shell, shell/mock-enabled.ts)
   * so every build drops them, including a build with NODE_ENV=development.
   */
  mocks?: () => Promise<{ default: FeatureMocks }>;
}
