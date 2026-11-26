// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
// @vitest-environment node

// The dev worker (PID-00013 S02) starts quiet: MSW's default request log prints request bodies (API keys of Provider
// Connections) to the browser console (QC #143 G1). msw/browser only resolves in a browser, so the test reads the
// options module browser.ts passes to worker.start, and checks browser.ts passes exactly that.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { workerStartOptions } from './worker-options';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('worker của dev:mock', () => {
  it('không log request ra console', () => {
    expect(workerStartOptions).toMatchObject({ quiet: true, onUnhandledFrame: 'bypass' });
    const source = fs.readFileSync(path.join(here, 'browser.ts'), 'utf8');
    expect(source).toMatch(/worker\.start\(workerStartOptions\)/);
    expect(source.match(/worker\.start\(/g)).toHaveLength(1);
  });
});
