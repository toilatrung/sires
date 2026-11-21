// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';

// Mermaid's sanitizer requires a DOM even during parse. jsdom neither runs
// source scripts nor loads external resources with its default options.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { default: mermaid } = await import('mermaid');

// Separate process: the supervisor can kill a parser that blocks the event loop.
if (process.env.SPK_STALL_PARSE === '1') await new Promise(() => setInterval(() => {}, 1000));
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
const source = await fs.readFile('/work/input.mmd', 'utf8');
try {
  const parsed = await mermaid.parse(source);
  await fs.writeFile('/work/parse.json', JSON.stringify({ ok: true, diagramType: parsed.diagramType }));
} catch (error) {
  // Jison's loc may refer to the preceding token. Prefer its diagnostic line;
  // an EOF error points to the last actual source line rather than a phantom row.
  const reportedLine = Number(
    /line (\d+)/i.exec(error.message)?.[1] ?? error.hash?.loc?.first_line ?? error.hash?.line,
  );
  const line =
    Number.isFinite(reportedLine) && reportedLine > 0
      ? Math.min(reportedLine, source.trimEnd().split(/\r?\n/).length)
      : null;
  await fs.writeFile(
    '/work/parse.json',
    JSON.stringify({
      ok: false,
      code:
        error.hash || /parse error|lexical error|no diagram type|syntax error/i.test(error.message)
          ? 'syntax_error'
          : 'parse_error',
      line,
      message: error.message,
    }),
  );
  process.exitCode = 2;
}
