// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import i18next from 'i18next';
import { afterEach, beforeEach } from 'vitest';
import { initI18n } from '../i18n';

initI18n('vi');

beforeEach(async () => {
  await i18next.changeLanguage('vi');
});

afterEach(async () => {
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
