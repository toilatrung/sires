// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Content of a diagram version (S06, H10; Artifacts figure): preview of that same version (getDiagramPreview, shown
// as an image from a blob — the SVG never enters the DOM), the Mermaid source, the check status read from
// ArtifactVersion.validation, the source editor (validateDiagramSource, save as a new Draft version) and the request
// to the Diagram Agent. The source is the master copy (DIAG-SOURCE-001).

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState, useApi, useDraft, useShell, type ApiError } from '../../shell';
import { useLoad, useSingleFlight, toApiError, type Schemas } from './data';
import { Dialog } from './Dialog';
import { problemDetail } from './labels';

type Version = Schemas['ArtifactVersion'];
type Artifact = Schemas['Artifact'];
type Workflow = Schemas['Workflow'];

const enc = encodeURIComponent;

/** Object URL of an SVG blob, revoked on unmount; undefined when the browser cannot make one. */
function objectUrl(blob: Blob): string | undefined {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : undefined;
}

/**
 * GET …/versions/{versionId}/preview?format=svg as a blob. The shell's client reads JSON only, so this one binary GET
 * uses fetch on the same origin with the session cookie (implement.md).
 */
function usePreview(projectId: string, artifactId: string, versionId: string, enabled: boolean) {
  const api = useApi();
  const [state, setState] = useState<{ url?: string; failed?: boolean; loading: boolean }>({ loading: enabled });
  useEffect(() => {
    if (!enabled) {
      setState({ loading: false });
      return undefined;
    }
    let alive = true;
    let url: string | undefined;
    setState({ loading: true });
    const href = new URL(api.url(`/projects/${enc(projectId)}/artifacts/${enc(artifactId)}/versions/${enc(versionId)}/preview`, { format: 'svg' }), window.location.href);
    fetch(href.toString(), { credentials: 'same-origin', headers: { Accept: 'image/svg+xml' } })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (!alive) return;
        url = objectUrl(blob);
        setState(url ? { url, loading: false } : { failed: true, loading: false });
      })
      .catch(() => {
        if (alive) setState({ failed: true, loading: false });
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [api, projectId, artifactId, versionId, enabled]);
  return state;
}

/** Check status text of the figure caption (“Draft · Mermaid · cú pháp hợp lệ”); not a chip (H2). */
export function validationText(t: (key: string) => string, validation: Version['validation']): string {
  if (!validation) return t('diagram.validation.none');
  return t(`diagram.validation.${validation.status}`);
}

function ValidationErrors({ title, errors }: { title: string; errors: NonNullable<Version['validation']>['errors'] }) {
  const { t } = useTranslation('research');
  return (
    <div role="alert" className="sires-error">
      <strong className="sires-error__title">{title}</strong>
      <ul className="research-errorlist">
        {(errors ?? []).map((error, index) => (
          <li key={index}>{error.line !== undefined ? `${t('diagram.line', { line: error.line })}: ` : ''}{error.message}</li>
        ))}
      </ul>
    </div>
  );
}

export function RequestDiagramDialog({ projectId, artifact, onStarted, onCancel }: { projectId: string; artifact: Artifact; onStarted: (workflow: Workflow) => void; onCancel: () => void }) {
  const { t } = useTranslation('research');
  const api = useApi();
  const { idempotency } = useShell();
  const instruction = useDraft('diagram.instruction');
  const [diagramType, setDiagramType] = useState('');
  const [empty, setEmpty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | undefined>();
  const types = useLoad(() => api.get('/diagram-types').then((result) => result.data.items ?? []), [api]);
  const once = useSingleFlight();

  const submit = async () => {
    const description = instruction.value.trim();
    if (!description) {
      setEmpty(true);
      return;
    }
    setEmpty(false);
    await once(async () => {
      setBusy(true);
      setFailure(undefined);
      try {
        const { data } = await idempotency.run(`requestDiagram:${artifact.id}`, (key) => api.post('/projects/{projectId}/diagrams', {
          path: { projectId },
          body: { description, revisesArtifactId: artifact.id, ...(artifact.taskId ? { taskId: artifact.taskId } : {}), ...(diagramType ? { diagramType } : {}) },
          idempotencyKey: key,
        }));
        instruction.clear();
        onStarted(data);
      } catch (error) {
        setFailure(toApiError(error));
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <Dialog
      title={t('diagram.requestTitle')}
      cancelLabel={t('diagram.requestCancel')}
      onCancel={onCancel}
      confirm={{ label: t('diagram.requestConfirm'), onConfirm: () => void submit(), busy }}
    >
      <p>{t('diagram.requestIntro')}</p>
      <label className="sires-field">
        <span className="sires-field__label">{t('diagram.instruction')}</span>
        <textarea
          className="sires-input"
          rows={4}
          value={instruction.value}
          aria-invalid={empty || undefined}
          aria-describedby={empty ? 'research-instruction-error' : undefined}
          onChange={(event) => instruction.setValue(event.currentTarget.value)}
        />
      </label>
      {empty && <p id="research-instruction-error" className="research-field-error">{t('diagram.instructionEmpty')}</p>}
      {/* listDiagramTypes failed: no type field, the request still goes out (EC36). */}
      {types.data && (
        <label className="sires-field">
          <span className="sires-field__label">{t('diagram.type')}</span>
          <select className="research-select" value={diagramType} onChange={(event) => setDiagramType(event.currentTarget.value)}>
            <option value="">{t('diagram.keepType')}</option>
            {types.data.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </label>
      )}
      {failure && (
        <ErrorState error={failure} ns="research" title={failure.code === 'active_workflow_exists' ? t('diagram.requestRunning') : t('diagram.requestRefused')} description={problemDetail(failure)} />
      )}
    </Dialog>
  );
}

export interface DiagramContentProps {
  projectId: string;
  artifact: Artifact;
  version: Version;
  /** A new Draft version was saved from the editor. */
  onSaved?: (versionId: string) => void;
  /** 409 on save: reload the versions, keep the editor. */
  onConflict?: () => void;
  onRequest?: () => void;
  requestDisabled?: boolean;
}

/** Preview, source and check status of one version; also the compare column (no editor there). */
export function DiagramFigure({ projectId, artifactId, version }: { projectId: string; artifactId: string; version: Version }) {
  const { t } = useTranslation('research');
  const validation = version.validation;
  // Errors never show a preview as if valid (DIAG-VALIDATE-001-AC01); without validation the version is “chưa kiểm tra”.
  const showPreview = !validation || validation.status === 'valid';
  const preview = usePreview(projectId, artifactId, version.id, showPreview);
  const caption = `${version.status} · Mermaid · ${validationText(t, validation)}`;
  return (
    <figure className="research-figure" data-status={version.status}>
      <figcaption className="research-figure__caption">{caption}</figcaption>
      {validation && validation.status !== 'valid' && (
        <ValidationErrors title={validation.status === 'render_error' ? t('diagram.renderErrorTitle') : t('diagram.syntaxErrorTitle')} errors={validation.errors} />
      )}
      {!validation && <p role="note" className="research-warning">{t('diagram.notCheckedNote')}</p>}
      {showPreview && (
        <div className="research-preview">
          {preview.url && <img src={preview.url} alt={t('diagram.previewAlt', { version: version.versionNumber })} />}
          {preview.failed && <p className="research-meta">{t('diagram.previewFailed')}</p>}
          {preview.loading && <p role="status" className="research-meta">{t('diagram.previewLoading')}</p>}
        </div>
      )}
      <pre className="research-source" aria-label={t('diagram.sourceLabel', { version: version.versionNumber })}>{version.content ?? ''}</pre>
    </figure>
  );
}

export function DiagramContent({ projectId, artifact, version, onSaved, onConflict, onRequest, requestDisabled }: DiagramContentProps) {
  const { t } = useTranslation('research');
  const api = useApi();
  const { idempotency } = useShell();
  const source = useDraft('diagram.source');
  const [editing, setEditing] = useState(() => source.value !== '');
  const [check, setCheck] = useState<{ state: 'idle' | 'checking' | 'valid' | 'invalid' | 'failed'; errors?: NonNullable<Version['validation']>['errors']; url?: string; error?: ApiError }>({ state: 'idle' });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | undefined>();
  const once = useSingleFlight();

  useEffect(() => () => {
    if (check.url) URL.revokeObjectURL(check.url);
  }, [check.url]);

  const startEditing = () => {
    if (!source.value) source.setValue(version.content ?? '');
    setEditing(true);
  };
  const runCheck = async () => {
    setCheck({ state: 'checking' });
    try {
      const { data } = await api.post('/projects/{projectId}/diagrams/validate', { path: { projectId }, body: { source: source.value } });
      if (data.valid) {
        const url = data.previewSvg ? objectUrl(new Blob([data.previewSvg], { type: 'image/svg+xml' })) : undefined;
        setCheck({ state: 'valid', url });
      } else {
        setCheck({ state: 'invalid', errors: (data.errors ?? []).map((error) => ({ ...error, message: error.message ?? '' })) });
      }
    } catch (error) {
      setCheck({ state: 'failed', error: toApiError(error) });
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    await once(async () => {
      setBusy(true);
      setSaveError(undefined);
      try {
        const { data } = await idempotency.run(`createArtifactVersion:${version.id}`, (key) => api.post('/projects/{projectId}/artifacts/{artifactId}/versions', {
          path: { projectId, artifactId: artifact.id }, body: { basedOnVersionId: version.id, content: source.value }, idempotencyKey: key,
        }));
        source.clear();
        setEditing(false);
        setCheck({ state: 'idle' });
        onSaved?.(data.id);
      } catch (error) {
        const failure = toApiError(error);
        setSaveError(failure);
        // 409: reload the versions, the editor keeps its content (EC35).
        if (failure.status === 409) onConflict?.();
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <div className="research-stack">
      <DiagramFigure projectId={projectId} artifactId={artifact.id} version={version} />
      {!editing && (
        <div className="research-actions">
          <button type="button" className="sires-button" data-size="sm" onClick={startEditing}>{t('diagram.edit')}</button>
          <button type="button" className="sires-button" data-size="sm" disabled={requestDisabled} onClick={onRequest}>{t('diagram.request')}</button>
        </div>
      )}
      {editing && (
        <form className="research-editor" onSubmit={(event) => void save(event)} aria-label={t('diagram.editorLabel')}>
          <div className="research-editor__columns">
            <label className="sires-field research-editor__source">
              <span className="sires-field__label">{t('diagram.sourceField', { version: version.versionNumber })}</span>
              <textarea className="sires-input research-code" rows={10} spellCheck={false} value={source.value} onChange={(event) => { source.setValue(event.currentTarget.value); setCheck({ state: 'idle' }); }} />
            </label>
            <div className="research-editor__result" aria-live="polite">
              {check.state === 'idle' && <p className="research-meta">{t('diagram.checkHint')}</p>}
              {check.state === 'checking' && <p role="status" className="research-meta">{t('diagram.checking')}</p>}
              {check.state === 'valid' && (
                <>
                  <p className="research-meta">{t('diagram.validation.valid')}</p>
                  {check.url && <img src={check.url} alt={t('diagram.editorPreviewAlt')} />}
                </>
              )}
              {check.state === 'invalid' && <ValidationErrors title={t('diagram.syntaxErrorTitle')} errors={check.errors} />}
              {check.state === 'failed' && (
                <ErrorState error={check.error} ns="research" title={t('diagram.notChecked')} onRetry={() => void runCheck()} />
              )}
            </div>
          </div>
          {check.state === 'invalid' && <p className="research-warning">{t('diagram.saveWithErrors')}</p>}
          {saveError && <ErrorState error={saveError} ns="research" title={t('diagram.saveRefused')} description={problemDetail(saveError)} next={saveError.status === 409 ? t('diagram.saveKept') : undefined} />}
          <div className="research-actions">
            <button type="button" className="sires-button" data-size="sm" disabled={check.state === 'checking'} onClick={() => void runCheck()}>{t('diagram.check')}</button>
            <button type="submit" className="sires-button" data-size="sm" disabled={busy}>{t('diagram.saveAsVersion')}</button>
            <button type="button" className="research-textbutton" onClick={() => { source.clear(); setEditing(false); setCheck({ state: 'idle' }); setSaveError(undefined); }}>
              {t('diagram.cancelEdit')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
