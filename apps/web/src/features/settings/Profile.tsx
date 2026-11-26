// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// S1 Profile (PID-00036 S05; H11, H12, H19): target of “Hồ sơ” in the avatar menu. Email is read-only (eTroy), the
// picture is shown only (avatarUrl is read-only in the contract). The context switch is stored in Preferences;
// one save button sends updateProfile, then updatePreferences with the new ETag. Text fields use the shell's draft
// store so an expired session does not lose them (UX-STATE-004).

import type { PublicApi } from '@sires/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState, isApiError, useApi, useDraft, type ApiError } from '../../shell';
import { NS, SettingsLayout, Switch, initials, mergePatch, useResource } from './shared';

type Schemas = PublicApi.components['schemas'];
type Account = Schemas['Account'];
type Profile = Schemas['Profile'];

const LIMITS = { displayName: 200, affiliation: 300, researchField: 300 } as const;

interface Values {
  displayName: string;
  affiliation: string;
  researchField: string;
  scholarUrl: string;
  includeResearchField: boolean;
}

function valuesOf(account: Account): Values {
  return {
    displayName: account.profile.displayName ?? '',
    affiliation: account.profile.affiliation ?? '',
    researchField: account.profile.researchField ?? '',
    scholarUrl: account.profile.googleScholarProfileUrl ?? '',
    includeResearchField: account.preferences.includeResearchFieldInContext ?? false,
  };
}

export function isScholarUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname;
  } catch {
    return false;
  }
}

type Errors = Partial<Record<'displayName' | 'affiliation' | 'researchField' | 'scholarUrl', string>>;

export function validateProfile(v: Values): Errors {
  const errors: Errors = {};
  const name = v.displayName.trim();
  if (!name) errors.displayName = 'required';
  else if (name.length > LIMITS.displayName) errors.displayName = 'too_big';
  if (v.affiliation.trim().length > LIMITS.affiliation) errors.affiliation = 'too_big';
  if (v.researchField.trim().length > LIMITS.researchField) errors.researchField = 'too_big';
  if (!isScholarUrl(v.scholarUrl.trim())) errors.scholarUrl = 'invalid_format';
  return errors;
}

/**
 * merge-patch body with only the changed fields (H11). A cleared Scholar URL is `null` (merge-patch removes it);
 * the contract on this branch types the field as string only (PR #126 adds null), hence the single cast here.
 */
export function profilePatch(base: Values, next: Values): Profile {
  const patch: Record<string, string | null> = {};
  if (next.displayName.trim() !== base.displayName) patch.displayName = next.displayName.trim();
  if (next.affiliation.trim() !== base.affiliation) patch.affiliation = next.affiliation.trim();
  if (next.researchField.trim() !== base.researchField) patch.researchField = next.researchField.trim();
  const url = next.scholarUrl.trim();
  if (url !== base.scholarUrl) patch.googleScholarProfileUrl = url ? url : null;
  return patch as Profile;
}

export function ProfileScreen() {
  const { t } = useTranslation(NS);
  const api = useApi();
  const resource = useResource(async () => {
    const { data, etag } = await api.get('/me');
    return { account: data, etag: etag ?? `"${data.rowVersion}"` };
  });
  const drafts = {
    displayName: useDraft('settings.profile.displayName'),
    affiliation: useDraft('settings.profile.affiliation'),
    researchField: useDraft('settings.profile.researchField'),
    scholarUrl: useDraft('settings.profile.scholarUrl'),
  };
  const [values, setValues] = useState<Values | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'saved' } | { kind: 'error'; error: ApiError; saved?: boolean } | null>(null);

  const base = resource.value.state === 'ready' ? valuesOf(resource.value.data.account) : null;

  // First load: server values, replaced by restored drafts after an expired session (EC36).
  useEffect(() => {
    if (!base || values) return;
    setValues({
      ...base,
      displayName: drafts.displayName.value || base.displayName,
      affiliation: drafts.affiliation.value || base.affiliation,
      researchField: drafts.researchField.value || base.researchField,
      scholarUrl: drafts.scholarUrl.value || base.scholarUrl,
    });
  }, [base, values, drafts.displayName.value, drafts.affiliation.value, drafts.researchField.value, drafts.scholarUrl.value]);

  const set = (field: keyof Values, value: string | boolean) => {
    setValues((old) => (old ? { ...old, [field]: value } : old));
    setResult(null);
    if (field !== 'includeResearchField' && typeof value === 'string') drafts[field].setValue(value);
  };

  const clearDrafts = () => Object.values(drafts).forEach((d) => d.clear());

  const save = async () => {
    if (!values || !base || resource.value.state !== 'ready') return;
    const found = validateProfile(values);
    setErrors(found);
    setResult(null);
    if (Object.keys(found).length) return;
    const patch = profilePatch(base, values);
    const toggleChanged = values.includeResearchField !== base.includeResearchField;
    if (!Object.keys(patch).length && !toggleChanged) return;
    setBusy(true);
    let etag = resource.value.data.etag;
    let account = resource.value.data.account;
    let profileSaved = false;
    try {
      if (Object.keys(patch).length) {
        const res = await api.patch('/me/profile', { body: patch, contentType: 'application/merge-patch+json', ifMatch: etag });
        account = res.data;
        etag = res.etag ?? `"${res.data.rowVersion}"`;
        profileSaved = true;
      }
      if (toggleChanged) {
        const res = await api.patch('/me/preferences', {
          body: mergePatch<Account['preferences']>({ includeResearchFieldInContext: values.includeResearchField }),
          contentType: 'application/merge-patch+json',
          ifMatch: etag,
        });
        account = res.data;
        etag = res.etag ?? `"${res.data.rowVersion}"`;
      }
      resource.setData(() => ({ account, etag }));
      setValues(valuesOf(account));
      clearDrafts();
      setResult({ kind: 'saved' });
    } catch (caught) {
      const error = caught as ApiError;
      if (profileSaved) resource.setData(() => ({ account, etag }));
      // 412: read again, keep what the user typed, do not resend (H12, EC34).
      if (isApiError(error) && error.status === 412) {
        try {
          const fresh = await api.get('/me');
          resource.setData(() => ({ account: fresh.data, etag: fresh.etag ?? `"${fresh.data.rowVersion}"` }));
        } catch {
          // the conflict message below still applies
        }
      }
      setResult({ kind: 'error', error, saved: profileSaved });
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (!base) return;
    setValues(base);
    setErrors({});
    setResult(null);
    clearDrafts();
  };

  if (resource.value.state === 'loading' || (resource.value.state === 'ready' && !values)) {
    return (
      <SettingsLayout title={t('profile.title')}>
        <LoadingState what={t('profile.title')} />
      </SettingsLayout>
    );
  }
  if (resource.value.state === 'error' || !values) {
    return (
      <SettingsLayout title={t('profile.title')}>
        <ErrorState error={resource.value.state === 'error' ? (resource.value.error as ApiError) : undefined} ns={NS} onRetry={() => void resource.reload()} />
      </SettingsLayout>
    );
  }

  const account = resource.value.data.account;
  const errorText = (field: keyof Errors) => errors[field] && <span className="sires-settings__field-error">{t(`profile.error.${field}.${errors[field]}`)}</span>;

  return (
    <SettingsLayout title={t('profile.title')}>
      <section className="sires-settings__panel" aria-label={t('profile.section')}>
        <div className="sires-settings__avatar-row">
          {account.profile.avatarUrl ? (
            <img className="sires-settings__avatar" src={account.profile.avatarUrl} alt={t('profile.avatarAlt')} width={64} height={64} />
          ) : (
            <span className="sires-settings__avatar" aria-hidden="true">
              {initials(values.displayName || account.profile.displayName || '')}
            </span>
          )}
        </div>
        <div className="sires-settings__grid">
          <label className="sires-field">
            <span className="sires-field__label">{t('profile.displayName')}</span>
            <input className="sires-input" value={values.displayName} aria-invalid={!!errors.displayName} onChange={(e) => set('displayName', e.currentTarget.value)} />
            {errorText('displayName')}
            <span className="sires-settings__hint">{t('profile.displayNameHint')}</span>
          </label>
          <label className="sires-field">
            <span className="sires-field__label">{t('profile.email')}</span>
            <input className="sires-input sires-settings__readonly" value={account.profile.email ?? ''} readOnly />
            <span className="sires-settings__hint">{t('profile.emailHint')}</span>
          </label>
          <label className="sires-field">
            <span className="sires-field__label">{t('profile.affiliation')}</span>
            <input className="sires-input" value={values.affiliation} aria-invalid={!!errors.affiliation} onChange={(e) => set('affiliation', e.currentTarget.value)} />
            {errorText('affiliation')}
          </label>
          <label className="sires-field">
            <span className="sires-field__label">{t('profile.researchField')}</span>
            <input className="sires-input" value={values.researchField} aria-invalid={!!errors.researchField} onChange={(e) => set('researchField', e.currentTarget.value)} />
            {errorText('researchField')}
          </label>
        </div>
        <label className="sires-field">
          <span className="sires-field__label">{t('profile.scholar')}</span>
          <input
            className="sires-input sires-id"
            value={values.scholarUrl}
            inputMode="url"
            aria-invalid={!!errors.scholarUrl}
            aria-describedby={errors.scholarUrl ? 'sires-scholar-error' : undefined}
            onChange={(e) => set('scholarUrl', e.currentTarget.value)}
          />
          {errors.scholarUrl && (
            <span id="sires-scholar-error" className="sires-settings__field-error">
              {t('profile.error.scholarUrl.invalid_format')}
            </span>
          )}
          <span className="sires-settings__hint">{t('profile.scholarHint')}</span>
        </label>
      </section>
      <section className="sires-settings__panel">
        <Switch
          checked={values.includeResearchField}
          onChange={(next) => set('includeResearchField', next)}
          label={`${t('profile.context')} · ${values.includeResearchField ? t('common.on') : t('common.off')}`}
          description={t('profile.contextHint')}
        />
      </section>
      {result?.kind === 'saved' && (
        <p role="status" className="sires-settings__saved">
          {t('common.saved')}
        </p>
      )}
      {result?.kind === 'error' && (
        <ErrorState
          error={result.error}
          ns={NS}
          saved={result.saved ? t('profile.savedProfile') : undefined}
          notSaved={result.saved ? t('profile.notSavedToggle') : t('common.notSaved')}
          next={isApiError(result.error) && result.error.status === 412 ? t('common.conflictNext') : undefined}
        />
      )}
      <div className="sires-settings__buttons">
        <button type="button" className="sires-button" data-variant="primary" disabled={busy} onClick={() => void save()}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
        <button type="button" className="sires-button" disabled={busy} onClick={cancel}>
          {t('common.cancel')}
        </button>
      </div>
      <p className="sires-settings__hint">{t('profile.noPassword')}</p>
    </SettingsLayout>
  );
}
