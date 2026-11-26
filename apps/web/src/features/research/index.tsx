// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Research area (PID-00114): References and Evidence with the Evidence Inspector and claim review, Research Artifacts
// with versions, provenance, diagrams and syntheses. Addresses of PRD 4.3 as settled in H3.

import type { Feature } from '../../shell';
import { ResearchArtifacts } from './ArtifactsScreen';
import { ReferencesAndEvidence } from './EvidenceScreen';
import en from './i18n/en.json';
import vi from './i18n/vi.json';
import './research.css';

export const feature: Feature = {
  id: 'research',
  routes: [
    // ?tab=references|claims|evidence, Claims by default.
    { path: 'projects/:projectId/evidence', element: <ReferencesAndEvidence /> },
    { path: 'projects/:projectId/claims/:claimId', element: <ReferencesAndEvidence /> },
    { path: 'projects/:projectId/evidence/:evidenceId', element: <ReferencesAndEvidence /> },
    // ?version= picks a version, ?compare= the version shown next to it.
    { path: 'projects/:projectId/artifacts', element: <ResearchArtifacts /> },
    { path: 'projects/:projectId/artifacts/:artifactId', element: <ResearchArtifacts /> },
  ],
  messages: { vi, en },
  // Same guard as src/mocks/index.ts, so a build with NODE_ENV=development keeps no mock code (build.spec.ts).
  mocks: import.meta.env.DEV && import.meta.env.MODE !== 'production' ? () => import('./__mocks__') : undefined,
};
