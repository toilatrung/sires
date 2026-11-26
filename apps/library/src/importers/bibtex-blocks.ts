// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Tách văn bản BibTeX thành từng khối `@type{…}` trước khi đưa cho thư viện parser (PID-00024 S04; PC-04 A10 điều
// kiện 2 “validation riêng, xử lý theo từng bản ghi”): thư viện nhận cả file sẽ từ chối toàn bộ khi một entry hỏng,
// nên mỗi entry được đọc riêng. Không phụ thuộc thư viện parser nào.

export type BibtexBlockKind = 'entry' | 'string' | 'preamble' | 'comment';

export interface BibtexBlock {
  readonly kind: BibtexBlockKind;
  /** Loại sau `@`, chữ thường (`article`, `string`, …). */
  readonly type: string;
  /** Văn bản của khối, từ `@` tới ngoặc đóng (hoặc tới trước khối kế tiếp khi thiếu ngoặc đóng). */
  readonly text: string;
  /** Citation key khi đọc được (`@article{key,`). */
  readonly key?: string;
  /** false khi khối thiếu ngoặc đóng: gặp đầu dòng `@type{` của khối kế tiếp hoặc hết file trước khi đóng. */
  readonly terminated: boolean;
}

/** `@type{` hoặc `@type(` tại vị trí của `@`. */
const BLOCK_START = /@[ \t]*([A-Za-z][A-Za-z0-9_:-]*)[ \t\r\n]*([{(])/y;
/** Đầu dòng mở một khối mới — dấu hiệu khối đang đọc thiếu ngoặc đóng. */
const LINE_STARTS_BLOCK = /[ \t]*@[ \t]*[A-Za-z][A-Za-z0-9_:-]*[ \t]*[{(]/y;
const KEY = /^@[ \t]*[A-Za-z][A-Za-z0-9_:-]*[ \t\r\n]*[{(][ \t\r\n]*([^,\s{}()"=#]+)[ \t\r\n]*,/;

function kindOf(type: string): BibtexBlockKind {
  if (type === 'string' || type === 'preamble' || type === 'comment') return type;
  return 'entry';
}

/**
 * Các khối theo thứ tự trong file. Văn bản ngoài khối là chú thích theo quy ước BibTeX và bị bỏ qua. Ngoặc nhọn đếm
 * lồng nhau; ký tự sau `\` không tính (`\{`, `\}`). Khối mở bằng `(` đóng ở `)` ngoài mọi ngoặc nhọn.
 */
export function splitBibtex(input: string): BibtexBlock[] {
  const blocks: BibtexBlock[] = [];
  let index = 0;
  while (index < input.length) {
    const at = input.indexOf('@', index);
    if (at < 0) break;
    BLOCK_START.lastIndex = at;
    const start = BLOCK_START.exec(input);
    if (!start) {
      index = at + 1;
      continue;
    }
    const type = (start[1] as string).toLowerCase();
    const paren = start[2] === '(';
    let depth = 0;
    let end = -1;
    let cut = -1;
    let position = BLOCK_START.lastIndex;
    for (; position < input.length; position += 1) {
      const char = input[position];
      if (char === '\\') {
        position += 1;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        if (!paren && depth === 0) {
          end = position + 1;
          break;
        }
        depth = Math.max(0, depth - 1);
      } else if (char === ')' && paren && depth === 0) {
        end = position + 1;
        break;
      } else if (char === '\n' || char === '\r') {
        LINE_STARTS_BLOCK.lastIndex = position + 1;
        if (LINE_STARTS_BLOCK.test(input)) {
          cut = position + 1;
          break;
        }
      }
    }
    const terminated = end >= 0;
    const stop = terminated ? end : cut >= 0 ? cut : input.length;
    const text = input.slice(at, stop).replace(/\s+$/, '');
    const key = KEY.exec(text)?.[1];
    blocks.push({ kind: kindOf(type), type, text, ...(key === undefined ? {} : { key }), terminated });
    index = stop;
  }
  return blocks;
}

/**
 * Tách danh sách tên của trường `author`, `editor` theo ` and ` ngoài ngoặc nhọn, giữ nguyên từng tên (kể cả ngoặc).
 * Dùng để nhận tên tập thể `{World Health Organization}` và `and others` (H2).
 */
export function splitBibtexNames(value: string): string[] {
  const names: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i] as string;
    if (char === '\\') {
      current += char + (value[i + 1] ?? '');
      i += 1;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') depth = Math.max(0, depth - 1);
    if (depth === 0 && /\s/.test(char)) {
      const match = /^\s+and\s+/i.exec(value.slice(i));
      if (match) {
        names.push(current.trim());
        current = '';
        i += match[0].length - 1;
        continue;
      }
    }
    current += char;
  }
  if (current.trim() !== '') names.push(current.trim());
  return names;
}

/** Tên được bọc trọn trong một cặp ngoặc nhọn ngoài cùng: tên tập thể theo quy ước BibTeX. */
export function isBracedName(name: string): boolean {
  if (!name.startsWith('{') || !name.endsWith('}')) return false;
  let depth = 0;
  for (let i = 0; i < name.length; i += 1) {
    const char = name[i];
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0 && i < name.length - 1) return false;
    }
  }
  return depth === 0;
}
