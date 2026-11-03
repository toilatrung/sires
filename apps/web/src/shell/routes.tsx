// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Navigate, type RouteObject } from 'react-router';
import { App } from './App';
import { features } from './features';

// URL structure follows PRD 4; each feature area owns its routes.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [{ index: true, element: <Navigate to="/dashboard" replace /> }, ...features.flatMap((f) => f.routes)],
  },
];
