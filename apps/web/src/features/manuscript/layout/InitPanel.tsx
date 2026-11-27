// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Init block (PID-00115 S02, MS-INIT-001, H5): Default or Blank with what each gives, nothing preselected, the
// primary button enabled once chosen; 409 (created in another tab) reloads quietly (EC02).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState, type ApiError } from '../../../shell';
import { asApiError, type Manuscript } from '../model';
import { useManuscript } from '../state';
import { Banner } from '../ui';

export function InitPanel() {
  const { t } = useTranslation('manuscript');
  const { init, archived } = useManuscript();
  const [mode, setMode] = useState<Manuscript['initMode'] | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | undefined>();

  const submit = async () => {
    if (!mode || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await init(mode);
    } catch (caught) {
      setError(asApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ms-init">
      <header className="ms-init__head">
        <h1 className="ms-init__title">{t('title')}</h1>
        <p className="ms-init__lead">{t('init.lead')}</p>
      </header>
      {archived ? (
        <Banner tone="info" title={t('archived.title')}>
          {t('init.archived')}
        </Banner>
      ) : (
        <form
          className="ms-init__form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <fieldset className="ms-init__choices">
            <legend className="ms-init__legend">{t('init.choose')}</legend>
            {(['Default', 'Blank'] as const).map((value) => (
              <label key={value} className="ms-init__choice" data-checked={mode === value ? '' : undefined}>
                <input type="radio" name="initMode" value={value} checked={mode === value} onChange={() => setMode(value)} />
                <span className="ms-init__choice-text">
                  <strong>{t(`init.${value}.title`)}</strong>
                  <span>{t(`init.${value}.gives`)}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="ms-init__note">{t('init.note')}</p>
          {error && <ErrorState error={error} ns="manuscript" notSaved={t('init.notCreated')} onRetry={() => void submit()} />}
          <div className="ms-init__actions">
            <button type="submit" className="sires-button" data-variant="primary" disabled={!mode || busy} aria-describedby={!mode ? 'ms-init-why' : undefined}>
              {busy ? t('init.creating') : t('init.submit')}
            </button>
            {!mode && (
              <span id="ms-init-why" className="ms-muted">
                {t('init.chooseFirst')}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
