// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// “Khôi phục file này về rN” (PID-00115 S07, MS-REVISION-001, H14): one commit with the text of rN — modify when the
// file still exists, add when it was deleted since (EC42). Not for a file with unsaved changes, nor binary files
// (N6), nor an Archived project (H20). Earlier revisions stay; the restore is a new revision.

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi, type ApiError } from '../../../shell';
import { asApiError, fileContent, isText, type FileChange, type ManuscriptFile } from '../model';
import { useManuscript } from '../state';

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

export function useRestore(onDone: (restored: Restored) => void) {
  const api = useApi();
  const { t } = useTranslation('manuscript');
  const ctx = useManuscript();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<{ path: string; error: ApiError } | undefined>();

  /** Why the file cannot be restored now, or undefined. */
  const blocked = (target: RestoreTarget): string | undefined => {
    if (!isText(target)) return t('history.restoreBinary');
    const current = ctx.fileList.find((file) => file.id === target.fileId);
    if (ctx.isDirty(current?.path ?? target.path)) return t('history.restoreDirty');
    return undefined;
  };

  const restore = async (target: RestoreTarget) => {
    if (busy || blocked(target) || ctx.archived) return;
    const key = `${target.fileId}@${target.revisionId}`;
    setBusy(key);
    setError(undefined);
    try {
      const content = await fileContent(api, ctx.projectId, { id: target.fileId, path: target.path, fileType: target.fileType }, target.revisionId);
      const text = 'text' in content ? content.text ?? '' : '';
      const change = (files: readonly ManuscriptFile[]): FileChange => {
        const current = files.find((file) => file.id === target.fileId);
        return current ? { path: current.path, operation: 'modify', content: text } : { path: target.path, operation: 'add', content: text };
      };
      const revision = await ctx.commit([change(ctx.fileList)], {
        message: t('history.restoreMessage', { path: target.path, n: target.revisionNumber }),
        retry: (files) => [change(files)],
      });
      onDone({ path: target.path, from: target.revisionNumber, to: revision.revisionNumber });
    } catch (caught) {
      setError({ path: target.path, error: asApiError(caught) });
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
