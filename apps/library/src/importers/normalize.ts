// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Chuẩn hóa một mục đã tách (ParsedEntry) sang ReferenceMetadata (PRD 17.6) theo H1, H2 (PID-00024 S06, S07): không
// phụ thuộc thư viện parser. Kiểu lấy từ type sinh của hợp đồng (`components/schemas/library.yaml`), không định nghĩa
// lại; hợp đồng cho mục `source` = `bibtex`, `ris` thiếu `identifiers.sourceId`, `identifiers.url` (nới 18/11/2026).

import type { PublicApi } from '@sires/contracts';
import type { ParsedEntry, ParsedName } from './reference-parser';

export type ReferenceMetadata = PublicApi.components['schemas']['ReferenceMetadata'];
export type PublicationType = NonNullable<ReferenceMetadata['publicationType']>;

/** Bảng ánh xạ loại entry BibTeX → publicationType (H2; designs/notes.html). */
const BIBTEX_TYPES: Readonly<Record<string, PublicationType>> = {
  article: 'article',
  inproceedings: 'conference',
  conference: 'conference',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  thesis: 'thesis',
  book: 'book',
  incollection: 'chapter',
  inbook: 'chapter',
  techreport: 'report',
  report: 'report',
};

/** Bảng ánh xạ thẻ TY của RIS → publicationType (H2; designs/notes.html). */
const RIS_TYPES: Readonly<Record<string, PublicationType>> = {
  JOUR: 'article',
  EJOUR: 'article',
  CONF: 'conference',
  CPAPER: 'conference',
  THES: 'thesis',
  BOOK: 'book',
  EBOOK: 'book',
  CHAP: 'chapter',
  ECHAP: 'chapter',
  RPRT: 'report',
};

/**
 * Loại tài liệu (EC22): theo bảng; BibTeX không thuộc bảng mà có định danh arXiv (`eprint` với `archivePrefix = arXiv`)
 * → `preprint`; còn lại → `other`.
 */
export function publicationTypeOf(entry: Pick<ParsedEntry, 'format' | 'entryType' | 'arxivId'>): PublicationType {
  if (entry.format === 'ris') return RIS_TYPES[entry.entryType.trim().toUpperCase()] ?? 'other';
  return BIBTEX_TYPES[entry.entryType.trim().toLowerCase()] ?? (entry.arxivId ? 'preprint' : 'other');
}

const DOI_PREFIX = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i;

/**
 * DOI chữ thường, không tiền tố `https://doi.org/`, `http://dx.doi.org/`, `doi:` (EC20; DDL `library.sql` cột `doi`).
 * Giá trị không có dạng `10.<registrant>/<suffix>` sau khi bỏ tiền tố thì không phải DOI → undefined (bản gốc còn ở
 * `raw`).
 */
export function normalizeDoi(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const doi = value.trim().replace(DOI_PREFIX, '').trim().toLowerCase();
  return /^10\.\d{4,}(?:\.\d+)*\/\S+$/.test(doi) ? doi : undefined;
}

/** `https://doi.org/` + DOI (H1, EC24); mỗi đoạn giữa `/` được mã hóa để URL hợp lệ với DOI có `<`, `#`, `?`. */
export function doiUrl(doi: string): string {
  return `https://doi.org/${doi.split('/').map(encodeURIComponent).join('/')}`;
}

/** URL http(s) tuyệt đối (hợp đồng: `format: uri`); giá trị khác (thiếu scheme, đường dẫn tệp) → undefined. */
export function normalizeUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const url = value.trim();
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `authors[].name` = “Họ, Tên” (H2, EC23): họ gồm tiểu từ đứng trước (“van Beethoven”), tên gồm tiểu từ rơi, hậu tố
 * nối sau dấu phẩy; tên tập thể giữ nguyên. Chỉ có họ hoặc chỉ có tên thì ghi phần có.
 */
export function authorName(name: ParsedName): string {
  if (name.literal !== undefined) return name.literal;
  const family = [name.nonDroppingParticle, name.family].filter(Boolean).join(' ');
  const given = [name.given, name.droppingParticle].filter(Boolean).join(' ');
  const base = family && given ? `${family}, ${given}` : family || given;
  return name.suffix ? `${base}, ${name.suffix}` : base;
}

/**
 * ReferenceMetadata của một mục đủ metadata tối thiểu (tiêu đề, ít nhất một tác giả — ReferenceImporter kiểm trước).
 * Điền theo H1: `source` = định dạng; `identifiers.sourceId` = citation key / `ID`; `identifiers.url` = `url` / `UR`,
 * không có thì `https://doi.org/` + DOI; mục không có cả hai (hoặc RIS không có `ID`) thì thiếu trường tương ứng (S07);
 * `retrievedAt` = thời điểm parse; `raw` = bản gốc của mục.
 */
export function toReferenceMetadata(entry: ParsedEntry, retrievedAt: string): ReferenceMetadata {
  if (entry.title === undefined || entry.authors.length === 0) {
    throw new Error('toReferenceMetadata cần mục có tiêu đề và ít nhất một tác giả (LIB-IMPORT-001)');
  }
  const doi = normalizeDoi(entry.doi);
  const url = normalizeUrl(entry.url) ?? (doi === undefined ? undefined : doiUrl(doi));
  const identifiers: ReferenceMetadata['identifiers'] = {
    ...(doi === undefined ? {} : { doi }),
    ...(entry.arxivId === undefined ? {} : { arxivId: entry.arxivId }),
    ...(entry.isbn === undefined ? {} : { isbn: entry.isbn }),
    ...(entry.key === undefined ? {} : { sourceId: entry.key }),
    ...(url === undefined ? {} : { url }),
  };
  return {
    title: entry.title,
    authors: entry.authors.map((name) => ({ name: authorName(name) })),
    ...(entry.year === undefined ? {} : { year: entry.year }),
    ...(entry.venue === undefined ? {} : { venue: entry.venue }),
    publicationType: publicationTypeOf(entry),
    identifiers,
    ...(entry.abstract === undefined ? {} : { abstractOrSnippet: entry.abstract }),
    source: entry.format,
    retrievedAt,
    raw: {
      format: entry.format,
      entryType: entry.entryType,
      ...(entry.key === undefined ? {} : { key: entry.key }),
      fields: entry.fields,
      text: entry.text,
    },
  };
}
