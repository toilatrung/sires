// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Demo data of the manuscript area (/projects/:id/manuscript/*): the LaTeX manuscript and its files.

import type { Fixtures, Schemas } from '../types';
import { ago, id, meta, projects } from './ids';

const manuscripts: Schemas['Manuscript'][] = [
  {
    ...meta('manuscript', 1, { projectId: projects.rag, hours: 24 * 7, version: 12 }),
    initMode: 'Default', mainFile: 'main.tex', compiler: 'xelatex',
    bibliographyTool: { engine: 'bibtex', package: 'natbib', style: 'apalike' },
    currentRevisionId: id('revision', 12), currentRevisionNumber: 12,
    latestBuild: {
      id: id('build', 7), manuscriptId: id('manuscript', 1), revisionId: id('revision', 12), revisionNumber: 12, compiler: 'xelatex',
      status: 'Succeeded', queuedAt: ago(5), startedAt: ago(5), endedAt: ago(4.9), hasPdf: true,
      citationKeysFound: ['zhang2024rag', 'tran2025trichdan', 'rossi2023hallucination'], unresolvedKeys: [],
    },
  },
];

const files: Schemas['ManuscriptFile'][] = [
  'main.tex', 'sections/introduction.tex', 'sections/related-work.tex', 'sections/methodology.tex', 'references.bib', 'figures/prisma.svg',
].map((path, index): Schemas['ManuscriptFile'] => ({
  id: id('revision', 100 + index), path, fileType: path.endsWith('.bib') ? 'bib' : path.endsWith('.svg') ? 'figure' : 'tex',
  contentHash: `${'a1b2c3d4'.repeat(7)}${String(index).padStart(8, '0')}`, status: 'Active',
}));

export const manuscript: Fixtures = {
  Manuscript: manuscripts,
  ManuscriptFile: files,
};
