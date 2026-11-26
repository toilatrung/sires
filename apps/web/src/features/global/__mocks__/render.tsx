// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Test helper of the global area: the real shell frame (renderShell) whose API client and SSE go to the mock
// server of PID-00013 instead of the shell's fetch stub. Used only by *.spec.tsx.

import { renderShell } from '../../../shell/test/render';
import { FetchStub } from '../../../shell/test/stub';
import { mockFetch } from '../../../shell/mock/node';

export function renderGlobal(path: string) {
  const stub = new FetchStub();
  Object.defineProperty(stub, 'fetch', { value: mockFetch });
  return renderShell({ path, stub });
}

