// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import { changeLanguage, detectInitialLanguage, resources } from './i18n';

function flatKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => flatKeys(v, prefix ? `${prefix}.${k}` : k));
}

// REL-08: every namespace has the same keys in Vietnamese and English (EC04).
describe('i18n resources', () => {
  const { vi, en } = resources();
  for (const ns of Object.keys(vi)) {
    it(`namespace ${ns} has matching vi/en keys`, () => {
      expect(flatKeys(en[ns] ?? {}).sort()).toEqual(flatKeys(vi[ns]).sort());
    });
  }

  it('vi/en cùng khóa: mọi khu vực có namespace ở cả hai ngôn ngữ (EC04)', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(vi).sort());
  });
});

describe('ngôn ngữ ban đầu (UX-I18N-001, EC01)', () => {
  it('theo Preferences khi có', () => {
    expect(detectInitialLanguage('en', ['vi-VN'])).toBe('en');
    expect(detectInitialLanguage('vi', ['en-US'])).toBe('vi');
  });

  it('chưa có Preferences: theo trình duyệt (vi* → vi, en* → en)', () => {
    expect(detectInitialLanguage(undefined, ['vi-VN', 'en-US'])).toBe('vi');
    expect(detectInitialLanguage(null, ['vi'])).toBe('vi');
    expect(detectInitialLanguage(undefined, ['en-GB'])).toBe('en');
    expect(detectInitialLanguage(undefined, ['fr-FR', 'vi-VN'])).toBe('vi');
  });

  it('không xác định → English', () => {
    expect(detectInitialLanguage(undefined, ['fr-FR', 'ja'])).toBe('en');
    expect(detectInitialLanguage(undefined, [])).toBe('en');
    expect(detectInitialLanguage('de', [])).toBe('en');
  });
});

describe('đổi ngôn ngữ', () => {
  it('đặt lang của tài liệu theo ngôn ngữ', async () => {
    await changeLanguage('en', i18next);
    expect(document.documentElement.lang).toBe('en');
    expect(i18next.t('nav.pendingActions')).toBe('Pending Actions');
    await changeLanguage('vi', i18next);
    expect(document.documentElement.lang).toBe('vi');
    expect(i18next.t('context.label')).toBe('Ngữ cảnh');
  });
});
