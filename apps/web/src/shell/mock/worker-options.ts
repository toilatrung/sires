// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Options of the dev worker (browser.ts), in their own module so tests can read them without msw/browser.

export const workerStartOptions = {
  // MSW otherwise logs every intercepted request with its body to the console, API keys of Provider Connections
  // included (QC #143 G1).
  quiet: true,
  onUnhandledFrame: 'bypass',
  serviceWorker: { url: '/mockServiceWorker.js' },
} as const;
