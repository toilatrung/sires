// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Injectable } from '@nestjs/common';
import type { WorkflowEngine } from './workflow-engine';

/** Hiện thực nội bộ của {@link WorkflowEngine}; module khác không import file này (luật lint của S03). */
@Injectable()
export class WorkflowEngineService implements WorkflowEngine {}
