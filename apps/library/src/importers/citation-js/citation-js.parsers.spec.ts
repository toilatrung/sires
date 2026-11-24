// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Bản hiện thực Citation.js của ReferenceParser (PID-00024 S04, S05; PC-04 A10 điều kiện 2): chỉ hai plugin định dạng,
// kiểu đầu vào ép rõ nên không tải URL, log của thư viện được dọn, công thức toán giữ nguyên, Node đủ phiên bản thư viện
// yêu cầu. Không cần mạng.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as citationCore from '@citation-js/core';
import { plugins } from '@citation-js/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CitationJsBibtexParser, CitationJsRisParser, citationJsParsers } from './citation-js.parsers';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const APP_ROOT = join(__dirname, '..', '..', '..');

/** So phiên bản `a.b.c` (bỏ tiền tố `v`, `>=`). */
function atLeast(version: string, minimum: string): boolean {
  const parse = (v: string) => v.replace(/^[^\d]*/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const [a, b] = [parse(version), parse(minimum)];
  for (let i = 0; i < 3; i += 1) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
}

describe('parser Citation.js (PC-04 A10)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('chỉ nạp hai plugin định dạng', () => {
    // Không có plugin DOI, URL, Wikidata, ISBN: thư viện không thể tự tra cứu nguồn ngoài.
    expect(plugins.list()).toEqual(['@else', '@bibtex', '@ris']);
    expect(plugins.input.list().filter((format) => /doi|wikidata|isbn|pubmed/i.test(format))).toEqual([]);
    const pkg = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(Object.entries(pkg.dependencies).filter(([name]) => name.startsWith('@citation-js/'))).toEqual([
      ['@citation-js/core', '0.9.0'], ['@citation-js/plugin-bibtex', '0.9.0'], ['@citation-js/plugin-ris', '0.9.0'],
    ]);
  });

  it('không tải URL hay DOI đưa vào', () => {
    // Kiểu đầu vào ép rõ: URL, DOI trơn không phải mục BibTeX/RIS → [] và không có request nào.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const [parser, input] of [
      [new CitationJsBibtexParser(), 'https://doi.org/10.1126/science.1225829'],
      [new CitationJsBibtexParser(), '10.1126/science.1225829'],
      [new CitationJsRisParser(), 'https://example.org/refs.ris'],
    ] as const) {
      expect(parser.parse(input)).toEqual([]);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('dọn log của thư viện sau mỗi lần đọc', () => {
    const log = (citationCore as unknown as { logger: { _log: unknown[] } }).logger._log;
    const [bibtex, ris] = citationJsParsers();
    bibtex?.parse('@article{a, title = {T}, author = {A, B}, unknownfield = {x}}\n@article{b, title = {T} author = {A}}');
    expect(log).toEqual([]);
    ris?.parse('TY  - JOUR\nTI  - T\nAU  - A, B\nZZ  - lạ\nER  - \n');
    expect(log).toEqual([]);
  });

  it('công thức toán và chữ trùng mã giữ chỗ', () => {
    const [result] = new CitationJsBibtexParser().parse(
      String.raw`@article{m, title = {SIRESMATH0Q: $a_1$ and $$b$$ and \$5 \textbf{bold}}, author = {A, B}}`,
    );
    expect(result).toMatchObject({ ok: true, entry: { title: String.raw`SIRESMATH0Q: $a_1$ and $$b$$ and $5 bold` } });
  });

  it('Node đủ phiên bản Citation.js yêu cầu', () => {
    // Citation.js 0.9.0 khai engines node >=22.12.0; máy chạy test và .nvmrc của repo (CI) phải thỏa.
    for (const name of ['core', 'plugin-bibtex', 'plugin-ris']) {
      const pkg = JSON.parse(readFileSync(join(APP_ROOT, 'node_modules', '@citation-js', name, 'package.json'), 'utf8')) as {
        engines: { node: string };
      };
      expect(pkg.engines.node).toBe('>=22.12.0');
    }
    expect(atLeast(process.versions.node, '22.12.0')).toBe(true);
    const nvmrc = readFileSync(join(REPO_ROOT, '.nvmrc'), 'utf8').trim();
    expect(atLeast(nvmrc.includes('.') ? nvmrc : `${nvmrc}.0.0`, '22.12.0')).toBe(true);
  });
});
