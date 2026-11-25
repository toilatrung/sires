// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Tách văn bản RIS thành từng bản ghi trước khi đưa cho thư viện parser (PID-00024 S05; PC-04 A10 điều kiện 2): thư
// viện nhận bản ghi thiếu `ER` như bản ghi đúng và bỏ qua dòng rác, nên ranh giới và lỗi cấu trúc do mã này kiểm.
// Không phụ thuộc thư viện parser nào.

export interface RisRecordBlock {
  /**
   * Văn bản của bản ghi: từ dòng mở (thường là `TY`) tới `ER`, hoặc tới trước `TY` kế tiếp / hết file. Là đoạn cắt
   * nguyên của chuỗi vào (giữ xuống dòng CRLF, LF hay CR như trong file), chỉ bỏ khoảng trắng ở cuối.
   */
  readonly text: string;
  /** Bản ghi mở bằng `TY`. */
  readonly hasType: boolean;
  /** Bản ghi kết thúc bằng `ER`. */
  readonly hasEnd: boolean;
  /** Giá trị thẻ `ID` đầu tiên khi có. */
  readonly id?: string;
}

/** Dòng thẻ RIS: hai ký tự (chữ hoa, chữ số), một hoặc hai khoảng trắng, `-`, giá trị. */
const TAG_LINE = /^([A-Z][A-Z0-9])[ \t]{1,2}-(?:[ \t]?(.*))?$/;

/** Bỏ dấu BOM (U+FEFF) đầu file nếu có. */
function withoutBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

/**
 * Các bản ghi theo thứ tự trong file. `TY` mở bản ghi mới (bản ghi đang mở mà chưa có `ER` thì thành bản ghi thiếu
 * `ER`); `ER` đóng bản ghi; thẻ khác khi không có bản ghi mở thì mở một bản ghi thiếu `TY`. Dòng không phải thẻ nằm
 * trong bản ghi là phần nối của giá trị trước; nằm ngoài bản ghi thì là rác và bị bỏ qua.
 */
export function splitRis(input: string): RisRecordBlock[] {
  const source = withoutBom(input);
  const records: RisRecordBlock[] = [];
  // Vị trí đầu dòng mở bản ghi đang đọc (undefined: không có bản ghi mở) và vị trí cuối dòng cuối của nó.
  let start: number | undefined;
  let end = 0;
  let hasType = false;
  let id: string | undefined;
  const close = (hasEnd: boolean) => {
    if (start === undefined) return;
    // Cắt theo vị trí (như splitBibtex), không ghép lại dòng: `text` và `raw.text` là bản gốc của bản ghi (H1).
    const text = source.slice(start, end).replace(/\s+$/, '');
    records.push({ text, hasType, hasEnd, ...(id === undefined ? {} : { id }) });
    start = undefined;
    hasType = false;
    id = undefined;
  };
  const newline = /\r\n|\r|\n/g;
  let position = 0;
  while (position < source.length) {
    newline.lastIndex = position;
    const found = newline.exec(source);
    const lineEnd = found ? found.index : source.length;
    const next = found ? found.index + found[0].length : source.length;
    const line = source.slice(position, lineEnd);
    const match = TAG_LINE.exec(line.replace(/\s+$/, ''));
    if (!match) {
      if (start !== undefined) end = lineEnd;
    } else {
      const tag = match[1] as string;
      if (tag === 'TY') {
        close(false);
        start = position;
        hasType = true;
      } else if (start === undefined) {
        start = position;
        hasType = false;
      }
      end = lineEnd;
      if (tag === 'ID' && id === undefined) {
        const value = (match[2] ?? '').trim();
        if (value !== '') id = value;
      }
      if (tag === 'ER') close(true);
    }
    position = next;
  }
  close(false);
  return records;
}
