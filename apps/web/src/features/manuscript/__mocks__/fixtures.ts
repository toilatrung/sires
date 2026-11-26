// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Demo manuscript of the RAG project (PID-00115 S01; designs/notes.html › Dữ liệu): a Default LaTeX manuscript with
// revisions r15–r18, three Change Proposals (Proposed, citation error, Outdated), builds r16 Succeeded and r17
// Failed, a bibliography with one Revoked entry, and a Trusted Reference (smith2020) without entry. The Archived
// project (credit) has a small finished manuscript to show the read-only state. The text is written for this demo.

import { ACCOUNT_ID, agent, ago, id, projects, researcher } from '../../../shell/mock/fixtures/ids';
import type { Schemas } from '../../../shell/mock/types';

/** Readable UUID with a prefix of this area (ids.ts has no kind for files, proposals, entries). */
export const uid = (prefix: string, n: number) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const fileId = (n: number) => uid('e1', n);
export const proposalId = (n: number) => uid('e2', n);
export const entryId = (n: number) => uid('e3', n);
export const referenceId = (n: number) => uid('e4', n);
export const revisionId = (n: number) => id('revision', n);
export const buildId = (n: number) => id('build', n);

export const RAG = projects.rag;
export const ARCHIVED_PROJECT = projects.credit;
export const MANUSCRIPT_ID = id('manuscript', 1);
export const ARCHIVED_MANUSCRIPT_ID = uid('e8', 1);
export const ARCHIVED_BUILD_ID = uid('e9', 1);
/** Writing Task of the accepted and pending proposals (planning demo Task 4). */
export const WRITING_TASK = id('task', 4);
export const WRITING_WORKFLOW = id('workflow', 1);
export const CLAIMS = [id('claim', 1), id('claim', 2)] as const;

export const SYSTEM: Schemas['ActorRef'] = { type: 'system', component: 'manuscript' };
const writing = (run: number) => agent('writing', run);

/** main.tex; line 4 is the package the accepted proposal of r17 added (booktabs, not in the build image). */
export function mainTex(line4 = '\\usepackage{booktabs}', title = 'Retrieval over Vetted Sources for LLM-assisted Literature Review'): string {
  return [
    '\\documentclass[11pt]{article}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage{graphicx}',
    line4,
    '\\usepackage[numbers]{natbib}',
    `\\title{${title}}`,
    '\\author{[Tác giả] \\and [Đơn vị]}',
    '',
    '\\begin{document}',
    '\\maketitle',
    '\\input{sections/intro}',
    '\\input{sections/method}',
    '',
    '\\bibliographystyle{plainnat}',
    '\\bibliography{bibliography/references}',
    '\\end{document}',
    '',
  ].join('\n');
}

export const INTRO_R15 = ['\\section{Introduction}', '\\label{sec:intro}', '', '% Viết phần mở đầu ở đây.', ''].join('\n');

/** Line 7 cites gao2023survy (typo of gao2023survey); line 9 cites doe2023hd (Revoked); line 11 is the proposal's target. */
export const INTRO_R17 = [
  '\\section{Introduction}',
  '\\label{sec:intro}',
  '',
  'Large language models are increasingly used to',
  'support literature review \\citep{lewis2020rag, gao2023survey}.',
  'A recent',
  'survey of RAG systems \\citep{gao2023survy}.',
  '',
  'However, unverified generation can introduce unsupported claims \\citep{doe2023hd}.',
  '% TODO: so sánh với các framework kiểm citation khác (mục 2.3)',
  'Prior work shows retrieval always helps.',
  '',
].join('\n');

export const METHOD_R15 = ['\\section{Method}', '\\label{sec:method}', '', '% Mô tả phương pháp ở đây.', ''].join('\n');

export const METHOD_R18 = [
  '\\section{Method}',
  '\\label{sec:method}',
  '',
  'We compare five frameworks that check citations against the cited source.',
  'Each framework is scored on precision and recall of supported claims.',
  '',
].join('\n');

const bib = (key: string, type: string, author: string, title: string, year: number) =>
  [`@${type}{${key},`, `  author = {${author}},`, `  title = {${title}},`, `  year = {${year}}`, '}'].join('\n');

export const BIB_ENTRIES: Record<string, string> = {
  lewis2020rag: bib('lewis2020rag', 'inproceedings', 'Lewis, Patrick and others', 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', 2020),
  gao2023survey: bib('gao2023survey', 'article', 'Gao, Yunfan and others', 'Retrieval-Augmented Generation for Large Language Models: A Survey', 2023),
  doe2023hd: bib('doe2023hd', 'article', 'Doe, Jane', 'Hallucination Detection in Clinical Summaries', 2023),
  smith2020: bib('smith2020', 'article', 'Smith, Alex', 'Measuring Citation Accuracy in Generated Reviews', 2020),
};

/** references.bib as System generates it from the bibliography entries (MS-BIB-001). */
export function referencesBib(entries: readonly { bibtexKey: string; bibtex?: string }[]): string {
  const header = '% Sinh tự động từ Trusted Reference của project — không sửa tay.';
  return [header, '', ...entries.map((entry) => `${entry.bibtex ?? BIB_ENTRIES[entry.bibtexKey] ?? `@misc{${entry.bibtexKey}}`}\n`)].join('\n');
}

/** 1×1 PNG, the figure of the demo. */
export const PRISMA_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export type FileKind = Schemas['ManuscriptFile']['fileType'];

/** One file at one revision; `content` is text, or base64 when `binary`. */
export interface FileVersion {
  id: string;
  path: string;
  fileType: FileKind;
  content: string;
  binary?: boolean;
  status: 'Active' | 'Deleted';
  updatedInRevision: number;
}

export interface RevisionSnapshot {
  revision: Schemas['ManuscriptRevision'];
  /** Every file known at this revision (Deleted included), keyed by file id. */
  files: Map<string, FileVersion>;
}

export const file = (n: number, path: string, fileType: FileKind, content: string, revision: number, binary = false): FileVersion => ({
  id: fileId(n), path, fileType, content, ...(binary ? { binary } : {}), status: 'Active', updatedInRevision: revision,
});

function revisionRow(
  n: number, source: Schemas['ManuscriptRevision']['source'], createdBy: Schemas['ActorRef'], hoursAgo: number,
  changes: Schemas['FileChange'][], extra: Partial<Schemas['ManuscriptRevision']> = {},
): Schemas['ManuscriptRevision'] {
  return {
    id: revisionId(n), revisionNumber: n, ...(source === 'init' ? {} : { parentRevisionId: revisionId(n - 1) }),
    changes, source, createdBy, createdAt: ago(hoursAgo), ...extra,
  };
}

const at = (files: FileVersion[], changes: Record<string, [string, number]>) =>
  files.map((row) => (changes[row.path] ? { ...row, content: changes[row.path]![0], updatedInRevision: changes[row.path]![1] } : { ...row }));
const byId = (files: FileVersion[]) => new Map(files.map((row) => [row.id, row]));

/** The four revisions of the RAG demo, oldest first, each with the full file set at that revision. */
export function demoRevisions(): RevisionSnapshot[] {
  const bibliography = demoBibliography();
  const r15 = [
    file(1, 'main.tex', 'tex', mainTex('\\usepackage{amsmath}', '[Tiêu đề bản thảo]'), 15),
    file(2, 'bibliography/references.bib', 'bib', referencesBib(bibliography), 15),
    file(3, 'sections/intro.tex', 'tex', INTRO_R15, 15),
    file(4, 'sections/method.tex', 'tex', METHOD_R15, 15),
    file(5, 'figures/prisma.png', 'figure', PRISMA_PNG_BASE64, 15, true),
  ];
  const r16 = at(r15, { 'main.tex': [mainTex('\\usepackage{amsmath}'), 16] });
  const r17 = at(r16, { 'main.tex': [mainTex(), 17], 'sections/intro.tex': [INTRO_R17, 17] });
  const r18 = at(r17, { 'sections/method.tex': [METHOD_R18, 18] });
  return [
    { revision: revisionRow(15, 'init', SYSTEM, 24 * 38, r15.map((row) => ({ path: row.path, operation: 'add' as const })), { message: 'Default' }), files: byId(r15) },
    { revision: revisionRow(16, 'direct_edit', researcher, 24 * 28, [{ path: 'main.tex', operation: 'modify' }]), files: byId(r16) },
    {
      revision: revisionRow(17, 'change_proposal', writing(59), 3, [{ path: 'main.tex', operation: 'modify' }, { path: 'sections/intro.tex', operation: 'modify' }], {
        changeProposalId: proposalId(9), taskId: WRITING_TASK, message: 'Mở đầu mục Introduction',
      }),
      files: byId(r17),
    },
    { revision: revisionRow(18, 'direct_edit', researcher, 2, [{ path: 'sections/method.tex', operation: 'modify' }]), files: byId(r18) },
  ];
}

const entity = (rowId: string, projectId: string, hoursAgo: number, by: Schemas['ActorRef']) => ({
  id: rowId, accountId: ACCOUNT_ID, projectId, createdAt: ago(hoursAgo), createdBy: by, rowVersion: 1,
});

const provenance = (run: number, inputs: string[]): Schemas['Provenance'] => ({
  createdBy: writing(run), workflowId: WRITING_WORKFLOW, taskId: WRITING_TASK,
  inputs: inputs.map((evidence) => ({ type: 'evidence', id: evidence })) as Schemas['Provenance']['inputs'],
});

const EVIDENCE = [id('evidence', 1), id('evidence', 2), id('evidence', 3)];

/** Proposed (2 files, citation 2/2), Proposed with citation error (asai2024selfrg), Outdated (base r16), Accepted (r17). */
export function demoProposals(): Schemas['ChangeProposal'][] {
  return [
    {
      ...entity(proposalId(1), RAG, 1.5, writing(61)),
      manuscriptId: MANUSCRIPT_ID, baseRevisionId: revisionId(18), status: 'Proposed',
      summary: 'Viết lại câu cuối mục Introduction theo evidence của Task và thêm cách tính điểm vào Method.',
      diff: [
        {
          path: 'sections/intro.tex', operation: 'modify',
          hunks: [{ oldStart: 11, oldLines: 1, newStart: 11, newLines: 1, lines: ['-Prior work shows retrieval always helps.', '+Retrieval restricted to vetted sources improves factuality \\citep{lewis2020rag, gao2023survey}.'] }],
        },
        {
          path: 'sections/method.tex', operation: 'modify',
          hunks: [{ oldStart: 5, oldLines: 1, newStart: 5, newLines: 2, lines: [' Each framework is scored on precision and recall of supported claims.', '+Scores are averaged over three annotators \\citep{gao2023survey}.'] }],
        },
      ],
      taskId: WRITING_TASK, claimIds: [...CLAIMS], evidenceIds: EVIDENCE,
      createdByAgentRunId: id('agentRun', 61),
      citationCheck: { verificationResultId: uid('e6', 1), passed: true, unresolvedKeys: [], mismatches: [] },
      provenance: provenance(61, EVIDENCE),
    },
    {
      ...entity(proposalId(2), RAG, 1, writing(62)),
      manuscriptId: MANUSCRIPT_ID, baseRevisionId: revisionId(18), status: 'Proposed',
      summary: 'Thêm một câu so sánh với Self-RAG vào Method.',
      diff: [
        {
          path: 'sections/method.tex', operation: 'modify',
          hunks: [{ oldStart: 4, oldLines: 1, newStart: 4, newLines: 2, lines: [' We compare five frameworks that check citations against the cited source.', '+Self-reflective retrieval is the closest baseline \\citep{asai2024selfrg}.'] }],
        },
      ],
      taskId: WRITING_TASK, claimIds: [CLAIMS[1]], evidenceIds: [EVIDENCE[1]!],
      createdByAgentRunId: id('agentRun', 62),
      citationCheck: {
        verificationResultId: uid('e6', 2), passed: false, unresolvedKeys: ['asai2024selfrg'],
        mismatches: [{ key: 'asai2024selfrg', claimId: CLAIMS[1], message: 'Không có Trusted Reference với key asai2024selfrg trong project.' }],
      },
      provenance: provenance(62, [EVIDENCE[1]!]),
    },
    {
      ...entity(proposalId(3), RAG, 24 * 27, writing(58)),
      manuscriptId: MANUSCRIPT_ID, baseRevisionId: revisionId(16), status: 'Outdated',
      summary: 'Viết câu mở đầu mục Introduction.',
      diff: [
        {
          path: 'sections/intro.tex', operation: 'modify',
          hunks: [{ oldStart: 4, oldLines: 1, newStart: 4, newLines: 1, lines: ['-% Viết phần mở đầu ở đây.', '+Retrieval-augmented generation grounds answers in documents \\citep{lewis2020rag}.'] }],
        },
      ],
      taskId: WRITING_TASK, claimIds: [CLAIMS[0]], evidenceIds: [EVIDENCE[0]!],
      createdByAgentRunId: id('agentRun', 58),
      citationCheck: { verificationResultId: uid('e6', 3), passed: true, unresolvedKeys: [], mismatches: [] },
      provenance: provenance(58, [EVIDENCE[0]!]),
    },
    {
      ...entity(proposalId(9), RAG, 4, writing(59)),
      manuscriptId: MANUSCRIPT_ID, baseRevisionId: revisionId(16), status: 'Accepted',
      summary: 'Mở đầu mục Introduction và nạp booktabs cho bảng so sánh.',
      diff: [
        { path: 'main.tex', operation: 'modify', hunks: [{ oldStart: 4, oldLines: 1, newStart: 4, newLines: 1, lines: ['-\\usepackage{amsmath}', '+\\usepackage{booktabs}'] }] },
        { path: 'sections/intro.tex', operation: 'modify', hunks: [] },
      ],
      taskId: WRITING_TASK, claimIds: [...CLAIMS], evidenceIds: EVIDENCE,
      createdByAgentRunId: id('agentRun', 59),
      citationCheck: { verificationResultId: uid('e6', 9), passed: true, unresolvedKeys: [], mismatches: [] },
      resultingRevisionId: revisionId(17),
      approval: {
        approvedBy: researcher, decidedAt: ago(3), decision: 'approved', objectType: 'change_proposal',
        objectId: proposalId(9), objectVersion: 1, apr: 'APR-05',
      },
      provenance: provenance(59, EVIDENCE),
    },
  ];
}

export function demoBibliography(): Schemas['BibliographyEntry'][] {
  const entry = (n: number, key: string, status: Schemas['ReferenceApprovalStatus'], cited: string[]): Schemas['BibliographyEntry'] => ({
    id: entryId(n), manuscriptId: MANUSCRIPT_ID, bibtexKey: key, referenceId: referenceId(n), referenceApprovalStatus: status,
    bibtex: BIB_ENTRIES[key]!, generatedFromMetadataVersion: 1, citedInFiles: cited,
  });
  return [
    entry(1, 'lewis2020rag', 'Trusted', ['sections/intro.tex']),
    entry(2, 'gao2023survey', 'Trusted', ['sections/intro.tex']),
    entry(3, 'doe2023hd', 'Revoked', ['sections/intro.tex']),
  ];
}

/**
 * Trusted References selected for the RAG project (library area data, PID-00098), contributed as fixtures so the
 * dev demo suggests smith2020; tests override listProjectReferences themselves (H3).
 */
export function demoProjectReferences(): Schemas['ProjectReferenceSelection'][] {
  const reference = (n: number, key: string, title: string, author: string, year: number, status: Schemas['ReferenceApprovalStatus']): Schemas['ProjectReferenceSelection'] => ({
    ...entity(uid('e5', n), RAG, 24 * 30, researcher),
    referenceId: referenceId(n), status: 'Active', selectedBy: researcher,
    reference: {
      id: referenceId(n), accountId: ACCOUNT_ID, createdAt: ago(24 * 40), createdBy: researcher, rowVersion: 1,
      bibtexKey: key, origin: 'manual', approvalStatus: status, indexingStatus: 'Indexed', metadataVersion: 1,
      metadata: { title, authors: [{ name: author }], year, publicationType: 'article', identifiers: {}, source: 'bibtex', retrievedAt: ago(24 * 40) },
    },
  });
  return [
    reference(1, 'lewis2020rag', 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', 'Patrick Lewis', 2020, 'Trusted'),
    reference(2, 'gao2023survey', 'Retrieval-Augmented Generation for Large Language Models: A Survey', 'Yunfan Gao', 2023, 'Trusted'),
    reference(3, 'doe2023hd', 'Hallucination Detection in Clinical Summaries', 'Jane Doe', 2023, 'Revoked'),
    reference(4, 'smith2020', 'Measuring Citation Accuracy in Generated Reviews', 'Alex Smith', 2020, 'Trusted'),
  ];
}

export const BUILD_LOG_R17 = [
  'This is pdfTeX, Version 3.141592653-2.6-1.40.25 (TeX Live 2023) (preloaded format=pdflatex)',
  ' restricted \\write18 enabled.',
  'entering extended mode',
  '(./main.tex',
  'LaTeX2e <2022-11-01> patch level 1',
  '(/usr/share/texlive/texmf-dist/tex/latex/base/article.cls',
  'Document Class: article 2022/07/02 v1.4n Standard LaTeX document class',
  ')',
  '',
  "! LaTeX Error: File `booktabs.sty' not found.",
  '',
  'Type X to quit or <RETURN> to proceed,',
  'or enter new name. (Default extension: sty)',
  '',
  'l.4 \\usepackage',
  '               {booktabs}^^M',
  '(./sections/intro.tex',
  "LaTeX Warning: Citation `gao2023survy' on page 1 undefined on input line 7.",
  ')',
  'No pages of output.',
  'Transcript written on main.log.',
  '',
].join('\n');

export const BUILD_LOG_R16 = [
  'This is pdfTeX, Version 3.141592653-2.6-1.40.25 (TeX Live 2023) (preloaded format=pdflatex)',
  '(./main.tex',
  'LaTeX2e <2022-11-01> patch level 1',
  '(./sections/intro.tex) (./sections/method.tex)',
  '(./main.bbl)',
  'Output written on main.pdf (6 pages, 48213 bytes).',
  'Transcript written on main.log.',
  '',
].join('\n');

export const MISSING_PACKAGE_VI = 'Môi trường build chưa có package booktabs. Bỏ dòng \\usepackage{booktabs} ở main.tex hoặc dựng bảng không cần booktabs.';
const UNDEFINED_CITATION_VI = 'Key gao2023survy không có trong references.bib. Có thể bạn định dùng gao2023survey.';

export function demoBuilds(): Schemas['Build'][] {
  return [
    {
      id: buildId(16), manuscriptId: MANUSCRIPT_ID, revisionId: revisionId(16), revisionNumber: 16, compiler: 'pdflatex',
      status: 'Succeeded', queuedAt: ago(24 * 28 - 0.01), startedAt: ago(24 * 28 - 0.012), endedAt: ago(24 * 28 - 0.02), hasPdf: true,
      issues: [], citationKeysFound: ['lewis2020rag', 'gao2023survey'], unresolvedKeys: [],
    },
    {
      id: buildId(17), manuscriptId: MANUSCRIPT_ID, revisionId: revisionId(17), revisionNumber: 17, compiler: 'pdflatex',
      status: 'Failed', queuedAt: ago(2.9), startedAt: ago(2.895), endedAt: ago(2.89), hasPdf: false,
      issues: [
        { severity: 'error', file: 'main.tex', line: 4, code: 'missing_package', message: "! LaTeX Error: File `booktabs.sty' not found.", friendlyMessage: MISSING_PACKAGE_VI },
        { severity: 'warning', file: 'sections/intro.tex', line: 7, code: 'undefined_citation', message: "LaTeX Warning: Citation `gao2023survy' on page 1 undefined on input line 7.", friendlyMessage: UNDEFINED_CITATION_VI },
      ],
      citationKeysFound: ['lewis2020rag', 'gao2023survey', 'doe2023hd'], unresolvedKeys: ['gao2023survy'],
    },
  ];
}

export function manuscriptRow(projectId: string, manuscriptId: string, current: Schemas['ManuscriptRevision'], initMode: Schemas['Manuscript']['initMode'] = 'Default', hoursAgo = 24 * 38): Schemas['Manuscript'] {
  return {
    id: manuscriptId, accountId: ACCOUNT_ID, projectId, createdAt: ago(hoursAgo), createdBy: researcher, rowVersion: 1,
    initMode, mainFile: 'main.tex', compiler: 'pdflatex',
    bibliographyTool: { engine: 'bibtex', package: 'natbib', style: 'plainnat' },
    currentRevisionId: current.id, currentRevisionNumber: current.revisionNumber,
  };
}

/** Archived project: one finished revision and its PDF (read-only demo, H20). */
export function archivedRevisions(): RevisionSnapshot[] {
  const files = [
    file(101, 'main.tex', 'tex', ['\\documentclass{article}', '\\usepackage[numbers]{natbib}', '\\title{Explainable credit scoring for microfinance}', '\\begin{document}', '\\maketitle', '\\input{sections/results}', '\\end{document}', ''].join('\n'), 1),
    file(102, 'bibliography/references.bib', 'bib', referencesBib([]), 1),
    file(103, 'sections/results.tex', 'tex', ['\\section{Results}', 'Gradient boosting with monotonic constraints keeps the ranking interpretable.', ''].join('\n'), 1),
  ];
  return [{
    revision: { id: uid('e7', 1), revisionNumber: 1, changes: files.map((row) => ({ path: row.path, operation: 'add' as const })), source: 'init', createdBy: SYSTEM, createdAt: ago(24 * 60), message: 'Default' },
    files: byId(files),
  }];
}

/** Files a new manuscript starts with (MS-INIT-001): Default is the article template, Blank only main.tex. */
export function templateFiles(mode: Schemas['Manuscript']['initMode'], next: () => string): FileVersion[] {
  const make = (path: string, fileType: FileKind, content: string): FileVersion => ({ id: next(), path, fileType, content, status: 'Active', updatedInRevision: 1 });
  if (mode === 'Blank') {
    return [
      make('main.tex', 'tex', ['\\documentclass{article}', '\\usepackage[numbers]{natbib}', '\\begin{document}', '', '\\bibliographystyle{plainnat}', '\\bibliography{bibliography/references}', '\\end{document}', ''].join('\n')),
      make('bibliography/references.bib', 'bib', referencesBib([])),
    ];
  }
  return [
    make('main.tex', 'tex', ['\\documentclass[11pt]{article}', '\\usepackage[utf8]{inputenc}', '\\usepackage{graphicx}', '\\usepackage[numbers]{natbib}', '\\title{[Tiêu đề bản thảo]}', '\\author{[Tác giả]}', '', '\\begin{document}', '\\maketitle', '\\input{sections/introduction}', '', '\\bibliographystyle{plainnat}', '\\bibliography{bibliography/references}', '\\end{document}', ''].join('\n')),
    make('sections/introduction.tex', 'tex', ['\\section{Introduction}', '\\label{sec:introduction}', '', ''].join('\n')),
    make('bibliography/references.bib', 'bib', referencesBib([])),
  ];
}
