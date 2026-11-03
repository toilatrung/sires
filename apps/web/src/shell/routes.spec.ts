// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { describe, expect, it } from 'vitest';
import { features } from './features';

describe('feature routes', () => {
  it('no two feature areas claim the same path', () => {
    const paths = features.flatMap((f) => f.routes.map((r) => r.path));
    expect(new Set(paths).size).toBe(paths.length);
  });
});
