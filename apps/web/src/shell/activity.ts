// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// User activity (H6, H11, ADR-27, INT-OIDC-003-AC02): the router calls GET /auth/session once per user navigation
// (link, back/forward); the gateway counts that call as activity. No header is added to any request. SSE, its
// reconnects and the GET refreshes after an SSE event never call it, and nothing calls it on a timer.
// Redirects (`replace`, e.g. / → /dashboard, → /sign-in) are not user navigations and do not count.

import type { createBrowserRouter } from 'react-router';
import type { SessionController } from './session/session';

export type Router = ReturnType<typeof createBrowserRouter>;

export function trackUserNavigation(router: Router, session: Pick<SessionController, 'touch'>): () => void {
  let lastKey = router.state.location.key;
  return router.subscribe((state) => {
    if (state.navigation.state !== 'idle') return;
    const { key } = state.location;
    if (key === lastKey) return;
    lastKey = key;
    if (state.historyAction === 'REPLACE') return;
    void session.touch();
  });
}

/**
 * For a screen opened without a route change (e.g. a panel): counts as user activity like a navigation.
 * Call it from the user's action, never from a timer or after an SSE event.
 */
export function markScreenOpened(session: Pick<SessionController, 'touch'>): Promise<void> {
  return session.touch();
}
