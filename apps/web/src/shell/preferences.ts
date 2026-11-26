// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// VI/EN on the TopBar (H2, AC03): apply at once, then PATCH /me/preferences {uiLanguage} with If-Match = ETag of
// the last GET /me and X-CSRF-Token. 412 → GET /me again and resend once (EC26). Any other failure keeps the chosen
// language for this session and reports “not saved” (EC27). Without a session nothing is sent (EC28).

import type { PublicApi } from '@sires/contracts';
import type { i18n } from 'i18next';
import type { ApiClient } from './api/client';
import { ApiError, isApiError } from './api/errors';
import type { Locale } from './feature';
import { changeLanguage } from './locale';
import type { SessionController } from './session/session';

export type LanguageSaveResult = 'saved' | 'session-only' | 'failed';

type Listener = (error: ApiError | undefined) => void;

export class LanguagePreference {
  private errorValue?: ApiError;
  private readonly listeners = new Set<Listener>();
  private chosen = false;
  /** Saves run one after another, so the last click is also the last value written to Preferences. */
  private queue: Promise<unknown> = Promise.resolve();
  private latest = 0;

  constructor(
    private readonly api: ApiClient,
    private readonly session: SessionController,
    private readonly i18nInstance?: i18n,
  ) {}

  /** Last save error, shown under the TopBar until dismissed or the next choice. */
  get error(): ApiError | undefined {
    return this.errorValue;
  }

  /** The user picked a language in this page; Preferences loaded later must not override it. */
  get userChose(): boolean {
    return this.chosen;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dismissError(): void {
    this.setError(undefined);
  }

  private setError(error: ApiError | undefined): void {
    this.errorValue = error;
    for (const listener of [...this.listeners]) listener(error);
  }

  async select(language: Locale): Promise<LanguageSaveResult> {
    this.chosen = true;
    this.setError(undefined);
    await changeLanguage(language, this.i18nInstance);
    if (!this.session.signedIn) return 'session-only';
    const ticket = ++this.latest;
    const run = this.queue.then(() => this.save(language, false));
    this.queue = run.catch(() => undefined);
    try {
      await run;
      return 'saved';
    } catch (error) {
      // A newer choice is already on its way: its own result is what the user needs to see.
      if (ticket === this.latest) this.setError(isApiError(error) ? error : new ApiError('network'));
      return 'failed';
    }
  }

  private async save(language: Locale, retried: boolean): Promise<void> {
    let state = this.session.current;
    if (state.status === 'signed-in' && !state.accountEtag) {
      // No ETag yet (GET /me failed at start-up): read it now; its real error is the one to report.
      await this.session.loadAccount({ throwOnError: true });
      state = this.session.current;
    }
    if (state.status !== 'signed-in' || !state.accountEtag) throw new ApiError('http', { status: 428 });
    try {
      const { data, etag } = await this.api.patch('/me/preferences', {
        // merge-patch (RFC 7396): only the changed field; the generated type marks defaulted fields as required.
        body: { uiLanguage: language } as PublicApi.components['schemas']['Preferences'],
        contentType: 'application/merge-patch+json',
        ifMatch: state.accountEtag,
      });
      this.session.setAccount(data, etag);
    } catch (error) {
      if (!retried && isApiError(error) && error.status === 412) {
        await this.session.loadAccount({ throwOnError: true });
        return this.save(language, true);
      }
      throw error;
    }
  }
}
