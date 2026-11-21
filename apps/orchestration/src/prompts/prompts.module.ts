// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Module prompts của orchestration (tickets 1.6) — InteractiveAgentPrompt, phê duyệt APR.
// Chỉ là khung (PID-00019 S03); logic, API và sự kiện do PID-00065 viết. Đổi trạng thái Workflow, WorkflowStep đi
// qua giao diện của engine (import từ '../engine'), không import file nội bộ của engine/.
import { Module } from '@nestjs/common';

@Module({})
export class PromptsModule {}
