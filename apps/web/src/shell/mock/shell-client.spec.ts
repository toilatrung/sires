// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00013 S02 with the shell's client (PID-00012 S04), in the jsdom environment UI tests of the areas use: the
// typed API client reads the demo session and account from the mock (EC08) and sends CSRF on writes.

import { describe, expect, it } from 'vitest';
import type { PublicApi } from '@sires/contracts';
import { ApiClient } from '../api/client';
import { ACCOUNT_ID, CSRF_TOKEN } from './index';
import { mockFetch, useMockServer } from './node';

describe('client API của shell trên mock (S02, EC08)', () => {
  const mock = useMockServer();

  it('phiên mẫu qua client của shell', async () => {
    const api = new ApiClient({ fetch: mockFetch });
    const session = await api.get('/auth/session');
    expect(session.data).toMatchObject({ accountId: ACCOUNT_ID, csrfToken: CSRF_TOKEN });
    const me = await api.get('/me');
    expect(me.data.preferences?.uiLanguage).toBe('vi');
    expect(me.data.profile.displayName).toBe('Nguyễn Thị Minh Anh');

    let sentToken: string | null = null;
    mock.use({ overrides: { updatePreferences: ({ request, generated }) => {
      sentToken = request.headers.get('X-CSRF-Token');
      return { status: 200, body: generated(200) };
    } } });
    api.setCsrfProvider(async () => CSRF_TOKEN);
    // merge-patch with only the changed field, as shell/preferences.ts sends it.
    const body = { uiLanguage: 'en' } as PublicApi.components['schemas']['Preferences'];
    await api.patch('/me/preferences', { body, contentType: 'application/merge-patch+json', ifMatch: '"4"' });
    expect(sentToken).toBe(CSRF_TOKEN);
  });
});
