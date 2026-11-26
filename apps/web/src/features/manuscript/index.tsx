// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Manuscript area (tickets 1.5, PID-00115): LaTeX editor, Change Proposal diff, revision history, build log, PDF
// preview and export, on the mock of PID-00013 in PH-02 (D-UI). Each slice keeps its strings in its own file.

import { lazy, Suspense } from 'react';
import { LoadingState } from '../../shell';
import type { Feature } from '../../shell/feature';
import buildEn from './i18n/build.en.json';
import buildVi from './i18n/build.vi.json';
import en from './i18n/en.json';
import filesEn from './i18n/files.en.json';
import filesVi from './i18n/files.vi.json';
import historyEn from './i18n/history.en.json';
import historyVi from './i18n/history.vi.json';
import mobileEn from './i18n/mobile.en.json';
import mobileVi from './i18n/mobile.vi.json';
import proposalsEn from './i18n/proposals.en.json';
import proposalsVi from './i18n/proposals.vi.json';
import vi from './i18n/vi.json';

// The screen and CodeMirror load only when Manuscript opens (own chunk, not in the app's first bundle).
const ManuscriptScreen = lazy(() => import('./ManuscriptScreen').then((module) => ({ default: module.ManuscriptScreen })));

export const feature: Feature = {
  id: 'manuscript',
  routes: [
    {
      path: 'projects/:projectId/manuscript/*',
      element: (
        <Suspense fallback={<LoadingState rows={0} />}>
          <ManuscriptScreen />
        </Suspense>
      ),
    },
  ],
  messages: {
    vi: { ...vi, ...filesVi, ...proposalsVi, ...historyVi, ...buildVi, ...mobileVi },
    en: { ...en, ...filesEn, ...proposalsEn, ...historyEn, ...buildEn, ...mobileEn },
  },
  // Same guard as src/mocks/index.ts: a `vite build` (MODE production) never bundles the mocks, whatever NODE_ENV is.
  mocks: import.meta.env.DEV && import.meta.env.MODE !== 'production' ? () => import('./__mocks__') : undefined,
};
