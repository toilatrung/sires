// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Restores of the history pane (PID-00115 S07, MS-REVISION-001, H14; contract 27/11/2026 FileChange.restoreFromRevisionId):
// “Khôi phục file này về rN” for text and binary files (modify, or add when deleted since, EC42) and “Khôi phục toàn bộ
// về rN” (one commit: modify/add with restoreFromRevisionId, delete for files not in rN, references.bib untouched,
// EC57). Not with unsaved changes, not for references.bib, not in an Archived project (H20). Earlier revisions stay.

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiError, useApi, type ApiError } from '../../../shell';
import { asApiError, fileContent, isGeneratedBib, isText, type FileChange, type ManuscriptFile } from '../model';
import { useManuscript } from '../state';
import { Dialog } from '../ui';

export interface RestoreTarget {
  fileId: string;
  /** Path of the file at revision rN. */
  path: string;
  fileType: ManuscriptFile['fileType'];
  revisionId: string;
  revisionNumber: number;
}

export interface Restored {
  path: string;
  from: number;
  to: number;
}

export interface RestoreError {
  path: string;
  error: ApiError;
  /** Field messages of a 400 (e.g. the revision has no file at that path). */
  detail?: string;
}

const detailOf = (error: unknown) =>
  isApiError(error) ? error.problem?.errors?.map((item) => item.message ?? `${item.field}: ${item.code}`).join('; ') || undefined : undefined;

export function useRestore(onDone: (restored: Restored) => void) {
  const api = useApi();
  const { t } = useTranslation('manuscript');
  const ctx = useManuscript();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<RestoreError | undefined>();

  /** Why the file cannot be restored now, or undefined. */
  const blocked = (target: RestoreTarget): string | undefined => {
    if (isGeneratedBib(target.path)) return t('history.restoreBib');
    const current = ctx.fileList.find((file) => file.id === target.fileId);
    if (ctx.isDirty(current?.path ?? target.path)) return t('history.restoreDirty');
    // Renamed since rN: the restore source is matched by path, so only the text can be carried over.
    if (current && current.path !== target.path && !isText(target)) return t('history.restoreRenamed');
    return undefined;
  };

  const restore = async (target: RestoreTarget) => {
    if (busy || blocked(target) || ctx.archived) return;
    const key = `${target.fileId}@${target.revisionId}`;
    setBusy(key);
    setError(undefined);
    try {
      const renamed = ctx.fileList.find((file) => file.id === target.fileId && file.path !== target.path);
      let text: string | undefined;
      if (renamed) {
        const content = await fileContent(api, ctx.projectId, { id: target.fileId, path: target.path, fileType: target.fileType }, target.revisionId);
        text = 'text' in content ? content.text ?? '' : '';
      }
      const change = (files: readonly ManuscriptFile[]): FileChange => {
        const current = files.find((file) => file.id === target.fileId);
        if (!current) return { path: target.path, operation: 'add', restoreFromRevisionId: target.revisionId };
        if (current.path === target.path) return { path: current.path, operation: 'modify', restoreFromRevisionId: target.revisionId };
        return { path: current.path, operation: 'modify', content: text ?? '' };
      };
      const revision = await ctx.commit([change(ctx.fileList)], {
        message: t('history.restoreMessage', { path: target.path, n: target.revisionNumber }),
        retry: (files) => [change(files)],
      });
      onDone({ path: target.path, from: target.revisionNumber, to: revision.revisionNumber });
    } catch (caught) {
      setError({ path: target.path, error: asApiError(caught), detail: detailOf(caught) });
    } finally {
      setBusy(undefined);
    }
  };

  return { restore, blocked, busy, error, clearError: () => setError(undefined) };
}

export function RestoreButton({ target, tools }: { target: RestoreTarget; tools: ReturnType<typeof useRestore> }) {
  const { t } = useTranslation('manuscript');
  const { archived } = useManuscript();
  const reasonId = useId();
  if (archived) return null;
  const reason = tools.blocked(target);
  const running = tools.busy === `${target.fileId}@${target.revisionId}`;
  return (
    <span className="msh-restore">
      <button
        type="button"
        className="sires-button"
        data-variant="outline"
        data-size="sm"
        disabled={Boolean(reason) || Boolean(tools.busy)}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => void tools.restore(target)}
      >
        {running ? t('history.restoring') : t('history.restore', { n: target.revisionNumber })}
      </button>
      {reason && (
        <span id={reasonId} className="msh-reason">
          {reason}
        </span>
      )}
    </span>
  );
}

interface Plan {
  changes: FileChange[];
  modified: number;
  added: number;
  deleted: number;
}

/** Changes that bring the current files back to rN; references.bib is left to System (MS-BIB-001). */
export function restorePlan(at: readonly ManuscriptFile[], current: readonly ManuscriptFile[], revisionId: string): Plan {
  const plan: Plan = { changes: [], modified: 0, added: 0, deleted: 0 };
  for (const file of at) {
    if (isGeneratedBib(file.path)) continue;
    const now = current.find((row) => row.path === file.path);
    if (!now) {
      plan.changes.push({ path: file.path, operation: 'add', restoreFromRevisionId: revisionId });
      plan.added += 1;
    } else if (now.contentHash !== file.contentHash) {
      plan.changes.push({ path: file.path, operation: 'modify', restoreFromRevisionId: revisionId });
      plan.modified += 1;
    }
  }
  for (const file of current) {
    if (isGeneratedBib(file.path) || at.some((row) => row.path === file.path)) continue;
    plan.changes.push({ path: file.path, operation: 'delete' });
    plan.deleted += 1;
  }
  return plan;
}

/** “Khôi phục toàn bộ về rN” with its confirmation (EC57). */
export function RestoreAllButton({ revisionId, revisionNumber, onDone }: { revisionId: string; revisionNumber: number; onDone: (restored: Restored) => void }) {
  const api = useApi();
  const { t } = useTranslation('manuscript');
  const ctx = useManuscript();
  const reasonId = useId();
  const [open, setOpen] = useState<{ at: ManuscriptFile[]; plan: Plan } | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RestoreError | undefined>();
  if (ctx.archived) return null;
  const current = ctx.manuscript.status === 'ready' && ctx.manuscript.data?.currentRevisionId === revisionId;
  if (current) return null;
  const reason = ctx.dirtyDocs.length ? t('history.restoreAllDirty') : undefined;
  const label = t('history.restoreAllLabel', { n: revisionNumber });

  const prepare = async () => {
    setError(undefined);
    setBusy(true);
    try {
      const { data } = await api.get('/projects/{projectId}/manuscript/files', { path: { projectId: ctx.projectId }, query: { revisionId } });
      const at = (data.items ?? []) as ManuscriptFile[];
      setOpen({ at, plan: restorePlan(at, ctx.fileList, revisionId) });
    } catch (caught) {
      setError({ path: label, error: asApiError(caught), detail: detailOf(caught) });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!open || busy) return;
    setBusy(true);
    try {
      const revision = await ctx.commit(open.plan.changes, {
        message: t('history.restoreAllMessage', { n: revisionNumber }),
        // Another revision came first (H7): plan again on the new files.
        retry: (files) => restorePlan(open.at, files, revisionId).changes,
      });
      setOpen(undefined);
      onDone({ path: t('history.allFiles'), from: revisionNumber, to: revision.revisionNumber });
    } catch (caught) {
      setOpen(undefined);
      setError({ path: label, error: asApiError(caught), detail: detailOf(caught) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="msh-restore">
      <button
        type="button"
        className="sires-button"
        data-variant="outline"
        data-size="sm"
        disabled={Boolean(reason) || busy}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => void prepare()}
      >
        {t('history.restoreAll', { n: revisionNumber })}
      </button>
      {reason && (
        <span id={reasonId} className="msh-reason">
          {reason}
        </span>
      )}
      {error && (
        <span className="msh-reason" role="alert">
          {t('history.restoreAllFailed', { n: revisionNumber })} {error.detail ?? t(`error.${error.error.code}`, { defaultValue: error.error.code })} ({error.error.code})
        </span>
      )}
      {open && (
        <Dialog title={label} onClose={() => setOpen(undefined)}>
          {open.plan.changes.length ? (
            <>
              <p className="ms-dialog__body">{t('history.restoreAllCounts', { modified: open.plan.modified, added: open.plan.added, deleted: open.plan.deleted })}</p>
              <p className="ms-dialog__body">{t('history.restoreAllNote')}</p>
            </>
          ) : (
            <p className="ms-dialog__body">{t('history.restoreAllNothing', { n: revisionNumber })}</p>
          )}
          <div className="ms-dialog__actions">
            <button type="button" className="sires-button" data-variant="secondary" onClick={() => setOpen(undefined)}>
              {t('common.cancel')}
            </button>
            {open.plan.changes.length > 0 && (
              <button type="button" className="sires-button" data-variant="outline" disabled={busy} onClick={() => void confirm()}>
                {busy ? t('history.restoring') : t('history.restoreAllConfirm')}
              </button>
            )}
          </div>
        </Dialog>
      )}
    </span>
  );
}
