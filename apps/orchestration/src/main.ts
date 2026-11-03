// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { bootstrapService } from '@sires/platform';
import { AppModule } from './app.module';
import { manifest } from './manifest';

void bootstrapService(AppModule, manifest);
