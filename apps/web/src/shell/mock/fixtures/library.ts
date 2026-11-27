// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Demo data of the library area (/discover, /library): references in every approval and indexing state.
// Titles and authors are invented.

import type { Fixtures, Schemas } from '../types';
import { ago, agent, id, meta, researcher } from './ids';

interface Paper {
  n: number;
  title: string;
  authors: string[];
  year: number;
  venue: string;
  type: NonNullable<Schemas['ReferenceMetadata']['publicationType']>;
  cite: string;
  abstract: string;
  approval: Schemas['ReferenceApprovalStatus'];
  indexing: Schemas['IndexingStatus'];
  origin: 'discovered' | 'manual';
  pages?: number;
  citations?: number;
}

const papers: Paper[] = [
  { n: 1, title: 'Retrieval-Augmented Generation for Biomedical Literature Review: A Replication Study', authors: ['Emily Zhang', 'Daniel Carter'],
    year: 2024, venue: 'Journal of Clinical Text Mining', type: 'article', cite: 'zhang2024rag', approval: 'Trusted', indexing: 'Indexed', origin: 'discovered', pages: 14, citations: 87,
    abstract: 'We replicate three RAG pipelines on 1,200 biomedical review questions and measure citation precision against source passages.' },
  { n: 2, title: 'Đánh giá độ chính xác trích dẫn của mô hình ngôn ngữ lớn trong văn bản học thuật tiếng Việt', authors: ['Trần Quốc Bảo', 'Phạm Ngọc Hân'],
    year: 2025, venue: 'Tạp chí Khoa học Dữ liệu', type: 'article', cite: 'tran2025trichdan', approval: 'Trusted', indexing: 'Indexed', origin: 'manual', pages: 11, citations: 9,
    abstract: 'Nghiên cứu khảo sát 640 trích dẫn do LLM sinh ra trong văn bản học thuật tiếng Việt; 23% không khớp với nguồn gốc.' },
  { n: 3, title: 'Citation Hallucination in Large Language Models: Detection and Mitigation', authors: ['Sofia Rossi', 'Aisha Rahman', 'Michael Brown'],
    year: 2023, venue: 'Workshop on Trustworthy NLP', type: 'conference', cite: 'rossi2023hallucination', approval: 'Trusted', indexing: 'Indexed', origin: 'discovered', pages: 9, citations: 214,
    abstract: 'A benchmark of 5,000 generated citations and a verifier that flags unsupported references with 0.91 F1.' },
  { n: 4, title: 'A Systematic Review of Evidence Grading Frameworks in Health Research', authors: ['Michael Brown'],
    year: 2022, venue: 'Health Evidence Review', type: 'article', cite: 'brown2022grading', approval: 'Trusted', indexing: 'Indexing', origin: 'discovered', pages: 22, citations: 156,
    abstract: 'We compare GRADE, Oxford CEBM and three newer frameworks across 140 reviews.' },
  { n: 5, title: 'Ứng dụng học kết hợp trong đào tạo sau đại học: nghiên cứu tại ba trường đại học phía Bắc', authors: ['Lê Hoàng Phúc', 'Võ Thanh Tùng'],
    year: 2024, venue: 'Tạp chí Đào tạo Sau đại học', type: 'article', cite: 'le2024hocketop', approval: 'Pending Approval', indexing: 'Not Indexed', origin: 'discovered', citations: 3,
    abstract: 'Khảo sát 412 học viên cao học về mức độ hài lòng và kết quả học tập trong mô hình học kết hợp.' },
  { n: 6, title: 'Measuring Learning Outcomes in Blended Classrooms: A Meta-Analysis', authors: ['Daniel Carter', 'Emily Zhang'],
    year: 2023, venue: 'Blended Learning Quarterly', type: 'article', cite: 'carter2023blended', approval: 'Trusted', indexing: 'Failed', origin: 'manual', citations: 61,
    abstract: 'Meta-analysis of 48 studies (N = 9,312) reporting a pooled effect size of d = 0.34 for blended over face-to-face teaching.' },
  { n: 7, title: 'Saltwater Intrusion Forecasting in the Mekong Delta with Gradient Boosting', authors: ['Võ Thanh Tùng', 'Aisha Rahman'],
    year: 2025, venue: 'Mekong Environmental Modelling', type: 'article', cite: 'vo2025salinity', approval: 'Pending Approval', indexing: 'Not Indexed', origin: 'discovered', citations: 4,
    abstract: 'Gradient-boosted models forecast salinity 14 days ahead at 32 monitoring stations with MAE of 0.8 g/L.' },
];

const reference = (paper: Paper): Schemas['Reference'] => ({
  ...meta('reference', paper.n, { hours: 24 * (10 - paper.n), by: paper.origin === 'discovered' ? agent('discovery', 40 + paper.n) : researcher }),
  metadata: {
    title: paper.title,
    authors: paper.authors.map((name) => ({ name })),
    year: paper.year,
    venue: paper.venue,
    publicationType: paper.type,
    identifiers: {
      doi: `10.5555/sires.${paper.year}.${String(paper.n).padStart(4, '0')}`,
      // Discovered rows keep the source's id and landing page (ReferenceMetadata if/else).
      ...(paper.origin === 'discovered' ? { sourceId: `W43900000${paper.n}`, url: `https://openalex.sires.example/works/W43900000${paper.n}` } : {}),
    },
    abstractOrSnippet: paper.abstract,
    ...(paper.citations !== undefined ? { citationCount: paper.citations, citationCountAt: ago(48) } : {}),
    source: paper.origin === 'discovered' ? 'openalex' : 'bibtex',
    retrievedAt: ago(24 * (10 - paper.n)),
  },
  metadataVersion: 1,
  bibtexKey: paper.cite,
  origin: paper.origin,
  approvalStatus: paper.approval,
  indexingStatus: paper.indexing,
  ...(paper.indexing === 'Failed' ? { indexingError: { code: 'pdf_without_text_layer', message: 'PDF chỉ có ảnh quét, không có lớp văn bản.' } } : {}),
  ...(paper.pages ? {
    document: {
      id: id('document', paper.n), fileName: `${paper.cite}.pdf`, sizeBytes: 380_000 + paper.n * 91_000, pageCount: paper.pages,
      ...(paper.indexing === 'Indexed' ? { indexedAt: ago(24 * (9 - paper.n)), chunkCount: paper.pages * 6, embeddingModel: 'text-embedding-3-small' } : {}),
    },
  } : {}),
  ...(paper.approval === 'Trusted' ? {
    approval: {
      approvedBy: researcher, decidedAt: ago(24 * (9 - paper.n)), decision: 'approved', objectType: 'reference',
      objectId: id('reference', paper.n), objectVersion: 1, apr: 'APR-03',
    },
  } : {}),
  usedInProjectCount: paper.approval === 'Trusted' ? 1 + (paper.n % 2) : 0,
});

export const references: Schemas['Reference'][] = papers.map(reference);

export const library: Fixtures = {
  Reference: references,
};
