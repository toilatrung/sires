// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Realistic Vietnamese and English values for schema-based mock data. Pools interleave both languages so any
// generated screen shows the two UI languages the product supports (UX-I18N). Values are invented; they name no
// real person's work.

export const people = [
  'Nguyễn Thị Minh Anh', 'Daniel Carter', 'Trần Quốc Bảo', 'Emily Zhang', 'Lê Hoàng Phúc', 'Sofia Rossi',
  'Phạm Ngọc Hân', 'Michael Brown', 'Võ Thanh Tùng', 'Aisha Rahman',
];

const projectNames = [
  'Ứng dụng RAG trong tổng quan tài liệu y sinh', 'Measuring learning outcomes in blended classrooms',
  'Đánh giá độ tin cậy của trích dẫn do LLM sinh ra', 'Evidence synthesis for urban heat mitigation',
  'Mô hình dự báo xâm nhập mặn vùng Đồng bằng sông Cửu Long', 'Explainable credit scoring for microfinance',
];

const paperTitles = [
  'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks: A Replication Study',
  'Đánh giá hiệu quả của mô hình học kết hợp trong giáo dục đại học Việt Nam',
  'Citation Hallucination in Large Language Models: Detection and Mitigation',
  'Ảnh hưởng của biến đổi khí hậu tới xâm nhập mặn ở Đồng bằng sông Cửu Long giai đoạn 2000–2024',
  'A Systematic Review of Evidence Grading Frameworks in Health Research',
  'Phương pháp tổng hợp bằng chứng có hệ thống cho nghiên cứu khoa học xã hội',
  'Urban Green Infrastructure and Surface Temperature: A Meta-Analysis',
  'Học máy giải thích được trong chấm điểm tín dụng vi mô',
];

const taskTitles = [
  'Tìm và sàng lọc tài liệu về RAG trong y sinh', 'Extract evidence on citation accuracy',
  'Tổng hợp phương pháp đánh giá kết quả học tập', 'Draft the related-work section',
  'Kiểm chứng trích dẫn trong chương 2', 'Build the comparison table of evaluation metrics',
  'Vẽ sơ đồ quy trình nghiên cứu', 'Review inclusion criteria with the supervisor',
];

const titles = [
  'Tổng quan tài liệu', 'Research synthesis draft', 'Bảng so sánh phương pháp', 'Evidence summary',
  'Khung lý thuyết', 'Methodology overview', 'Kế hoạch thu thập dữ liệu', 'Findings and limitations',
];

const notificationTitles = [
  'Tác vụ “Tìm và sàng lọc tài liệu” đã hoàn thành', 'Plan Version 3 is waiting for your approval',
  'Có 4 reference mới cần duyệt', 'Citation check found 2 mismatches',
  'Agent cần bạn trả lời một câu hỏi', 'Manuscript build succeeded',
];

const sentences = [
  'Làm thế nào để RAG cải thiện độ chính xác của tổng quan tài liệu y sinh?',
  'How can evidence-based feedback improve learning outcomes in blended classrooms?',
  'Agent đã tìm được 12 nguồn phù hợp; 4 nguồn cần Researcher xác nhận trước khi đưa vào thư viện.',
  'The synthesis compares five evaluation frameworks and highlights gaps in reproducibility.',
  'Kết quả cho thấy tỉ lệ trích dẫn sai giảm 38% khi kiểm chứng với văn bản gốc.',
  'Inclusion criteria: peer-reviewed studies published between 2015 and 2025, English or Vietnamese.',
  'Cần bổ sung bằng chứng định lượng cho luận điểm ở mục 2.3.',
  'Retrieval quality depends strongly on chunk size and the embedding model.',
];

const quotes = [
  'Retrieval-augmented models reduced unsupported claims by 38% compared with the baseline.',
  'Mô hình học kết hợp giúp tăng 12% điểm trung bình cuối kỳ so với nhóm đối chứng.',
  'Surface temperature dropped by 1.8 °C within 100 m of large urban parks.',
];

const domains = ['Khoa học máy tính', 'Education', 'Y sinh học', 'Environmental science', 'Kinh tế học', 'Public health'];
const affiliations = ['Trường Đại học Bách khoa Hà Nội', 'Troy University', 'Đại học Quốc gia TP. Hồ Chí Minh', 'University of Melbourne'];
const venues = ['Journal of Clinical Text Mining', 'Tạp chí Khoa học Dữ liệu', 'Blended Learning Quarterly', 'Health Evidence Review', 'Workshop on Trustworthy NLP'];
const keywords = ['retrieval-augmented generation', 'tổng quan hệ thống', 'citation verification', 'học kết hợp', 'meta-analysis', 'xâm nhập mặn'];
const files = ['main.tex', 'sections/introduction.tex', 'sections/related-work.tex', 'sections/methodology.tex', 'figures/workflow.svg', 'references.bib'];
const fileNames = ['nguyen2024rag.pdf', 'carter2023learning.pdf', 'tran2025citation.pdf', 'zhang2022heat.pdf'];
const models = ['gpt-4.1-mini', 'claude-sonnet-4-5', 'gemini-2.5-flash', 'text-embedding-3-small'];
const connections = ['OpenAI cá nhân', 'Anthropic — nhóm nghiên cứu', 'Google AI Studio'];
const generic = ['Ghi chú nghiên cứu', 'Research note', 'Bản nháp', 'Draft', 'Mục cần xem lại', 'Needs review'];

const slug = (value) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

const is = (name, ...words) => words.some((word) => name === word || name.endsWith(word.charAt(0).toUpperCase() + word.slice(1)));

/**
 * A realistic value for a string property, or undefined when nothing fits (the sampler then uses a generic phrase).
 * `pick(list)` chooses deterministically from a list.
 */
export function stringFor(property, schemaName, pick) {
  const name = property ?? '';
  const owner = schemaName ?? '';
  if (is(name, 'email')) return `${slug(pick(people))}@university.example`;
  if (is(name, 'displayName', 'author', 'researcher', 'supervisor') || (name === 'name' && /Author|Person|Profile/.test(owner))) return pick(people);
  if (name === 'name' && /Project/.test(owner)) return pick(projectNames);
  if (name === 'name' && /Connection/.test(owner)) return pick(connections);
  if (name === 'name' && /Phase/.test(owner)) return pick(['Tổng quan tài liệu', 'Data collection', 'Phân tích', 'Writing']);
  if (name === 'title' && /Reference|Metadata|Discover|Result|Candidate/.test(owner)) return pick(paperTitles);
  if (name === 'title' && /Task/.test(owner)) return pick(taskTitles);
  if (name === 'title' && /Notification|Pending|Prompt/.test(owner)) return pick(notificationTitles);
  if (is(name, 'title', 'heading', 'label', 'name')) return pick(titles);
  if (is(name, 'researchQuestion', 'question', 'objective', 'goal')) return pick(sentences.slice(0, 2));
  if (is(name, 'quote', 'excerpt', 'snippet')) return pick(quotes);
  if (is(name, 'summary', 'description', 'detail', 'content', 'text', 'body', 'message', 'rationale', 'reason', 'statement',
    'note', 'comment', 'answer', 'prompt', 'instructions', 'abstract', 'inputSummary', 'outputSummary', 'shortDescription')) return pick(sentences);
  if (is(name, 'domain', 'researchField', 'field', 'discipline')) return pick(domains);
  if (is(name, 'affiliation', 'institution', 'organization')) return pick(affiliations);
  if (is(name, 'venue', 'journal', 'publisher', 'container')) return pick(venues);
  if (is(name, 'keyword', 'tag', 'topic', 'query', 'searchQuery')) return pick(keywords);
  if (is(name, 'doi')) return `10.5555/sires.${pick(['2024.0142', '2023.0387', '2025.0019', '2022.0911'])}`;
  if (is(name, 'bibtexKey', 'citationKey', 'key')) return pick(['nguyen2024rag', 'carter2023learning', 'tran2025citation', 'zhang2022heat']);
  if (is(name, 'path', 'filePath')) return pick(files);
  if (is(name, 'fileName', 'filename')) return pick(fileNames);
  if (is(name, 'model', 'embeddingModel')) return pick(models);
  if (is(name, 'issuer')) return 'https://id.etroy.example';
  if (is(name, 'timezone')) return 'Asia/Ho_Chi_Minh';
  if (is(name, 'contentHash', 'hash', 'checksum', 'sha256')) return undefined;
  if (is(name, 'adapterVersion', 'version')) return pick(['v1', 'v2', '2026.11']);
  if (is(name, 'csrfToken', 'token')) return 'mock-csrf-token';
  if (is(name, 'correlationId', 'traceId', 'requestId')) return undefined;
  return undefined;
}

export const genericPhrases = generic;
export const sampleText = sentences;
