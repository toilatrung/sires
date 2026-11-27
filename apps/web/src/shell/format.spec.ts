// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import i18next from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import { clock, formatDate, formatDateTime, formatElapsed, formatNumber, formatTime } from './format';

describe('format', () => {
  it('vi theo múi giờ trình duyệt (UX-I18N-004-AC01)', () => {
    vi.spyOn(clock, 'timeZone').mockReturnValue('Asia/Saigon');
    expect(formatDateTime('2026-11-17T02:52:00Z', { locale: 'vi' })).toBe('17/11/2026 09:52');
  });

  it('múi giờ: theo trình duyệt, không theo Preferences.timezone (EC21)', () => {
    vi.spyOn(clock, 'timeZone').mockReturnValue('Europe/Paris');
    // Preferences.timezone = Asia/Saigon is ignored: the shell never passes it.
    expect(formatDateTime('2026-11-17T02:52:00Z')).toBe('17/11/2026 03:52');
    expect(formatTime('2026-11-17T23:30:00Z')).toBe('00:30');
    expect(formatDate('2026-11-17T23:30:00Z')).toBe('18/11/2026');
  });

  it('en cùng mẫu ngày, số theo ngôn ngữ (EC25)', async () => {
    vi.spyOn(clock, 'timeZone').mockReturnValue('Asia/Saigon');
    await i18next.changeLanguage('en');
    expect(formatDateTime('2026-11-17T02:52:00Z')).toBe('17/11/2026 09:52');
    expect(formatTime('2026-11-17T13:05:09Z', { withSeconds: true })).toBe('20:05:09');
    expect(formatNumber(1234.5)).toBe('1,234.5');
    await i18next.changeLanguage('vi');
    expect(formatNumber(1234.5)).toBe('1.234,5');
    expect(formatNumber(1234.5, { locale: 'en' })).toBe('1,234.5');
  });

  it('thời gian đã chạy', () => {
    expect(formatElapsed(12)).toBe('00:12');
    expect(formatElapsed(6 * 60 + 12)).toBe('06:12');
    expect(formatElapsed(3600 + 61)).toBe('01:01:01');
  });
});
