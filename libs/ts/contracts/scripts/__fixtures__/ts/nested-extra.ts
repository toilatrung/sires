// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import type { PublicApi, UsageRecordedMessage } from '../../../src/index';
export const project: Partial<PublicApi.components['schemas']['ResearchProject']> = { fieldNotInSpec: true };
export function inspect(message: UsageRecordedMessage) { return message.aggregate?.fieldNotInSpec; }
