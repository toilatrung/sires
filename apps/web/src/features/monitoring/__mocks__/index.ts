// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Mocks of the monitoring area. Each PID keeps its own file (web-settings step 2 conventions): pid-00059.ts holds the 10
// operations of Agent Activity, Workflow, Agent Run, Agent List and History. The PR merged later adds the line of the
// deliberation tab's mock (PID-00083).

import { defineMocks } from '../../../shell/mock';
import { operations } from './generated';
import { overrides as activity } from './pid-00059';

export { WF_52D, resetMonitoringMockState } from './pid-00059';

export default defineMocks({
  operations,
  overrides: { ...activity },
});
