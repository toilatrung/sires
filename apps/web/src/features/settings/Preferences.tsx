// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// S4 Preferences (PID-00036 S07; H12, H15, H16): interface language, default agent language, debug mode and the
// verification thresholds, one save button for the view. Three thresholds as in the contract (no Conflicting row).
// The contract on this branch has no default values, so the group shows one “đã chỉnh” mark from isDefault and no
// default column until it does (H16); the web never hard-codes defaults.

import type { PublicApi } from '@sires/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState, changeLanguage, formatDate, formatNumber, isApiError, useApi, type ApiError } from '../../shell';
import { Dialog, NS, SettingsLayout, Switch, fieldErrors, mergePatch, parseDecimal, useResource } from './shared';

type Schemas = PublicApi.components['schemas'];
type Account = Schemas['Account'];
type Thresholds = Schemas['VerificationThresholds'];
type Language = Schemas['Language'];

const DEBUG_RETENTION_DAYS = 30;

type ThresholdKey = 'supported' | 'partiallySupported' | 'mismatch';
const THRESHOLDS: ThresholdKey[] = ['supported', 'partiallySupported', 'mismatch'];

type ThresholdShape = { claimSupport?: { supported?: number; partiallySupported?: number }; citationMismatch?: { mismatch?: number } };

function thresholdValue(t: ThresholdShape | undefined, key: ThresholdKey): number | undefined {
  return key === 'mismatch' ? t?.citationMismatch?.mismatch : t?.claimSupport?.[key];
}

/** Field of a 400 validation_failed (`claimSupport.supported`, …) → threshold key (EC50). */
function thresholdKeyOf(field: string): ThresholdKey | undefined {
  return THRESHOLDS.find((k) => field === k || field.endsWith(`.${k}`));
}

interface Form {
  uiLanguage: Language;
  defaultAgentLanguage: Language;
  debugMode: boolean;
  thresholds: Record<ThresholdKey, string>;
}

function formOf(account: Account, thresholds: Thresholds, format: (n: number) => string): Form {
  return {
    uiLanguage: account.preferences.uiLanguage ?? 'vi',
    defaultAgentLanguage: account.preferences.defaultAgentLanguage ?? 'en',
    debugMode: account.preferences.debugMode ?? false,
    thresholds: Object.fromEntries(THRESHOLDS.map((k) => [k, (() => { const v = thresholdValue(thresholds, k); return v === undefined ? '' : format(v); })()])) as Record<ThresholdKey, string>,
  };
}

/** Thresholds typed in the form, or the keys that are not numbers in 0–1 (EC50). */
export function parseThresholds(values: Record<ThresholdKey, string>): { ok: true; value: Record<ThresholdKey, number> } | { ok: false; invalid: ThresholdKey[] } {
  const parsed = Object.fromEntries(THRESHOLDS.map((k) => [k, parseDecimal(values[k])])) as Record<ThresholdKey, number | undefined>;
  const invalid = THRESHOLDS.filter((k) => parsed[k] === undefined || (parsed[k] as number) < 0 || (parsed[k] as number) > 1);
  return invalid.length ? { ok: false, invalid } : { ok: true, value: parsed as Record<ThresholdKey, number> };
}

/** Date until which full prompts of Agent Runs started today are kept (UX-SETTINGS-004). */
export function debugUntil(now: Date = new Date()): Date {
  return new Date(now.getTime() + DEBUG_RETENTION_DAYS * 86_400_000);
}

export function PreferencesScreen() {
  const { t, i18n } = useTranslation(NS);
  const api = useApi();
  const format = (n: number) => formatNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const thresholdsEtag = async (etag: string | undefined, saved: Thresholds) =>
    etag ?? (await api.get('/me/verification-thresholds').then((r) => r.etag, () => undefined)) ?? `"${saved.updatedAt ?? ''}"`;
  const resource = useResource(async () => {
    const [me, thresholds] = await Promise.all([api.get('/me'), api.get('/me/verification-thresholds')]);
    return {
      account: me.data,
      accountEtag: me.etag ?? `"${me.data.rowVersion}"`,
      thresholds: thresholds.data,
      thresholdsEtag: thresholds.etag ?? `"${thresholds.data.updatedAt ?? ''}"`,
    };
  });
  const [form, setForm] = useState<Form | null>(null);
  const [invalid, setInvalid] = useState<ThresholdKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<{ kind: 'saved' } | { kind: 'reset' } | { kind: 'error'; error: ApiError; saved?: 'preferences' } | null>(null);

  const data = resource.value.state === 'ready' ? resource.value.data : null;
  useEffect(() => {
    if (data && !form) setForm(formOf(data.account, data.thresholds, format));
    // `format` follows the interface language; the form is built once per load, so it is not a dependency.
  }, [data, form]);

  if (!data || !form) {
    return (
      <SettingsLayout title={t('preferences.title')}>
        {resource.value.state === 'error' ? <ErrorState error={resource.value.error as ApiError} ns={NS} onRetry={() => void resource.reload()} /> : <LoadingState what={t('preferences.title')} />}
      </SettingsLayout>
    );
  }

  const base = formOf(data.account, data.thresholds, format);
  const update = (patch: Partial<Form>) => {
    setForm({ ...form, ...patch });
    setResult(null);
  };

  const save = async () => {
    const parsed = parseThresholds(form.thresholds);
    if (!parsed.ok) {
      setInvalid(parsed.invalid);
      return;
    }
    setInvalid([]);
    const prefs: Partial<Schemas['Preferences']> = {};
    if (form.uiLanguage !== base.uiLanguage) prefs.uiLanguage = form.uiLanguage;
    if (form.defaultAgentLanguage !== base.defaultAgentLanguage) prefs.defaultAgentLanguage = form.defaultAgentLanguage;
    if (form.debugMode !== base.debugMode) prefs.debugMode = form.debugMode;
    const thresholdsChanged = THRESHOLDS.some((k) => parsed.value[k] !== thresholdValue(data.thresholds, k));
    if (!Object.keys(prefs).length && !thresholdsChanged) return;
    setBusy(true);
    let prefsSaved = false;
    try {
      if (Object.keys(prefs).length) {
        const res = await api.patch('/me/preferences', { body: mergePatch(prefs), contentType: 'application/merge-patch+json', ifMatch: data.accountEtag });
        resource.setData((d) => ({ ...d, account: res.data, accountEtag: res.etag ?? `"${res.data.rowVersion}"` }));
        prefsSaved = true;
        // The language changes only after it is saved (EC48); the shell does not save it again.
        if (prefs.uiLanguage) await changeLanguage(prefs.uiLanguage, i18n);
      }
      if (thresholdsChanged) {
        const body: Thresholds = {
          claimSupport: { supported: parsed.value.supported, partiallySupported: parsed.value.partiallySupported },
          citationMismatch: { mismatch: parsed.value.mismatch },
          isDefault: data.thresholds.isDefault,
        };
        const res = await api.put('/me/verification-thresholds', { body, ifMatch: data.thresholdsEtag });
        const etag = await thresholdsEtag(res.etag, res.data);
        resource.setData((d) => ({ ...d, thresholds: res.data, thresholdsEtag: etag }));
      }
      setForm(null);
      setResult({ kind: 'saved' });
    } catch (caught) {
      const error = caught as ApiError;
      // 400 on the thresholds: mark the fields the server named (EC50).
      const fields = Object.keys(fieldErrors(error)).map(thresholdKeyOf).filter((k): k is ThresholdKey => !!k);
      if (fields.length) setInvalid(fields);
      if (isApiError(error) && error.status === 412) {
        // Conflict: read again, keep what the user typed, do not resend (H12, EC34).
        try {
          const [me, th] = await Promise.all([api.get('/me'), api.get('/me/verification-thresholds')]);
          resource.setData(() => ({
            account: me.data,
            accountEtag: me.etag ?? `"${me.data.rowVersion}"`,
            thresholds: th.data,
            thresholdsEtag: th.etag ?? `"${th.data.updatedAt ?? ''}"`,
          }));
        } catch {
          // keep the conflict message
        }
      }
      setResult({ kind: 'error', error, saved: prefsSaved ? 'preferences' : undefined });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      const res = await api.post('/me/verification-thresholds/reset');
      const etag = await thresholdsEtag(res.etag, res.data);
      resource.setData((d) => ({ ...d, thresholds: res.data, thresholdsEtag: etag }));
      setForm({ ...form, thresholds: formOf(data.account, res.data, format).thresholds });
      setResetting(false);
      setResult({ kind: 'reset' });
    } catch (caught) {
      setResetting(false);
      setResult({ kind: 'error', error: caught as ApiError });
    } finally {
      setBusy(false);
    }
  };

  // Defaults from the contract (H16): one “đã chỉnh” per row; without them, one for the group (EC52).
  const hasDefaults = THRESHOLDS.some((k) => thresholdValue(data.thresholds.defaults, k) !== undefined);
  const debugLabel = form.debugMode ? t('preferences.debug.on', { date: formatDate(debugUntil().toISOString()) }) : t('common.off');

  return (
    <SettingsLayout title={t('preferences.title')}>
      <section className="sires-settings__panel" aria-label={t('preferences.languageSection')}>
        <fieldset className="sires-settings__radios">
          <legend className="sires-field__label">{t('preferences.uiLanguage')}</legend>
          <div className="sires-settings__segment">
            {(['vi', 'en'] as const).map((lng) => (
              <label key={lng} className="sires-settings__segment-item" data-checked={form.uiLanguage === lng ? '' : undefined}>
                <input type="radio" name="ui-language" value={lng} checked={form.uiLanguage === lng} onChange={() => update({ uiLanguage: lng })} />
                {t(`language.${lng}`)}
              </label>
            ))}
          </div>
          <span className="sires-settings__hint">{t('preferences.uiLanguageHint')}</span>
        </fieldset>
        <label className="sires-field">
          <span className="sires-field__label">{t('preferences.agentLanguage')}</span>
          <select className="sires-input" value={form.defaultAgentLanguage} onChange={(e) => update({ defaultAgentLanguage: e.currentTarget.value as Language })}>
            <option value="en">{t('language.en')}</option>
            <option value="vi">{t('language.vi')}</option>
          </select>
          <span className="sires-settings__hint">{t('preferences.agentLanguageHint')}</span>
        </label>
      </section>
      <section className="sires-settings__panel">
        <Switch checked={form.debugMode} onChange={(next) => update({ debugMode: next })} label={`${t('preferences.debug.label')} · ${debugLabel}`} description={t('preferences.debug.explain')} />
      </section>
      <section className="sires-settings__panel" aria-labelledby="sires-thresholds-title">
        <div className="sires-settings__panel-head">
          <h3 id="sires-thresholds-title" className="sires-settings__panel-title">
            {t('preferences.thresholds.title')}{' '}
            {!hasDefaults && !data.thresholds.isDefault && (
              <span className="sires-chip" data-tone="warning-flag">
                {t('preferences.thresholds.adjusted')}
              </span>
            )}
          </h3>
          <button type="button" className="sires-button" disabled={busy} onClick={() => setResetting(true)}>
            {t('preferences.thresholds.reset')}
          </button>
        </div>
        <p className="sires-settings__hint">{t('preferences.thresholds.lead')}</p>
        <div className="sires-settings__thresholds">
          {THRESHOLDS.map((key) => {
            const fallback = thresholdValue(data.thresholds.defaults, key);
            const adjusted = fallback !== undefined && thresholdValue(data.thresholds, key) !== fallback;
            return (
              <label key={key} className="sires-settings__threshold">
                <span className="sires-settings__threshold-name">
                  <span className="sires-settings__strong">
                    {t(`preferences.thresholds.${key}.name`)}
                    {adjusted && (
                      <>
                        {' '}
                        <span className="sires-chip" data-tone="warning-flag">
                          {t('preferences.thresholds.adjusted')}
                        </span>
                      </>
                    )}
                  </span>
                  <span className="sires-settings__note">{t(`preferences.thresholds.${key}.desc`)}</span>
                </span>
                {fallback !== undefined && <span className="sires-settings__default-value">{t('preferences.thresholds.defaultValue', { value: format(fallback) })}</span>}
                <input
                  className="sires-input sires-id sires-settings__threshold-input"
                  inputMode="decimal"
                  value={form.thresholds[key]}
                  aria-invalid={invalid.includes(key)}
                  aria-describedby={invalid.includes(key) ? `sires-threshold-${key}-error` : undefined}
                  onChange={(e) => update({ thresholds: { ...form.thresholds, [key]: e.currentTarget.value } })}
                />
                {invalid.includes(key) && (
                  <span id={`sires-threshold-${key}-error`} className="sires-settings__field-error">
                    {t('preferences.thresholds.invalid')}
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <p className="sires-settings__hint">{t('preferences.thresholds.applies')}</p>
      </section>
      {result?.kind === 'saved' && (
        <p role="status" className="sires-settings__saved">
          {t('common.saved')}
        </p>
      )}
      {result?.kind === 'reset' && (
        <p role="status" className="sires-settings__saved">
          {t('preferences.thresholds.resetDone')}
        </p>
      )}
      {result?.kind === 'error' && (
        <ErrorState
          error={result.error}
          ns={NS}
          saved={result.saved ? t('preferences.savedPreferences') : undefined}
          notSaved={result.saved ? t('preferences.notSavedThresholds') : t('common.notSaved')}
          next={isApiError(result.error) && result.error.status === 412 ? t('common.conflictNext') : undefined}
        />
      )}
      <div className="sires-settings__buttons">
        <button type="button" className="sires-button" data-variant="primary" disabled={busy} onClick={() => void save()}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
      {resetting && (
        <Dialog
          title={t('preferences.thresholds.dialog.title')}
          onClose={() => setResetting(false)}
          footer={
            <>
              <button type="button" className="sires-button" onClick={() => setResetting(false)}>
                {t('preferences.thresholds.dialog.keep')}
              </button>
              <button type="button" className="sires-button" data-variant="primary" disabled={busy} onClick={() => void reset()}>
                {t('preferences.thresholds.reset')}
              </button>
            </>
          }
        >
          <p>{t('preferences.thresholds.dialog.body')}</p>
        </Dialog>
      )}
    </SettingsLayout>
  );
}
