// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import type { Feature } from '../../shell/feature';
import { Placeholder } from '../../shell/Placeholder';
import en from './i18n/en.json';
import vi from './i18n/vi.json';

const screens = [
  'projects/:projectId/overview',
  'projects/:projectId/chat'
];

export const feature: Feature = {
  id: 'project',
  routes: screens.map((path) => ({ path, element: <Placeholder ns="project" screen={path} /> })),
  messages: { vi, en },
};
