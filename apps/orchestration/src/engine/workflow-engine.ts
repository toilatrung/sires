// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

/**
 * Giao diện của engine cho các module con khác (prompts, context-store, deliberation, usage): mọi thay đổi trạng
 * thái Workflow, WorkflowStep, Checkpoint đi qua đây, không sửa bảng của engine trực tiếp (tickets 1.6; PID-00019
 * EC01). Chưa có phương thức: PID-00046 thêm khi viết logic engine.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- khung PID-00019 S03; PID-00046 thêm phương thức
export interface WorkflowEngine {}

/** Token tiêm phụ thuộc của Nest cho {@link WorkflowEngine}: `@Inject(WORKFLOW_ENGINE) engine: WorkflowEngine`. */
export const WORKFLOW_ENGINE = Symbol('orchestration.WorkflowEngine');
