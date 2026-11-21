// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Module engine — lõi của orchestration (tickets 1.6): Workflow, WorkflowStep, Checkpoint, heartbeat, sweeper,
// Recovery decision. Logic do PID-00046 viết; PID-00019 S03 chỉ dựng khung và giao diện.
import { Module } from '@nestjs/common';
import { WORKFLOW_ENGINE } from './workflow-engine';
import { WorkflowEngineService } from './workflow-engine.service';

@Module({
  providers: [{ provide: WORKFLOW_ENGINE, useClass: WorkflowEngineService }],
  exports: [WORKFLOW_ENGINE],
})
export class EngineModule {}
