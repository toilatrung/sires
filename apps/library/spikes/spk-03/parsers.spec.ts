// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fixtures, parseBibtex, parseCitation } from './parsers.mjs';

describe('PID-00025-AC03 — parser trên export Crossref thật', () => {
  it('BibTeX và RIS giữ DOI, title, tác giả, năm và đúng số bản ghi', async () => {
    const inputs = await fixtures();
    expect(inputs).toHaveLength(4);
    for (const fixture of inputs) {
      const bytes = await readFile(new URL(`./fixtures/${fixture.file}`, import.meta.url));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256);
      const data = parseCitation(fixture.input, fixture.file.endsWith('.bib') ? 'bib' : 'ris');
      expect(data).toHaveLength(1);
      expect(data[0].DOI.toLowerCase()).toBe(fixture.doi.toLowerCase());
      expect(data[0].title.length).toBeGreaterThan(10);
      expect(data[0].author.length).toBe(fixture.file.startsWith('crispr') ? 6 : 2);
      expect(data[0].issued['date-parts'][0][0]).toBe(fixture.file.startsWith('crispr') ? 2012 : 2007);
      if (fixture.file.endsWith('.bib')) {
        const alternative = parseBibtex(fixture.input);
        expect(alternative).toHaveLength(1);
        expect(alternative[0].entryTags.DOI.toLowerCase()).toBe(fixture.doi.toLowerCase());
      }
    }
  });

  it('ghép hai export thành batch vẫn giữ cả hai công bố', async () => {
    const inputs = await fixtures();
    for (const format of ['bib', 'ris']) {
      const input = inputs.filter(row => row.file.endsWith(`.${format}`)).map(row => row.input).join('\n');
      expect(parseCitation(input, format)).toHaveLength(2);
    }
  });

  it('ghi nhận thư viện có thể dung thứ RIS thiếu ER; PID-00024 cần validation riêng', () => {
    expect(parseCitation('TY  - JOUR\nTI  - Incomplete\n', 'ris')).toHaveLength(1);
    expect(() => parseCitation('@article{broken, title={unterminated', 'bib')).toThrow();
  });
});
