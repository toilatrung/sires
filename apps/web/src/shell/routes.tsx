// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { redirect, type RouteObject } from 'react-router';
import { App, Frameless } from './App';
import { NotFound } from './NotFound';
import type { Feature } from './feature';
import { features as allFeatures } from './features';

/** Routes rendered without TopBar and rail (SignIn.html): only the VI/EN switch (EC17). */
export const FRAMELESS_PATHS: readonly string[] = ['sign-in'];

// URL structure follows PRD 4.3; each feature area owns its routes. / → /dashboard; unknown → “not found” (EC06).
export function createRoutes(features: readonly Feature[] = allFeatures): RouteObject[] {
  const areaRoutes = features.flatMap((f) => f.routes);
  const frameless = areaRoutes.filter((r) => r.path && FRAMELESS_PATHS.includes(r.path));
  const framed = areaRoutes.filter((r) => !(r.path && FRAMELESS_PATHS.includes(r.path)));
  const assistant = features.find((f) => f.assistant)?.assistant;
  return [
    { element: <Frameless />, children: frameless.map((r) => ({ ...r, path: `/${r.path}` })) },
    {
      path: '/',
      element: <App assistant={assistant} />,
      // The redirect runs in the router, before the session gate, so / always lands on /dashboard.
      children: [{ index: true, loader: () => redirect('/dashboard') }, ...framed, { path: '*', element: <NotFound /> }],
    },
  ];
}

export const routes: RouteObject[] = createRoutes();
