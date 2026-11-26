// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// S2 Provider Connections (PID-00036 S03, S04; H5–H9). “Kiểm tra kết nối” creates the connection the first time
// (Untested), or saves changed fields, then tests it; the result shows in the form. “Lưu” closes the form once the
// test is Valid. A Valid proxy (custom base URL) counts like any connection (D-KEY). The key lives only in the form
// state until the create or update returns, and is never shown again: only ••••••••keyHint (H7).

import type { PublicApi } from '@sires/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState, StatusChip, formatDateTime, isApiError, useApi, type ApiError } from '../../shell';
import { Dialog, NS, SettingsLayout, etagOf, fieldErrors, useResource } from './shared';

type Schemas = PublicApi.components['schemas'];
type Connection = Schemas['ProviderConnection'];
type ProviderName = Schemas['ProviderName'];
type ProviderErrorCode = Schemas['ProviderErrorCode'];

export const PROVIDERS: ProviderName[] = ['anthropic', 'openai', 'google'];

/** Official endpoints prefilled per provider (AGENT-PROVIDER-002). */
export const OFFICIAL_BASE_URL: Record<ProviderName, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com',
};

/** One action per error code of a failed test (H6). */
type FixAction = 'fixKey' | 'fixUrl' | 'retest';
const ACTION_FOR: Partial<Record<ProviderErrorCode, FixAction>> = {
  auth_failed: 'fixKey',
  permission_denied: 'fixKey',
  model_not_found: 'fixUrl',
  invalid_response: 'fixUrl',
};
export function fixActionFor(code: ProviderErrorCode | undefined): FixAction {
  return (code && ACTION_FOR[code]) ?? 'retest';
}

const MIN_KEY = 8;
const MAX_NAME = 100;

export function maskedKey(keyHint: string): string {
  return `••••••••${keyHint}`;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function ProvidersScreen() {
  const { t } = useTranslation(NS);
  const api = useApi();
  const resource = useResource(async () => (await api.get('/provider-connections')).data.items ?? []);
  const [form, setForm] = useState<{ mode: 'create'; first: boolean } | { mode: 'edit'; id: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [rowError, setRowError] = useState<ApiError | null>(null);

  const connections = resource.value.state === 'ready' ? resource.value.data : [];
  const empty = resource.value.state === 'ready' && connections.length === 0;

  // No connection yet: the form for the first one opens by itself (UX-SETTINGS-002, EC13).
  useEffect(() => {
    if (empty) setForm((old) => old ?? { mode: 'create', first: true });
  }, [empty]);

  const upsert = (row: Connection) =>
    resource.setData((rows) => (rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? { ...row, assignedAgents: row.assignedAgents ?? r.assignedAgents } : r)) : [...rows, row]));

  const retest = async (row: Connection) => {
    setTesting(row.id);
    setRowError(null);
    try {
      const { data } = await api.post('/provider-connections/{connectionId}/test', { path: { connectionId: row.id } });
      upsert(data);
    } catch (error) {
      setRowError(error as ApiError);
    } finally {
      setTesting(null);
    }
  };

  const deleting = connections.find((c) => c.id === deletingId);

  return (
    <SettingsLayout
      title={t('providers.title')}
      actions={
        <button type="button" className="sires-button" data-variant="outline" onClick={() => setForm({ mode: 'create', first: connections.length === 0 })}>
          {t('providers.add')}
        </button>
      }
    >
      <p className="sires-settings__lead">{t('providers.lead')}</p>
      {resource.value.state === 'loading' && <LoadingState what={t('providers.title')} />}
      {resource.value.state === 'error' && <ErrorState error={resource.value.error as ApiError} ns={NS} onRetry={() => void resource.reload()} />}
      {empty && (
        <div className="sires-settings__empty">
          <p className="sires-settings__empty-title">{t('providers.empty.title')}</p>
          <p className="sires-settings__empty-reason">{t('providers.empty.reason')}</p>
        </div>
      )}
      {rowError && <ErrorState error={rowError} ns={NS} notSaved={t('providers.retestNotSaved')} />}
      {connections.length > 0 && (
        <div className="sires-settings__table-wrap">
          <table className="sires-settings__table">
            <thead>
              <tr>
                <th scope="col">{t('providers.col.name')}</th>
                <th scope="col">{t('providers.col.provider')}</th>
                <th scope="col">{t('providers.col.baseUrl')}</th>
                <th scope="col">{t('providers.col.key')}</th>
                <th scope="col">{t('providers.col.test')}</th>
                <th scope="col">{t('providers.col.agents')}</th>
                <th scope="col">{t('providers.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((row) => (
                <tr key={row.id}>
                  <td className="sires-settings__strong">{row.name}</td>
                  <td>{t(`provider.${row.provider}`)}</td>
                  <td className="sires-id sires-settings__url">{row.baseUrl}</td>
                  <td className="sires-id sires-settings__nowrap">{maskedKey(row.keyHint)}</td>
                  <td>
                    <StatusChip status={row.testStatus} />
                    <span className="sires-settings__note">
                      {testing === row.id
                        ? t('providers.testing')
                        : row.testStatus === 'Invalid' && row.lastError?.code
                          ? <code className="sires-id">{row.lastError.code}</code>
                          : row.testStatus === 'Valid' && !row.availableModels?.length
                            ? t('providers.noModelList')
                            : row.lastTestedAt
                              ? t('providers.testedAt', { time: formatDateTime(row.lastTestedAt) })
                              : t('providers.notTested')}
                    </span>
                  </td>
                  <td className="sires-muted">{agentList(row, t)}</td>
                  <td>
                    <div className="sires-settings__actions">
                      <button type="button" className="sires-button" aria-label={t('providers.editNamed', { name: row.name })} onClick={() => setForm({ mode: 'edit', id: row.id })}>
                        {t('providers.edit')}
                      </button>
                      <button type="button" className="sires-button" aria-label={t('providers.retestNamed', { name: row.name })} disabled={testing === row.id} onClick={() => void retest(row)}>
                        {t('providers.retest')}
                      </button>
                      <button type="button" className="sires-button" data-variant="danger" aria-label={t('providers.deleteNamed', { name: row.name })} onClick={() => setDeletingId(row.id)}>
                        {t('providers.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && resource.value.state === 'ready' && (
        <ProviderForm
          key={form.mode === 'edit' ? form.id : 'create'}
          connection={form.mode === 'edit' ? connections.find((c) => c.id === form.id) : undefined}
          firstConnection={form.mode === 'create' && form.first}
          onChanged={upsert}
          onClose={() => setForm(null)}
          canClose={!empty}
        />
      )}
      {deleting && (
        <DeleteDialog
          connection={deleting}
          connections={connections}
          onClose={() => setDeletingId(null)}
          onDeleted={() => {
            setDeletingId(null);
            void resource.reload();
          }}
          onConflict={() => void resource.reload()}
          onAdd={() => {
            setDeletingId(null);
            setForm({ mode: 'create', first: false });
          }}
        />
      )}
    </SettingsLayout>
  );
}

function agentList(row: Connection, t: (key: string) => string): string {
  const agents = row.assignedAgents ?? [];
  if (!agents.length) return '—';
  return [...new Set(agents)].map((a) => t(`agent.${a}`)).join(', ');
}

interface FormProps {
  connection?: Connection;
  firstConnection: boolean;
  onChanged: (row: Connection) => void;
  onClose: () => void;
  canClose: boolean;
}

function ProviderForm({ connection, firstConnection, onChanged, onClose, canClose }: FormProps) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const editing = !!connection;
  const [name, setName] = useState(connection?.name ?? '');
  const [provider, setProvider] = useState<ProviderName>(connection?.provider ?? 'anthropic');
  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl ?? OFFICIAL_BASE_URL.anthropic);
  const [apiKey, setApiKey] = useState('');
  const [ack, setAck] = useState(false);
  const [saved, setSaved] = useState<Connection | undefined>(connection);
  const [result, setResult] = useState<Connection | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const keyRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // The form opens under the table: move focus (and the view) to its first field.
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const changeProvider = (next: ProviderName) => {
    // Keep a base URL the user typed; replace an untouched official endpoint (EC14).
    if (!baseUrl.trim() || baseUrl === OFFICIAL_BASE_URL[provider]) setBaseUrl(OFFICIAL_BASE_URL[next]);
    setProvider(next);
  };

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    const trimmed = name.trim();
    if (!trimmed) errors.name = 'required';
    else if (trimmed.length > MAX_NAME) errors.name = 'too_big';
    if (!isHttpsUrl(baseUrl.trim())) errors.baseUrl = 'invalid_format';
    if (!saved && apiKey.length < MIN_KEY) errors.apiKey = apiKey ? 'too_small' : 'required';
    if (saved && apiKey && apiKey.length < MIN_KEY) errors.apiKey = 'too_small';
    return errors;
  };

  const test = async () => {
    const errors = validate();
    setFields(errors);
    setError(null);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      let row = saved;
      if (!row) {
        const { data } = await api.post('/provider-connections', { body: { name: name.trim(), provider, baseUrl: baseUrl.trim(), apiKey } });
        row = data;
        setApiKey('');
      } else {
        const body: Schemas['ProviderConnectionUpdate'] = {};
        if (name.trim() !== row.name) body.name = name.trim();
        if (baseUrl.trim() !== row.baseUrl) body.baseUrl = baseUrl.trim();
        if (apiKey) body.apiKey = apiKey;
        if (Object.keys(body).length) {
          const { data } = await api.patch('/provider-connections/{connectionId}', {
            path: { connectionId: row.id },
            body,
            contentType: 'application/merge-patch+json',
            ifMatch: etagOf(row),
          });
          row = data;
          setApiKey('');
        }
      }
      setSaved(row);
      onChanged(row);
      const { data } = await api.post('/provider-connections/{connectionId}/test', { path: { connectionId: row.id } });
      setSaved(data);
      setResult(data);
      onChanged(data);
    } catch (caught) {
      if (isApiError(caught) && caught.code === 'duplicate_name') setFields({ name: 'duplicate_name' });
      else if (isApiError(caught) && caught.code === 'validation_failed') setFields(fieldErrors(caught));
      else setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const fix = (action: FixAction) => {
    if (action === 'fixKey') keyRef.current?.focus();
    else if (action === 'fixUrl') urlRef.current?.focus();
    else void test();
  };

  const valid = result?.testStatus === 'Valid';
  const status = result?.testStatus ?? saved?.testStatus ?? 'Untested';
  const ackMissing = firstConnection && !editing && !ack;
  const heading = editing ? t('providers.form.editTitle', { name: connection?.name }) : t('providers.form.newTitle');

  return (
    <section className="sires-settings__panel" aria-labelledby="sires-provider-form-title">
      <h3 id="sires-provider-form-title" className="sires-settings__panel-title">
        {heading} · <StatusChip status={status} />
      </h3>
      <div className="sires-settings__grid">
        <label className="sires-field">
          <span className="sires-field__label">{t('providers.form.name')}</span>
          <input ref={nameRef} className="sires-input" value={name} maxLength={MAX_NAME + 1} aria-invalid={!!fields.name} aria-describedby={fields.name ? 'sires-provider-name-error' : undefined} onChange={(e) => setName(e.currentTarget.value)} />
          {fields.name && <span id="sires-provider-name-error" className="sires-settings__field-error">{t(`providers.form.nameError.${fields.name}`, { defaultValue: t('field.invalid') })}</span>}
        </label>
        <label className="sires-field">
          <span className="sires-field__label">{t('providers.form.provider')}</span>
          <select className="sires-input" value={provider} disabled={!!saved} onChange={(e) => changeProvider(e.currentTarget.value as ProviderName)}>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {t(`provider.${p}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="sires-field">
        <span className="sires-field__label">{t('providers.form.baseUrl')}</span>
        <input ref={urlRef} className="sires-input sires-id" value={baseUrl} inputMode="url" aria-invalid={!!fields.baseUrl} aria-describedby={fields.baseUrl ? 'sires-provider-url-error' : undefined} onChange={(e) => setBaseUrl(e.currentTarget.value)} />
        {fields.baseUrl && <span id="sires-provider-url-error" className="sires-settings__field-error">{t('providers.form.baseUrlError')}</span>}
        <span className="sires-settings__hint">{t('providers.form.baseUrlHint')}</span>
      </label>
      <label className="sires-field">
        <span className="sires-field__label">{t('providers.form.key')}</span>
        <input
          ref={keyRef}
          className="sires-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          aria-invalid={!!fields.apiKey}
          aria-describedby={fields.apiKey ? 'sires-provider-key-error' : undefined}
          placeholder={saved ? maskedKey(saved.keyHint) : undefined}
          onChange={(e) => setApiKey(e.currentTarget.value)}
        />
        {fields.apiKey && <span id="sires-provider-key-error" className="sires-settings__field-error">{t(`providers.form.keyError.${fields.apiKey}`, { defaultValue: t('field.invalid') })}</span>}
        <span className="sires-settings__hint">{saved ? t('providers.form.keyKeep') : t('providers.form.keyHint')}</span>
      </label>
      {firstConnection && !editing && (
        <div role="note" className="sires-settings__notice">
          <p>{t('providers.privacy.text')}</p>
          <label className="sires-settings__check">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.currentTarget.checked)} />
            {t('providers.privacy.ack')}
          </label>
        </div>
      )}
      {result && <TestResult connection={result} onFix={fix} />}
      {busy && (
        <p role="status" className="sires-settings__hint">
          {t('providers.form.testingStatus')}
        </p>
      )}
      {error && <ErrorState error={error} ns={NS} notSaved={saved ? undefined : t('providers.form.notCreated')} />}
      <div className="sires-settings__buttons">
        <button type="button" className="sires-button" data-variant="primary" disabled={busy || ackMissing} onClick={() => void test()}>
          {busy ? t('providers.form.testing') : t('providers.form.test')}
        </button>
        <button type="button" className="sires-button" data-variant="outline" disabled={!valid || busy} onClick={onClose}>
          {t('providers.form.save')}
        </button>
        {canClose && (
          <button type="button" className="sires-button" disabled={busy} onClick={onClose}>
            {t('providers.form.close')}
          </button>
        )}
        <span className="sires-settings__hint">{ackMissing ? t('providers.privacy.needAck') : t('providers.form.saveHint')}</span>
      </div>
    </section>
  );
}

function TestResult({ connection, onFix }: { connection: Connection; onFix: (action: FixAction) => void }) {
  const { t } = useTranslation(NS);
  if (connection.testStatus === 'Valid') {
    const count = connection.availableModels?.length ?? 0;
    return (
      <div role="status" className="sires-settings__result" data-tone="ok">
        <StatusChip status="Valid" /> {count ? t('providers.result.valid', { count }) : t('providers.result.noModels')}
      </div>
    );
  }
  const code = connection.lastError?.code;
  const action = fixActionFor(code);
  const reminder = code === 'rate_limited' || code === 'quota_exceeded' ? 'quota' : action === 'fixUrl' ? 'compatible' : undefined;
  return (
    <div role="alert" className="sires-settings__result" data-tone="error">
      <span>
        <StatusChip status="Invalid" /> {t(`providerError.${code ?? 'unknown'}`, { defaultValue: t('providerError.unknown') })} {t('providers.result.impact')}
        {reminder && <> {t(`providers.result.${reminder}`)}</>}
      </span>
      <span className="sires-settings__note">
        {t('providers.result.code')} <code className="sires-id">{code ?? '—'}</code>
      </span>
      <button type="button" className="sires-button" data-variant="outline" onClick={() => onFix(action)}>
        {t(`providers.fix.${action}`)}
      </button>
    </div>
  );
}

interface DeleteProps {
  connection: Connection;
  connections: Connection[];
  onClose: () => void;
  onDeleted: () => void;
  onConflict: () => void;
  onAdd: () => void;
}

/** Delete with a replacement when the connection is assigned to agents (AGENT-PROVIDER-002-AC03, H9). */
function DeleteDialog({ connection, connections, onClose, onDeleted, onConflict, onAdd }: DeleteProps) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const [replacement, setReplacement] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const assigned = [...new Set(connection.assignedAgents ?? [])];
  const others = connections.filter((c) => c.id !== connection.id);
  const validOthers = others.filter((c) => c.testStatus === 'Valid');
  const needsReplacement = assigned.length > 0;
  const blocked = needsReplacement && (!replacement || !validOthers.length);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.delete('/provider-connections/{connectionId}', {
        path: { connectionId: connection.id },
        query: needsReplacement ? { replacementConnectionId: replacement } : undefined,
      });
      onDeleted();
    } catch (caught) {
      if (isApiError(caught) && caught.code === 'connection_in_use') onConflict();
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t('providers.deleteDialog.title', { name: connection.name })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sires-button" onClick={onClose}>
            {t('providers.deleteDialog.keep')}
          </button>
          <button type="button" className="sires-button" data-variant="danger" disabled={blocked || busy} onClick={() => void confirm()}>
            {blocked ? t('providers.deleteDialog.confirmChoose') : t('providers.deleteDialog.confirm')}
          </button>
        </>
      }
    >
      {needsReplacement ? (
        <>
          <p>{t('providers.deleteDialog.inUse', { count: assigned.length, agents: assigned.map((a) => t(`agent.${a}`)).join(', ') })}</p>
          {validOthers.length ? (
            <fieldset className="sires-settings__radios">
              <legend className="sires-field__label">{t('providers.deleteDialog.replacement')}</legend>
              {others.map((c) => (
                <label key={c.id} className="sires-settings__radio" data-disabled={c.testStatus !== 'Valid' ? '' : undefined}>
                  <input type="radio" name="replacement" value={c.id} checked={replacement === c.id} disabled={c.testStatus !== 'Valid'} onChange={() => setReplacement(c.id)} />
                  {c.name} <span className="sires-muted">· {c.testStatus}</span>
                  {c.testStatus !== 'Valid' && <span className="sires-muted"> — {t('providers.deleteDialog.notSelectable')}</span>}
                </label>
              ))}
            </fieldset>
          ) : (
            <p>
              {t('providers.deleteDialog.noValid')}{' '}
              <button type="button" className="sires-settings__link-button" onClick={onAdd}>
                {t('providers.add')}
              </button>
            </p>
          )}
          {blocked && validOthers.length > 0 && <p className="sires-settings__hint">{t('providers.deleteDialog.chooseFirst')}</p>}
        </>
      ) : (
        <p>{t('providers.deleteDialog.free')}</p>
      )}
      {error && <ErrorState error={error} ns={NS} notSaved={t('providers.deleteDialog.notDeleted')} />}
    </Dialog>
  );
}
