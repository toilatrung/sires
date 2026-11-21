// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Điểm vào duy nhất của engine cho phần còn lại của service (PID-00019-AC02): file ngoài engine/ chỉ import từ
// đây; import file khác trong engine/ bị luật lint của apps/orchestration/eslint.config.mjs chặn.
export { EngineModule } from './engine.module';
export { WORKFLOW_ENGINE, type WorkflowEngine } from './workflow-engine';
