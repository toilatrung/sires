// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// S3 Agent Models (PID-00036 S06; H13, H14): default configuration, one row per agent (Analysis Agent A and B),
// the edit panel (Valid connections only, then a model of that connection), capability and same-model warnings,
// and the account's embedding model with the confirmation before re-indexing (UX-SETTINGS-003).

import type { PublicApi } from '@sires/contracts';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, StatusChip, formatTime, isApiError, useApi, type ApiError } from '../../shell';
import { NS, SettingsLayout, useResource } from './shared';

type Schemas = PublicApi.components['schemas'];
type Connection = Schemas['ProviderConnection'];
type Assignment = Schemas['AgentModelAssignment'];
type AgentDefinition = Schemas['AgentDefinition'];
type Embedding = Schemas['EmbeddingSettings'];
type ModelInfo = Schemas['ModelInfo'];
type AgentKey = Schemas['AgentName'] | 'default';
type Instance = Schemas['AgentInstance'];

interface Row {
  agent: AgentKey;
  instance?: Instance;
  label: string;
  role?: string;
}

const isEmbeddingOnly = (m: ModelInfo) => !!m.capabilities?.length && m.capabilities.every((c) => c === 'embedding');
const hasEmbedding = (m: ModelInfo) => !!m.capabilities?.includes('embedding');

/** Models an agent can run: every model except embedding-only ones (EC39). */
export function agentModels(connection: Connection | undefined): ModelInfo[] {
  return (connection?.availableModels ?? []).filter((m) => !isEmbeddingOnly(m));
}

/** Connections and models offered for the embedding model: Valid OpenAI or Gemini, embedding models only (OQ-051). */
export function embeddingChoices(connections: Connection[]): Array<{ connection: Connection; models: ModelInfo[] }> {
  return connections
    .filter((c) => c.testStatus === 'Valid' && (c.provider === 'openai' || c.provider === 'google'))
    .map((connection) => ({ connection, models: (connection.availableModels ?? []).filter(hasEmbedding) }))
    .filter((choice) => choice.models.length > 0);
}

function own(assignments: Assignment[], row: Row): Assignment | undefined {
  return assignments.find((a) => a.agent === row.agent && (row.agent !== 'analysis' || a.instance === row.instance));
}

async function loadAll(api: ReturnType<typeof useApi>) {
  const [agents, assignments, connections, embedding] = await Promise.all([
    api.get('/agents'),
    api.get('/agent-model-assignments'),
    api.get('/provider-connections'),
    api.get('/me/embedding-settings').then(
      (r) => r.data as Embedding,
      (error: unknown) => {
        if (isApiError(error) && error.status === 404) return null;
        throw error;
      },
    ),
  ]);
  return {
    agents: agents.data.items ?? [],
    assignments: assignments.data.items ?? [],
    connections: connections.data.items ?? [],
    embedding,
  };
}

export function AgentsScreen() {
  const { t } = useTranslation(NS);
  const api = useApi();
  const resource = useResource(() => loadAll(api));
  const [editing, setEditing] = useState<Row | null>(null);

  if (resource.value.state !== 'ready') {
    return (
      <SettingsLayout title={t('agents.title')}>
        {resource.value.state === 'loading' ? <LoadingState what={t('agents.title')} /> : <ErrorState error={resource.value.error as ApiError} ns={NS} onRetry={() => void resource.reload()} />}
      </SettingsLayout>
    );
  }
  const { agents, assignments, connections, embedding } = resource.value.data;
  const valid = connections.filter((c) => c.testStatus === 'Valid');
  const byId = (id: string | undefined) => connections.find((c) => c.id === id);
  const fallback = assignments.find((a) => a.agent === 'default');
  const rows: Row[] = agents.flatMap((d: AgentDefinition) =>
    d.instances?.length
      ? d.instances.map((instance) => ({ agent: d.agent, instance, label: t('agents.instanceLabel', { name: d.displayName, instance }), role: d.role }))
      : [{ agent: d.agent, label: d.displayName, role: d.role }],
  );
  const sameModel = assignments.some((a) => a.agent === 'analysis' && a.sameModelWarning);
  const analysisA = assignments.find((a) => a.agent === 'analysis' && a.instance === 'A') ?? fallback;
  const replace = (row: Assignment | null, target: Row) =>
    resource.setData((data) => ({
      ...data,
      assignments: [...data.assignments.filter((a) => !(a.agent === target.agent && (target.agent !== 'analysis' || a.instance === target.instance))), ...(row ? [row] : [])],
    }));

  const configText = (a: Assignment | undefined) => (a ? `${byId(a.providerConnectionId)?.name ?? '—'}` : '—');

  return (
    <SettingsLayout title={t('agents.title')}>
      <p className="sires-settings__lead">
        {t('agents.lead')}{' '}
        <Link to="/settings/providers" className="sires-settings__inline-link">
          {t('agents.manageConnections')}
        </Link>
      </p>
      {!valid.length && (
        <EmptyState
          title={t('agents.noValid.title')}
          reason={t('agents.noValid.reason')}
          action={
            <Link to="/settings/providers" className="sires-button" data-variant="outline">
              {t('agents.manageConnections')}
            </Link>
          }
        />
      )}
      <section className="sires-settings__panel" aria-labelledby="sires-agents-default">
        <h3 id="sires-agents-default" className="sires-settings__panel-title">
          {t('agents.default.title')}
        </h3>
        <p className="sires-settings__hint">{t('agents.default.hint')}</p>
        <div className="sires-settings__default">
          <span>{fallback ? `${configText(fallback)} · ` : ''}</span>
          {fallback ? <span className="sires-id">{fallback.model}</span> : <span>{t('agents.notConfigured')}</span>}
          <button type="button" className="sires-button" disabled={!valid.length} onClick={() => setEditing({ agent: 'default', label: t('agents.default.title') })}>
            {t('agents.edit')}
          </button>
        </div>
        {editing?.agent === 'default' && (
          <AssignmentEditor row={editing} connections={connections} current={fallback} onClose={() => setEditing(null)} onSaved={(a) => replace(a, editing)} onRefreshed={(c) => resource.setData((d) => ({ ...d, connections: d.connections.map((x) => (x.id === c.id ? c : x)) }))} />
        )}
      </section>
      <div className="sires-settings__table-wrap">
        <table className="sires-settings__table">
          <thead>
            <tr>
              <th scope="col">{t('agents.col.agent')}</th>
              <th scope="col">{t('agents.col.connection')}</th>
              <th scope="col">{t('agents.col.model')}</th>
              <th scope="col">{t('agents.col.status')}</th>
              <th scope="col">
                <span className="sires-visually-hidden">{t('agents.col.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const mine = own(assignments, row);
              const shown = mine ?? fallback;
              const connection = byId(shown?.providerConnectionId);
              // Status notes of SettingsAgents: a connection that is not Valid blocks the agent's Tasks; Analysis A and B on
              // one model (ORCH-DELIB-005); capabilities the model does not declare (EC41). None of them blocks saving.
              const notes = [
                ...(shown && connection && connection.testStatus !== 'Valid' ? [t('agents.connectionNotValid', { status: connection.testStatus })] : []),
                ...(row.agent === 'analysis' && mine?.sameModelWarning ? [t('agents.sameModelRow', { other: row.instance === 'A' ? 'B' : 'A' })] : []),
                ...(mine?.capabilityWarnings ?? []).map((w) => t('agents.capabilityMissing', { capability: w.capability })),
              ];
              const key = `${row.agent}-${row.instance ?? ''}`;
              const open = editing !== null && editing.agent === row.agent && editing.instance === row.instance;
              return (
                <Fragment key={key}>
                <tr>
                  <td>
                    <span className="sires-settings__strong">{row.label}</span>
                    {row.role && <span className="sires-settings__note">{row.role}</span>}
                  </td>
                  <td>
                    {configText(shown)}
                    {!mine && shown && <span className="sires-settings__note">{t('agents.usesDefault')}</span>}
                  </td>
                  <td className="sires-id">{shown?.model ?? '—'}</td>
                  <td>
                    {!shown ? (
                      <span className="sires-chip" data-tone="warning-flag">
                        {t('agents.notConfigured')}
                      </span>
                    ) : notes.length ? (
                      notes.map((note) => (
                        <span key={note} className="sires-settings__warning">
                          {note}
                        </span>
                      ))
                    ) : (
                      <span className="sires-muted">{t('agents.ready')}</span>
                    )}
                  </td>
                  <td>
                    <button type="button" className="sires-button" disabled={!valid.length} aria-label={t('agents.editNamed', { name: row.label })} onClick={() => setEditing(row)}>
                      {t('agents.edit')}
                    </button>
                  </td>
                </tr>
                {/* The editor opens right under its row, as on SettingsAgents. */}
                {open && editing && (
                  <tr>
                    <td colSpan={5} className="sires-settings__editor-cell">
                      <AssignmentEditor
                        row={editing}
                        connections={connections}
                        current={own(assignments, editing)}
                        onClose={() => setEditing(null)}
                        onSaved={(a) => replace(a, editing)}
                        onRefreshed={(c) => resource.setData((d) => ({ ...d, connections: d.connections.map((x) => (x.id === c.id ? c : x)) }))}
                        reload={() => void resource.reload()}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {sameModel && analysisA && (
        <div role="note" className="sires-settings__banner" data-tone="warning">
          <strong>{t('agents.sameModel', { model: analysisA.model, name: byId(analysisA.providerConnectionId)?.name ?? '—' })}</strong> {t('agents.sameModelWhy')}
        </div>
      )}
      <EmbeddingRow connections={connections} embedding={embedding} onSaved={(e) => resource.setData((d) => ({ ...d, embedding: e }))} />
    </SettingsLayout>
  );
}

interface EditorProps {
  row: Row;
  connections: Connection[];
  current?: Assignment;
  onClose: () => void;
  onSaved: (assignment: Assignment | null) => void;
  onRefreshed: (connection: Connection) => void;
  reload?: () => void;
}

/** Edit panel: 1. a Valid connection, 2. a model of that connection; manual entry when it lists none (EC38–EC40). */
function AssignmentEditor({ row, connections, current, onClose, onSaved, onRefreshed, reload }: EditorProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.scrollIntoView?.({ block: 'nearest' });
    titleRef.current?.focus();
  }, []);
  const { t } = useTranslation(NS);
  const api = useApi();
  const firstValid = connections.find((c) => c.testStatus === 'Valid');
  const [connectionId, setConnectionId] = useState(current?.providerConnectionId ?? firstValid?.id ?? '');
  const [model, setModel] = useState(current?.model ?? '');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState<'save' | 'clear' | 'refresh' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [modelError, setModelError] = useState(false);
  const connection = connections.find((c) => c.id === connectionId);
  const models = agentModels(connection);
  const manualEntry = !!connection && !models.length;
  const chosen = manualEntry ? manual.trim() : model;
  const instanceQuery = row.agent === 'analysis' && row.instance ? { instance: row.instance } : undefined;

  const save = async () => {
    if (!connection || !chosen) return;
    setBusy('save');
    setError(null);
    setModelError(false);
    try {
      const { data } = await api.put('/agent-model-assignments/{agent}', {
        path: { agent: row.agent },
        query: instanceQuery,
        body: { providerConnectionId: connection.id, model: chosen },
      });
      onSaved(data);
      reload?.();
      onClose();
    } catch (caught) {
      if (isApiError(caught) && caught.code === 'model_not_available') setModelError(true);
      else setError(caught as ApiError);
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    setBusy('clear');
    setError(null);
    try {
      await api.delete('/agent-model-assignments/{agent}', { path: { agent: row.agent }, query: instanceQuery });
      onSaved(null);
      reload?.();
      onClose();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(null);
    }
  };

  const refresh = async () => {
    if (!connection) return;
    setBusy('refresh');
    setError(null);
    try {
      const { data } = await api.post('/provider-connections/{connectionId}/test', { path: { connectionId: connection.id } });
      onRefreshed(data);
      if (data.testStatus !== 'Valid') setError(null);
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="sires-settings__panel sires-settings__editor" aria-labelledby="sires-assignment-title">
      <h3 id="sires-assignment-title" ref={titleRef} tabIndex={-1} className="sires-settings__panel-title">
        {row.label} · {t('agents.editing')}
      </h3>
      <fieldset className="sires-settings__radios">
        <legend className="sires-field__label">{t('agents.step.connection')}</legend>
        {connections.map((c) => (
          <label key={c.id} className="sires-settings__radio" data-disabled={c.testStatus !== 'Valid' ? '' : undefined}>
            <input
              type="radio"
              name="assignment-connection"
              value={c.id}
              checked={connectionId === c.id}
              disabled={c.testStatus !== 'Valid'}
              onChange={() => {
                setConnectionId(c.id);
                setModel('');
              }}
            />
            <span>{c.name}</span>
            <span className="sires-muted">{t(`provider.${c.provider}`)}</span>
            <StatusChip status={c.testStatus} />
          </label>
        ))}
        <Link to="/settings/providers" className="sires-settings__inline-link">
          {t('agents.addConnection')}
        </Link>
      </fieldset>
      {connection && (
        <fieldset className="sires-settings__radios">
          <legend className="sires-field__label">{t('agents.step.model', { name: connection.name })}</legend>
          {connection.testStatus === 'Invalid' && <ProviderProblem connection={connection} />}
          {models.map((m) => (
            <label key={m.id} className="sires-settings__radio">
              <input type="radio" name="assignment-model" value={m.id} checked={model === m.id} onChange={() => setModel(m.id)} />
              <span className="sires-id">{m.id}</span>
              {m.verified === false && <span className="sires-muted">{t('agents.unverified')}</span>}
            </label>
          ))}
          {manualEntry && (
            <label className="sires-field">
              <span className="sires-field__label">
                {t('agents.manualModel')} <span className="sires-muted">· {t('agents.unverified')}</span>
              </span>
              <input className="sires-input sires-id" value={manual} aria-invalid={modelError} aria-describedby={modelError ? 'sires-model-error' : undefined} onChange={(e) => setManual(e.currentTarget.value)} />
              <span className="sires-settings__hint">{t('agents.manualHint')}</span>
            </label>
          )}
          {modelError && (
            <span id="sires-model-error" className="sires-settings__field-error">
              {t('agents.modelNotAvailable')}
            </span>
          )}
          <p className="sires-settings__hint">
            {connection.lastTestedAt ? t('agents.listedAt', { time: formatTime(connection.lastTestedAt) }) : t('agents.notListed')}{' '}
            <button type="button" className="sires-settings__link-button" disabled={busy !== null} onClick={() => void refresh()}>
              {busy === 'refresh' ? t('agents.refreshing') : t('agents.refresh')}
            </button>
          </p>
        </fieldset>
      )}
      {error && <ErrorState error={error} ns={NS} notSaved={t('common.notSaved')} />}
      <div className="sires-settings__buttons">
        <button type="button" className="sires-button" disabled={busy !== null} onClick={onClose}>
          {t('common.cancel')}
        </button>
        {current && row.agent !== 'default' && (
          <button type="button" className="sires-button" disabled={busy !== null} onClick={() => void clear()}>
            {t('agents.useDefault')}
          </button>
        )}
        <button type="button" className="sires-button" data-variant="primary" disabled={busy !== null || !chosen || connection?.testStatus !== 'Valid'} onClick={() => void save()}>
          {busy === 'save' ? t('common.saving') : t('agents.saveForAgent')}
        </button>
      </div>
    </section>
  );
}

function ProviderProblem({ connection }: { connection: Connection }) {
  const { t } = useTranslation(NS);
  const code = connection.lastError?.code;
  return (
    <p role="alert" className="sires-settings__field-error">
      {t(`providerError.${code ?? 'unknown'}`, { defaultValue: t('providerError.unknown') })} <code className="sires-id">{code ?? '—'}</code>{' '}
      <Link to="/settings/providers" className="sires-settings__inline-link">
        {t('agents.fixConnection')}
      </Link>
    </p>
  );
}

/** Embedding model of the account; changing an existing one asks first (UX-SETTINGS-003-AC01, H14). */
function EmbeddingRow({ connections, embedding, onSaved }: { connections: Connection[]; embedding: Embedding | null; onSaved: (e: Embedding) => void }) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const choices = embeddingChoices(connections);
  const [connectionId, setConnectionId] = useState(embedding?.providerConnectionId ?? choices[0]?.connection.id ?? '');
  const [model, setModel] = useState(embedding?.model ?? '');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const choice = choices.find((c) => c.connection.id === connectionId);
  const changed = !!model && (model !== embedding?.model || connectionId !== embedding?.providerConnectionId);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.put('/me/embedding-settings', { body: { providerConnectionId: connectionId, model } });
      onSaved(data);
      setConfirming(false);
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const currentConnection = connections.find((c) => c.id === embedding?.providerConnectionId);

  return (
    <section className="sires-settings__panel" aria-labelledby="sires-embedding-title">
      <h3 id="sires-embedding-title" className="sires-settings__panel-title">
        {t('agents.embedding.title')} <span className="sires-muted">· {t('agents.embedding.scope')}</span>
      </h3>
      <p className="sires-settings__hint">{embedding ? t('agents.embedding.current', { model: embedding.model, name: currentConnection?.name ?? '—' }) : t('agents.embedding.none')}</p>
      {choices.length ? (
        <div className="sires-settings__grid">
          <label className="sires-field">
            <span className="sires-field__label">{t('agents.embedding.connection')}</span>
            <select
              className="sires-input"
              value={connectionId}
              onChange={(e) => {
                setConnectionId(e.currentTarget.value);
                setModel('');
              }}
            >
              {choices.map((c) => (
                <option key={c.connection.id} value={c.connection.id}>
                  {c.connection.name}
                </option>
              ))}
            </select>
          </label>
          <label className="sires-field">
            <span className="sires-field__label">{t('agents.embedding.model')}</span>
            <select className="sires-input sires-id" value={model} onChange={(e) => setModel(e.currentTarget.value)}>
              <option value="">{t('agents.embedding.choose')}</option>
              {(choice?.models ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <p className="sires-settings__hint">{t('agents.embedding.noChoice')}</p>
      )}
      <p className="sires-settings__hint">{t('agents.embedding.hint')}</p>
      {error && !confirming && <ErrorState error={error} ns={NS} notSaved={t('common.notSaved')} />}
      <div className="sires-settings__buttons">
        <button type="button" className="sires-button" data-variant="outline" disabled={!changed || busy} onClick={() => (embedding ? setConfirming(true) : void save())}>
          {embedding ? t('agents.embedding.change') : t('agents.embedding.save')}
        </button>
      </div>
      {confirming && embedding && (
        <ConfirmDialog
          title={t('agents.embedding.dialog.title')}
          confirmLabel={t('agents.embedding.dialog.confirm')}
          cancelLabel={t('agents.embedding.dialog.keep')}
          busy={busy}
          onConfirm={() => void save()}
          onCancel={() => setConfirming(false)}
        >
          <p>{t('agents.embedding.dialog.from', { from: embedding.model, to: model })}</p>
          <p className="sires-settings__strong">
            {embedding.indexedReferenceCount !== undefined ? t('agents.embedding.dialog.countN', { count: embedding.indexedReferenceCount }) : t('agents.embedding.dialog.count')}
          </p>
          <p>{t('agents.embedding.dialog.usage', { name: choice?.connection.name ?? '—' })}</p>
          <p>{t('agents.embedding.dialog.unavailable')}</p>
          {error && <ErrorState error={error} ns={NS} notSaved={t('common.notSaved')} />}
        </ConfirmDialog>
      )}
    </section>
  );
}
