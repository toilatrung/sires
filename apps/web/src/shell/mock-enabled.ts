// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Whether mocks may load (PID-00013). Its own module, outside shell/mock: builds keep it, and the mock's types do not
// pull import.meta.env into code compiled without Vite's types.

/**
 * True in the dev server and in tests, false in every `vite build`, including one run with NODE_ENV=development
 * (DEV is true there, MODE is still `production`). A build-time constant: guard area mocks with it
 * (`mocks: mockEnabled ? () => import('./__mocks__') : undefined`) and the bundler drops them (shell/mock/build.spec.ts).
 */
export const mockEnabled: boolean = import.meta.env.DEV && import.meta.env.MODE !== 'production';
