// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Dialogs of the file tree (PID-00115 S03, H9): one path dialog for new file, new folder and rename/move, checked
// at the field before anything is sent (EC08, EC09) and showing the server's field errors (400); a delete
// confirmation saying the delete is soft (EC11). Both list the \input/\include lines that point at the file (EC10).

import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState, isApiError, type ApiError } from '../../../shell';
import { asApiError, referenceTarget, type FileReference } from '../model';
import { Dialog } from '../ui';

export function ReferenceList({ references }: { references: readonly FileReference[] }) {
  return (
    <ul className="ms-fp-refs">
      {references.map((reference) => (
        <li key={`${reference.path}:${reference.line}:${reference.target}`}>
          <span className="sires-id">
            {reference.path}:{reference.line}
          </span>{' '}
          <code className="ms-fp-refs__code">
            \{reference.command}
            {'{'}
            {reference.target}
            {'}'}
          </code>
          {referenceTarget(reference) !== reference.target && <span className="sires-visually-hidden"> ({referenceTarget(reference)})</span>}
        </li>
      ))}
    </ul>
  );
}

export interface PathDialogProps {
  title: string;
  label: string;
  initial: string;
  submitLabel: string;
  /** Problem of a typed path, as a sentence; undefined when it may be sent. */
  validate: (path: string) => string | undefined;
  onSubmit: (path: string) => Promise<void>;
  onClose: () => void;
  hint?: ReactNode;
  /** Shown under the field for the typed path, e.g. the lines that point at the old name. */
  extra?: (path: string) => ReactNode;
}

/** Field errors of a 400 from commitManuscriptChanges (`changes[0].path`, `changes[0].newPath`). */
function fieldError(error: ApiError): string | undefined {
  if (!isApiError(error) || error.status !== 400) return undefined;
  const field = error.problem?.errors?.find((item) => /path/i.test(item.field ?? ''));
  return field ? field.message ?? field.code ?? error.code : undefined;
}

export function PathDialog({ title, label, initial, submitLabel, validate, onSubmit, onClose, hint, extra }: PathDialogProps) {
  const { t } = useTranslation('manuscript');
  const id = useId();
  const [path, setPath] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  const [failure, setFailure] = useState<ApiError | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    const problem = validate(path.trim());
    setError(problem);
    setFailure(undefined);
    if (problem) return;
    setBusy(true);
    try {
      await onSubmit(path.trim());
    } catch (caught) {
      const apiError = asApiError(caught);
      const field = fieldError(apiError);
      if (field) setError(t('files.error.server', { message: field }));
      else setFailure(apiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={title} onClose={onClose}>
      <form
        className="ms-fp-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="sires-field">
          <label htmlFor={`${id}-path`} className="ms-fp-form__label">
            {label}
          </label>
          <input
            id={`${id}-path`}
            className="sires-input sires-id"
            value={path}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={[error ? `${id}-error` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined}
            onChange={(event) => {
              setPath(event.target.value);
              if (error) setError(undefined);
            }}
          />
          {error && (
            <p id={`${id}-error`} className="ms-fp-form__error" role="alert">
              {error} {t('files.error.notSaved')}
            </p>
          )}
          {hint && (
            <p id={`${id}-hint`} className="ms-fp-form__hint">
              {hint}
            </p>
          )}
        </div>
        {extra?.(path.trim())}
        {failure && <ErrorState error={failure} ns="manuscript" notSaved={t('files.error.notSaved')} />}
        <div className="ms-dialog__actions">
          <button type="button" className="sires-button" data-variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="sires-button" data-variant="outline" disabled={busy}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export interface DeleteDialogProps {
  title: string;
  body: ReactNode;
  references: readonly FileReference[];
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function DeleteDialog({ title, body, references, onConfirm, onClose }: DeleteDialogProps) {
  const { t } = useTranslation('manuscript');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | undefined>();
  const confirm = async () => {
    setBusy(true);
    setFailure(undefined);
    try {
      await onConfirm();
    } catch (caught) {
      setFailure(asApiError(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={title} onClose={onClose} alert>
      <p className="ms-dialog__body">{body}</p>
      {references.length > 0 && (
        <div className="ms-fp-warn">
          <p className="ms-dialog__body">{t('files.refs.beforeDelete')}</p>
          <ReferenceList references={references} />
        </div>
      )}
      {failure && <ErrorState error={failure} ns="manuscript" notSaved={t('files.error.notSaved')} />}
      <div className="ms-dialog__actions">
        <button type="button" className="sires-button" data-variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button type="button" className="sires-button" data-variant="danger" disabled={busy} onClick={() => void confirm()}>
          {t('files.delete.confirm')}
        </button>
      </div>
    </Dialog>
  );
}
