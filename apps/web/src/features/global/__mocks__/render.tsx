// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Test helpers of the global area: the real shell frame (renderShell) whose API client and SSE go to the mock
// server of PID-00013 instead of the shell's fetch stub, and a phone-width matchMedia. Used only by *.spec.tsx.

import { renderShell } from '../../../shell/test/render';
import { FetchStub } from '../../../shell/test/stub';
import { mockFetch } from '../../../shell/mock/node';

export function renderGlobal(path: string) {
  const stub = new FetchStub();
  Object.defineProperty(stub, 'fetch', { value: mockFetch });
  return renderShell({ path, stub });
}

/**
 * jsdom has no layout: make `(max-width: …)` media queries match as on a phone of `width` px (390 or 375), so the
 * shell's phone frame and the area's phone layout render. Returns a function restoring the previous matchMedia.
 */
export function phoneWidth(width: number): () => void {
  const previous = window.matchMedia;
  window.matchMedia = ((query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query);
    const min = /min-width:\s*(\d+)px/.exec(query);
    const matches = (!max || width <= Number(max[1])) && (!min || width >= Number(min[1]));
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    } as MediaQueryList;
  }) as typeof window.matchMedia;
  return () => {
    window.matchMedia = previous;
  };
}
