// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Content of a version that is neither a diagram nor a synthesis (S05, H8): csv → table, a file (fileUrl or pdf) →
// “Tải file”, anything else → text that keeps its line breaks. Content is always text: HTML is never inserted (EC29);
// Markdown is shown as written (implement.md).

import { useTranslation } from 'react-i18next';
import type { Schemas } from './data';

/** RFC 4180 CSV; undefined when it cannot be read (unbalanced quotes, rows of different widths) → plain text (EC30). */
export function parseCsv(text: string): string[][] | undefined {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === '"') {
      return undefined;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (quoted) return undefined;
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const width = rows[0]?.length ?? 0;
  if (rows.length < 1 || width < 2 || rows.some((cells) => cells.length !== width)) return undefined;
  return rows;
}

export function FormatContent({ version }: { version: Schemas['ArtifactVersion'] }) {
  const { t } = useTranslation('research');
  const format = version.format.toLowerCase();
  const content = version.content ?? '';
  if (version.fileUrl || format === 'pdf') {
    return (
      <div className="research-stack">
        {version.fileUrl
          ? <a className="sires-button" data-size="sm" href={version.fileUrl} target="_blank" rel="noopener noreferrer" download>{t('content.download')}</a>
          : <p className="research-meta">{t('content.noFile')}</p>}
        {content && <pre className="research-text">{content}</pre>}
      </div>
    );
  }
  const table = format === 'csv' ? parseCsv(content.trimEnd()) : undefined;
  if (table) {
    const [head, ...body] = table;
    return (
      <div className="research-tablewrap">
        <table className="research-table">
          <thead><tr>{head!.map((cell, index) => <th key={index} scope="col">{cell}</th>)}</tr></thead>
          <tbody>{body.map((cells, row) => <tr key={row}>{cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  return content ? <pre className="research-text">{content}</pre> : <p className="research-meta">{t('content.empty')}</p>;
}
