// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Test-only feature areas: a screen with an input registered in the draft store, as a feature area would do.

import type { FormEvent } from 'react';
import type { Feature } from '../feature';
import { useDraft } from '../hooks';
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
