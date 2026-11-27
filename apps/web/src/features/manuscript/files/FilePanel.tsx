// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Files and outline pane (PID-00115 S03, H9): folder tree with the open file marked and “đề xuất” on files a
// Proposed Change Proposal touches (files it adds dashed, EC35); new file and folder, rename or move, soft delete,
// upload — each one commit, one revision; references.bib read-only (EC12); a file with unsaved changes cannot be
// renamed or deleted (EC17); the lines still pointing at an old name are listed before and after (EC10). The
// outline follows \input in document order. Archived: no file operation (H20).

import { useMemo, useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState, useApi, useShell, type ApiError } from '../../../shell';
import { asApiError, dataOf, isGeneratedBib, pathProblem, referencesTo, type FileChange, type FileReference, type ManuscriptFile } from '../model';
import { useManuscript } from '../state';
import { Banner } from '../ui';
import { DeleteDialog, PathDialog, ReferenceList } from './dialogs';
import { RowMenu, type RowMenuItem } from './RowMenu';
import { buildTree, filesUnder, type FileNode, type FolderNode } from './tree';
import { isTextUpload, readText, uploadFile } from './upload';
import { useTexIndex } from './useTexIndex';
import './files.css';

type DialogState =
  | { kind: 'newFile'; folder: string }
  | { kind: 'newFolder'; folder: string }
  | { kind: 'rename'; path: string; folder: boolean }
  | { kind: 'delete'; path: string; folder: boolean };

type Notice =
  | { kind: 'moved'; from: string; to: string; references: FileReference[] }
  | { kind: 'deleted'; path: string; references: FileReference[] }
  | { kind: 'uploaded'; path: string };

const dirOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

export function FilePanel() {
  const { t } = useTranslation('manuscript');
  const api = useApi();
  const shell = useShell();
  const ctx = useManuscript();
  const { fileList, files, proposals, active, archived, openFile, commit, isDirty, reload, projectId } = ctx;
  const index = useTexIndex();
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [uploadError, setUploadError] = useState<{ error?: ApiError; message?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const uploadFolder = useRef('');

  const proposed = useMemo(() => (dataOf(proposals) ?? []).filter((proposal) => proposal.status === 'Proposed'), [proposals]);
  const touched = useMemo(() => new Set(proposed.flatMap((proposal) => proposal.diff.filter((entry) => entry.operation !== 'add').map((entry) => entry.path ?? ''))), [proposed]);
  const adds = useMemo(() => proposed.flatMap((proposal) => proposal.diff.filter((entry) => entry.operation === 'add' && entry.path).map((entry) => entry.path!)), [proposed]);
  const tree = useMemo(() => buildTree(fileList, extraFolders, adds), [fileList, extraFolders, adds]);
  const paths = useMemo(() => fileList.map((file) => file.path), [fileList]);

  const problemText = (path: string, existing: readonly string[]) => {
    const problem = pathProblem(path, existing);
    return problem ? t(`files.path.${problem}`) : undefined;
  };
  const refsTo = (path: string, folder: boolean): FileReference[] => {
    const targets = folder ? filesUnder(fileList, path).map((file) => file.path) : [path];
    return targets.flatMap((target) => referencesTo(index.references, target)).filter((reference) => !targets.includes(reference.path));
  };
  const anyDirty = (path: string, folder: boolean) => (folder ? filesUnder(fileList, path).some((file) => isDirty(file.path)) : isDirty(path));

  // ---- Commands (one commit = one revision) ---------------------------------------------------------------------

  const createFile = async (path: string) => {
    const changes: FileChange[] = [{ path, operation: 'add', content: '' }];
    await commit(changes, { retry: (now) => (now.some((file) => file.path === path) ? null : changes) });
    setDialog(null);
    openFile(path);
  };

  const createFolder = (path: string) => {
    setExtraFolders((current) => (current.includes(path) ? current : [...current, path]));
    setCollapsed((current) => {
      const next = new Set(current);
      next.delete(path);
      return next;
    });
    setDialog(null);
  };

  const rename = async (from: string, to: string, folder: boolean) => {
    const references = refsTo(from, folder);
    const moves = folder ? filesUnder(fileList, from).map((file) => ({ from: file.path, to: `${to}${file.path.slice(from.length)}` })) : [{ from, to }];
    if (!moves.length) {
      // A folder that exists only in the browser (EC14).
      setExtraFolders((current) => current.map((path) => (path === from || path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : path)));
      setDialog(null);
      return;
    }
    const changes: FileChange[] = moves.map((move) => ({ path: move.from, operation: 'rename', newPath: move.to }));
    await commit(changes, {
      retry: (now) => (moves.every((move) => now.some((file) => file.path === move.from) && !now.some((file) => file.path === move.to)) ? changes : null),
    });
    setExtraFolders((current) => current.filter((path) => path !== from && !path.startsWith(`${from}/`)));
    setDialog(null);
    setNotice(references.length ? { kind: 'moved', from, to, references } : null);
  };

  const remove = async (path: string, folder: boolean) => {
    const references = refsTo(path, folder);
    const targets = folder ? filesUnder(fileList, path).map((file) => file.path) : [path];
    if (targets.length) {
      const changes: FileChange[] = targets.map((target) => ({ path: target, operation: 'delete' }));
      await commit(changes, { retry: (now) => (targets.every((target) => now.some((file) => file.path === target)) ? changes : null) });
    }
    if (folder) setExtraFolders((current) => current.filter((extra) => extra !== path && !extra.startsWith(`${path}/`)));
    setDialog(null);
    setNotice(references.length ? { kind: 'deleted', path, references } : null);
  };

  const pickUpload = (folder: string) => {
    uploadFolder.current = folder;
    setUploadError(null);
    input.current?.click();
  };

  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    const path = uploadFolder.current ? `${uploadFolder.current}/${chosen.name}` : chosen.name;
    const problem = problemText(path, paths);
    if (problem) {
      setUploadError({ message: `${path}: ${problem}` });
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      // Text goes in FileChange.content; a figure or other binary is uploaded first, then referenced (EC13).
      const change: FileChange = isTextUpload(chosen.name)
        ? { path, operation: 'add', content: await readText(chosen) }
        : { path, operation: 'add', fileUploadId: await uploadFile(api, () => shell.session.csrfToken(), projectId, chosen) };
      await commit([change], { retry: (now) => (now.some((file) => file.path === path) ? null : [change]) });
      setNotice({ kind: 'uploaded', path });
      openFile(path);
    } catch (caught) {
      setUploadError({ error: asApiError(caught) });
    } finally {
      setUploading(false);
    }
  };

  // ---- Rows ---------------------------------------------------------------------------------------------------------

  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const fileMenu = (node: FileNode & { file: ManuscriptFile }) => {
    const dirty = isDirty(node.path);
    const items: RowMenuItem[] = [
      { label: t('files.action.rename'), onSelect: () => setDialog({ kind: 'rename', path: node.path, folder: false }), disabled: dirty },
      { label: t('files.action.delete'), onSelect: () => setDialog({ kind: 'delete', path: node.path, folder: false }), danger: true, disabled: dirty },
    ];
    return <RowMenu label={t('files.actionsFor', { name: node.path })} items={items} note={dirty ? t('files.dirtyReason') : undefined} />;
  };

  const folderMenu = (node: FolderNode) => {
    const dirty = anyDirty(node.path, true);
    const items: RowMenuItem[] = [
      { label: t('files.action.newFileHere'), onSelect: () => setDialog({ kind: 'newFile', folder: node.path }) },
      { label: t('files.action.uploadHere'), onSelect: () => pickUpload(node.path) },
      { label: t('files.action.rename'), onSelect: () => setDialog({ kind: 'rename', path: node.path, folder: true }), disabled: dirty },
      { label: t('files.action.deleteFolder'), onSelect: () => setDialog({ kind: 'delete', path: node.path, folder: true }), danger: true, disabled: dirty },
    ];
    const generated = filesUnder(fileList, node.path).some((file) => isGeneratedBib(file.path));
    const safe = generated ? items.filter((item) => item.label !== t('files.action.rename') && item.label !== t('files.action.deleteFolder')) : items;
    return <RowMenu label={t('files.actionsFor', { name: `${node.path}/` })} items={safe} note={dirty ? t('files.dirtyReason') : generated ? t('files.generatedFolder') : undefined} />;
  };

  const renderFile = (node: FileNode) => {
    if (node.proposedAdd || !node.file) {
      return (
        <li key={`add:${node.path}`} className="ms-fp-row" data-proposed-add="">
          <span className="ms-fp-row__name ms-fp-row__name--ghost sires-id" title={node.path}>
            {node.name}
          </span>
          <span className="ms-fp-tag">{t('files.tag.proposedAdd')}</span>
        </li>
      );
    }
    const file = node.file;
    const generated = isGeneratedBib(file.path);
    const dirty = isDirty(file.path);
    return (
      <li key={file.id} className="ms-fp-row">
        <button type="button" className="ms-fp-row__name sires-id" aria-current={active === file.id ? 'true' : undefined} title={file.path} onClick={() => openFile(file.id)}>
          {node.name}
          {dirty && (
            <span className="ms-fp-row__dirty" aria-label={t('files.unsaved')}>
              {' •'}
            </span>
          )}
        </button>
        {touched.has(file.path) && <span className="ms-fp-tag">{t('files.tag.proposed')}</span>}
        {generated ? <span className="ms-fp-tag" data-tone="muted">{t('files.tag.readOnly')}</span> : !archived && fileMenu({ ...node, file })}
      </li>
    );
  };

  const renderFolder = (node: FolderNode): ReactElement => {
    const open = !collapsed.has(node.path);
    const empty = !node.files.length && !node.folders.length;
    return (
      <li key={`dir:${node.path}`} className="ms-fp-folder">
        <div className="ms-fp-row">
          <button type="button" className="ms-fp-row__name ms-fp-row__folder sires-id" aria-expanded={open} onClick={() => toggle(node.path)}>
            <span aria-hidden="true" className="ms-fp-caret">
              {open ? '▾' : '▸'}
            </span>
            {node.name}/
          </button>
          {!archived && folderMenu(node)}
        </div>
        {open && (
          <ul className="ms-fp-list" role="group" aria-label={`${node.path}/`}>
            {node.files.map(renderFile)}
            {node.folders.map(renderFolder)}
            {empty && <li className="ms-fp-empty">{t('files.emptyFolder')}</li>}
          </ul>
        )}
      </li>
    );
  };

  // ---- Dialog ---------------------------------------------------------------------------------------------------

  let dialogNode: ReactElement | null = null;
  if (dialog?.kind === 'newFile') {
    dialogNode = (
      <PathDialog
        title={t('files.newFile.title')}
        label={t('files.field.path')}
        initial={dialog.folder ? `${dialog.folder}/` : ''}
        submitLabel={t('files.newFile.submit')}
        hint={t('files.newFile.hint')}
        validate={(path) => problemText(path, paths)}
        onSubmit={createFile}
        onClose={() => setDialog(null)}
      />
    );
  } else if (dialog?.kind === 'newFolder') {
    const folders = new Set([...paths.map(dirOf), ...extraFolders]);
    dialogNode = (
      <PathDialog
        title={t('files.newFolder.title')}
        label={t('files.field.folder')}
        initial={dialog.folder ? `${dialog.folder}/` : ''}
        submitLabel={t('files.newFolder.submit')}
        hint={t('files.newFolder.hint')}
        validate={(path) => problemText(path, [...paths, ...folders])}
        onSubmit={async (path) => createFolder(path)}
        onClose={() => setDialog(null)}
      />
    );
  } else if (dialog?.kind === 'rename') {
    const { path: from, folder } = dialog;
    const references = refsTo(from, folder);
    const others = paths.filter((path) => path !== from && !(folder && path.startsWith(`${from}/`)));
    dialogNode = (
      <PathDialog
        title={folder ? t('files.rename.folderTitle', { path: `${from}/` }) : t('files.rename.title', { path: from })}
        label={t('files.field.newPath')}
        initial={from}
        submitLabel={t('files.rename.submit')}
        validate={(path) => {
          if (path === from) return t('files.path.same');
          if (folder && others.some((other) => other.startsWith(`${path}/`))) return t('files.path.duplicate');
          return problemText(path, others);
        }}
        onSubmit={(to) => rename(from, to, folder)}
        onClose={() => setDialog(null)}
        extra={() =>
          references.length > 0 ? (
            <div className="ms-fp-warn">
              <p className="ms-dialog__body">{t('files.refs.beforeRename', { count: references.length })}</p>
              <ReferenceList references={references} />
              <p className="ms-dialog__body">{t('files.refs.buildWarning')}</p>
            </div>
          ) : null
        }
      />
    );
  } else if (dialog?.kind === 'delete') {
    const { path, folder } = dialog;
    const count = folder ? filesUnder(fileList, path).length : 1;
    dialogNode = (
      <DeleteDialog
        title={folder ? t('files.delete.folderTitle', { path: `${path}/`, count }) : t('files.delete.title', { path })}
        body={folder ? t('files.delete.folderBody', { count }) : t('files.delete.body')}
        references={refsTo(path, folder)}
        onConfirm={() => remove(path, folder)}
        onClose={() => setDialog(null)}
      />
    );
  }

  // ---- Render ---------------------------------------------------------------------------------------------------

  if (files.status === 'loading') return <LoadingState what={t('files.heading')} rows={6} />;
  if (files.status === 'error') return <ErrorState error={files.error} ns="manuscript" onRetry={() => void reload(['files'])} />;

  return (
    <div className="ms-fp">
      <div className="ms-fp__head">
        <h2 className="ms-fp__title">{t('files.heading')}</h2>
        {!archived && (
          <div className="ms-fp__actions">
            <button type="button" className="sires-button" data-variant="secondary" data-size="xs" onClick={() => setDialog({ kind: 'newFile', folder: '' })}>
              {t('files.action.newFile')}
            </button>
            <button type="button" className="sires-button" data-variant="secondary" data-size="xs" onClick={() => setDialog({ kind: 'newFolder', folder: '' })}>
              {t('files.action.newFolder')}
            </button>
            <button type="button" className="sires-button" data-variant="secondary" data-size="xs" disabled={uploading} onClick={() => pickUpload('')}>
              {uploading ? t('files.upload.busy') : t('files.action.upload')}
            </button>
          </div>
        )}
      </div>
      <input ref={input} type="file" className="sires-visually-hidden" tabIndex={-1} aria-label={t('files.upload.input')} onChange={(event) => void onUpload(event)} />
      {uploadError && (
        <ErrorState
          error={uploadError.error}
          ns="manuscript"
          title={uploadError.error?.status === 413 ? t('files.upload.tooLargeTitle') : t('files.upload.failed')}
          description={uploadError.error?.status === 413 ? t('files.upload.tooLarge') : uploadError.message}
          notSaved={t('files.upload.noRevision')}
          actions={
            <button type="button" className="sires-button" data-variant="secondary" data-size="sm" onClick={() => setUploadError(null)}>
              {t('common.close')}
            </button>
          }
        />
      )}
      {notice && notice.kind !== 'uploaded' && (
        <Banner
          tone="warn"
          label={t('files.refs.label')}
          title={notice.kind === 'moved' ? t('files.refs.afterRename', { from: notice.from, to: notice.to }) : t('files.refs.afterDelete', { path: notice.path })}
          actions={
            <button type="button" className="sires-button" data-variant="secondary" data-size="sm" onClick={() => setNotice(null)}>
              {t('common.close')}
            </button>
          }
        >
          <p className="ms-banner__line">{t('files.refs.stillPointing')}</p>
          <ul className="ms-fp-refs">
            {notice.references.map((reference) => (
              <li key={`${reference.path}:${reference.line}`}>
                <button type="button" className="ms-fp-link sires-id" onClick={() => openFile(reference.path, { line: reference.line })}>
                  {reference.path}:{reference.line}
                </button>{' '}
                <code className="ms-fp-refs__code">
                  \{reference.command}
                  {'{'}
                  {reference.target}
                  {'}'}
                </code>
              </li>
            ))}
          </ul>
          <p className="ms-banner__line">{t('files.refs.buildWarning')}</p>
        </Banner>
      )}
      {notice?.kind === 'uploaded' && (
        <p className="ms-fp-status" role="status">
          {t('files.upload.done', { path: notice.path })}
        </p>
      )}
      <nav aria-label={t('files.heading')}>
        <ul className="ms-fp-list ms-fp-list--root">
          {tree.files.map(renderFile)}
          {tree.folders.map(renderFolder)}
        </ul>
        {!fileList.length && <p className="ms-fp-empty">{t('files.none')}</p>}
      </nav>
      <section className="ms-fp-outline" aria-label={t('files.outline')}>
        <h2 className="ms-fp__title">{t('files.outline')}</h2>
        {index.loading ? (
          <p className="ms-fp-empty" role="status">
            {t('files.outlineLoading')}
          </p>
        ) : index.outline.length ? (
          <ol className="ms-fp-outline__list">
            {numbered(index.outline).map(({ item, number }) => (
              <li key={`${item.path}:${item.line}`} data-level={item.level}>
                <button type="button" className="ms-fp-outline__item" onClick={() => openFile(item.path, { line: item.line })}>
                  {number && <span className="ms-fp-outline__num">{number}</span>}
                  {item.title}
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="ms-fp-empty">{t('files.outlineEmpty')}</p>
        )}
      </section>
      {dialogNode}
    </div>
  );
}

/** “1”, “1.1” numbers for sections and subsections (starred headings are numbered too, as written). */
function numbered(items: ReturnType<typeof useTexIndex>['outline']) {
  const counters = [0, 0, 0, 0, 0];
  const top = Math.min(...items.map((item) => item.level));
  return items.map((item) => {
    const depth = item.level - top;
    if (depth > 2) return { item, number: '' };
    counters[depth]! += 1;
    for (let i = depth + 1; i < counters.length; i += 1) counters[i] = 0;
    return { item, number: counters.slice(0, depth + 1).join('.') };
  });
}
