// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Shared demo world of the web mock (one researcher, four projects in Vietnamese and English). Split by the area
// whose screens show it; an area adds or replaces rows from features/<area>/__mocks__/ (README.md).

import type { Fixtures } from '../types';
import { global } from './global';
import { library } from './library';
import { manuscript } from './manuscript';
import { monitoring } from './monitoring';
import { planning } from './planning';
import { project } from './project';
import { research } from './research';
import { settings } from './settings';

export { ACCOUNT_ID, id, projects as projectIds } from './ids';

export const demoFixtures: Fixtures = {
  ...settings, ...global, ...library, ...project, ...planning, ...research, ...manuscript, ...monitoring,
};
