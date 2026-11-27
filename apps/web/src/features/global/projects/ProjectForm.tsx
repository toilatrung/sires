// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// “Tạo project” form (PID-00037 S03, H5; PROJ-CRUD-001): name and research question required, short description
// optional, no manuscript template (PRD 7.2, 12.1). One Idempotency-Key per opened form, reused on retry (EC07).

import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicApi } from '@sires/contracts';
import { ErrorState, isApiError, useApi, useShell, type ApiError } from '../../../shell';

type Project = PublicApi.components['schemas']['ResearchProject'];

export const NAME_MAX = 200;
export const DESCRIPTION_MAX = 1000;

export interface ProjectFormProps {
  /** Names of Active projects already loaded, for the duplicate warning (EC08). */
  activeNames: readonly string[];
  onCreated: (project: Project) => void;
  onCancel: () => void;
}

interface FieldErrors {
  name?: string;
  question?: string;
  description?: string;
}

const normalize = (value: string) => value.trim().toLocaleLowerCase();

export function ProjectForm({ activeNames, onCreated, onCancel }: ProjectFormProps) {
  const { t } = useTranslation('global');
  const api = useApi();
  const { idempotency } = useShell();
  const ids = { name: useId(), question: useId(), description: useId() };
  const operation = useRef(`createProject:${globalThis.crypto.randomUUID()}`);
  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiError>();
  const [sending, setSending] = useState(false);

  const duplicate = useMemo(() => {
    const value = normalize(name);
    return value !== '' && activeNames.some((other) => normalize(other) === value);
  }, [activeNames, name]);

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = t('form.required');
    else if (name.trim().length > NAME_MAX) next.name = t('form.tooLong', { max: NAME_MAX });
    if (!question.trim()) next.question = t('form.required');
    if (description.trim().length > DESCRIPTION_MAX) next.description = t('form.tooLong', { max: DESCRIPTION_MAX });
    return next;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    setSending(true);
    setFailure(undefined);
    try {
      const body = {
        name: name.trim(),
        ...(description.trim() ? { shortDescription: description.trim() } : {}),
        context: { researchQuestion: question.trim() },
      };
      const result = await idempotency.run(operation.current, (key) => api.post('/projects', { body, idempotencyKey: key }));
      onCreated(result.data);
    } catch (error) {
      if (isApiError(error)) {
        const fields = error.problem?.errors ?? [];
        if (fields.length) {
          setErrors({
            ...(fields.some((f) => f.field === 'name') ? { name: t('form.required') } : {}),
            ...(fields.some((f) => f.field?.startsWith('context')) ? { question: t('form.required') } : {}),
          });
        }
        setFailure(error);
      } else {
        throw error;
      }
    } finally {
      setSending(false);
    }
  };

  const describedBy = (id: string, ...parts: Array<string | false | undefined>) => parts.filter(Boolean).map((p) => `${id}-${p}`).join(' ') || undefined;

  return (
    <form className="g-form" onSubmit={submit} noValidate aria-labelledby={`${ids.name}-title`}>
      <h2 id={`${ids.name}-title`} className="g-panel-title">
        {t('form.createTitle')}
      </h2>
      <div className="g-field">
        <label htmlFor={ids.name}>{t('form.name')}</label>
        <input
          id={ids.name}
          className="g-input"
          value={name}
          maxLength={NAME_MAX + 50}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describedBy(ids.name, errors.name && 'error', duplicate && 'warn')}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        {errors.name && (
          <span id={`${ids.name}-error`} className="g-field__error">
            {errors.name} {t('form.notSaved')}
          </span>
        )}
        {duplicate && !errors.name && (
          <span id={`${ids.name}-warn`} className="g-field__warn">
            {t('form.duplicate')}
          </span>
        )}
      </div>
      <div className="g-field">
        <label htmlFor={ids.question}>{t('form.question')}</label>
        <textarea
          id={ids.question}
          className="g-textarea"
          rows={4}
          value={question}
          aria-invalid={errors.question ? true : undefined}
          aria-describedby={describedBy(ids.question, errors.question && 'error')}
          onChange={(event) => setQuestion(event.currentTarget.value)}
        />
        {errors.question && (
          <span id={`${ids.question}-error`} className="g-field__error">
            {errors.question} {t('form.notSaved')}
          </span>
        )}
      </div>
      <div className="g-field">
        <label htmlFor={ids.description}>{t('form.description')}</label>
        <textarea
          id={ids.description}
          className="g-textarea"
          rows={3}
          value={description}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={describedBy(ids.description, errors.description ? 'error' : 'hint')}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
        {errors.description ? (
          <span id={`${ids.description}-error`} className="g-field__error">
            {errors.description} {t('form.notSaved')}
          </span>
        ) : (
          <span id={`${ids.description}-hint`} className="g-field__hint">
            {t('form.optional')}
          </span>
        )}
      </div>
      <p className="g-note">{t('form.afterCreate')}</p>
      {failure && (
        <ErrorState
          error={failure}
          ns="global"
          notSaved={t('form.notCreated')}
          next={t('form.retryHint')}
        />
      )}
      <div className="g-actions">
        <button type="submit" className="sires-button" data-variant="primary" disabled={sending}>
          {sending ? t('form.creating') : t('form.createAndOpen')}
        </button>
        <button type="button" className="sires-button" data-variant="secondary" onClick={onCancel}>
          {t('form.cancel')}
        </button>
      </div>
    </form>
  );
}
