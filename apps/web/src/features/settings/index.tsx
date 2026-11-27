// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Settings area (PID-00036): S0 SignIn and the four Settings views. /settings opens Profile (EC01); Profile is the
// target of “Hồ sơ” in the shell's avatar menu (H19).

import { Navigate } from 'react-router';
import type { Feature } from '../../shell';
import { AgentsScreen } from './Agents';
import { PreferencesScreen } from './Preferences';
import { ProfileScreen } from './Profile';
import { ProvidersScreen } from './Providers';
import { SignInScreen } from './SignIn';
import en from './i18n/en.json';
import vi from './i18n/vi.json';
import './settings.css';

export const feature: Feature = {
  id: 'settings',
  routes: [
    { path: 'sign-in', element: <SignInScreen /> },
    { path: 'settings', element: <Navigate to="/settings/profile" replace /> },
    { path: 'settings/profile', element: <ProfileScreen /> },
    { path: 'settings/providers', element: <ProvidersScreen /> },
    { path: 'settings/agents', element: <AgentsScreen /> },
    { path: 'settings/preferences', element: <PreferencesScreen /> },
  ],
  messages: { vi, en },
  // Same build-time guard as src/mocks/index.ts: `vite build` (mode production) drops the mocks even when NODE_ENV is
  // not production (shell/mock/build.spec.ts); DEV alone would keep them.
  mocks: import.meta.env.DEV && import.meta.env.MODE !== 'production' ? () => import('./__mocks__') : undefined,
};
