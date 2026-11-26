// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Mocks of the project area. Each PID keeps its own file (web-settings step 2 conventions): pid-00058.ts holds the 9
// operations of Overview and Project AI Chat. The PR merged later adds the line of deliberation-card.ts (PID-00084).

import { defineMocks } from '../../../shell/mock';
import { operations } from './generated';
import { overrides as chat } from './pid-00058';

export { resetProjectChatMockState, sharedContext } from './pid-00058';

export default defineMocks({
  operations,
  overrides: { ...chat },
});
