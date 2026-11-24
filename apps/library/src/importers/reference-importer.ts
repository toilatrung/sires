// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Đọc nội dung BibTeX hoặc RIS thành kết quả từng mục (PID-00024 S04–S07; kiến trúc 8.7): ReferenceMetadata đã chuẩn
// hóa hoặc lỗi kèm lý do, để một mục hỏng không làm hỏng cả file (PID-00024-AC01). Dùng bởi API nhập reference
// (PID-00076) và nguồn khác; không tạo Reference, không kiểm trùng với Trusted Library, không giới hạn số mục (N1, N2).
// Chỉ biết giao diện ReferenceParser, không import thư viện parser (PC-04 A10 điều kiện 1).

import { type ReferenceMetadata, toReferenceMetadata } from './normalize';
import type { ParsedEntry, ParseErrorCode, ReferenceFormat, ReferenceParser } from './reference-parser';

/**
 * Lỗi của một mục: lỗi cú pháp của parser, `missing_fields` (thiếu tiêu đề hoặc tác giả — LIB-IMPORT-001, EC11, EC17),
 * `duplicate_key` (citation key trùng mục đã nhận trước trong cùng file — EC13).
 */
export type ReferenceImportErrorCode = ParseErrorCode | 'missing_fields' | 'duplicate_key';

/** Trường bắt buộc của metadata tối thiểu (LIB-IMPORT-001); thiếu năm không phải lỗi. */
export type RequiredField = 'title' | 'authors';

export interface ImportedReference {
  readonly ok: true;
  /** Vị trí của mục trong file (0, 1, …), tính cả mục lỗi; không tính `@string`, `@preamble`, `@comment`. */
  readonly index: number;
  readonly format: ReferenceFormat;
  readonly citationKey?: string;
  /** Mục không có năm: không lỗi, ghi rõ thiếu năm (LIB-IMPORT-001, EC12). */
  readonly yearMissing: boolean;
  /** Các trường đã tách (S04, S05). */
  readonly entry: ParsedEntry;
  /** Metadata chuẩn hóa 17.6 (S06, S07). */
  readonly metadata: ReferenceMetadata;
}

export interface RejectedReference {
  readonly ok: false;
  readonly index: number;
  readonly format: ReferenceFormat;
  readonly citationKey?: string;
  readonly code: ReferenceImportErrorCode;
  /** Lý do cho người dùng (tiếng Việt). */
  readonly message: string;
  /** Với `missing_fields`: trường thiếu. */
  readonly missing?: readonly RequiredField[];
  /** Văn bản của mục trong file. */
  readonly text: string;
}

export type ReferenceImportResult = ImportedReference | RejectedReference;

const FIELD_LABEL: Readonly<Record<RequiredField, string>> = { title: 'tiêu đề', authors: 'tác giả' };

export class ReferenceImporter {
  private readonly parsers: ReadonlyMap<ReferenceFormat, ReferenceParser>;

  /**
   * `parsers`: một bản hiện thực ReferenceParser cho mỗi định dạng (ImportersModule ghép bản Citation.js). `now`: nguồn
   * thời gian của `retrievedAt`, tiêm được để test cố định.
   */
  constructor(parsers: readonly ReferenceParser[], private readonly now: () => Date = () => new Date()) {
    this.parsers = new Map(parsers.map((parser) => [parser.format, parser]));
  }

  /**
   * Kết quả theo thứ tự mục trong file. Chuỗi rỗng hoặc không có mục → [] (EC16; thông báo cho người dùng thuộc API
   * nhập). Mọi mục đúng nhận cùng `retrievedAt` (thời điểm parse).
   */
  parse(input: string, format: ReferenceFormat): ReferenceImportResult[] {
    const parser = this.parsers.get(format);
    if (!parser) throw new Error(`Không có parser cho định dạng ${format}`);
    const retrievedAt = this.now().toISOString();
    const accepted = new Map<string, number>();
    return parser.parse(input).map((record, index): ReferenceImportResult => {
      if (!record.ok) {
        const { failure } = record;
        return {
          ok: false, index, format, code: failure.code, message: failure.message, text: failure.text,
          ...(failure.key === undefined ? {} : { citationKey: failure.key }),
        };
      }
      const { entry } = record;
      const citationKey = entry.key;
      const reject = (code: ReferenceImportErrorCode, message: string, missing?: RequiredField[]): RejectedReference => ({
        ok: false, index, format, code, message, text: entry.text,
        ...(citationKey === undefined ? {} : { citationKey }),
        ...(missing === undefined ? {} : { missing }),
      });
      // EC13: citation key (BibTeX) trùng mục đã nhận trước; mục sau thành lỗi, mục trước giữ nguyên.
      if (format === 'bibtex' && citationKey !== undefined) {
        const earlier = accepted.get(citationKey);
        if (earlier !== undefined) {
          return reject('duplicate_key', `Trùng citation key “${citationKey}” với mục thứ ${earlier + 1}; giữ mục trước`);
        }
      }
      const missing: RequiredField[] = [];
      if (entry.title === undefined) missing.push('title');
      if (entry.authors.length === 0) missing.push('authors');
      if (missing.length > 0) {
        return reject('missing_fields', `Mục thiếu ${missing.map((field) => FIELD_LABEL[field]).join(' và ')}`, missing);
      }
      if (format === 'bibtex' && citationKey !== undefined) accepted.set(citationKey, index);
      return {
        ok: true, index, format, yearMissing: entry.year === undefined, entry,
        metadata: toReferenceMetadata(entry, retrievedAt),
        ...(citationKey === undefined ? {} : { citationKey }),
      };
    });
  }
}
