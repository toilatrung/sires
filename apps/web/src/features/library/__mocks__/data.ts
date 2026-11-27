// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Demo data of the library area (PID-00098 designs/notes.html “Dữ liệu”): the references of the Library screen,
// the five pending items, the five Discover results. Ids are local to this area; projects are the shell demo projects
// so “Project đang dùng” matches the project switcher in dev.

import { ACCOUNT_ID, demoFixtures, projectIds, type Schemas } from '../../../shell/mock';

type Reference = Schemas['Reference'];
type DiscoveredResult = Schemas['DiscoveredResult'];

const hex = (prefix: string, n: number) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const referenceId = (n: number) => hex('4e', n);
export const resultId = (n: number) => hex('4f', n);
export const documentId = (n: number) => hex('4d', n);
export const workflowId = (n: number) => hex('7e', n);

const at = (daysAgo: number, hour = 9) => new Date(Date.UTC(2026, 10, 27 - daysAgo, hour, 51)).toISOString();
const researcher = { type: 'researcher', accountId: ACCOUNT_ID } as const;
const projectName = (id: string) => demoFixtures.ResearchProject?.find((row) => row.id === id)?.name ?? id;

export const projects = {
  rag: { id: projectIds.rag, name: projectName(projectIds.rag) },
  learning: { id: projectIds.learning, name: projectName(projectIds.learning) },
};

interface Paper {
  n: number;
  /** BibTeX key (named cite: gitleaks reads `key: '…'` as an API key, PID-00013). */
  cite: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  type?: Schemas['ReferenceMetadata']['publicationType'];
  arxiv?: string;
  doi?: string;
  abstract?: string;
  citations?: number;
}

function metadata(paper: Paper, source: string): Schemas['ReferenceMetadata'] {
  return {
    title: paper.title,
    authors: paper.authors.map((name) => ({ name })),
    ...(paper.year ? { year: paper.year } : {}),
    ...(paper.venue ? { venue: paper.venue } : {}),
    publicationType: paper.type ?? 'article',
    identifiers: {
      ...(paper.doi ? { doi: paper.doi } : {}),
      ...(paper.arxiv ? { arxivId: paper.arxiv } : {}),
      sourceId: `W${4390000000 + paper.n}`,
      url: paper.arxiv ? `https://arxiv.org/abs/${paper.arxiv}` : `https://openalex.org/W${4390000000 + paper.n}`,
    },
    ...(paper.abstract ? { abstractOrSnippet: paper.abstract } : {}),
    ...(paper.citations !== undefined ? { citationCount: paper.citations, citationCountAt: at(1) } : {}),
    source,
    retrievedAt: at(12),
  };
}

interface Options {
  approval: Schemas['ReferenceApprovalStatus'];
  indexing: Schemas['IndexingStatus'];
  chunks?: number;
  error?: { code: string; message: string };
  document?: boolean;
  duplicateOf?: number;
  usedIn?: number;
  origin?: 'discovered' | 'manual';
  daysAgo?: number;
  version?: number;
}

function reference(paper: Paper, options: Options): Reference {
  const createdAt = at(options.daysAgo ?? 10);
  const decided = at((options.daysAgo ?? 10) - 1, 10);
  const origin = options.origin ?? 'discovered';
  return {
    id: referenceId(paper.n),
    accountId: ACCOUNT_ID,
    createdAt,
    createdBy: origin === 'discovered' ? { type: 'agent', agent: 'reference_processing', agentRunId: hex('7c', 40 + paper.n) } : researcher,
    rowVersion: options.version ?? 1,
    metadata: metadata(paper, origin === 'discovered' ? 'openalex' : 'bibtex'),
    metadataVersion: options.version ?? 1,
    bibtexKey: paper.cite,
    origin,
    approvalStatus: options.approval,
    indexingStatus: options.indexing,
    ...(options.error ? { indexingError: options.error } : {}),
    ...(options.document ?? (options.indexing !== 'Unavailable' && options.indexing !== 'Not Indexed') ? {
      document: {
        id: documentId(paper.n), fileName: `${paper.cite}.pdf`, sizeBytes: 820_000 + paper.n * 37_000, pageCount: 12 + paper.n,
        ...(options.indexing === 'Indexed' ? { indexedAt: decided, chunkCount: options.chunks ?? 60, embeddingModel: 'text-embedding-3-small' } : {}),
      },
    } : {}),
    ...(options.duplicateOf ? { duplicateWarnings: [{ referenceId: referenceId(options.duplicateOf), matchedOn: 'title_author_year' as const }] } : {}),
    ...(options.approval === 'Trusted' || options.approval === 'Revoked' ? {
      approval: { approvedBy: researcher, decidedAt: decided, decision: 'approved' as const, objectType: 'reference', objectId: referenceId(paper.n), objectVersion: options.version ?? 1, apr: 'APR-04' as const },
    } : {}),
    ...(options.approval === 'Revoked' ? {
      revocation: { approvedBy: researcher, decidedAt: at(2, 14), decision: 'rejected' as const, objectType: 'reference', objectId: referenceId(paper.n), objectVersion: 1, apr: 'APR-04' as const, reason: 'Bài đã bị rút (retracted).' },
    } : {}),
    usedInProjectCount: options.usedIn ?? 0,
  };
}

export const papers = {
  lewis: { n: 1, cite: 'lewis2020rag', title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', authors: ['P. Lewis', 'E. Perez', 'A. Piktus'], year: 2020, venue: 'NeurIPS', type: 'conference', arxiv: '2005.11401', citations: 5210, abstract: 'Large pre-trained language models store factual knowledge in their parameters; we combine them with a non-parametric memory accessed by a neural retriever.' },
  karpukhin: { n: 2, cite: 'karpukhin2020dpr', title: 'Dense Passage Retrieval for Open-Domain Question Answering', authors: ['V. Karpukhin', 'B. Oğuz', 'S. Min'], year: 2020, venue: 'EMNLP', type: 'conference', arxiv: '2004.04906', citations: 3120 },
  gao: { n: 3, cite: 'gao2023survey', title: 'Retrieval-Augmented Generation for Large Language Models: A Survey', authors: ['Y. Gao', 'Y. Xiong', 'X. Gao'], year: 2023, venue: 'arXiv', type: 'preprint', arxiv: '2312.10997', citations: 1480 },
  liu: { n: 4, cite: 'liu2024lost', title: 'Lost in the Middle: How Language Models Use Long Contexts', authors: ['N. F. Liu', 'K. Lin', 'J. Hewitt'], year: 2024, venue: 'TACL', arxiv: '2307.03172', citations: 1290 },
  asai: { n: 5, cite: 'asai2024selfrag', title: 'Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection', authors: ['A. Asai', 'Z. Wu', 'Y. Wang'], year: 2024, venue: 'ICLR', type: 'conference', arxiv: '2310.11511', citations: 860 },
  doe: { n: 6, cite: 'doe2023hd', title: 'Hallucination detection preprint (đã rút)', authors: ['J. Doe'], year: 2023, venue: 'arXiv', type: 'preprint' },
  huang: { n: 7, cite: 'huang2024survey', title: 'A Survey on Hallucination in Large Language Models', authors: ['L. Huang', 'W. Yu', 'W. Ma'], year: 2024, venue: 'ACM TOIS', doi: '10.1145/3703155', citations: 940 },
  chen: { n: 8, cite: 'chen2024benchmarking', title: 'Benchmarking Large Language Models in Retrieval-Augmented Generation', authors: ['J. Chen', 'H. Lin', 'X. Han', 'L. Sun'], year: 2024, venue: 'AAAI', type: 'conference', arxiv: '2309.01431', citations: 410 },
  jiang: { n: 9, cite: 'jiang2023active', title: 'Active Retrieval Augmented Generation', authors: ['Z. Jiang', 'F. Xu', 'L. Gao'], year: 2023, venue: 'EMNLP', type: 'conference', arxiv: '2305.06983', citations: 520 },
  es: { n: 10, cite: 'es2024ragas', title: 'RAGAS: Automated Evaluation of Retrieval Augmented Generation', authors: ['S. Es', 'J. James', 'L. Espinosa-Anke'], year: 2024, venue: 'EACL Demo', type: 'conference', arxiv: '2309.15217' },
  shi: { n: 11, cite: 'shi2023distracted', title: 'Large Language Models Can Be Easily Distracted by Irrelevant Context', authors: ['F. Shi', 'X. Chen', 'K. Misra'], year: 2023, venue: 'ICML', type: 'conference', arxiv: '2302.00093' },
  chenPreprint: { n: 12, cite: 'chen2023benchmarking', title: 'Benchmarking Large Language Models in Retrieval-Augmented Generation (preprint)', authors: ['J. Chen', 'H. Lin', 'X. Han', 'L. Sun'], year: 2023, venue: 'arXiv', type: 'preprint', arxiv: '2309.01431' },
} satisfies Record<string, Paper>;

/** References of the Library and Reference screens. */
export function demoReferences(): Reference[] {
  return [
    reference(papers.lewis, { approval: 'Trusted', indexing: 'Indexed', chunks: 142, usedIn: 2, daysAgo: 20 }),
    reference(papers.karpukhin, { approval: 'Trusted', indexing: 'Indexed', chunks: 96, usedIn: 1, daysAgo: 19 }),
    reference(papers.gao, { approval: 'Trusted', indexing: 'Failed', error: { code: 'pdf_without_text_layer', message: 'PDF không có lớp văn bản (chỉ có ảnh quét).' }, usedIn: 1, daysAgo: 15 }),
    reference(papers.liu, { approval: 'Trusted', indexing: 'Unavailable', usedIn: 1, daysAgo: 14, origin: 'manual' }),
    reference(papers.asai, { approval: 'Trusted', indexing: 'Indexing', daysAgo: 3 }),
    reference(papers.doe, { approval: 'Revoked', indexing: 'Indexed', chunks: 31, usedIn: 1, daysAgo: 30 }),
    reference(papers.huang, { approval: 'Pending Approval', indexing: 'Not Indexed', daysAgo: 0 }),
    reference(papers.chen, { approval: 'Pending Approval', indexing: 'Not Indexed', duplicateOf: 12, daysAgo: 0 }),
    reference(papers.jiang, { approval: 'Pending Approval', indexing: 'Not Indexed', daysAgo: 0 }),
    reference(papers.es, { approval: 'Pending Approval', indexing: 'Not Indexed', daysAgo: 0 }),
    reference(papers.shi, { approval: 'Pending Approval', indexing: 'Not Indexed', daysAgo: 0 }),
    reference(papers.chenPreprint, { approval: 'Trusted', indexing: 'Indexed', chunks: 58, daysAgo: 40 }),
  ];
}

/** Which project uses which reference (getReferenceUsage). */
export function demoUsage(): Record<string, { projectId: string; name: string; evidenceCount: number; citationCount: number }[]> {
  return {
    [referenceId(1)]: [
      { projectId: projects.rag.id, name: projects.rag.name, evidenceCount: 6, citationCount: 3 },
      { projectId: projects.learning.id, name: projects.learning.name, evidenceCount: 2, citationCount: 1 },
    ],
    [referenceId(2)]: [{ projectId: projects.rag.id, name: projects.rag.name, evidenceCount: 3, citationCount: 2 }],
    [referenceId(3)]: [{ projectId: projects.rag.id, name: projects.rag.name, evidenceCount: 0, citationCount: 1 }],
    [referenceId(4)]: [{ projectId: projects.learning.id, name: projects.learning.name, evidenceCount: 0, citationCount: 2 }],
    [referenceId(6)]: [{ projectId: projects.rag.id, name: projects.rag.name, evidenceCount: 2, citationCount: 1 }],
  };
}

/** The five results of the Discover screen for one search workflow. */
export function demoResults(searchWorkflowId: string, query: string, source = 'openalex'): DiscoveredResult[] {
  const rows: [Paper, number?][] = [[papers.lewis, 1], [papers.huang], [papers.chen], [papers.jiang], [papers.asai, 5]];
  return rows.map(([paper, duplicateOf], index) => ({
    id: resultId(index + 1),
    accountId: ACCOUNT_ID,
    createdAt: at(0),
    createdBy: { type: 'agent', agent: 'discovery', agentRunId: hex('7c', 90 + index) },
    rowVersion: 1,
    searchWorkflowId,
    // The contract (#159) narrows DiscoveredResult.source to the known sources; the mock passes what the search asked.
    source: source as DiscoveredResult['source'],
    query,
    metadata: metadata(paper, source),
    sourceUrl: paper.arxiv ? `https://arxiv.org/abs/${paper.arxiv}` : `https://doi.org/${paper.doi}`,
    status: 'New',
    ...(duplicateOf ? { duplicateOfReferenceId: referenceId(duplicateOf) } : {}),
  }));
}

export const demoSources: Schemas['DiscoverySource'][] = [
  { source: 'openalex', role: 'primary', available: true, accessMethod: 'official_api', supportedFilters: ['title', 'keywords', 'yearFrom', 'yearTo'], supportsAuthorSearch: true, hasFullText: false },
  { source: 'google_scholar', role: 'fallback', available: true, accessMethod: 'contracted_intermediary', supportedFilters: ['yearFrom', 'yearTo'], supportsAuthorSearch: true, hasFullText: false, termsNotice: 'Google Scholar qua dịch vụ trung gian; dùng khi bạn chọn.' },
];
