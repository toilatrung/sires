// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Mocks of the research area (PID-00114 S01, H12), loaded by the dev mock and tests through `Feature.mocks`. The dev
// mock gets one demo store whose events go to the stream the mock worker exposes as `siresMock.events`; a test builds
// its own store with `createResearchMocks({ store })` and the `mock.events.emit` of `useMockServer`.

import { defineMocks } from '../../../shell/mock';
import type { EventInput, EventStreamMock, FeatureMocks } from '../../../shell/mock';
import { operations } from './generated';
import { createResearchOverrides } from './overrides';
import { createResearchStore, type ResearchStore } from './store';

export { createResearchStore, type RecordedCall, type ResearchStore, type ResearchStoreOptions } from './store';
export { ids, PROJECT_ID, stateDiagramSource, synthesisV2Content } from './data';

/** Event sink of the dev mock: the worker sets `siresMock.events` once it started (shell/mock/browser.ts). */
const devEmit = (event: EventInput) => {
  (globalThis as { siresMock?: { events?: EventStreamMock } }).siresMock?.events?.emit(event);
};

export function createResearchMocks({ store = createResearchStore({ emit: devEmit }) }: { store?: ResearchStore } = {}): FeatureMocks {
  return defineMocks({ operations, overrides: createResearchOverrides(store) });
}

export default createResearchMocks();
