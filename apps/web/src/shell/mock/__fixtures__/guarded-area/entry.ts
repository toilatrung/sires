// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// An area as features/<area>/index.tsx declares it (build.spec.ts): its mocks behind `mockEnabled`.

import { mockEnabled } from '../../../mock-enabled';

export const area = {
  id: 'guarded-area',
  mocks: mockEnabled ? () => import('./area-mocks') : undefined,
};
