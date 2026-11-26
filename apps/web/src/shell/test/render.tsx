// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Render the real shell (routes, services, providers) on a memory router with the fetch stub. renderShell mounts the
// areas' real screens (the areas' own tests use it); renderShellFrame mounts the neutral areas, so the shell's own
// tests never depend on a screen an area builds (PC-05 P37).

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { expect } from 'vitest';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import type { Feature } from '../feature';
import { features as areaFeatures } from '../features';
import { ShellProvider } from '../hooks';
import { createRoutes } from '../routes';
import { createShellServices, type BrowserNavigator } from '../services';
import type { DraftStorage } from '../drafts/store';
import { neutralFeatures } from './features';
import { shellStub, type FetchStub } from './stub';

export interface RenderShellOptions {
  path?: string;
  stub?: FetchStub;
  /** Feature areas mounted before the others (e.g. a test screen with an input). */
  features?: Feature[];
  /** The areas behind `features`: the real ones by default; renderShellFrame passes neutralFeatures. */
  areas?: readonly Feature[];
  storage?: DraftStorage;
}

export function testBrowser(): BrowserNavigator & { forms: Array<{ action: string; fields: Record<string, string> }>; assigned: string[] } {
  const forms: Array<{ action: string; fields: Record<string, string> }> = [];
  const assigned: string[] = [];
  return {
    forms,
    assigned,
    submitForm: (action, fields) => forms.push({ action, fields }),
    assign: (url) => assigned.push(url),
  };
}

export function renderShell(options: RenderShellOptions = {}) {
  const stub = options.stub ?? shellStub();
  const browser = testBrowser();
  const services = createShellServices({ fetch: stub.fetch, browser, i18n: i18next, storage: options.storage, sseRetryDelays: [10] });
  const { features: extra = [], areas = areaFeatures } = options;
  const routes: RouteObject[] = createRoutes([...extra, ...areas]);
  const router = createMemoryRouter(routes, { initialEntries: [options.path ?? '/dashboard'] });
  const detach = services.attachRouter(router as never);
  const user = userEvent.setup();
  const view = render(
    <ShellProvider services={services}>
      <RouterProvider router={router} />
    </ShellProvider>,
  );
  return {
    ...view,
    stub,
    services,
    router,
    browser,
    user,
    detach,
    unmountAll() {
      services.events.close();
      detach();
      view.unmount();
    },
  };
}

/**
 * The shell on the neutral areas (test/features.tsx): every area path shows the shell's Placeholder, no Assistant
 * content, no area API call. For the shell's own tests.
 */
export function renderShellFrame(options: Omit<RenderShellOptions, 'areas'> = {}) {
  return renderShell({ ...options, areas: neutralFeatures });
}

/** Wait until the frame shows the routed screen (session checked). */
export async function waitForFrame(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.queryByText(/Đang kiểm phiên|Checking your session/)).toBeNull();
  });
}

export function TestScreen({ children }: { children: ReactNode }) {
  return <section>{children}</section>;
}
