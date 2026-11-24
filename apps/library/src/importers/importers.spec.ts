// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00024-AC01 (S04–S07) và EC11–EC24: parser BibTeX, RIS trả kết quả từng mục — ReferenceMetadata (17.6) chuẩn hóa
// theo H1, H2 hoặc lỗi kèm lý do — trên fixture đa ngành ở __fixtures__/ và chuỗi viết trong test. Không cần mạng,
// không cần database. Hợp lệ theo hợp đồng kiểm bằng type sinh của @sires/contracts (lúc biên dịch) và
// contractViolations() dưới đây (lúc chạy), chép quy tắc của `ReferenceMetadata` trong
// docs/api-design/components/schemas/library.yaml; test không đọc docs/ ngoài DDL (spec mục 7).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Test } from '@nestjs/testing';
import type { PublicApi } from '@sires/contracts';
import { describe, expect, it } from 'vitest';
import { citationJsParsers } from './citation-js/citation-js.parsers';
import {
  authorName,
  doiUrl,
  type ImportedReference,
  ImportersModule,
  normalizeDoi,
  publicationTypeOf,
  ReferenceImporter,
  type ReferenceImportResult,
  type RejectedReference,
} from './index';

const NOW = new Date('2026-11-25T03:00:00.000Z');
const importer = new ReferenceImporter(citationJsParsers(), () => NOW);
const FIXTURES = join(__dirname, '__fixtures__');
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

const parseBib = (input: string) => importer.parse(input, 'bibtex');
const parseRis = (input: string) => importer.parse(input, 'ris');
const accepted = (results: ReferenceImportResult[]) => results.filter((r): r is ImportedReference => r.ok);
const rejected = (results: ReferenceImportResult[]) => results.filter((r): r is RejectedReference => !r.ok);
const only = (results: ReferenceImportResult[]): ImportedReference => {
  expect(results).toHaveLength(1);
  const [result] = results;
  if (!result?.ok) throw new Error(`mong đợi một mục đúng, nhận ${JSON.stringify(result)}`);
  return result;
};
/** Tóm tắt một kết quả để so cả danh sách theo thứ tự. */
const outline = (r: ReferenceImportResult) =>
  r.ok ? `${r.index} ok ${r.citationKey ?? '-'} ${r.metadata.publicationType}` : `${r.index} ${r.code} ${r.citationKey ?? '-'}`;

type ReferenceMetadata = PublicApi.components['schemas']['ReferenceMetadata'];
const PUBLICATION_TYPES = ['article', 'conference', 'thesis', 'book', 'chapter', 'preprint', 'report', 'other'];
const TOP_LEVEL = new Set([
  'title', 'authors', 'year', 'venue', 'publicationType', 'identifiers', 'abstractOrSnippet', 'citationCount',
  'citationCountAt', 'source', 'retrievedAt', 'raw',
]);
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Chỗ lệch với schema `ReferenceMetadata` của hợp đồng (rỗng khi hợp lệ). */
function contractViolations(value: unknown): string[] {
  const problems: string[] = [];
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const isUri = (v: unknown) => {
    if (typeof v !== 'string' || !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(v)) return false;
    try {
      return Boolean(new URL(v));
    } catch {
      return false;
    }
  };
  if (!isObject(value)) return ['không phải object'];
  for (const key of Object.keys(value)) if (!TOP_LEVEL.has(key)) problems.push(`trường lạ ${key}`);
  for (const key of ['title', 'authors', 'identifiers', 'source', 'retrievedAt']) if (!(key in value)) problems.push(`thiếu ${key}`);
  if (typeof value['title'] !== 'string' || value['title'].length < 1) problems.push('title phải là chuỗi không rỗng');
  if (!Array.isArray(value['authors'])) problems.push('authors phải là danh sách');
  for (const author of Array.isArray(value['authors']) ? value['authors'] : []) {
    if (!isObject(author) || typeof author['name'] !== 'string') problems.push('authors[] cần name');
    else for (const key of Object.keys(author)) if (!['name', 'affiliation', 'sourceAuthorId'].includes(key)) problems.push(`authors[].${key}`);
  }
  if ('year' in value && !Number.isInteger(value['year'])) problems.push('year phải là số nguyên');
  if ('venue' in value && typeof value['venue'] !== 'string') problems.push('venue phải là chuỗi');
  if ('publicationType' in value && !PUBLICATION_TYPES.includes(value['publicationType'] as string)) problems.push('publicationType ngoài enum');
  if ('abstractOrSnippet' in value && typeof value['abstractOrSnippet'] !== 'string') problems.push('abstractOrSnippet phải là chuỗi');
  if (typeof value['source'] !== 'string') problems.push('source phải là chuỗi');
  if (typeof value['retrievedAt'] !== 'string' || !DATE_TIME.test(value['retrievedAt'])) problems.push('retrievedAt phải là date-time');
  if ('raw' in value && !isObject(value['raw'])) problems.push('raw phải là object');
  const identifiers = value['identifiers'];
  if (!isObject(identifiers)) {
    problems.push('identifiers phải là object');
  } else {
    for (const key of ['doi', 'arxivId', 'isbn', 'sourceId', 'url']) {
      if (key in identifiers && typeof identifiers[key] !== 'string') problems.push(`identifiers.${key} phải là chuỗi`);
    }
    if ('url' in identifiers && !isUri(identifiers['url'])) problems.push('identifiers.url phải là URI');
    // if/then/else của hợp đồng: chỉ `bibtex`, `ris` được thiếu sourceId, url.
    if (!['bibtex', 'ris'].includes(value['source'] as string)) {
      if (!('sourceId' in identifiers)) problems.push('thiếu identifiers.sourceId');
      if (!('url' in identifiers)) problems.push('thiếu identifiers.url');
    }
  }
  return problems;
}

describe('importers — PID-00024-AC01', () => {
  it('BibTeX mẫu đa ngành', () => {
    const input = fixture('multidisciplinary.bib');
    const results = parseBib(input);
    // 13 mục theo thứ tự trong file (@string, @preamble, @comment không thành mục): 10 đúng, 3 lỗi riêng.
    expect(results.map(outline)).toEqual([
      '0 ok jinek2012 article', '1 ok vaswani2017 conference', '2 ok akerlof1970 article', '3 syntax_error broken2021',
      '4 ok godel1931 article', '5 ok who2020 report', '6 missing_fields notitle2018', '7 ok tran2019 thesis',
      '8 ok bourdieu1984 book', '9 ok brown2020 preprint', '10 ok le2024 other', '11 duplicate_key jinek2012',
      '12 ok pham_noyear article',
    ]);
    const byKey = new Map(accepted(results).map((r) => [r.citationKey, r]));
    // Tiêu đề, tác giả theo thứ tự, năm, venue, DOI, URL, loại entry đúng như trong file.
    expect(byKey.get('jinek2012')?.metadata).toMatchObject({
      title: 'A Programmable Dual-RNA–Guided DNA Endonuclease in Adaptive Bacterial Immunity',
      authors: ['Jinek, Martin', 'Chylinski, Krzysztof', 'Fonfara, Ines', 'Hauer, Michael', 'Doudna, Jennifer A.',
        'Charpentier, Emmanuelle'].map((name) => ({ name })),
      year: 2012, venue: 'Science', publicationType: 'article',
      identifiers: { doi: '10.1126/science.1225829', sourceId: 'jinek2012', url: 'https://doi.org/10.1126/science.1225829' },
    });
    expect(byKey.get('vaswani2017')?.metadata).toMatchObject({
      title: 'Attention Is All You Need',
      authors: ['Vaswani, Ashish', 'Shazeer, Noam', 'Parmar, Niki', 'Uszkoreit, Jakob', 'Jones, Llion', 'Gomez, Aidan N.',
        'Kaiser, Łukasz', 'Polosukhin, Illia'].map((name) => ({ name })),
      year: 2017, venue: 'Advances in Neural Information Processing Systems', publicationType: 'conference',
      identifiers: { arxivId: '1706.03762', sourceId: 'vaswani2017', url: 'https://arxiv.org/abs/1706.03762' },
    });
    expect(byKey.get('akerlof1970')?.metadata).toMatchObject({
      title: 'The Market for “Lemons”: Quality Uncertainty and the Market Mechanism', authors: [{ name: 'Akerlof, George A.' }],
      year: 1970, venue: 'The Quarterly Journal of Economics',
      identifiers: { doi: '10.2307/1879431', url: 'https://doi.org/10.2307/1879431' },
    });
    expect(byKey.get('godel1931')?.metadata).toMatchObject({
      title: 'Über formal unentscheidbare Sätze der Principia Mathematica und verwandter Systeme I',
      authors: [{ name: 'Gödel, Kurt' }], year: 1931, venue: 'Monatshefte für Mathematik und Physik',
      identifiers: { doi: '10.1007/bf01700692' },
    });
    expect(byKey.get('who2020')?.metadata).toMatchObject({
      authors: [{ name: 'World Health Organization' }], publicationType: 'report',
      identifiers: { sourceId: 'who2020', url: 'https://www.who.int/publications' },
    });
    expect(byKey.get('tran2019')?.metadata).toMatchObject({
      title: 'Đô thị hóa và sinh kế hộ gia đình ven đô Hà Nội', authors: [{ name: 'Trần, Thị Bình' }], year: 2019,
      publicationType: 'thesis',
    });
    expect(byKey.get('bourdieu1984')?.metadata).toMatchObject({ publicationType: 'book', identifiers: { isbn: '0-674-21277-0' } });
    expect(byKey.get('brown2020')?.metadata.authors).toEqual(['Brown, Tom B.', 'Mann, Benjamin', 'Ryder, Nick'].map((name) => ({ name })));
    // Lỗi riêng kèm lý do; mục thiếu năm không lỗi, ghi rõ thiếu năm; mục trùng key sau không ghi đè mục trước.
    const errors = new Map(rejected(results).map((r) => [r.index, r]));
    expect(errors.get(3)).toMatchObject({ code: 'syntax_error', citationKey: 'broken2021' });
    expect(errors.get(3)?.message).toMatch(/^Mục BibTeX sai cú pháp/);
    expect(errors.get(6)).toMatchObject({ code: 'missing_fields', missing: ['title'], message: 'Mục thiếu tiêu đề' });
    expect(errors.get(11)).toMatchObject({ code: 'duplicate_key', citationKey: 'jinek2012' });
    expect(byKey.get('jinek2012')?.index).toBe(0);
    expect(byKey.get('pham_noyear')).toMatchObject({ yearMissing: true });
    expect(byKey.get('pham_noyear')?.metadata).not.toHaveProperty('year');
    expect(accepted(results).filter((r) => r.yearMissing).map((r) => r.citationKey)).toEqual(['pham_noyear']);

    // Số mục đúng không đổi khi bỏ các mục hỏng khỏi file: cùng metadata, cùng thứ tự.
    const cleaned = rejected(results).reduce((text, r) => text.replace(r.text, ''), input);
    const again = parseBib(cleaned);
    expect(rejected(again)).toEqual([]);
    expect(accepted(again).map((r) => r.metadata)).toEqual(accepted(results).map((r) => r.metadata));
  });

  it('RIS mẫu đa ngành', () => {
    const input = fixture('multidisciplinary.ris');
    const results = parseRis(input);
    // 10 bản ghi: 8 đúng, 1 thiếu ER, 1 thiếu tác giả.
    expect(results.map(outline)).toEqual([
      '0 ok jinek2012 article', '1 ok vaswani2017 conference', '2 ok akerlof1970 article', '3 missing_end broken-missing-er',
      '4 ok bourdieu1984 book', '5 ok - thesis', '6 ok who2020 report', '7 missing_fields no-author2018',
      '8 ok pham-noyear chapter', '9 ok le2024 other',
    ]);
    const ok = accepted(results);
    expect(ok[0]?.metadata).toMatchObject({
      title: 'A programmable dual-RNA-guided DNA endonuclease in adaptive bacterial immunity',
      authors: ['Jinek, Martin', 'Chylinski, Krzysztof', 'Fonfara, Ines', 'Hauer, Michael', 'Doudna, Jennifer A.',
        'Charpentier, Emmanuelle'].map((name) => ({ name })),
      year: 2012, venue: 'Science', publicationType: 'article',
      identifiers: { doi: '10.1126/science.1225829', sourceId: 'jinek2012', url: 'https://www.science.org/doi/10.1126/science.1225829' },
    });
    expect(ok[1]?.metadata).toMatchObject({ venue: 'Advances in Neural Information Processing Systems', year: 2017 });
    expect(ok[2]?.metadata).toMatchObject({
      venue: 'The Quarterly Journal of Economics',
      identifiers: { doi: '10.2307/1879431', sourceId: 'akerlof1970', url: 'https://doi.org/10.2307/1879431' },
    });
    expect(ok[3]?.metadata).toMatchObject({ publicationType: 'book', identifiers: { isbn: '0-674-21277-0', sourceId: 'bourdieu1984' } });
    expect(ok[4]?.metadata).toMatchObject({ title: 'Đô thị hóa và sinh kế hộ gia đình ven đô Hà Nội', authors: [{ name: 'Trần, Thị Bình' }] });
    expect(ok[5]?.metadata.authors).toEqual([{ name: 'World Health Organization' }]);
    expect(ok[6]).toMatchObject({ yearMissing: true, metadata: { venue: 'Kinh tế nông thôn Việt Nam' } });
    expect(ok[7]?.metadata).toMatchObject({ title: 'Ghi chép thực địa về chợ nổi Cái Răng', authors: [{ name: 'Lê, Văn Cường' }], year: 2024 });
    expect(rejected(results).map((r) => [r.code, r.message])).toEqual([
      ['missing_end', 'Bản ghi RIS thiếu thẻ ER'],
      ['missing_fields', 'Mục thiếu tác giả'],
    ]);

    const cleaned = rejected(results).reduce((text, r) => text.replace(r.text, ''), input);
    const again = parseRis(cleaned);
    expect(rejected(again)).toEqual([]);
    expect(accepted(again).map((r) => r.metadata)).toEqual(ok.map((r) => r.metadata));
  });

  it('kết quả là ReferenceMetadata hợp lệ', () => {
    // S06: mục có URL hoặc DOI và có mã định danh — điền đủ theo H1.
    const all = [...parseBib(fixture('multidisciplinary.bib')), ...parseRis(fixture('multidisciplinary.ris'))];
    const complete = accepted(all).filter((r) => r.citationKey !== undefined && (r.entry.url !== undefined || r.entry.doi !== undefined));
    expect(complete.length).toBeGreaterThanOrEqual(12);
    for (const result of complete) {
      const metadata: ReferenceMetadata = result.metadata;
      expect(contractViolations(metadata), result.citationKey).toEqual([]);
      expect(metadata.source).toBe(result.format);
      expect(metadata.retrievedAt).toBe(NOW.toISOString());
      expect(metadata.identifiers.sourceId).toBe(result.citationKey);
      expect(metadata.identifiers.url).toMatch(/^https:\/\//);
      expect(metadata.raw).toMatchObject({ format: result.format, text: result.entry.text, fields: result.entry.fields });
    }
  });

  it('mọi mục đúng là ReferenceMetadata hợp lệ', () => {
    // S07: kể cả mục không có URL và DOI, hoặc RIS không có ID — hợp đồng đã nới `identifiers` cho bibtex, ris.
    const all = [...parseBib(fixture('multidisciplinary.bib')), ...parseRis(fixture('multidisciplinary.ris'))];
    const ok = accepted(all);
    expect(ok).toHaveLength(18);
    for (const result of ok) expect(contractViolations(result.metadata), `${result.format} ${result.index}`).toEqual([]);
    expect(ok.filter((r) => r.metadata.identifiers.url === undefined).map((r) => `${r.format} ${r.citationKey}`)).toEqual([
      'bibtex tran2019', 'bibtex bourdieu1984', 'bibtex le2024', 'ris bourdieu1984', 'ris le2024',
    ]);
    expect(ok.filter((r) => r.metadata.identifiers.sourceId === undefined).map((r) => `${r.format} ${r.index}`)).toEqual(['ris 5']);
    // Hợp đồng cũ (bắt buộc sourceId, url) không áp cho bibtex, ris; nguồn khác vẫn bắt buộc.
    expect(contractViolations({ ...ok[0]?.metadata, source: 'openalex', identifiers: {} })).toEqual([
      'thiếu identifiers.sourceId', 'thiếu identifiers.url',
    ]);
  });
});

describe('importers — edge case', () => {
  it('BibTeX thiếu trường bắt buộc', () => {
    // EC11: thiếu tiêu đề hoặc không có tác giả → mục đó lỗi kèm trường thiếu; mục khác vẫn có kết quả.
    const results = parseBib(String.raw`
@article{a, author = {Doe, Jane}, year = 2020}
@book{b, title = {Chỉ có biên tập}, editor = {Ed, Itor}, year = 2020}
@article{c, year = 2020}
@article{d, title = {}, author = {Doe, Jane}}
@article{ok, title = {Đủ}, author = {Doe, Jane}, year = 2020}`);
    expect(results.map((r) => (r.ok ? 'ok' : [r.citationKey, r.code, r.missing, r.message]))).toEqual([
      ['a', 'missing_fields', ['title'], 'Mục thiếu tiêu đề'],
      ['b', 'missing_fields', ['authors'], 'Mục thiếu tác giả'],
      ['c', 'missing_fields', ['title', 'authors'], 'Mục thiếu tiêu đề và tác giả'],
      ['d', 'missing_fields', ['title'], 'Mục thiếu tiêu đề'],
      'ok',
    ]);
  });

  it('thiếu năm', () => {
    // EC12: không lỗi; kết quả ghi rõ thiếu năm, metadata không có `year`.
    for (const result of [
      only(parseBib('@article{a, title = {Không năm}, author = {Doe, Jane}}')),
      only(parseBib('@article{b, title = {Năm không đọc được}, author = {Doe, Jane}, year = {n.d.}}')),
      only(parseRis('TY  - JOUR\nTI  - Không năm\nAU  - Doe, Jane\nER  - \n')),
    ]) {
      expect(result.yearMissing).toBe(true);
      expect(result.metadata).not.toHaveProperty('year');
      expect(contractViolations(result.metadata)).toEqual([]);
    }
    expect(only(parseRis('TY  - JOUR\nTI  - Có năm\nAU  - Doe, Jane\nY1  - 1999///\nER  - \n'))).toMatchObject({
      yearMissing: false, metadata: { year: 1999 },
    });
  });

  it('trùng citation key', () => {
    // EC13: mục sau báo trùng kèm key; không ghi đè mục trước.
    const results = parseBib(String.raw`
@article{k, title = {Mục đầu}, author = {A, B}, year = 2001}
@article{k, title = {Mục sau}, author = {C, D}, year = 2002}
@article{other, title = {Khác}, author = {E, F}, year = 2003}
@article{k, title = {Mục thứ ba}, author = {G, H}, year = 2004}`);
    expect(results.map(outline)).toEqual(['0 ok k article', '1 duplicate_key k', '2 ok other article', '3 duplicate_key k']);
    expect(accepted(results)[0]?.metadata.title).toBe('Mục đầu');
    expect(rejected(results)[0]?.message).toBe('Trùng citation key “k” với mục thứ 1; giữ mục trước');
    // Mục đầu lỗi thì không giữ chỗ cho key: mục sau cùng key được nhận (không có gì bị ghi đè).
    const afterBroken = parseBib(String.raw`
@article{k, author = {A, B}}
@article{k, title = {Đúng}, author = {C, D}}`);
    expect(afterBroken.map(outline)).toEqual(['0 missing_fields k', '1 ok k article']);
  });

  it('BibTeX một mục hỏng', () => {
    // EC14: thiếu dấu phẩy, thiếu dấu bằng, thiếu ngoặc đóng ở giữa và cuối file → lỗi riêng; mục khác vẫn có kết quả.
    const results = parseBib(String.raw`
@article{first, title = {Một}, author = {A, B}, year = 2001}
@article{nocomma, title = {Hai} author = {A, B}}
@article{noequals, title {Ba}, author = {A, B}}
@article{unclosed, title = {Bốn, author = {A, B},
@article{middle, title = {Năm}, author = {A, B}, year = 2005}
@article{last, title = {Sáu}, author = {A, B}`);
    expect(results.map(outline)).toEqual([
      '0 ok first article', '1 syntax_error nocomma', '2 syntax_error noequals', '3 unterminated_entry unclosed',
      '4 ok middle article', '5 unterminated_entry last',
    ]);
    expect(rejected(results).find((r) => r.citationKey === 'unclosed')?.message).toBe(
      'Mục BibTeX thiếu ngoặc đóng: mục kết thúc ở khối kế tiếp hoặc cuối file',
    );
    expect(rejected(results).find((r) => r.citationKey === 'unclosed')?.text).not.toContain('@article{middle');
    // Khối dùng ngoặc tròn vẫn đọc được.
    expect(only(parseBib('@article(paren, title = {Bảy}, author = {A, B})')).citationKey).toBe('paren');
  });

  it('khối không phải entry', () => {
    // EC15: @string được thay vào giá trị (kể cả nối bằng #); @preamble, @comment không thành mục.
    const results = parseBib(String.raw`
@STRING{jn = {Journal of Testing}}
@string(vol = "Tập")
@preamble{"\newcommand{\noop}[1]{}"}
@comment{@article{inside, title = {Không phải mục}, author = {A, B}}}
@article{a, title = {T}, author = {A, B}, journal = jn # { } # vol # { 1}, year = 2020}`);
    expect(results.map(outline)).toEqual(['0 ok a article']);
    expect(accepted(results)[0]?.metadata.venue).toBe('Journal of Testing Tập 1');
    expect(accepted(results)[0]?.entry.fields['journal']).toBe('Journal of Testing Tập 1');
  });

  it('không có mục', () => {
    // EC16: chuỗi rỗng, chỉ khoảng trắng, rác, chỉ có chú thích → [] và không ném lỗi.
    for (const input of ['', '   \n\t\n', 'not a citation', '% chỉ có chú thích\n', '@comment{x}\n@string{a = {b}}', 'liên hệ: a@b']) {
      expect(parseBib(input), JSON.stringify(input)).toEqual([]);
    }
    for (const input of ['', '  \r\n', 'not a citation\nmore text', '@article{a, title={T}}']) {
      expect(parseRis(input), JSON.stringify(input)).toEqual([]);
    }
  });

  it('RIS một bản ghi hỏng', () => {
    // EC17: thiếu TY, thiếu ER (giữa và cuối file), thiếu tiêu đề, thiếu tác giả → lỗi riêng; bản ghi khác vẫn có kết quả.
    const results = parseRis([
      'TY  - JOUR', 'ID  - ok1', 'TI  - Đúng một', 'AU  - A, B', 'ER  - ', '',
      'ID  - notype', 'TI  - Không có TY', 'AU  - A, B', 'ER  - ', '',
      'TY  - JOUR', 'ID  - noend', 'TI  - Không có ER', 'AU  - A, B', '',
      'TY  - JOUR', 'ID  - notitle', 'AU  - A, B', 'ER  - ', '',
      'TY  - JOUR', 'ID  - noauthor', 'T1  - Không có tác giả', 'ER  - ', '',
      'TY  - JOUR', 'ID  - ok2', 'T1  - Đúng hai', 'A1  - C, D', 'ER  - ', '',
      'TY  - JOUR', 'ID  - lastnoend', 'TI  - Cuối file', 'AU  - A, B',
    ].join('\r\n'));
    expect(results.map(outline)).toEqual([
      '0 ok ok1 article', '1 missing_type notype', '2 missing_end noend', '3 missing_fields notitle',
      '4 missing_fields noauthor', '5 ok ok2 article', '6 missing_end lastnoend',
    ]);
    expect(rejected(results).map((r) => r.message)).toEqual([
      'Bản ghi RIS không mở bằng thẻ TY', 'Bản ghi RIS thiếu thẻ ER', 'Mục thiếu tiêu đề', 'Mục thiếu tác giả',
      'Bản ghi RIS thiếu thẻ ER',
    ]);
    expect(parseRis('AU  - A, B\nTI  - Mồ côi')).toMatchObject([{ code: 'missing_type', message: 'Bản ghi RIS không mở bằng thẻ TY và thiếu thẻ ER' }]);
  });

  it('RIS nhiều tác giả', () => {
    // EC18: danh sách tác giả theo thứ tự xuất hiện của thẻ AU (bản ghi cũ dùng A1).
    const result = only(parseRis([
      'TY  - JOUR', 'TI  - Nhiều tác giả', 'AU  - Zeta, Anna', 'AU  - Alpha, Bob', 'AU  - World Health Organization',
      'AU  - Mid, Carl', 'PY  - 2020', 'ER  - ',
    ].join('\n')));
    expect(result.metadata.authors.map((a) => a.name)).toEqual(['Zeta, Anna', 'Alpha, Bob', 'World Health Organization', 'Mid, Carl']);
    expect(result.entry.fields['AU']).toEqual(['Zeta, Anna', 'Alpha, Bob', 'World Health Organization', 'Mid, Carl']);
    const old = only(parseRis('TY  - JOUR\nT1  - Cũ\nA1  - Một, A\nA1  - Hai, B\nER  - \n'));
    expect(old.metadata.authors.map((a) => a.name)).toEqual(['Một, A', 'Hai, B']);
  });

  it('ký hiệu LaTeX', () => {
    // EC19: Unicode thuần ({\"o} → ö, \& → &, bỏ ngoặc giữ chữ hoa, lệnh định dạng bỏ thẻ); công thức toán giữ nguyên
    // chuỗi; bản gốc còn trong raw.
    const title = String.raw`{\"U}ber {DNA} and $E = mc^2$ \& more \textit{in vivo}, $\frac{a}{b}$, \(x^2\), H\textsubscript{2}O~test --- done`;
    const result = only(parseBib(String.raw`@article{tex,
  title = {${title}},
  author = {M{\"u}ller, J{\"o}rg and Nguy{\~\^e}n, V{\u{a}}n A},
  journal = {Monatshefte f{\"u}r Mathematik \& Physik},
  abstract = {We use $\alpha$-decay and \emph{CRISPR}.},
  year = 2001
}`));
    expect(result.metadata).toMatchObject({
      title: String.raw`Über DNA and $E = mc^2$ & more in vivo, $\frac{a}{b}$, \(x^2\), H2O test — done`,
      authors: [{ name: 'Müller, Jörg' }, { name: 'Nguyễn, Văn A' }],
      venue: 'Monatshefte für Mathematik & Physik',
      abstractOrSnippet: String.raw`We use $\alpha$-decay and CRISPR.`,
    });
    expect(result.metadata.title.normalize('NFC')).toBe(result.metadata.title);
    expect(result.entry.fields['title']).toBe(title);
    expect(result.metadata.raw).toMatchObject({ fields: { title } });
    expect(String(result.metadata.raw?.['text'])).toContain(title);
  });

  it('chuẩn hóa DOI', () => {
    // EC20: chữ thường, bỏ tiền tố https://doi.org/, http://dx.doi.org/, doi:; không phải DOI thì bỏ (bản gốc còn ở raw).
    expect([
      '10.1126/SCIENCE.1225829', 'https://doi.org/10.2307/1879431', 'http://dx.doi.org/10.1007/BF01700692', 'doi:10.1000/XYZ',
      'DOI: 10.1000/abc', ' HTTPS://DOI.ORG/10.1000/Q ', 'n/a', '',
    ].map(normalizeDoi)).toEqual([
      '10.1126/science.1225829', '10.2307/1879431', '10.1007/bf01700692', '10.1000/xyz', '10.1000/abc', '10.1000/q', undefined,
      undefined,
    ]);
    const bib = only(parseBib('@article{a, title = {T}, author = {A, B}, doi = {https://doi.org/10.1126/SCIENCE.1225829}}'));
    expect(bib.metadata.identifiers.doi).toBe('10.1126/science.1225829');
    expect(bib.entry.doi).toBe('https://doi.org/10.1126/SCIENCE.1225829');
    const ris = only(parseRis('TY  - JOUR\nTI  - T\nAU  - A, B\nDO  - doi:10.2307/1879431\nER  - \n'));
    expect(ris.metadata.identifiers.doi).toBe('10.2307/1879431');
    const invalid = only(parseBib('@article{a, title = {T}, author = {A, B}, doi = {n/a}}'));
    expect(invalid.metadata.identifiers).toEqual({ sourceId: 'a' });
    expect(invalid.metadata.raw).toMatchObject({ fields: { doi: 'n/a' } });
  });

  it('thiếu URL và DOI', () => {
    // EC21: không lỗi; thiếu identifiers.url (và sourceId khi RIS không có ID); hợp lệ theo hợp đồng đã nới.
    const bib = only(parseBib('@book{nolink, title = {Sách}, author = {A, B}, year = 2000}'));
    expect(bib.metadata.identifiers).toEqual({ sourceId: 'nolink' });
    const ris = only(parseRis('TY  - BOOK\nTI  - Sách\nAU  - A, B\nPY  - 2000\nER  - \n'));
    expect(ris.metadata.identifiers).toEqual({});
    // URL không phải URI tuyệt đối http(s) thì coi như không có; còn DOI thì dùng DOI.
    const relative = only(parseBib('@misc{rel, title = {T}, author = {A, B}, url = {www.example.com}}'));
    expect(relative.metadata.identifiers).toEqual({ sourceId: 'rel' });
    const fallback = only(parseRis('TY  - JOUR\nTI  - T\nAU  - A, B\nUR  - /local/file.pdf\nDO  - 10.1000/x\nER  - \n'));
    expect(fallback.metadata.identifiers).toEqual({ doi: '10.1000/x', url: 'https://doi.org/10.1000/x' });
    for (const result of [bib, ris, relative, fallback]) expect(contractViolations(result.metadata)).toEqual([]);
  });

  it('loại tài liệu', () => {
    // EC22: bảng ánh xạ H2 (designs/notes.html); không có trong bảng → other; BibTeX có arXiv mà không thuộc bảng → preprint.
    const bibtex = (entryType: string, arxivId?: string) =>
      publicationTypeOf({ format: 'bibtex', entryType, ...(arxivId === undefined ? {} : { arxivId }) });
    const ris = (entryType: string) => publicationTypeOf({ format: 'ris', entryType });
    expect(Object.fromEntries(['article', 'inproceedings', 'conference', 'phdthesis', 'mastersthesis', 'thesis', 'book',
      'incollection', 'inbook', 'techreport', 'report', 'misc', 'unpublished', 'online', 'ARTICLE'].map((t) => [t, bibtex(t)]))).toEqual({
      article: 'article', inproceedings: 'conference', conference: 'conference', phdthesis: 'thesis', mastersthesis: 'thesis',
      thesis: 'thesis', book: 'book', incollection: 'chapter', inbook: 'chapter', techreport: 'report', report: 'report',
      misc: 'other', unpublished: 'other', online: 'other', ARTICLE: 'article',
    });
    expect([bibtex('misc', '2005.14165'), bibtex('online', '2005.14165'), bibtex('article', '2005.14165')]).toEqual(['preprint', 'preprint', 'article']);
    expect(Object.fromEntries(['JOUR', 'EJOUR', 'CONF', 'CPAPER', 'THES', 'BOOK', 'EBOOK', 'CHAP', 'ECHAP', 'RPRT', 'GEN', 'ELEC', 'jour']
      .map((t) => [t, ris(t)]))).toEqual({
      JOUR: 'article', EJOUR: 'article', CONF: 'conference', CPAPER: 'conference', THES: 'thesis', BOOK: 'book', EBOOK: 'book',
      CHAP: 'chapter', ECHAP: 'chapter', RPRT: 'report', GEN: 'other', ELEC: 'other', jour: 'article',
    });
    // Định danh arXiv đọc từ eprint với archivePrefix = arXiv hoặc eprinttype = arxiv (biblatex).
    expect(only(parseBib('@misc{p, title = {T}, author = {A, B}, eprint = {arXiv:2301.00001}, eprinttype = {arxiv}}')).metadata)
      .toMatchObject({ publicationType: 'preprint', identifiers: { arxivId: '2301.00001' } });
    const ssrn = only(parseBib('@misc{q, title = {T}, author = {A, B}, eprint = {hep-th/9901001}, archivePrefix = {SSRN}}'));
    expect(ssrn.metadata).toMatchObject({ publicationType: 'other' });
    expect(ssrn.metadata.identifiers).not.toHaveProperty('arxivId');
    expect(ssrn.entry).toMatchObject({ eprint: 'hep-th/9901001' });
  });

  it('dạng tên tác giả', () => {
    // EC23: authors[].name = “Họ, Tên”; BibTeX “Tên Họ” đổi sang “Họ, Tên”; tên tập thể trong ngoặc giữ nguyên.
    const result = only(parseBib(String.raw`@article{names, title = {T}, year = 2000, author = {Ashish Vaswani and
  Akerlof, George A. and {World Health Organization} and Ludwig van Beethoven and de la Fontaine, Jean and
  King, Jr., Martin Luther and {\L}ukasz Kaiser and {\'E}mile Durkheim and Aristotle and {Nhóm Nghiên cứu Đô thị} and others}}`));
    expect(result.metadata.authors.map((a) => a.name)).toEqual([
      'Vaswani, Ashish', 'Akerlof, George A.', 'World Health Organization', 'van Beethoven, Ludwig', 'de la Fontaine, Jean',
      'King, Martin Luther, Jr.', 'Kaiser, Łukasz', 'Durkheim, Émile', 'Aristotle', 'Nhóm Nghiên cứu Đô thị',
    ]);
    const ris = only(parseRis('TY  - JOUR\nTI  - T\nAU  - Nguyễn, Văn An\nAU  - Doe, John, Jr.\nAU  - Nhóm Nghiên cứu\nER  - \n'));
    expect(ris.metadata.authors.map((a) => a.name)).toEqual(['Nguyễn, Văn An', 'Doe, John, Jr.', 'Nhóm Nghiên cứu']);
    expect([
      authorName({ family: 'Beethoven', nonDroppingParticle: 'van', given: 'Ludwig' }),
      authorName({ family: 'Poussin', given: 'Charles', droppingParticle: 'de la Vallée' }),
      authorName({ literal: 'World Health Organization' }),
      authorName({ given: 'Madonna' }),
    ]).toEqual(['van Beethoven, Ludwig', 'Poussin, Charles de la Vallée', 'World Health Organization', 'Madonna']);
  });

  it('URL từ DOI', () => {
    // EC24: có DOI, không có URL → https://doi.org/ + DOI đã chuẩn hóa; có URL thì giữ URL.
    expect(only(parseBib('@article{a, title = {T}, author = {A, B}, doi = {DOI:10.1007/BF01700692}}')).metadata.identifiers)
      .toEqual({ doi: '10.1007/bf01700692', sourceId: 'a', url: 'https://doi.org/10.1007/bf01700692' });
    expect(only(parseBib('@article{b, title = {T}, author = {A, B}, doi = {10.1/x}, url = {https://example.org/b}}')).metadata.identifiers)
      .toMatchObject({ url: 'https://example.org/b' });
    // DOI có ký tự không hợp lệ trong URL: mã hóa từng đoạn để url vẫn là URI hợp lệ, trỏ đúng DOI.
    const odd = '10.1002/(sici)1097-4571(199806)49:8<693::aid-asi4>3.0.co;2-o';
    expect(doiUrl(odd)).toBe('https://doi.org/10.1002/(sici)1097-4571(199806)49%3A8%3C693%3A%3Aaid-asi4%3E3.0.co%3B2-o');
    expect(decodeURIComponent(new URL(doiUrl(odd)).pathname.slice(1))).toBe(odd);
    const viaRis = only(parseRis(`TY  - JOUR\nTI  - T\nAU  - A, B\nDO  - ${odd.toUpperCase()}\nER  - \n`));
    expect(contractViolations(viaRis.metadata)).toEqual([]);
    expect(viaRis.metadata.identifiers.url).toBe(doiUrl(odd));
  });
});

describe('importers — xuống dòng', () => {
  it('xuống dòng CRLF giữ văn bản gốc', () => {
    // G1 của QC độc lập Lần 1: file xuất trên Windows dùng CRLF (RIS thật thường vậy). Cùng nội dung với LF thì cùng kết
    // quả; mọi `text` và `raw.text` là đoạn nguyên của chuỗi vào (H1: `raw` = bản gốc), nên bỏ mục hỏng theo `text`
    // vẫn được. Không phụ thuộc fixture được checkout LF hay CRLF.
    const cases = [
      ['multidisciplinary.bib', parseBib, ['\r\n', '\r']],
      ['multidisciplinary.ris', parseRis, ['\r\n', '\r']],
    ] as const;
    for (const [name, parse, endings] of cases) {
      const lf = fixture(name).replace(/\r\n?/g, '\n');
      const base = parse(lf);
      const withoutRaw = (results: ReferenceImportResult[]) => accepted(results).map((r) => ({ ...r.metadata, raw: undefined }));
      for (const ending of endings) {
        const label = `${name} ${JSON.stringify(ending)}`;
        const input = lf.replace(/\n/g, ending);
        const results = parse(input);
        expect(results.map(outline), label).toEqual(base.map(outline));
        expect(withoutRaw(results), label).toEqual(withoutRaw(base));
        for (const result of results) {
          const text = result.ok ? result.entry.text : result.text;
          expect(input.includes(text), `${label} ${result.index}`).toBe(true);
          if (result.ok) expect(result.metadata.raw?.['text'], `${label} ${result.index}`).toBe(text);
        }
        expect(accepted(results).some((r) => r.entry.text.includes(ending)), label).toBe(true);
        const cleaned = rejected(results).reduce((text, r) => text.replace(r.text, ''), input);
        expect(rejected(parse(cleaned)), label).toEqual([]);
        expect(accepted(parse(cleaned)).map((r) => r.metadata), label).toEqual(accepted(results).map((r) => r.metadata));
      }
    }
  });
});

describe('importers — giao diện và module (PC-04 A10)', () => {
  it('parser sau giao diện ReferenceParser', () => {
    // Điều kiện 1: chỉ thư mục citation-js/ import Citation.js; mã nghiệp vụ dùng ReferenceParser, ReferenceImporter.
    const src = join(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts')) files.push(path);
      }
    };
    walk(src);
    const importing = files
      .filter((file) => /from '@citation-js\/|import '@citation-js\//.test(readFileSync(file, 'utf8')))
      .map((file) => relative(src, file).replace(/\\/g, '/'));
    expect(importing).toContain('importers/citation-js/citation-js.parsers.ts');
    expect(importing.filter((file) => !file.startsWith('importers/citation-js/'))).toEqual([]);
    // Đổi thư viện = một bản hiện thực ReferenceParser khác; ReferenceImporter không đổi.
    const fake = new ReferenceImporter([{ format: 'ris', parse: () => [] }], () => NOW);
    expect(fake.parse('TY  - JOUR', 'ris')).toEqual([]);
    expect(() => fake.parse('@article{a}', 'bibtex')).toThrow('Không có parser cho định dạng bibtex');
  });

  it('ImportersModule cung cấp ReferenceImporter', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ImportersModule] }).compile();
    const fromModule = moduleRef.get(ReferenceImporter);
    expect(fromModule).toBeInstanceOf(ReferenceImporter);
    expect(fromModule.parse('@article{a, title = {T}, author = {A, B}}', 'bibtex').map(outline)).toEqual(['0 ok a article']);
  });
});
