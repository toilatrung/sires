// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
import type { UsageRecordedMessage } from '../../../src/index';
export function inspect(message: UsageRecordedMessage) { return message.data.fieldNotInSpec; }
export function write(message: UsageRecordedMessage) { message.data.fieldNotInSpec = true; }
export function replace(message: UsageRecordedMessage) {
  message.data = { ...message.data, fieldNotInSpec: true };
}
