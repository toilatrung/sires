// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Sample module for cli.spec.ts (PID-00158 S04): exports the shared golden declarations the way a service module exports
// its machines, plus wrong exports for the error cases.

import { readFileSync } from 'node:fs';

export const stateMachines = JSON.parse(readFileSync(new URL('./golden-machines.json', import.meta.url), 'utf8'));

export const notAList = { machine: 'sample_task', states: ['A', 'B'], transitions: [{ from: 'A', to: 'B' }] };

export const emptyList = [];

export const wrongDeclaration = [{ machine: 'Sample Task', states: ['A', 'B'], transitions: [{ from: 'A', to: 'B' }] }];

export const duplicateNames = [stateMachines[0], stateMachines[0]];
