// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Comparing two revisions (PID-00115 S07, UX-MS-006, H14): computed in the browser from the file lists of both sides
// (same id, contentHash differs) and their text (lineDiff). Binary files read “đã đổi” without line diff; a file
// added or deleted between the sides shows entirely as added or deleted (EC40).

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState, useApi } from '../../../shell';
import { asApiError, fileContent, isText, lineDiff, type DiffLine, type ManuscriptFile, type Revision } from '../model';
import { useManuscript } from '../state';
import { Banner, useActorLabel } from '../ui';
import { revisionTime } from './labels';
import { RestoreAllButton, RestoreButton, useRestore, type Restored } from './restore';


type Kind = 'modified' | 'added' | 'deleted' | 'renamed';

interface Entry {
  fileId: string;
  kind: Kind;
  older?: ManuscriptFile;
  newer?: ManuscriptFile;
  binary: boolean;
  lines?: DiffLine[];
}

const CONTEXT = 2;

/** Runs of unchanged lines longer than the context are folded to “… N dòng không đổi …”. */
function fold(lines: DiffLine[]): (DiffLine | { fold: number })[] {
  const out: (DiffLine | { fold: number })[] = [];
  let run: DiffLine[] = [];
  const flush = (last: boolean) => {
    const first = out.length === 0;
    if (run.length > CONTEXT * 2 + 1) {
      const head = first ? [] : run.slice(0, CONTEXT);
      const tail = last ? [] : run.slice(run.length - CONTEXT);
      out.push(...head, { fold: run.length - head.length - tail.length }, ...tail);
    } else out.push(...run);
    run = [];
  };
  for (const line of lines) {
    if (line.kind === 'same') run.push(line);
    else {
      flush(false);
      out.push(line);
    }
  }
  flush(true);
  return out;
}

async function listFiles(api: ReturnType<typeof useApi>, projectId: string, revisionId: string): Promise<ManuscriptFile[]> {
  const { data } = await api.get('/projects/{projectId}/manuscript/files', { path: { projectId }, query: { revisionId } });
  return (data.items ?? []) as ManuscriptFile[];
}

async function textAt(api: ReturnType<typeof useApi>, projectId: string, file: ManuscriptFile, revisionId: string): Promise<string> {
  const content = await fileContent(api, projectId, file, revisionId);
  return 'text' in content ? content.text ?? '' : '';
}

function Side({ revision, source }: { revision: Revision; source: string }) {
  const actorLabel = useActorLabel();
  return (
    <div className="msh-side">
      <span>
        <span className="sires-id">r{revision.revisionNumber}</span> · {actorLabel(revision.createdBy)} · {revisionTime(revision.createdAt)}
      </span>
      <span className="msh-source">{source}</span>
    </div>
  );
}

export interface CompareViewProps {
  older: Revision;
  newer: Revision;
  sourceOf: (revision: Revision) => string;
  onBack: () => void;
  onRestored: (restored: Restored) => void;
}

export function CompareView({ older, newer, sourceOf, onBack, onRestored }: CompareViewProps) {
  const { t } = useTranslation('manuscript');
  const api = useApi();
  const { projectId, manuscript } = useManuscript();
  const tools = useRestore(onRestored);
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; entries: Entry[] } | { status: 'error'; error: ReturnType<typeof asApiError> }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const current = manuscript.status === 'ready' ? manuscript.data?.currentRevisionId : undefined;

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    (async () => {
      const [before, after] = await Promise.all([listFiles(api, projectId, older.id), listFiles(api, projectId, newer.id)]);
      const ids = [...new Set([...before.map((file) => file.id), ...after.map((file) => file.id)])];
      const entries: Entry[] = [];
      for (const fileId of ids) {
        const a = before.find((file) => file.id === fileId);
        const b = after.find((file) => file.id === fileId);
        if (a && b && a.contentHash === b.contentHash && a.path === b.path) continue;
        const kind: Kind = !a ? 'added' : !b ? 'deleted' : a.contentHash === b.contentHash ? 'renamed' : 'modified';
        const sample = (b ?? a)!;
        entries.push({ fileId, kind, ...(a ? { older: a } : {}), ...(b ? { newer: b } : {}), binary: !isText(sample) });
      }
      await Promise.all(entries.map(async (entry) => {
        if (entry.binary || entry.kind === 'renamed') return;
        const left = entry.older ? await textAt(api, projectId, entry.older, older.id) : undefined;
        const right = entry.newer ? await textAt(api, projectId, entry.newer, newer.id) : undefined;
        if (left === undefined) entry.lines = right!.split('\n').map((text, index) => ({ kind: 'add', text, newLine: index + 1 }));
        else if (right === undefined) entry.lines = left.split('\n').map((text, index) => ({ kind: 'del', text, oldLine: index + 1 }));
        else entry.lines = lineDiff(left, right);
      }));
      entries.sort((x, y) => (x.newer ?? x.older)!.path.localeCompare((y.newer ?? y.older)!.path));
      if (alive) setState({ status: 'ready', entries });
    })().catch((error: unknown) => {
      if (alive) setState({ status: 'error', error: asApiError(error) });
    });
    return () => {
      alive = false;
    };
  }, [api, projectId, older.id, newer.id, attempt]);

  const status = (entry: Entry): ReactNode => {
    if (entry.kind === 'added') return t('history.added', { n: newer.revisionNumber });
    if (entry.kind === 'deleted') return t('history.deleted', { n: newer.revisionNumber });
    if (entry.kind === 'renamed') return t('history.renamed', { from: entry.older!.path, to: entry.newer!.path });
    if (entry.older && entry.newer && entry.older.path !== entry.newer.path) return `${t('history.modified')} · ${t('history.renamed', { from: entry.older.path, to: entry.newer.path })}`;
    return t('history.modified');
  };

  const title = t('history.compare', { a: older.revisionNumber, b: newer.revisionNumber });

  return (
    <section className="msh-compare" aria-label={title}>
      <div className="msh-head">
        <button type="button" className="sires-button" data-variant="secondary" data-size="sm" onClick={onBack}>
          {t('history.back')}
        </button>
        <h3 className="msh-title">{title}</h3>
        <RestoreAllButton revisionId={older.id} revisionNumber={older.revisionNumber} onDone={onRestored} />
      </div>
      <div className="msh-sides">
        <Side revision={older} source={sourceOf(older)} />
        <span className="msh-arrow" aria-hidden="true">↔</span>
        <Side revision={newer} source={sourceOf(newer)} />
      </div>
      {tools.error && (
        <ErrorState
          error={tools.error.error}
          {...(tools.error.detail ? { description: tools.error.detail } : {})}
          ns="manuscript"
          title={t('history.restoreFailed', { path: tools.error.path })}
          notSaved={t('history.restoreKept')}
          actions={
            <button type="button" className="sires-button" data-variant="secondary" data-size="sm" onClick={tools.clearError}>
              {t('common.close')}
            </button>
          }
        />
      )}
      {state.status === 'loading' && <LoadingState what={title} rows={2} />}
      {state.status === 'error' && <ErrorState error={state.error} ns="manuscript" onRetry={() => setAttempt((n) => n + 1)} />}
      {state.status === 'ready' && !state.entries.length && <Banner tone="info">{t('history.noChange')}</Banner>}
      {state.status === 'ready' &&
        state.entries.map((entry) => {
          const path = (entry.newer ?? entry.older)!.path;
          const targets = [
            entry.older && older.id !== current ? { file: entry.older, revision: older } : undefined,
            entry.newer && newer.id !== current ? { file: entry.newer, revision: newer } : undefined,
          ].filter(Boolean) as { file: ManuscriptFile; revision: Revision }[];
          return (
            <section key={entry.fileId} className="msh-file" aria-label={path}>
              <header className="msh-file__head">
                <h4 className="msh-file__path sires-id">{path}</h4>
                <span className="msh-file__status" data-kind={entry.kind}>
                  {status(entry)}
                </span>
              </header>
              {entry.binary ? (
                <p className="msh-binary">{t('history.binaryChanged')}</p>
              ) : entry.lines ? (
                <pre className="ms-diff msh-diff" aria-label={t('history.diffLabel', { path })}>
                  {fold(entry.lines).map((line, index) =>
                    'fold' in line ? (
                      <span key={index} className="ms-diff__line msh-fold">
                        {t('history.unchangedLines', { count: line.fold })}
                        {'\n'}
                      </span>
                    ) : (
                      <span key={index} className="ms-diff__line" data-kind={line.kind}>
                        {line.kind === 'add' ? '+ ' : line.kind === 'del' ? '− ' : '  '}
                        {line.text}
                        {'\n'}
                      </span>
                    ),
                  )}
                </pre>
              ) : null}
              {targets.length > 0 && (
                <div className="msh-file__actions">
                  {targets.map(({ file, revision }) => (
                    <RestoreButton
                      key={revision.id}
                      tools={tools}
                      target={{ fileId: file.id, path: file.path, fileType: file.fileType, revisionId: revision.id, revisionNumber: revision.revisionNumber }}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
    </section>
  );
}
