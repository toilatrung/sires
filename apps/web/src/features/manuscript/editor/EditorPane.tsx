// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Editor pane (PID-00115 S04): tabs of open files, the banners of one file (draft to restore H8, save conflict H7,
// save error EC20, generated references.bib EC12), the LaTeX editor with proposal boxes (H11) and citations (H10),
// an image viewer and “Không xem trước được” for other binary files (EC15).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '../../../shell';
import { useCitations } from '../citations/useCitations';
import { baseName, isGeneratedBib, lineDiff } from '../model';
import { useProposalBlocks } from '../proposals/useProposalBlocks';
import { useManuscript, type Doc } from '../state';
import { Banner, useActorLabel } from '../ui';
import { Editor } from './Editor';

function Tabs() {
  const { t } = useTranslation('manuscript');
  const { tabs, active, docs, openFile, closeTab } = useManuscript();
  if (!tabs.length) return null;
  return (
    <div className="ms-filetabs" role="tablist" aria-label={t('editor.tabs')}>
      {tabs.map((fileId) => {
        const doc = docs[fileId];
        if (!doc) return null;
        const changed = doc.kind === 'text' && doc.status === 'ready' && doc.text !== doc.server;
        return (
          <span key={fileId} className="ms-filetab" data-active={active === fileId ? '' : undefined}>
            <button type="button" role="tab" aria-selected={active === fileId} className="ms-filetab__open sires-id" title={doc.file.path} onClick={() => openFile(fileId)}>
              {baseName(doc.file.path)}
              {changed && (
                <span className="ms-filetab__dirty" aria-label={t('editor.unsavedMark')}>
                  {' •'}
                </span>
              )}
            </button>
            <button type="button" className="ms-filetab__close" aria-label={t('editor.closeTab', { name: baseName(doc.file.path) })} onClick={() => closeTab(fileId)}>
              ×
            </button>
          </span>
        );
      })}
    </div>
  );
}

function ConflictBox({ doc }: { doc: Doc }) {
  const { t } = useTranslation('manuscript');
  const actorLabel = useActorLabel();
  const { keepMine, useServer: takeServer } = useManuscript();
  const [diff, setDiff] = useState(false);
  const conflict = doc.conflict!;
  return (
    <Banner
      tone="warn"
      label={t('conflict.label')}
      title={conflict.gone ? t('conflict.goneTitle', { path: doc.file.path }) : t('conflict.title', { path: doc.file.path })}
      actions={
        <>
          {!conflict.gone && (
            <button type="button" className="sires-button" data-variant="secondary" data-size="sm" aria-expanded={diff} onClick={() => setDiff((open) => !open)}>
              {t('conflict.diff')}
            </button>
          )}
          <button type="button" className="sires-button" data-variant="outline" data-size="sm" onClick={() => keepMine(doc.file.id)}>
            {t('conflict.keepMine')}
          </button>
          {!conflict.gone && (
            <button type="button" className="sires-button" data-variant="secondary" data-size="sm" onClick={() => takeServer(doc.file.id)}>
              {t('conflict.useServer')}
            </button>
          )}
        </>
      }
    >
      <p className="ms-banner__line">
        {conflict.revisionNumber !== undefined
          ? t('conflict.who', { n: conflict.revisionNumber, actor: actorLabel(conflict.actor) })
          : t('conflict.whoUnknown')}{' '}
        {t('conflict.kept')}
      </p>
      {diff && (
        <pre className="ms-diff" aria-label={t('conflict.diffLabel')}>
          {lineDiff(conflict.serverText, doc.text).map((line, index) => (
            <span key={index} className="ms-diff__line" data-kind={line.kind}>
              {line.kind === 'add' ? '+ ' : line.kind === 'del' ? '− ' : '  '}
              {line.text}
              {'\n'}
            </span>
          ))}
        </pre>
      )}
    </Banner>
  );
}

function DocBanners({ doc }: { doc: Doc }) {
  const { t } = useTranslation('manuscript');
  const { restoreDraft, dropDraft, archived } = useManuscript();
  return (
    <>
      {doc.draft && !archived && (
        <Banner
          tone="info"
          label={t('draft.label')}
          title={t('draft.title')}
          actions={
            <>
              <button type="button" className="sires-button" data-variant="outline" data-size="sm" onClick={() => restoreDraft(doc.file.id)}>
                {t('draft.restore')}
              </button>
              <button type="button" className="sires-button" data-variant="secondary" data-size="sm" onClick={() => dropDraft(doc.file.id)}>
                {t('draft.drop')}
              </button>
            </>
          }
        >
          {doc.draft.stale ? t('draft.stale', { path: doc.file.path }) : t('draft.body', { path: doc.file.path })}
        </Banner>
      )}
      {doc.conflict && <ConflictBox doc={doc} />}
      {isGeneratedBib(doc.file.path) && (
        <Banner tone="info" label={t('bib.label')}>
          {t('bib.readOnly')}
        </Banner>
      )}
    </>
  );
}

function TextDoc({ doc }: { doc: Doc }) {
  const { t } = useTranslation('manuscript');
  const { archived, setText, save, cursor } = useManuscript();
  const citations = useCitations();
  const blocks = useProposalBlocks(doc);
  const readOnly = archived || isGeneratedBib(doc.file.path);
  return (
    <>
      {citations.error && (
        <ErrorState
          error={citations.error}
          ns="manuscript"
          title={t('cite.addFailed')}
          notSaved={t('cite.notInserted')}
          actions={
            <button type="button" className="sires-button" data-variant="secondary" data-size="sm" onClick={citations.clearError}>
              {t('common.close')}
            </button>
          }
        />
      )}
      <Editor
        fileId={doc.file.id}
        path={doc.file.path}
        text={doc.text}
        readOnly={readOnly}
        label={t('editor.label', { path: doc.file.path })}
        onChange={(text) => setText(doc.file.id, text)}
        onSave={() => void save()}
        cursor={cursor}
        blocks={blocks}
        citations={doc.file.fileType === 'tex' ? citations.support : undefined}
        citationListLabel={t('cite.listLabel')}
      />
    </>
  );
}

export function EditorPane() {
  const { t } = useTranslation('manuscript');
  const { active, docs, saveError, save, clearSaveError, files, reload } = useManuscript();
  const doc = active ? docs[active] : undefined;

  if (files.status === 'error') return <ErrorState error={files.error} ns="manuscript" onRetry={() => void reload(['files'])} />;

  return (
    <div className="ms-editor-pane">
      <Tabs />
      {saveError && (
        <ErrorState
          error={saveError}
          ns="manuscript"
          title={t('save.failed')}
          notSaved={t('save.kept')}
          onRetry={() => {
            clearSaveError();
            void save();
          }}
          retryLabel={t('save.retry')}
        />
      )}
      {!doc ? (
        <p className="ms-editor-pane__none">{files.status === 'loading' ? <LoadingState rows={0} /> : t('editor.none')}</p>
      ) : doc.status === 'loading' ? (
        <LoadingState what={doc.file.path} rows={0} />
      ) : doc.status === 'error' ? (
        <ErrorState error={doc.error} ns="manuscript" onRetry={() => void reload(['files'])} />
      ) : (
        <>
          <DocBanners doc={doc} />
          {doc.kind === 'text' ? (
            <TextDoc key="text" doc={doc} />
          ) : doc.kind === 'image' ? (
            <figure className="ms-image">
              {doc.imageUrl ? <img src={doc.imageUrl} alt={doc.file.path} /> : <span className="ms-muted">{doc.file.path}</span>}
              <figcaption className="sires-id">{doc.file.path}</figcaption>
            </figure>
          ) : (
            <p className="ms-binary">{t('editor.noPreview', { path: doc.file.path })}</p>
          )}
        </>
      )}
    </div>
  );
}
