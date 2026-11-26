// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Library area (PID-00098): Discover, Trusted Library, Reference.

import { mockEnabled, type Feature } from '../../shell';
import { DiscoverScreen } from './Discover';
import { LibraryScreen } from './Library';
import { ReferenceScreen } from './Reference';
import en from './i18n/en.json';
import vi from './i18n/vi.json';
import './library.css';

export const feature: Feature = {
  id: 'library',
  routes: [
    { path: 'discover', element: <DiscoverScreen /> },
    { path: 'library', element: <LibraryScreen /> },
    { path: 'library/:referenceId', element: <ReferenceScreen /> },
  ],
  messages: { vi, en },
  // Loaded only by the dev mock and tests; production builds drop it (PID-00013).
  mocks: mockEnabled ? () => import('./__mocks__') : undefined,
};
