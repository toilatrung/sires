// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { feature as global } from '../features/global';
import { feature as library } from '../features/library';
import { feature as manuscript } from '../features/manuscript';
import { feature as monitoring } from '../features/monitoring';
import { feature as planning } from '../features/planning';
import { feature as project } from '../features/project';
import { feature as research } from '../features/research';
import { feature as settings } from '../features/settings';
import type { Feature } from './feature';

// The only shell file a new feature area touches: one import and one entry.
export const features: Feature[] = [settings, global, library, project, planning, research, manuscript, monitoring];
