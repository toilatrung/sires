// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Test-only feature areas: a screen with an input registered in the draft store, as a feature area would do, and the
// neutral areas renderShell mounts by default.

import type { FormEvent } from 'react';
import type { Feature } from '../feature';
import { features as areaFeatures } from '../features';
import { useDraft } from '../hooks';
import { Placeholder } from '../Placeholder';
import { LoadingState } from '../states/States';

export function Composer({ fieldId = 'chat.composer' }: { fieldId?: string }) {
  const draft = useDraft(fieldId);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    draft.clear();
  };
  return (
    <form onSubmit={submit}>
      <label>
        Câu hỏi
        <textarea value={draft.value} onChange={(e) => draft.setValue(e.currentTarget.value)} />
      </label>
      <button type="submit">Gửi</button>
      <LoadingState what="Trusted Library" rows={1} />
    </form>
  );
}

export const composerFeature: Feature = {
  id: 'test-area',
  routes: [
    { path: 'projects/:projectId/chat', element: <Composer /> },
    { path: 'dashboard', element: <Composer fieldId="dashboard.note" /> },
  ],
  messages: { vi: {}, en: {} },
};

/**
 * Every area's paths and messages, each path on the shell's Placeholder, with no Assistant content and no mocks. Shell
 * tests mount these instead of the real screens, so they never depend on what an area builds (a Dashboard, a
 * SignIn, an Assistant calling more of the API) — PC-05 P37.
 */
export const neutralFeatures: Feature[] = areaFeatures.map((area) => ({
  id: area.id,
  messages: area.messages,
  routes: area.routes
    .filter((route) => route.path)
    .map((route) => ({ path: route.path, element: <Placeholder ns={area.id} screen={route.path!} /> })),
}));
