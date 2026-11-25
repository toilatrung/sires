// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Giao diện parser của module importers (PID-00024 S04, S05; PC-04 A10 điều kiện 1). Mã nghiệp vụ (ReferenceImporter,
// normalize) chỉ dùng các kiểu ở đây, không import thư viện parser. Bản hiện thực hiện tại ở citation-js/ dùng
// Citation.js 0.9.0 — lựa chọn tạm thời theo PC-04 A10, chờ PO chốt SPK-03 (PID-00025, PR #38, PC-03); đổi thư viện
// thì viết bản hiện thực khác của ReferenceParser, giữ nguyên hợp đồng dưới đây.

export const REFERENCE_FORMATS = ['bibtex', 'ris'] as const;
export type ReferenceFormat = (typeof REFERENCE_FORMATS)[number];

/** Một tác giả đã tách: người (họ, tên, tiểu từ, hậu tố) hoặc tên tập thể (`literal`, giữ nguyên). */
export interface ParsedName {
  readonly family?: string;
  readonly given?: string;
  /** Tiểu từ đứng trước họ và thuộc họ khi sắp xếp: “van”, “de la”. */
  readonly nonDroppingParticle?: string;
  readonly droppingParticle?: string;
  readonly suffix?: string;
  readonly literal?: string;
}

/**
 * Một mục đọc được (S04: entry BibTeX; S05: bản ghi RIS từ `TY` tới `ER`). Văn bản đã chuyển sang Unicode thuần, gom
 * khoảng trắng; công thức toán giữ nguyên chuỗi trong file (H2). Các định danh giữ như trong file (chỉ bỏ khoảng trắng
 * hai đầu); chuẩn hóa DOI, URL, loại tài liệu, dạng tên làm ở normalize.ts (S06).
 */
export interface ParsedEntry {
  readonly format: ReferenceFormat;
  /** Citation key (BibTeX) hoặc thẻ `ID` (RIS); không có thì undefined. */
  readonly key?: string;
  /** Loại mục như trong file: `article` (BibTeX, chữ thường), `JOUR` (RIS, chữ hoa). */
  readonly entryType: string;
  readonly title?: string;
  /** Theo thứ tự trong file. */
  readonly authors: readonly ParsedName[];
  readonly year?: number;
  readonly venue?: string;
  readonly doi?: string;
  readonly url?: string;
  readonly isbn?: string;
  /** Trường `eprint` của BibTeX như trong file (mọi kho lưu trữ). */
  readonly eprint?: string;
  /** Định danh arXiv: `eprint` khi `archivePrefix` (hoặc `eprinttype`) là arXiv, bỏ tiền tố `arXiv:`. */
  readonly arxivId?: string;
  readonly abstract?: string;
  /** Mọi trường gốc: BibTeX tên trường chữ thường → giá trị (đã thay `@string`); RIS thẻ → giá trị, thẻ lặp → danh sách. */
  readonly fields: Readonly<Record<string, string | readonly string[]>>;
  /** Đoạn văn bản của mục trong file. */
  readonly text: string;
}

/**
 * Lỗi cú pháp của một mục: `syntax_error` (thư viện không đọc được, ví dụ thiếu dấu phẩy), `unterminated_entry`
 * (BibTeX thiếu ngoặc đóng), `missing_type` (RIS không mở bằng `TY`), `missing_end` (RIS thiếu `ER`).
 */
export type ParseErrorCode = 'syntax_error' | 'unterminated_entry' | 'missing_type' | 'missing_end';

export interface ParseFailure {
  readonly format: ReferenceFormat;
  /** Citation key hoặc `ID` khi đọc được từ văn bản của mục. */
  readonly key?: string;
  readonly code: ParseErrorCode;
  /** Lý do cho người dùng (tiếng Việt), kèm thông báo gốc của thư viện khi có. */
  readonly message: string;
  readonly text: string;
}

export type ParsedRecord =
  | { readonly ok: true; readonly entry: ParsedEntry }
  | { readonly ok: false; readonly failure: ParseFailure };

export interface ReferenceParser {
  readonly format: ReferenceFormat;
  /**
   * Tách mọi mục theo thứ tự trong file. Không ném lỗi vì một mục hỏng: mục hỏng thành `ok: false`, các mục khác vẫn
   * có kết quả (PID-00024-AC01). Chuỗi rỗng, chỉ có khoảng trắng hoặc không có mục nào → [] (EC16).
   */
  parse(input: string): ParsedRecord[];
}
