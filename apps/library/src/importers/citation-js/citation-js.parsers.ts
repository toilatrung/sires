// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Bản hiện thực ReferenceParser bằng Citation.js 0.9.0 (MIT; giấy phép ở apps/library/THIRD_PARTY_NOTICES.md). Lựa
// chọn tạm thời theo PC-04 A10, chờ PO chốt SPK-03 (PID-00025, PR #38, PC-03); kiến trúc 2.3 nêu
// `@retorquere/bibtex-parser` nhưng SPK-03 chưa thử. Đây là file duy nhất của library import Citation.js (PC-04 A10
// điều kiện 1). Theo báo cáo nháp #38 mục 3.4 (điều kiện 2): chỉ nạp hai plugin định dạng, không nạp plugin DOI/URL;
// mỗi lần đọc nêu rõ kiểu đầu vào (`@biblatex/text`, `@ris/file`, `@ris/record` — tương đương `forceType`) nên thư
// viện không tự đoán kiểu và không bao giờ tải URL; tách và kiểm cấu trúc từng mục trước (bibtex-blocks.ts,
// ris-records.ts); đổi CSL-JSON của thư viện sang ParsedEntry. BibTeX dùng mapping biblatex của Citation.js (mặc định
// của thư viện cho văn bản BibTeX, `parse.biblatex: true`): mapping `@bibtex` cổ điển bỏ mất `abstract`.

import * as citationCore from '@citation-js/core';
import { type CSL, type CSLName, plugins } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-ris';
import { isBracedName, splitBibtex, splitBibtexNames } from '../bibtex-blocks';
import type { ParsedEntry, ParsedName, ParsedRecord, ParseErrorCode, ReferenceFormat, ReferenceParser } from '../reference-parser';
import { splitRis } from '../ris-records';

/** Thẻ định dạng Citation.js chèn khi đổi lệnh LaTeX (`\textit`, `\textbf`, `\textsc`, chỉ số, ngoặc giữ chữ hoa). */
const MARKUP = /<\/?(?:i|b|sup|sub)>|<span (?:class="nocase"|style="font-variant:small-caps;")>|<\/span>/g;

/**
 * Công thức toán LaTeX: `$$…$$`, `$…$` (không tính `\$`), `\(…\)`, `\[…\]`. Citation.js đổi công thức sang ký tự
 * (`$E = mc^2$` → `E = mc²`) hoặc làm hỏng (`\frac{a}{b}` → `\fracab`); H2 yêu cầu giữ nguyên chuỗi.
 */
const MATH = /(?<!\\)\$\$[\s\S]+?(?<!\\)\$\$|(?<!\\)\$(?:\\[\s\S]|[^$\\])+\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/g;

/** Trường danh sách tên (không có công thức) và trường nguyên văn (Citation.js không đổi). */
const NAME_FIELDS = new Set(['author', 'editor', 'translator', 'bookauthor', 'editora', 'editorb', 'editorc', 'holder']);
const VERBATIM_FIELDS = new Set(['doi', 'url', 'eprint', 'file', 'pdf', 'isbn', 'issn']);

type ChainOptions = NonNullable<Parameters<typeof plugins.input.chain>[1]>;

/**
 * Citation.js ghi mọi thông điệp vào `logger._log` (kể cả khi im lặng) và không bao giờ xóa; service chạy lâu sẽ
 * phình bộ nhớ. Xóa sau mỗi lần đọc.
 */
function clearLibraryLog(): void {
  // `logger` có ở runtime nhưng index.d.ts chỉ khai là interface.
  const log = (citationCore as unknown as { logger?: { _log?: unknown[] } }).logger?._log;
  if (Array.isArray(log)) log.length = 0;
}

/**
 * Chuỗi đưa cho thư viện dùng LF: Citation.js không coi CR đơn (file Mac cũ) là xuống dòng. `text` của mục vẫn là bản
 * gốc trong file (CRLF, LF hay CR).
 */
function forLibrary(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Thông điệp lỗi của thư viện: dòng đầu, bỏ vị trí dòng/cột (tính trên đoạn đưa vào, không phải trên file). */
function libraryMessage(error: unknown): string {
  const first = (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
  return first.replace(/\s+at line \d+ col \d+:?\s*$/, '').trim();
}

/** Unicode thuần: bỏ thẻ định dạng, gom khoảng trắng (kể cả `~` → khoảng trắng không ngắt), NFC; rỗng → undefined. */
function clean(value: unknown, restore: (text: string) => string = (text) => text): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = restore(value.replace(MARKUP, '').replace(/\s+/g, ' ').normalize('NFC')).trim();
  return text === '' ? undefined : text;
}

function first(value: unknown): string | undefined {
  const item = Array.isArray(value) ? value.find((v) => String(v).trim() !== '') : value;
  if (item === undefined || item === null) return undefined;
  const text = String(item).trim();
  return text === '' ? undefined : text;
}

function toParsedName(name: CSLName, restore?: (text: string) => string, corporate = false): ParsedName | undefined {
  if (corporate || name.literal !== undefined) {
    const literal = clean(name.literal ?? [name.given, name.family].filter(Boolean).join(' '), restore);
    return literal === undefined ? undefined : { literal };
  }
  const parts = {
    family: clean(name.family, restore),
    given: clean(name.given, restore),
    nonDroppingParticle: clean(name['non-dropping-particle'], restore),
    droppingParticle: clean(name['dropping-particle'], restore),
    suffix: clean(name.suffix, restore),
  };
  const defined = Object.fromEntries(Object.entries(parts).filter(([, v]) => v !== undefined)) as ParsedName;
  return defined.family === undefined && defined.given === undefined ? undefined : defined;
}

/**
 * Citation.js 0.9.0 xếp từ đầu bắt đầu bằng nhóm ký tự đặc biệt (`{\L}ukasz Kaiser`, `{\'E}mile Durkheim`) vào tiểu từ
 * “von” thay vì tên. Theo BibTeX, phần “von” chỉ gồm các từ viết thường; các từ viết hoa đứng đầu tiểu từ được chuyển
 * về tên để `authors[].name` đúng “Họ, Tên” (H2).
 */
function withBibtexParticleFix(name: CSLName): CSLName {
  const particle = name['non-dropping-particle'];
  if (particle === undefined) return name;
  const words = particle.trim().split(/\s+/);
  const moved: string[] = [];
  while (words.length > 0 && /^\p{Lu}/u.test(words[0] as string)) moved.push(words.shift() as string);
  if (moved.length === 0) return name;
  const fixed: CSLName = { ...name, given: [name.given, ...moved].filter(Boolean).join(' ') };
  if (words.length > 0) fixed['non-dropping-particle'] = words.join(' ');
  else delete fixed['non-dropping-particle'];
  return fixed;
}

function yearOf(csl: CSL): number | undefined {
  const part = csl.issued?.['date-parts']?.[0]?.[0];
  const year = typeof part === 'number' ? part : Number(part);
  return Number.isInteger(year) && year > 0 ? year : undefined;
}

/** Mọi giá trị không rỗng của một thẻ RIS (thẻ lặp → nhiều giá trị). */
function values(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return list.map((v) => String(v).trim()).filter((v) => v !== '');
}

/** Năm của thẻ ngày RIS (`2012/08/17/`, `1999///`, `2015`): bốn chữ số đầu. */
function tagYear(value: unknown): number | undefined {
  const match = /^\s*(\d{4})/.exec(first(value) ?? '');
  const year = match ? Number(match[1]) : NaN;
  return Number.isInteger(year) && year > 0 ? year : undefined;
}

/** Tên RIS dạng “Họ, Tên, Hậu tố” (định dạng RIS); không có dấu phẩy thì là tên tập thể, giữ nguyên. */
function risName(value: string): ParsedName | undefined {
  const text = clean(value);
  if (text === undefined) return undefined;
  const [family, given, ...suffix] = text.split(',').map((part) => part.trim());
  if (given === undefined) return { literal: text };
  const name = { family, given, suffix: suffix.filter(Boolean).join(', ') };
  return Object.fromEntries(Object.entries(name).filter(([, v]) => v)) as ParsedName;
}

function stringFields(record: Record<string, unknown>): Record<string, string | string[]> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : String(value)]),
  );
}

function failure(format: ReferenceFormat, code: ParseErrorCode, message: string, text: string, key?: string): ParsedRecord {
  return { ok: false, failure: { format, code, message, text, ...(key === undefined ? {} : { key }) } };
}

/** Thay mỗi công thức bằng một mã giữ chỗ chỉ gồm chữ và số (Citation.js không đổi), trả hàm đặt lại công thức. */
function mathGuard(text: string): { protect: (value: string) => string; restore: (value: string) => string } {
  let prefix = 'SIRESMATH';
  while (text.includes(prefix)) prefix += 'X';
  const formulas: string[] = [];
  const pattern = new RegExp(`${prefix}(\\d+)Q`, 'g');
  return {
    protect: (value) =>
      value.replace(MATH, (formula) => {
        formulas.push(formula);
        return `${prefix}${formulas.length - 1}Q`;
      }),
    restore: (value) => value.replace(pattern, (token, n: string) => formulas[Number(n)] ?? token),
  };
}

/** BibTeX (S04): mỗi entry đọc riêng, kèm các `@string` đứng trước nó trong file (EC15). */
export class CitationJsBibtexParser implements ReferenceParser {
  readonly format = 'bibtex' as const;

  parse(input: string): ParsedRecord[] {
    try {
      return this.parseBlocks(input);
    } finally {
      clearLibraryLog();
    }
  }

  private parseBlocks(input: string): ParsedRecord[] {
    const results: ParsedRecord[] = [];
    const strings: string[] = [];
    for (const block of splitBibtex(input)) {
      if (block.kind === 'string') {
        // `@string` hỏng thì bỏ qua; entry dùng macro đó nhận giá trị rỗng như khi macro chưa định nghĩa.
        if (block.terminated && this.readable(block.text)) strings.push(block.text);
        continue;
      }
      if (block.kind !== 'entry') continue; // @preamble, @comment không thành mục (EC15)
      if (!block.terminated) {
        results.push(failure('bibtex', 'unterminated_entry',
          'Mục BibTeX thiếu ngoặc đóng: mục kết thúc ở khối kế tiếp hoặc cuối file', block.text, block.key));
        continue;
      }
      let entries: ReturnType<typeof plugins.input.data<'@biblatex/text', string>>;
      try {
        entries = plugins.input.data(forLibrary([...strings, block.text].join('\n')), '@biblatex/text');
      } catch (error) {
        results.push(failure('bibtex', 'syntax_error',
          `Mục BibTeX sai cú pháp (thiếu dấu phẩy, dấu bằng hoặc ngoặc): ${libraryMessage(error)}`, block.text, block.key));
        continue;
      }
      const entry = entries.length === 1 ? entries[0] : undefined;
      if (!entry) {
        results.push(failure('bibtex', 'syntax_error', 'Không đọc được mục BibTeX', block.text, block.key));
        continue;
      }
      try {
        results.push({ ok: true, entry: this.toEntry(entry, block.text) });
      } catch (error) {
        results.push(failure('bibtex', 'syntax_error', `Không đọc được mục BibTeX: ${libraryMessage(error)}`, block.text, block.key));
      }
    }
    return results;
  }

  private readable(text: string): boolean {
    try {
      plugins.input.data(forLibrary(text), '@biblatex/text');
      return true;
    } catch {
      return false;
    }
  }

  private toEntry(entry: { type: string; label: string; properties: Record<string, unknown> }, text: string): ParsedEntry {
    const properties = entry.properties;
    const math = mathGuard(text);
    const guarded: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(properties)) {
      guarded[field] = typeof value === 'string' && !NAME_FIELDS.has(field) && !VERBATIM_FIELDS.has(field)
        ? math.protect(value) : value;
    }
    const converted = plugins.input.data([{ ...entry, properties: guarded }] as never, '@biblatex/entries+list') as unknown as CSL[];
    const csl = converted[0];
    if (!csl) throw new Error('Citation.js không trả kết quả cho mục');

    // Tên tập thể `{…}` và `and others`: nhận từ chuỗi gốc, khớp theo vị trí với tên Citation.js tách (H2).
    const rawNames = typeof properties['author'] === 'string' ? splitBibtexNames(properties['author']) : [];
    const cslNames = csl.author ?? [];
    const aligned = rawNames.length === cslNames.length;
    const authors: ParsedName[] = [];
    cslNames.forEach((name, i) => {
      const raw = aligned ? rawNames[i] : undefined;
      const others = raw !== undefined ? /^others$/i.test(raw) : !name.given && /^others$/i.test(name.family ?? name.literal ?? '');
      if (others) return;
      const corporate = raw !== undefined && isBracedName(raw);
      const parsed = toParsedName(corporate ? name : withBibtexParticleFix(name), undefined, corporate);
      if (parsed) authors.push(parsed);
    });

    const archive = first(properties['archiveprefix']) ?? first(properties['eprinttype']);
    const eprint = first(properties['eprint']);
    const key = entry.label.trim();
    const parsed: ParsedEntry = {
      format: 'bibtex',
      entryType: entry.type.toLowerCase(),
      authors,
      fields: stringFields(properties),
      text,
      ...(key === '' ? {} : { key }),
    };
    return withDefined(parsed, {
      title: clean(csl.title, math.restore),
      year: yearOf(csl),
      venue: clean(csl['container-title'], math.restore),
      doi: first(properties['doi']),
      url: first(properties['url']),
      isbn: first(properties['isbn']),
      eprint,
      arxivId: archive?.toLowerCase() === 'arxiv' ? eprint?.replace(/^arxiv:/i, '') : undefined,
      abstract: clean(csl.abstract, math.restore),
    });
  }
}

/** RIS (S05): mỗi bản ghi từ `TY` tới `ER` đọc riêng. */
export class CitationJsRisParser implements ReferenceParser {
  readonly format = 'ris' as const;

  parse(input: string): ParsedRecord[] {
    try {
      return splitRis(input).map((block) => {
        if (!block.hasType) {
          return failure('ris', 'missing_type',
            block.hasEnd ? 'Bản ghi RIS không mở bằng thẻ TY' : 'Bản ghi RIS không mở bằng thẻ TY và thiếu thẻ ER', block.text, block.id);
        }
        if (!block.hasEnd) return failure('ris', 'missing_end', 'Bản ghi RIS thiếu thẻ ER', block.text, block.id);
        try {
          const records = plugins.input.data(forLibrary(block.text), '@ris/file');
          const record = records.length === 1 ? (records[0] as unknown as Record<string, unknown>) : undefined;
          if (!record) return failure('ris', 'syntax_error', 'Không đọc được bản ghi RIS', block.text, block.id);
          const options = { forceType: '@ris/record', generateGraph: false } as ChainOptions;
          const csl = plugins.input.chain(record, options)[0];
          if (!csl) return failure('ris', 'syntax_error', 'Không đọc được bản ghi RIS', block.text, block.id);
          return { ok: true, entry: this.toEntry(record, csl, block.text) };
        } catch (error) {
          return failure('ris', 'syntax_error', `Không đọc được bản ghi RIS: ${libraryMessage(error)}`, block.text, block.id);
        }
      });
    } finally {
      clearLibraryLog();
    }
  }

  /**
   * Trường lấy từ thẻ theo thứ tự của S05 (TI/T1, AU/A1, PY/Y1, JO/T2/JF, DO, UR, AB, ID): Citation.js đoán bản ghi
   * “kiểu cũ/mới” theo thẻ và bỏ thẻ của kiểu kia (bản ghi JOUR có TI, AU mà năm ở Y1 thì mất năm; có cả AU và A1 thì
   * bỏ A1). CSL của thư viện chỉ dùng khi thiếu thẻ và cho ISBN (thư viện đổi SN thành ISBN hay ISSN theo loại TY).
   */
  private toEntry(record: Record<string, unknown>, csl: CSL, text: string): ParsedEntry {
    const key = first(record['ID']);
    const authorTags = values(record['AU']).length > 0 ? values(record['AU']) : values(record['A1']);
    const authors = authorTags.length > 0
      ? authorTags.map(risName)
      : (csl.author ?? []).map((name) => toParsedName(name));
    const parsed: ParsedEntry = {
      format: 'ris',
      entryType: first(record['TY']) ?? '',
      // Theo thứ tự xuất hiện của thẻ (EC18).
      authors: authors.filter((n): n is ParsedName => n !== undefined),
      fields: stringFields(record),
      text,
      ...(key === undefined ? {} : { key }),
    };
    return withDefined(parsed, {
      title: clean(first(record['TI']) ?? first(record['T1'])) ?? clean(csl.title),
      year: tagYear(record['PY']) ?? tagYear(record['Y1']) ?? yearOf(csl),
      venue: clean(first(record['JO']) ?? first(record['T2']) ?? first(record['JF'])),
      doi: first(record['DO']),
      url: first(record['UR']),
      isbn: typeof csl.ISBN === 'string' ? first(csl.ISBN) : undefined,
      abstract: clean(first(record['AB'])) ?? clean(csl.abstract),
    });
  }
}

function withDefined(entry: ParsedEntry, optional: Partial<Record<keyof ParsedEntry, unknown>>): ParsedEntry {
  return { ...entry, ...Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== undefined)) } as ParsedEntry;
}

/** Hai parser của library trên Citation.js; nơi ghép (ImportersModule, test) gọi hàm này. */
export function citationJsParsers(): ReferenceParser[] {
  return [new CitationJsBibtexParser(), new CitationJsRisParser()];
}
