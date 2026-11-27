// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Strings of the Deliberation tab (PID-00083, S01): namespace `monitoring`, keys `deliberation.*`, in this PID's own
// files so the area's `i18n/*.json` (PID-00059) stay untouched. The PR merged last adds them to the area's messages:
//   messages: { vi: { ...vi, ...deliberationMessages.vi }, en: { ...en, ...deliberationMessages.en } }

import type { Locale, Messages } from '../../../shell';
import en from './i18n/en.json';
import vi from './i18n/vi.json';

export const deliberationMessages: Record<Locale, Messages> = { vi, en };
