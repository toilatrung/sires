// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { describe, expect, it } from 'vitest';
import { TESTCONTAINERS_TIMEOUTS } from './timeouts';
import * as root from '../index';

describe('TESTCONTAINERS_TIMEOUTS (PC-04 A6)', () => {
  it('test 60 s, hook 180 s', () => {
    expect(TESTCONTAINERS_TIMEOUTS).toEqual({ testTimeout: 60_000, hookTimeout: 180_000 });
  });

  it('không sửa được lúc chạy', () => {
    expect(Object.isFrozen(TESTCONTAINERS_TIMEOUTS)).toBe(true);
  });

  it('gốc gói export cùng đối tượng', () => {
    expect(root.TESTCONTAINERS_TIMEOUTS).toBe(TESTCONTAINERS_TIMEOUTS);
  });
});
