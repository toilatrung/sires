// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { describe, expect, it } from 'vitest';
import { resources } from './i18n';

// REL-08: every namespace has the same keys in Vietnamese and English.
describe('i18n resources', () => {
  const { vi, en } = resources();
  for (const ns of Object.keys(vi)) {
    it(`namespace ${ns} has matching vi/en keys`, () => {
      expect(Object.keys(en[ns] ?? {}).sort()).toEqual(Object.keys(vi[ns]).sort());
    });
  }
});
