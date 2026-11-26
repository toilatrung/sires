// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// The shell's mock hook (PID-00012 main.tsx): `startMocks()` runs before the first render. The mock itself lives in
// shell/mock (PID-00013); this file only decides whether to start it. The guard is a build-time constant, false for
// `vite build` (mode production) even when NODE_ENV is not, so builds keep only this empty function
// (shell/mock/build.spec.ts).

export async function startMocks(): Promise<void> {
  if (import.meta.env.DEV && import.meta.env.MODE !== 'production'
    && (import.meta.env.MODE === 'mock' || import.meta.env.VITE_SIRES_MOCK === '1')) {
    const [{ startMockWorker }, { features }] = await Promise.all([import('../shell/mock/browser'), import('../shell/features')]);
    await startMockWorker(features);
  }
}
