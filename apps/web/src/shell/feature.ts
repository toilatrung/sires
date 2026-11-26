// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import type { RouteObject } from 'react-router';
import type { FeatureMocks } from './mock/types';

export type Locale = 'vi' | 'en';
export type Messages = Record<string, string>;

/** Contract between the shell and a feature area (delivery plan 1.5). */
export interface Feature {
  /** Folder name under src/features and i18n namespace. */
  id: string;
  routes: RouteObject[];
  messages: Record<Locale, Messages>;
  /**
   * Mocks of the area (PID-00013), loaded only by the dev mock and tests. Write
   * `mocks: import.meta.env.DEV ? () => import('./__mocks__') : undefined` so production builds drop them.
   */
  mocks?: () => Promise<{ default: FeatureMocks }>;
}
