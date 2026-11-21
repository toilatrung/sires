// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { renderMermaid } from '@mermaid-js/mermaid-cli';

const requireCli = createRequire(import.meta.resolve('@mermaid-js/mermaid-cli'));
const puppeteer = requireCli('puppeteer');
const attempts = [];
let browser;
try {
  if (process.env.SPK_STALL_RENDER === '1') await new Promise(() => setInterval(() => {}, 1000));
  browser = await puppeteer.launch({
    executablePath: process.env.SPK_BAD_BROWSER === '1' ? '/bin/false' : '/usr/bin/chromium',
    headless: true,
    // Chromium's inner sandbox cannot create namespaces under gVisor. The outer
    // gVisor sandbox, non-root UID, cgroup and Docker seccomp remain in force.
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--disable-component-update',
      '--no-first-run',
      '--disable-sync',
      '--no-proxy-server',
    ],
  });
  const source = await fs.readFile('/work/input.mmd', 'utf8');
  const guardedBrowser = {
    async newPage() {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = new URL(request.url());
        // Only the immutable CLI HTML/bundles and inline data are readable.
        const local = url.protocol === 'file:' && fileURLToPath(url).startsWith('/opt/spk-07/node_modules/');
        if (local || ['data:', 'about:'].includes(url.protocol)) {
          void request.continue();
        } else {
          attempts.push({ url: request.url(), resourceType: request.resourceType(), action: 'aborted' });
          void request.abort('blockedbyclient');
        }
      });
      return page;
    },
  };
  const options = {
    mermaidConfig: {
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'neutral',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    },
    viewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
    backgroundColor: 'white',
  };
  const format = process.env.SPK_PNG === '1' ? 'png' : 'svg';
  if (format === 'png') options.viewport.deviceScaleFactor = 300 / 96;
  const { data } = await renderMermaid(guardedBrowser, source, format, options);
  // A request attempt is an error, even when Chromium could paint a partial SVG.
  if (attempts.length) throw new Error('network request blocked');
  const output =
    format === 'svg'
      ? Buffer.concat([Buffer.from('<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->\n'), data])
      : data;
  await fs.writeFile(`/work/output.${format}`, output);
  await fs.writeFile('/work/render.json', JSON.stringify({ ok: true, format, blockedRequests: attempts }));
} catch (error) {
  await fs.writeFile(
    '/work/render.json',
    JSON.stringify({
      ok: false,
      code: attempts.length ? 'network_blocked' : 'render_error',
      message: error.message,
      blockedRequests: attempts,
    }),
  );
  process.exitCode = 3;
} finally {
  await fs.writeFile('/work/requests.json', JSON.stringify(attempts, null, 2));
  if (browser) await browser.close();
}
