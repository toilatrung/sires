// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Demo data of the research area (/projects/:id/evidence, /projects/:id/artifacts): evidence quoted from Trusted
// references, claims with support status, artifacts.

import type { Fixtures, Schemas } from '../types';
import { agent, id, meta, projects } from './ids';

const evidence: Schemas['Evidence'][] = [
  {
    ...meta('evidence', 1, { projectId: projects.rag, hours: 2.5, by: agent('evidence_retrieval', 1) }),
    referenceId: id('reference', 1), chunkId: id('chunk', 11), taskId: id('task', 2), createdByAgentRunId: id('agentRun', 1),
    quote: 'Across the three pipelines, retrieval augmentation reduced unsupported citations by 38% relative to the closed-book baseline.',
    location: { page: 7, paragraph: 3 }, retrievalQuery: 'citation precision RAG biomedical', relevanceScore: 0.92, status: 'Active',
  },
  {
    ...meta('evidence', 2, { projectId: projects.rag, hours: 2.4, by: agent('evidence_retrieval', 1) }),
    referenceId: id('reference', 2), chunkId: id('chunk', 21), taskId: id('task', 2), createdByAgentRunId: id('agentRun', 1),
    quote: 'Trong 640 trích dẫn do mô hình sinh ra, 23% không khớp với nội dung nguồn gốc.',
    location: { page: 5, paragraph: 2 }, retrievalQuery: 'tỉ lệ trích dẫn sai tiếng Việt', relevanceScore: 0.88, status: 'Active',
  },
  {
    ...meta('evidence', 3, { projectId: projects.rag, hours: 2.3, by: agent('evidence_retrieval', 1) }),
    referenceId: id('reference', 3), chunkId: id('chunk', 31), taskId: id('task', 2), createdByAgentRunId: id('agentRun', 1),
    quote: 'The verifier flags unsupported references with an F1 of 0.91 on the held-out set.',
    location: { page: 4 }, retrievalQuery: 'citation verifier F1', relevanceScore: 0.81, status: 'Active',
  },
];

const claims: Schemas['Claim'][] = [
  {
    ...meta('claim', 1, { projectId: projects.rag, hours: 2, by: agent('synthesis', 3) }),
    statement: 'RAG giảm khoảng một phần ba số trích dẫn không có căn cứ trong tổng quan tài liệu y sinh.',
    taskId: id('task', 2), approvalStatus: 'Draft', supportStatus: 'Supported', needsReview: false,
    evidenceLinks: [{ evidenceId: id('evidence', 1), relation: 'supports' }, { evidenceId: id('evidence', 3), relation: 'context' }],
  },
  {
    ...meta('claim', 2, { projectId: projects.rag, hours: 2, by: agent('synthesis', 3) }),
    statement: 'Tỉ lệ trích dẫn sai trong văn bản tiếng Việt cao hơn tiếng Anh.',
    taskId: id('task', 2), approvalStatus: 'Draft', supportStatus: 'Partially Supported', needsReview: true,
    evidenceLinks: [{ evidenceId: id('evidence', 2), relation: 'supports' }],
  },
];

const artifacts: Schemas['Artifact'][] = [
  {
    ...meta('artifact', 1, { projectId: projects.rag, hours: 24 * 7 }), type: 'synthesis', title: 'Tổng quan 32 nghiên cứu RAG trong y sinh',
    taskId: id('task', 1), currentAcceptedVersionId: id('artifactVersion', 2),
    latestVersion: { id: id('artifactVersion', 2), versionNumber: 2, status: 'Accepted' },
  },
  {
    ...meta('artifact', 2, { projectId: projects.rag, hours: 18 }), type: 'table', title: 'Bảng so sánh 5 khung đánh giá độ tin cậy',
    taskId: id('task', 3), currentAcceptedVersionId: null,
    latestVersion: { id: id('artifactVersion', 3), versionNumber: 1, status: 'Draft' },
  },
  {
    ...meta('artifact', 3, { projectId: projects.learning, hours: 24 * 4 }), type: 'note', title: 'Screening notes — 14 included studies',
    taskId: id('task', 11), currentAcceptedVersionId: id('artifactVersion', 4),
    latestVersion: { id: id('artifactVersion', 4), versionNumber: 1, status: 'Accepted' },
  },
];

export const research: Fixtures = {
  Evidence: evidence,
  Claim: claims,
  Artifact: artifacts,
};
