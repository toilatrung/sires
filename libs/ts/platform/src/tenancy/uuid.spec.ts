// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { afterEach, describe, expect, it, vi } from 'vitest';
import { isUuid, uuidv7, uuidv7Timestamp } from './uuid';

describe('uuidv7', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('đúng định dạng RFC 9562: version 7, variant 10', () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('mang thời điểm sinh theo mili giây', () => {
    const before = Date.now();
    const id = uuidv7();
    const after = Date.now();
    expect(uuidv7Timestamp(id)).toBeGreaterThanOrEqual(before);
    expect(uuidv7Timestamp(id)).toBeLessThanOrEqual(after + 1);
  });

  it('tăng nghiêm ngặt và không trùng trong một tiến trình, kể cả cùng mili giây', () => {
    const fixed = Date.now() + 1_000;
    vi.spyOn(Date, 'now').mockReturnValue(fixed);
    const ids = Array.from({ length: 10_000 }, () => uuidv7());
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
    expect(uuidv7Timestamp(ids[0] as string)).toBe(fixed);
  });

  it('không lùi khi đồng hồ lùi', () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(Date.now() + 5_000);
    const later = uuidv7();
    now.mockReturnValue(Date.now() - 60_000);
    const earlier = uuidv7();
    expect(earlier > later).toBe(true);
  });

  it('isUuid chỉ nhận chuỗi UUID chuẩn', () => {
    expect(isUuid('018f3a1e-7b2c-7d4e-8f00-123456789abc')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(() => uuidv7Timestamp('018f3a1e-7b2c-4d4e-8f00-123456789abc')).toThrow(TypeError);
  });
});
