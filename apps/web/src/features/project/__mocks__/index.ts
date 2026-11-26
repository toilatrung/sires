// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Mocks of the project area. Each PID keeps its own file (web-settings step 2 conventions): pid-00058.ts holds the 9
// operations of Overview and Project AI Chat; deliberation-card.ts (PID-00084) adds typed fixtures only: the open
// deliberation proposal in the RAG project's conversation and the Orchestrator's result after “Bỏ qua”.

import { defineMocks } from '../../../shell/mock';
import { operations } from './generated';
import { openProposal, proposalMessage, skippedResultMessage } from './deliberation-card';
import { overrides as chat } from './pid-00058';

export { resetProjectChatMockState, sharedContext } from './pid-00058';

export default defineMocks({
  operations,
  overrides: { ...chat },
  fixtures: { InteractiveAgentPrompt: [openProposal()], Message: [proposalMessage(), skippedResultMessage()] },
});
