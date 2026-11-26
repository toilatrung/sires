// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Sample data of the research area mock (PID-00114 S01, designs/notes.html “Dữ liệu”): project “RAG trong tổng quan
// tài liệu” of the shared mock world, its selected references, evidence (Active, Excluded, Stale), claims (five support
// levels, three approval states, needs review) and artifacts with versions and provenance. Quotes are placeholders in
// square brackets (design.md §6); bibliographic data of the references is public.

import { ACCOUNT_ID, id, projectIds } from '../../../shell/mock';
import type { Schemas } from '../../../shell/mock';

type ActorRef = Schemas['ActorRef'];
type Reference = Schemas['Reference'];

export const PROJECT_ID = projectIds.rag;

/** Ids of the sample rows, so tests name what they check (`ids.claim.unsupported`). */
export const ids = {
  reference: {
    lewis: id('reference', 101), shi: id('reference', 102), liu: id('reference', 103), karpukhin: id('reference', 104),
    doe: id('reference', 105), ji: id('reference', 106), maynez: id('reference', 107), gao: id('reference', 108),
    manakul: id('reference', 109), min: id('reference', 110), asai: id('reference', 111), huang: id('reference', 112),
    izacard: id('reference', 113), guu: id('reference', 114),
  },
  evidence: {
    lewisP7: id('evidence', 101), shiP2: id('evidence', 102), karpukhinP3: id('evidence', 103), doeStale: id('evidence', 104),
    lewisExcluded: id('evidence', 105), jiNoBefore: id('evidence', 106), maynez: id('evidence', 107), liu: id('evidence', 108),
    manakulUnused: id('evidence', 109), asai: id('evidence', 110), minUnused: id('evidence', 111),
  },
  claim: {
    conflicting: id('claim', 101), definition: id('claim', 102), longContext: id('claim', 103), intrinsic: id('claim', 104),
    unsupported: id('claim', 105), entropy: id('claim', 106), notAssessed: id('claim', 107), accepted: id('claim', 108),
    rareEntities: id('claim', 109),
  },
  artifact: {
    pipeline: id('artifact', 101), synthesis: id('artifact', 102), table: id('artifact', 103), note: id('artifact', 104),
    report: id('artifact', 105), stateDiagram: id('artifact', 106),
  },
  version: {
    pipelineV1: id('artifactVersion', 101), pipelineV2: id('artifactVersion', 102), synthesisV1: id('artifactVersion', 103),
    synthesisV2: id('artifactVersion', 104), tableV1: id('artifactVersion', 105), tableV2: id('artifactVersion', 106),
    tableV3: id('artifactVersion', 107), noteV1: id('artifactVersion', 108), reportV1: id('artifactVersion', 109),
    reportV2: id('artifactVersion', 110), stateV1: id('artifactVersion', 111),
  },
  /** Tasks of the shared planning fixtures (shell/mock/fixtures/planning.ts) the research rows point at. */
  task: { t1: id('task', 1), t2: id('task', 2), t3: id('task', 3), t4: id('task', 4), t6: id('task', 6) },
  researchContext: id('context', 101),
} as const;

export const researcher: ActorRef = { type: 'researcher', accountId: ACCOUNT_ID };
export const agentActor = (agent: Schemas['AgentName'], run: number): ActorRef => ({ type: 'agent', agent, agentRunId: id('agentRun', run) });

/** ISO time `hours` before `now`. */
export const before = (now: Date, hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

function meta(now: Date, rowId: string, hours: number, by: ActorRef = researcher, rowVersion = 1) {
  return {
    id: rowId, accountId: ACCOUNT_ID, projectId: PROJECT_ID, createdAt: before(now, hours), createdBy: by,
    updatedAt: before(now, hours / 2), rowVersion,
  } satisfies Schemas['EntityMeta'];
}

interface Paper {
  n: number;
  authors: string[];
  year: number;
  title: string;
  venue: string;
  approval: Schemas['ReferenceApprovalStatus'];
  indexing: Schemas['IndexingStatus'];
  pages?: number;
}

const papers: Paper[] = [
  { n: 101, authors: ['Patrick Lewis', 'Ethan Perez', 'Aleksandra Piktus'], year: 2020, title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', venue: 'NeurIPS', approval: 'Trusted', indexing: 'Indexed', pages: 19 },
  { n: 102, authors: ['Freda Shi', 'Xinyun Chen', 'Kanishka Misra'], year: 2023, title: 'Large Language Models Can Be Easily Distracted by Irrelevant Context', venue: 'ICML', approval: 'Trusted', indexing: 'Indexed', pages: 16 },
  { n: 103, authors: ['Nelson F. Liu', 'Kevin Lin', 'John Hewitt'], year: 2024, title: 'Lost in the Middle: How Language Models Use Long Contexts', venue: 'TACL', approval: 'Trusted', indexing: 'Unavailable' },
  { n: 104, authors: ['Vladimir Karpukhin', 'Barlas Oğuz', 'Sewon Min'], year: 2020, title: 'Dense Passage Retrieval for Open-Domain Question Answering', venue: 'EMNLP', approval: 'Trusted', indexing: 'Indexed', pages: 13 },
  { n: 105, authors: ['Jane Doe', 'John Roe', 'Alex Poe'], year: 2023, title: 'Hallucination detection preprint (đã rút)', venue: 'arXiv', approval: 'Revoked', indexing: 'Indexed', pages: 9 },
  { n: 106, authors: ['Ziwei Ji', 'Nayeon Lee', 'Rita Frieske'], year: 2023, title: 'Survey of Hallucination in Natural Language Generation', venue: 'ACM Computing Surveys', approval: 'Trusted', indexing: 'Indexed', pages: 38 },
  { n: 107, authors: ['Joshua Maynez', 'Shashi Narayan', 'Bernd Bohnet'], year: 2020, title: 'On Faithfulness and Factuality in Abstractive Summarization', venue: 'ACL', approval: 'Trusted', indexing: 'Indexed', pages: 14 },
  { n: 108, authors: ['Yunfan Gao', 'Yun Xiong', 'Xinyu Gao'], year: 2023, title: 'Retrieval-Augmented Generation for Large Language Models: A Survey', venue: 'arXiv', approval: 'Trusted', indexing: 'Indexing', pages: 21 },
  { n: 109, authors: ['Potsawee Manakul', 'Adian Liusie', 'Mark Gales'], year: 2023, title: 'SelfCheckGPT: Zero-Resource Black-Box Hallucination Detection for Generative Large Language Models', venue: 'EMNLP', approval: 'Trusted', indexing: 'Indexed', pages: 15 },
  { n: 110, authors: ['Sewon Min', 'Kalpesh Krishna', 'Xinxi Lyu'], year: 2023, title: 'FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation', venue: 'EMNLP', approval: 'Trusted', indexing: 'Indexed', pages: 17 },
  { n: 111, authors: ['Akari Asai', 'Zeqiu Wu', 'Yizhong Wang'], year: 2024, title: 'Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection', venue: 'ICLR', approval: 'Trusted', indexing: 'Indexed', pages: 30 },
  { n: 112, authors: ['Lei Huang', 'Weijiang Yu', 'Weitao Ma'], year: 2023, title: 'A Survey on Hallucination in Large Language Models', venue: 'arXiv', approval: 'Trusted', indexing: 'Failed' },
  { n: 113, authors: ['Gautier Izacard', 'Edouard Grave'], year: 2021, title: 'Leveraging Passage Retrieval with Generative Models for Open Domain Question Answering', venue: 'EACL', approval: 'Trusted', indexing: 'Queued', pages: 8 },
  { n: 114, authors: ['Kelvin Guu', 'Kenton Lee', 'Zora Tung'], year: 2020, title: 'REALM: Retrieval-Augmented Language Model Pre-Training', venue: 'ICML', approval: 'Trusted', indexing: 'Not Indexed', pages: 12 },
];

function reference(now: Date, paper: Paper): Reference {
  const refId = id('reference', paper.n);
  return {
    id: refId, accountId: ACCOUNT_ID, createdAt: before(now, 24 * 20), createdBy: researcher, rowVersion: 1,
    metadata: {
      title: paper.title,
      authors: paper.authors.map((name) => ({ name })),
      year: paper.year,
      venue: paper.venue,
      publicationType: paper.venue === 'arXiv' ? 'preprint' : 'conference',
      identifiers: { doi: `10.5555/sires.${paper.year}.${paper.n}`, sourceId: `W5${paper.n}`, url: `https://doi.org/10.5555/sires.${paper.year}.${paper.n}` },
      source: 'openalex',
      retrievedAt: before(now, 24 * 20),
    },
    metadataVersion: 1,
    bibtexKey: `${paper.authors[0]!.split(' ').pop()!.toLowerCase()}${paper.year}`,
    origin: 'discovered',
    approvalStatus: paper.approval,
    indexingStatus: paper.indexing,
    ...(paper.indexing === 'Failed' ? { indexingError: { code: 'pdf_without_text_layer', message: 'PDF chỉ có ảnh quét, không có lớp văn bản.' } } : {}),
    ...(paper.pages ? { document: { id: id('document', paper.n), fileName: `${paper.n}.pdf`, sizeBytes: 900_000 + paper.n * 1000, pageCount: paper.pages } } : {}),
  };
}

export function buildReferences(now: Date): Schemas['ProjectReferenceSelection'][] {
  return papers.map((paper) => ({
    ...meta(now, id('assignment', paper.n), 24 * 15),
    referenceId: id('reference', paper.n),
    reference: reference(now, paper),
    status: 'Active',
    selectedBy: researcher,
  }));
}

interface EvidenceRow {
  rowId: string;
  referenceId: string;
  page?: number;
  paragraph?: number;
  chunk: number;
  quote: string;
  before?: string;
  after?: string;
  status: Schemas['EvidenceStatus'];
  statusReason?: string;
  taskId?: string;
}

const evidenceRows: EvidenceRow[] = [
  { rowId: ids.evidence.lewisP7, referenceId: ids.reference.lewis, page: 7, paragraph: 3, chunk: 58, status: 'Active', taskId: ids.task.t3,
    before: '[câu đứng trước: so sánh mô hình có truy xuất với mô hình chỉ dùng tham số]',
    quote: '[đoạn trích hỗ trợ: mô hình có truy xuất cho câu trả lời đúng sự thật hơn mô hình chỉ dùng tham số]',
    after: '[câu đứng sau: kết quả trên các tập hỏi đáp mở]' },
  { rowId: ids.evidence.shiP2, referenceId: ids.reference.shi, page: 2, paragraph: 1, chunk: 4, status: 'Active', taskId: ids.task.t3,
    before: '[câu đứng trước: thiết lập thí nghiệm có ngữ cảnh nhiễu]',
    quote: '[đoạn trích phản bác: độ chính xác giảm khi ngữ cảnh truy xuất chứa thông tin không liên quan]',
    after: '[câu đứng sau: mức giảm theo số đoạn nhiễu]' },
  { rowId: ids.evidence.karpukhinP3, referenceId: ids.reference.karpukhin, page: 3, chunk: 21, status: 'Active', taskId: ids.task.t3,
    before: '[câu đứng trước: mô tả bộ truy xuất dày đặc]',
    quote: '[truy xuất dày đặc vượt BM25 trên các tập hỏi đáp mở]',
    after: '[câu đứng sau: số liệu top-20 accuracy]' },
  { rowId: ids.evidence.doeStale, referenceId: ids.reference.doe, page: 4, paragraph: 2, chunk: 17, status: 'Stale', taskId: ids.task.t1,
    statusReason: 'Reference đã bị thu hồi khỏi Trusted Library.',
    before: '[câu đứng trước: tập thử của bộ phát hiện]',
    quote: '[đoạn trích: bộ phát hiện dựa trên entropy đạt độ chính xác cao trên tập thử]',
    after: '[câu đứng sau: so sánh với baseline]' },
  { rowId: ids.evidence.lewisExcluded, referenceId: ids.reference.lewis, page: 9, paragraph: 1, chunk: 77, status: 'Excluded', taskId: ids.task.t3,
    statusReason: 'Không còn phù hợp với câu hỏi nghiên cứu.',
    before: '[câu đứng trước: phần phụ lục]',
    quote: '[đoạn trích không còn phù hợp với câu hỏi nghiên cứu]',
    after: '[câu đứng sau: cấu hình huấn luyện]' },
  { rowId: ids.evidence.jiNoBefore, referenceId: ids.reference.ji, page: 4, paragraph: 2, chunk: 12, status: 'Active', taskId: ids.task.t2,
    quote: '[hallucination là nội dung sinh ra không trung thành với nguồn hoặc không có căn cứ]',
    after: '[câu đứng sau: phân loại intrinsic và extrinsic]' },
  { rowId: ids.evidence.maynez, referenceId: ids.reference.maynez, page: 2, paragraph: 4, chunk: 6, status: 'Active', taskId: ids.task.t2,
    before: '[câu đứng trước: định nghĩa faithfulness]',
    quote: '[phân biệt hallucination intrinsic và extrinsic theo quan hệ với văn bản nguồn]',
    after: '[câu đứng sau: tỉ lệ mỗi loại trong tập tóm tắt]' },
  { rowId: ids.evidence.liu, referenceId: ids.reference.liu, page: 11, paragraph: 2, chunk: 40, status: 'Active',
    before: '[câu đứng trước: thí nghiệm đổi vị trí tài liệu liên quan]',
    quote: '[độ chính xác giảm khi thông tin liên quan nằm ở giữa ngữ cảnh dài]',
    after: '[câu đứng sau: đường cong hình chữ U]' },
  { rowId: ids.evidence.manakulUnused, referenceId: ids.reference.manakul, page: 5, paragraph: 1, chunk: 19, status: 'Active', taskId: ids.task.t1,
    before: '[câu đứng trước: ý tưởng lấy nhiều mẫu]',
    quote: '[SelfCheckGPT phát hiện câu không có căn cứ bằng độ nhất quán giữa các mẫu]',
    after: '[câu đứng sau: kết quả trên WikiBio]' },
  { rowId: ids.evidence.asai, referenceId: ids.reference.asai, page: 6, paragraph: 3, chunk: 33, status: 'Active', taskId: ids.task.t3,
    before: '[câu đứng trước: thiết lập đánh giá trích dẫn]',
    quote: '[Self-RAG giảm trích dẫn không có căn cứ so với RAG thông thường]',
    after: '[câu đứng sau: số liệu citation precision]' },
  { rowId: ids.evidence.minUnused, referenceId: ids.reference.min, page: 3, paragraph: 2, chunk: 9, status: 'Active', taskId: ids.task.t2,
    before: '[câu đứng trước: tách văn bản thành mệnh đề]',
    quote: '[đánh giá factual precision theo từng mệnh đề nguyên tử]',
    after: '[câu đứng sau: tương quan với đánh giá của người]' },
];

/** Which claims link which evidence, with the relation (the claim side of ClaimEvidenceLink). */
const links: Array<[claim: string, evidence: string, relation: Schemas['ClaimEvidenceLink']['relation']]> = [
  [ids.claim.conflicting, ids.evidence.lewisP7, 'supports'],
  [ids.claim.conflicting, ids.evidence.karpukhinP3, 'supports'],
  [ids.claim.conflicting, ids.evidence.shiP2, 'contradicts'],
  [ids.claim.conflicting, ids.evidence.lewisExcluded, 'context'],
  [ids.claim.definition, ids.evidence.lewisP7, 'supports'],
  [ids.claim.definition, ids.evidence.jiNoBefore, 'supports'],
  [ids.claim.definition, ids.evidence.maynez, 'supports'],
  [ids.claim.longContext, ids.evidence.liu, 'supports'],
  [ids.claim.intrinsic, ids.evidence.maynez, 'supports'],
  [ids.claim.entropy, ids.evidence.doeStale, 'supports'],
  [ids.claim.notAssessed, ids.evidence.asai, 'supports'],
  [ids.claim.accepted, ids.evidence.karpukhinP3, 'supports'],
  [ids.claim.rareEntities, ids.evidence.maynez, 'context'],
];

export function buildEvidence(now: Date): Schemas['EvidenceInContext'][] {
  return evidenceRows.map((row, index) => ({
    ...meta(now, row.rowId, 30 - index, agentActor('evidence_retrieval', 101)),
    referenceId: row.referenceId,
    chunkId: id('chunk', row.chunk),
    quote: row.quote,
    location: { ...(row.page ? { page: row.page } : {}), ...(row.paragraph ? { paragraph: row.paragraph } : {}) },
    status: row.status,
    ...(row.statusReason ? { statusReason: row.statusReason } : {}),
    ...(row.taskId ? { taskId: row.taskId } : {}),
    createdByAgentRunId: id('agentRun', 101),
    ...(row.before !== undefined ? { before: row.before } : {}),
    ...(row.after !== undefined ? { after: row.after } : {}),
  }));
}

export const THRESHOLDS: Schemas['VerificationThresholds'] = {
  claimSupport: { supported: 0.8, partiallySupported: 0.5 }, citationMismatch: { mismatch: 0.7 }, isDefault: true,
};

interface ClaimRow {
  rowId: string;
  statement: string;
  support: Schemas['SupportStatus'];
  approval: Schemas['ClaimApprovalStatus'];
  taskId?: string;
  artifactVersionId?: string;
  needsReview?: boolean;
  verifiedHoursAgo?: number;
}

const claimRows: ClaimRow[] = [
  { rowId: ids.claim.conflicting, statement: 'Truy xuất giới hạn trong nguồn đã duyệt làm tăng độ chính xác của câu trả lời.', support: 'Conflicting', approval: 'Draft', taskId: ids.task.t3, verifiedHoursAgo: 26 },
  { rowId: ids.claim.definition, statement: 'Hallucination là nội dung không trung thành với nguồn hoặc không có căn cứ.', support: 'Supported', approval: 'Accepted', taskId: ids.task.t2, artifactVersionId: ids.version.synthesisV2, verifiedHoursAgo: 20 },
  { rowId: ids.claim.longContext, statement: 'Ngữ cảnh dài làm mô hình bỏ sót thông tin ở giữa.', support: 'Supported', approval: 'Draft', verifiedHoursAgo: 19 },
  { rowId: ids.claim.intrinsic, statement: 'Intrinsic và extrinsic hallucination cần thước đo khác nhau.', support: 'Partially Supported', approval: 'Accepted', taskId: ids.task.t2, artifactVersionId: ids.version.synthesisV2, verifiedHoursAgo: 20 },
  { rowId: ids.claim.unsupported, statement: 'RAG giảm một nửa hallucination ở mọi miền.', support: 'Unsupported', approval: 'Draft', taskId: ids.task.t2, artifactVersionId: ids.version.synthesisV2, verifiedHoursAgo: 20 },
  { rowId: ids.claim.entropy, statement: 'Bộ phát hiện hallucination dựa trên entropy đạt độ chính xác cao.', support: 'Supported', approval: 'Draft', taskId: ids.task.t1, needsReview: true, verifiedHoursAgo: 40 },
  { rowId: ids.claim.notAssessed, statement: 'Self-RAG giảm số trích dẫn không có căn cứ so với RAG thông thường.', support: 'Not Assessed', approval: 'Draft', taskId: ids.task.t3 },
  { rowId: ids.claim.accepted, statement: 'Truy xuất dày đặc vượt BM25 trên các tập hỏi đáp mở.', support: 'Supported', approval: 'Accepted', taskId: ids.task.t3, verifiedHoursAgo: 48 },
  { rowId: ids.claim.rareEntities, statement: 'Hallucination thường gặp hơn ở câu hỏi về thực thể ít phổ biến.', support: 'Partially Supported', approval: 'Accepted', taskId: ids.task.t2, artifactVersionId: ids.version.synthesisV2, verifiedHoursAgo: 20 },
];

export function buildClaims(now: Date): Schemas['Claim'][] {
  return claimRows.map((row, index) => {
    const claimLinks = links.filter(([claim]) => claim === row.rowId).map(([, evidenceId, relation]) => ({ claimId: row.rowId, evidenceId, relation, createdBy: agentActor('synthesis', 103) }));
    return {
      ...meta(now, row.rowId, 28 - index, agentActor('synthesis', 103), 2),
      statement: row.statement,
      ...(row.taskId ? { taskId: row.taskId } : {}),
      ...(row.artifactVersionId ? { artifactVersionId: row.artifactVersionId } : {}),
      approvalStatus: row.approval,
      supportStatus: row.support,
      evidenceLinks: claimLinks,
      needsReview: row.needsReview ?? false,
      ...(row.needsReview ? { needsReviewReasons: [{ cause: 'evidence_stale', sourceType: 'evidence', sourceId: ids.evidence.doeStale, at: before(now, 30) }] } : {}),
      ...(row.verifiedHoursAgo !== undefined ? {
        lastVerification: {
          id: id('audit', 100 + index), targetType: 'claim' as const, targetId: row.rowId, agentRunId: id('agentRun', 104), outcome: row.support,
          thresholdsUsed: THRESHOLDS, at: before(now, row.verifiedHoursAgo),
        },
      } : {}),
      ...(row.approval === 'Accepted' ? {
        approval: { approvedBy: researcher, decidedAt: before(now, 10), decision: 'approved' as const, objectType: 'claim', objectId: row.rowId, objectVersion: 2, apr: 'APR-06' as const },
      } : {}),
    };
  });
}

const pipelineV1 = ['flowchart LR', '  Q[Câu hỏi] --> R[Retriever]', '  R --> C[(Trusted corpus)]', '  C --> G[Generator]'].join('\n');
const pipelineV2 = ['flowchart LR', '  Q[Câu hỏi] --> R[Retriever]', '  R --> C[(Trusted corpus)]', '  C --> G[Generator] --> V[Verification]'].join('\n');
/** Line 3 uses `->`, which stateDiagram-v2 rejects (designs/notes.html: lỗi cú pháp ở dòng 3). */
export const stateDiagramSource = ['stateDiagram-v2', '  [*] --> Draft', '  Draft -> Accepted : chấp nhận', '  Draft --> Rejected : từ chối'].join('\n');

/** Synthesis v2: the sentences of three T-2.1 claims, located by claimAnchors; one claim of the version has no anchor. */
export const synthesisV2Paragraphs = [
  'Bản tổng hợp này định nghĩa hallucination cho chương 2. Hallucination là nội dung không trung thành với nguồn hoặc không có căn cứ. Định nghĩa này bám theo các khảo sát đã chọn trong Trusted Library.',
  'Intrinsic và extrinsic hallucination cần thước đo khác nhau. Một số nghiên cứu cho rằng RAG giảm một nửa hallucination ở mọi miền. Nhận định đó cần được kiểm chứng thêm trước khi đưa vào bản thảo.',
];
export const synthesisV2Content = synthesisV2Paragraphs.join('\n\n');

/** [claimId, sentence] pairs anchored in synthesis v2 (ClaimAnchor: half-open [charStart, charEnd)). */
export function anchorOf(content: string, claimId: string, sentence: string): Schemas['ClaimAnchor'] {
  const charStart = content.indexOf(sentence);
  if (charStart < 0) throw new Error(`Sentence not in content: ${sentence}`);
  return { claimId, charStart, charEnd: charStart + sentence.length };
}

const provider = 'anthropic' as const;
const model = 'claude-sonnet-5-5';

export function buildArtifacts(now: Date): { artifacts: Schemas['Artifact'][]; versions: Schemas['ArtifactVersion'][] } {
  const version = (rowId: string, artifactId: string, versionNumber: number, status: Schemas['ArtifactVersionStatus'], hours: number,
    rest: Omit<Schemas['ArtifactVersion'], keyof Schemas['EntityMeta'] | 'artifactId' | 'versionNumber' | 'status' | 'contentHash'> & { by?: ActorRef }): Schemas['ArtifactVersion'] => {
    const { by, ...fields } = rest;
    return {
      ...meta(now, rowId, hours, by ?? fields.provenance.createdBy),
      artifactId, versionNumber, status, contentHash: `sha256:${rowId.slice(-6)}`, ...fields,
    };
  };
  const decided = (hours: number, objectId: string, apr: Schemas['AprCode']): Schemas['ApprovalRecord'] => ({
    approvedBy: researcher, decidedAt: before(now, hours), decision: 'approved', objectType: 'artifact_version', objectId, objectVersion: 1, apr,
  });

  const versions: Schemas['ArtifactVersion'][] = [
    version(ids.version.pipelineV1, ids.artifact.pipeline, 1, 'Rejected', 30, {
      format: 'mermaid', content: pipelineV1, diagramType: 'workflow', validation: { status: 'valid' },
      provenance: { createdBy: agentActor('diagram', 101), workflowId: id('workflow', 101), taskId: ids.task.t6, inputs: [{ type: 'research_context_version', id: ids.researchContext, version: 3 }], provider, model },
      review: { decision: 'rejected', by: researcher, at: before(now, 28), note: 'thiếu bước Verification' },
    }),
    version(ids.version.pipelineV2, ids.artifact.pipeline, 2, 'Draft', 3, {
      format: 'mermaid', content: pipelineV2, diagramType: 'workflow', validation: { status: 'valid' },
      provenance: {
        createdBy: agentActor('diagram', 102), workflowId: id('workflow', 102), taskId: ids.task.t6, provider, model,
        inputs: [
          { type: 'research_context_version', id: ids.researchContext, version: 4 },
          { type: 'artifact_version', id: ids.version.synthesisV1, version: 1, artifactId: ids.artifact.synthesis },
        ],
        sources: [{ referenceId: ids.reference.lewis, chunkId: id('chunk', 58) }],
      },
    }),
    version(ids.version.synthesisV1, ids.artifact.synthesis, 1, 'Accepted', 24 * 4, {
      format: 'markdown', content: 'Hallucination là nội dung không trung thành với nguồn. Bản đầu dùng một nguồn khảo sát.',
      provenance: { createdBy: agentActor('synthesis', 105), workflowId: id('workflow', 105), taskId: ids.task.t2, inputs: [{ type: 'evidence', id: ids.evidence.jiNoBefore, version: 1 }], provider, model },
      approval: decided(24 * 3, ids.version.synthesisV1, 'APR-06'),
    }),
    version(ids.version.synthesisV2, ids.artifact.synthesis, 2, 'Draft', 20, {
      format: 'markdown', content: synthesisV2Content,
      claimIds: [ids.claim.definition, ids.claim.intrinsic, ids.claim.unsupported, ids.claim.rareEntities],
      claimAnchors: [
        anchorOf(synthesisV2Content, ids.claim.definition, 'Hallucination là nội dung không trung thành với nguồn hoặc không có căn cứ.'),
        anchorOf(synthesisV2Content, ids.claim.intrinsic, 'Intrinsic và extrinsic hallucination cần thước đo khác nhau.'),
        anchorOf(synthesisV2Content, ids.claim.unsupported, 'RAG giảm một nửa hallucination ở mọi miền.'),
      ],
      provenance: {
        createdBy: agentActor('synthesis', 103), workflowId: id('workflow', 103), taskId: ids.task.t2, provider, model,
        inputs: [{ type: 'evidence', id: ids.evidence.jiNoBefore, version: 1 }, { type: 'evidence', id: ids.evidence.maynez, version: 1 }, { type: 'claim', id: ids.claim.definition, version: 2 }],
        sources: [{ referenceId: ids.reference.ji, chunkId: id('chunk', 12) }, { referenceId: ids.reference.maynez, chunkId: id('chunk', 6) }],
      },
    }),
    version(ids.version.tableV1, ids.artifact.table, 1, 'Superseded', 24 * 6, {
      format: 'csv', content: 'Phương pháp,Loại\nFActScore,Factual precision\n',
      provenance: { createdBy: agentActor('synthesis', 106), workflowId: id('workflow', 106), taskId: ids.task.t1, inputs: [], provider, model },
    }),
    version(ids.version.tableV2, ids.artifact.table, 2, 'Superseded', 24 * 5, {
      format: 'csv', content: 'Phương pháp,Loại\nFActScore,Factual precision\nSelfCheckGPT,Nhất quán mẫu\n',
      provenance: { createdBy: agentActor('synthesis', 107), workflowId: id('workflow', 107), taskId: ids.task.t1, inputs: [], provider, model },
    }),
    version(ids.version.tableV3, ids.artifact.table, 3, 'Accepted', 24 * 2, {
      format: 'csv', content: 'Phương pháp,Loại,Cần văn bản nguồn\nFActScore,Factual precision,Có\nSelfCheckGPT,Nhất quán mẫu,Không\n"Semantic entropy, có gom cụm",Bất định ngữ nghĩa,Không\n',
      provenance: { createdBy: agentActor('synthesis', 108), workflowId: id('workflow', 108), taskId: ids.task.t1, inputs: [{ type: 'reference', id: ids.reference.min, version: 1 }], provider, model },
      approval: decided(24, ids.version.tableV3, 'APR-03'),
    }),
    version(ids.version.noteV1, ids.artifact.note, 1, 'Draft', 8, {
      format: 'markdown', by: researcher,
      content: 'Ghi chú đọc 5 bài nền tảng\n\n1. Lewis et al. 2020 — RAG kết hợp truy xuất với sinh văn bản.\n2. Ji et al. 2023 — khảo sát hallucination.\n3. Maynez et al. 2020 — faithfulness trong tóm tắt.',
      provenance: { createdBy: researcher, taskId: ids.task.t4, inputs: [] },
    }),
    version(ids.version.reportV1, ids.artifact.report, 1, 'Superseded', 24 * 3, {
      format: 'markdown', content: 'Báo cáo kiểm chứng 6 claim: 3 Supported, 1 Partially Supported, 1 Unsupported, 1 Conflicting.',
      provenance: { createdBy: { type: 'system', component: 'research' }, taskId: ids.task.t2, inputs: [] },
    }),
    version(ids.version.reportV2, ids.artifact.report, 2, 'Accepted', 24 * 2, {
      format: 'markdown', content: 'Báo cáo kiểm chứng 8 claim: 4 Supported, 2 Partially Supported, 1 Unsupported, 1 Conflicting.',
      provenance: { createdBy: agentActor('verification', 104), workflowId: id('workflow', 104), taskId: ids.task.t2, inputs: [{ type: 'claim', id: ids.claim.conflicting, version: 2 }], provider: 'openai', model: 'gpt-5.1' },
      approval: decided(24, ids.version.reportV2, 'APR-03'),
    }),
    version(ids.version.stateV1, ids.artifact.stateDiagram, 1, 'Draft', 5, {
      format: 'mermaid', content: stateDiagramSource, diagramType: 'state',
      validation: { status: 'syntax_error', errors: [{ line: 3, message: 'Mũi tên “->” không hợp lệ; stateDiagram-v2 dùng “-->”.' }] },
      // No workflowId: the Agent Run code shows without a link (EC28).
      provenance: { createdBy: agentActor('diagram', 109), inputs: [{ type: 'research_context_version', id: ids.researchContext, version: 4 }], provider, model },
    }),
  ];

  const summary = (v: Schemas['ArtifactVersion']): Schemas['ArtifactVersionSummary'] => ({ id: v.id, versionNumber: v.versionNumber, status: v.status, createdAt: v.createdAt });
  const latest = (artifactId: string) => summary(versions.filter((v) => v.artifactId === artifactId).sort((a, b) => b.versionNumber - a.versionNumber)[0]!);
  const artifact = (rowId: string, type: Schemas['ArtifactType'], title: string, hours: number, taskId: string | undefined, accepted: string | null): Schemas['Artifact'] => ({
    ...meta(now, rowId, hours), type, title, ...(taskId ? { taskId } : {}), currentAcceptedVersionId: accepted, latestVersion: latest(rowId),
  });

  const artifacts = [
    artifact(ids.artifact.pipeline, 'diagram', 'Pipeline RAG trên Trusted Library', 30, ids.task.t6, null),
    artifact(ids.artifact.synthesis, 'synthesis', 'Định nghĩa hallucination', 24 * 4, ids.task.t2, ids.version.synthesisV1),
    artifact(ids.artifact.table, 'table', 'Danh sách phương pháp đo', 24 * 6, ids.task.t1, ids.version.tableV3),
    artifact(ids.artifact.note, 'note', 'Ghi chú đọc 5 bài nền tảng', 8, ids.task.t4, null),
    artifact(ids.artifact.report, 'verification_report', 'Báo cáo kiểm chứng claim', 24 * 3, ids.task.t2, ids.version.reportV2),
    artifact(ids.artifact.stateDiagram, 'diagram', 'Sơ đồ trạng thái claim', 5, undefined, null),
  ];
  return { artifacts, versions };
}

/** DIAG-TYPES-001: the five supported types, all Mermaid in the MVP. */
export const diagramTypes: Schemas['DiagramType'][] = [
  { id: 'sequence', label: 'Sequence', syntax: 'mermaid' },
  { id: 'component', label: 'Component', syntax: 'mermaid' },
  { id: 'activity', label: 'Activity', syntax: 'mermaid' },
  { id: 'state', label: 'State', syntax: 'mermaid' },
  { id: 'workflow', label: 'Workflow', syntax: 'mermaid' },
];
