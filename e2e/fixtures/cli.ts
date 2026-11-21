// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { generateFixtures } from './generate.ts';
import { loadFixtures } from './load.ts';

const args = process.argv.slice(2);
const seedIndex = args.indexOf('--seed');
if (args.some((arg, i) => arg !== '--seed' && arg !== '--scale' && !(seedIndex >= 0 && i === seedIndex + 1))) {
  throw new Error('Cách dùng: fixtures:dry-run [--seed giá-trị] [--scale]');
}
if (seedIndex >= 0 && (!args[seedIndex + 1] || args[seedIndex + 1].startsWith('--'))) {
  throw new Error('--seed cần một giá trị.');
}
loadFixtures(generateFixtures(seedIndex >= 0 ? args[seedIndex + 1] : 'PID-00034', args.includes('--scale') ? 'scale' : 'standard'), {
  dryRun: true, write: (line) => process.stdout.write(`${line}\n`),
});
