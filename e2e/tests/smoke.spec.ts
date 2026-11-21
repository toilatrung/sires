// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { expect, test } from '@playwright/test';

test('TS-00-01 web shell loads and redirects to the dashboard', async ({ page, baseURL }, testInfo) => {
  try {
    await page.goto('/');
  } catch {
    throw new Error(`Không mở được môi trường E2E: ${baseURL}`);
  }
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page).toHaveTitle('SIRes');
  expect(await page.evaluate(() => navigator.language)).toBe(testInfo.project.use.locale);
});
