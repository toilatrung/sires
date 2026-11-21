// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

// Crossref exports. BibTeX gets a packaging notice; keep both source and
// packaged checksums. RIS stays byte-for-byte. No reconstructed records.
const directory = fileURLToPath(new URL('./fixtures/', import.meta.url));
const works = [
  { name: 'crispr', doi: '10.1126/science.1225829' },
  { name: 'economics', doi: '10.1257/jep.21.1.141' },
];
await mkdir(directory, { recursive: true });
const manifest = [];
for (const work of works) {
  for (const [extension, format] of [['bib', 'application/x-bibtex'], ['ris', 'application/x-research-info-systems']]) {
    const url = `https://api.crossref.org/works/${encodeURIComponent(work.doi)}/transform/${format}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const sourceBytes = Buffer.from(await response.arrayBuffer());
    const notice = '% SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.\n% Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.\n% SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — packaging only; see LICENSES.md.\n% Bibliographic metadata belongs to its original authors; source and hashes: manifest.json.\n';
    const bytes = extension === 'bib' ? Buffer.concat([Buffer.from(notice), sourceBytes]) : sourceBytes;
    const file = `${work.name}.${extension}`;
    await writeFile(`${directory}/${file}`, bytes);
    manifest.push({ file, doi: work.doi, url, capturedAt: new Date().toISOString(), contentType: response.headers.get('content-type'), sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'), sha256: createHash('sha256').update(bytes).digest('hex') });
    await sleep(1500);
  }
}
await writeFile(`${directory}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
