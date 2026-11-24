#!/usr/bin/env node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Bin of @sires/platform (PID-00158 S04): runs the built command dist/state-machine/cli.js. This file is committed so
// that pnpm can link the bin before the library is built; build the library (pnpm nx run @sires/platform:build) first.

import cli from '../dist/state-machine/cli.js';

process.exitCode = await cli.runCli(process.argv.slice(2));
