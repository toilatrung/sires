// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Dialogs of the project lifecycle (PID-00037 S04): edit with If-Match (H8), archive and soft delete with APR-08
// confirmation and the 409 active_workflow_exists case listing the project's active workflows (H7).

import { useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { PublicApi } from '@sires/contracts';
import { ErrorState, StatusChip, formatDate, isApiError, useApi, useShell, type ApiError } from '../../../shell';
import { Dialog } from '../ui';
import { DESCRIPTION_MAX, NAME_MAX } from './ProjectForm';

type Schemas = PublicApi.components['schemas'];
type Project = Schemas['ResearchProject'];
type Workflow = Schemas['Workflow'];
type Language = Schemas['Language'];

const RESTORE_DAYS = 30;
const ACTIVE_STATES: Schemas['WorkflowStatus'][] = ['Running', 'Waiting for User', 'Paused', 'Interrupted'];

export function EditProjectDialog({ project, onClose, onSaved, onReopen }: { project: Project; onClose: () => void; onSaved: (project: Project) => void; onReopen: () => void }) {
  const { t } = useTranslation('global');
  const api = useApi();
  const ids = { name: useId(), description: useId(), language: useId() };
  const [base, setBase] = useState(project);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.shortDescription ?? '');
  const [language, setLanguage] = useState<Language | ''>(project.agentResponseLanguage ?? '');
  const [error, setError] = useState<ApiError>();
  const [nameError, setNameError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const readOnly = base.status === 'Archived';

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly || saving) return;
    const trimmed = name.trim();
    if (!trimmed) return setNameError(t('form.required'));
    if (trimmed.length > NAME_MAX) return setNameError(t('form.tooLong', { max: NAME_MAX }));
    setNameError(undefined);
    const patch: Schemas['ProjectUpdate'] = {};
    if (trimmed !== base.name) patch.name = trimmed;
    if (description.trim() !== (base.shortDescription ?? '')) patch.shortDescription = description.trim();
    if (language && language !== base.agentResponseLanguage) patch.agentResponseLanguage = language;
    if (!Object.keys(patch).length) return onClose();
    setSaving(true);
    setError(undefined);
    setConflict(false);
    try {
      const result = await api.patch('/projects/{projectId}', {
        path: { projectId: base.id },
        body: patch,
        contentType: 'application/merge-patch+json',
        ifMatch: `"${base.rowVersion}"`,
      });
      onSaved(result.data);
    } catch (failure) {
      if (!isApiError(failure)) throw failure;
      if (failure.status === 412) {
        // EC12: keep what the researcher typed, load the newer version for the next If-Match.
        setConflict(true);
        try {
          const latest = await api.get('/projects', { query: { status: base.status, limit: 200 } });
          const fresh = (latest.data.items as Project[]).find((row) => row.id === base.id);
          if (fresh) setBase(fresh);
        } catch {
          /* the error box below already explains the conflict */
        }
      }
      setError(failure);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title={t('edit.title')} onClose={onClose}>
      <form className="g-form" onSubmit={save} noValidate>
        {readOnly && <p className="g-notice">{t('edit.archivedReadOnly')}</p>}
        <div className="g-field">
          <label htmlFor={ids.name}>{t('form.name')}</label>
          <input
            id={ids.name}
            className="g-input"
            value={name}
            readOnly={readOnly}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${ids.name}-error` : undefined}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          {nameError && (
            <span id={`${ids.name}-error`} className="g-field__error">
              {nameError} {t('form.notSaved')}
            </span>
          )}
        </div>
        <div className="g-field">
          <label htmlFor={ids.description}>{t('form.description')}</label>
          <textarea
            id={ids.description}
            className="g-textarea"
            rows={3}
            maxLength={DESCRIPTION_MAX}
            value={description}
            readOnly={readOnly}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
        </div>
        <div className="g-field">
          <label htmlFor={ids.language}>{t('edit.language')}</label>
          <select
            id={ids.language}
            className="g-select"
            value={language}
            disabled={readOnly}
            onChange={(event) => setLanguage(event.currentTarget.value as Language)}
          >
            {!language && <option value="">{t('edit.languageDefault')}</option>}
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </div>
        {conflict && <p className="g-field__warn">{t('edit.conflict')}</p>}
        {error && <ErrorState error={error} ns="global" notSaved={t('edit.notSaved')} />}
        <div className="g-actions">
          {readOnly ? (
            <button type="button" className="sires-button" data-variant="primary" onClick={onReopen}>
              {t('actions.reopen')}
            </button>
          ) : (
            <button type="submit" className="sires-button" data-variant="primary" disabled={saving}>
              {saving ? t('edit.saving') : t('edit.save')}
            </button>
          )}
          <button type="button" className="sires-button" data-variant="secondary" onClick={onClose}>
            {readOnly ? t('edit.close') : t('form.cancel')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export type LifecycleKind = 'archive' | 'delete';

/** APR-08 confirmation (PROJ-CRUD-003): consequences first; the cancel button names the safe option. */
export function LifecycleDialog({ kind, project, onClose, onDone }: { kind: LifecycleKind; project: Project; onClose: () => void; onDone: (project: Project) => void }) {
  const { t } = useTranslation('global');
  const api = useApi();
  const { idempotency } = useShell();
  const operation = useRef(`${kind}Project:${project.id}:${globalThis.crypto.randomUUID()}`);
  const [error, setError] = useState<ApiError>();
  const [blocking, setBlocking] = useState<Workflow[]>();
  const [sending, setSending] = useState(false);
  const purgeOn = formatDate(new Date(Date.now() + RESTORE_DAYS * 86_400_000));

  const confirm = async () => {
    if (sending) return;
    setSending(true);
    setError(undefined);
    try {
      const result = await idempotency.run(operation.current, (key) =>
        kind === 'archive'
          ? api.post('/projects/{projectId}/archive', { path: { projectId: project.id }, idempotencyKey: key })
          : api.delete('/projects/{projectId}', { path: { projectId: project.id }, idempotencyKey: key }),
      );
      onDone(result.data);
    } catch (failure) {
      if (!isApiError(failure)) throw failure;
      setError(failure);
      if (failure.code === 'active_workflow_exists') {
        try {
          const rows = await api.get('/workflows', { query: { projectId: project.id, status: ACTIVE_STATES, limit: 50 } });
          setBlocking((rows.data.items as Workflow[]).filter((row) => ACTIVE_STATES.includes(row.status)));
        } catch {
          setBlocking([]);
        }
      }
    } finally {
      setSending(false);
    }
  };

  const blocked = error?.code === 'active_workflow_exists';
  return (
    <Dialog alert title={t(`${kind}.title`, { name: project.name })} onClose={onClose}>
      {kind === 'archive' ? (
        <p className="g-dialog__body">{t('archive.consequence')}</p>
      ) : (
        <>
          <p className="g-dialog__body">{t('delete.consequence')}</p>
          <ul className="g-dialog__list">
            <li>{t('delete.data')}</li>
            <li>{t('delete.window', { days: RESTORE_DAYS, date: purgeOn })}</li>
          </ul>
        </>
      )}
      {blocked ? (
        <div role="alert" className="sires-error">
          <strong className="sires-error__title">{t(`${kind}.blocked`)}</strong>
          <span>{t('blocked.next')}</span>
          {blocking && blocking.length > 0 && (
            <ul className="g-dialog__list">
              {blocking.map((workflow) => (
                <li key={workflow.id}>
                  <Link to={`/projects/${project.id}/activity/workflows/${workflow.id}`}>
                    <span className="sires-id">{workflow.type}</span>
                  </Link>{' '}
                  <StatusChip status={workflow.status} entity="workflow" />
                </li>
              ))}
            </ul>
          )}
          <span className="sires-error__footer">
            <Link to={`/projects/${project.id}/activity`}>{t('blocked.openActivity')}</Link>
            <span className="sires-error__code">active_workflow_exists</span>
          </span>
        </div>
      ) : (
        error && <ErrorState error={error} ns="global" notSaved={t('lifecycle.notChanged')} />
      )}
      <div className="g-actions">
        <button type="button" className="sires-button" data-variant="secondary" onClick={onClose}>
          {t('lifecycle.keep')}
        </button>
        {!blocked && (
          <button type="button" className="sires-button" data-variant="danger" disabled={sending} onClick={confirm}>
            {sending ? t('lifecycle.sending') : t(`${kind}.confirm`)}
          </button>
        )}
      </div>
    </Dialog>
  );
}
