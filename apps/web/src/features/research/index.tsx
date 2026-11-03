// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import type { Feature } from '../../shell/feature';
import { Placeholder } from '../../shell/Placeholder';
import en from './i18n/en.json';
import vi from './i18n/vi.json';

const screens = [
  'projects/:projectId/evidence',
  'projects/:projectId/evidence/claims/:claimId',
  'projects/:projectId/artifacts',
  'projects/:projectId/artifacts/:artifactId'
];

export const feature: Feature = {
  id: 'research',
  routes: screens.map((path) => ({ path, element: <Placeholder ns="research" screen={path} /> })),
  messages: { vi, en },
};
