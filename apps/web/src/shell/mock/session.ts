// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Shell's own mocks (PID-00013 S02, EC08): a signed-in demo session so the frame of PID-00012 loads without
// eTroy OIDC. Only getSession, getMe and streamEvents belong to the shell; every other operation shell screens
// call is mocked by the area that owns it (EC10, PID-00012 H1, H2).

import { operations } from './generated';
import { account } from './fixtures/settings';
import type { FeatureMocks } from './types';
import { defineMocks } from './runtime';

export const CSRF_TOKEN = 'mock-csrf-token';
const SESSION_HOURS = 12;

export const shellMocks: FeatureMocks = defineMocks({
  operations: { streamEvents: operations.streamEvents },
  overrides: {
    getSession: () => ({
      status: 200,
      body: { accountId: account.id, expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString(), csrfToken: CSRF_TOKEN },
    }),
    getMe: ({ fixtures }) => {
      const me = fixtures.Account?.find((row) => row.id === account.id) ?? account;
      return { status: 200, body: structuredClone(me), headers: { ETag: `"${me.rowVersion}"` } };
    },
  },
});

/** Overrides for tests of the signed-out path: both session reads answer 401 unauthenticated. */
export const signedOutMocks: FeatureMocks = defineMocks({
  overrides: {
    getSession: () => ({ status: 401 }),
    getMe: () => ({ status: 401 }),
  },
});
