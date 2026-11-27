// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Export of the toolbar (PID-00115 S08, H18, MS-EXPORT-001): a menu with PDF and source zip. PDF of an older
// revision than the current one asks first (“PDF thuộc revision 7; revision hiện hành là 8”), no PDF at all says
// so and still offers the zip; the zip downloads at once (EC51). Export stays available when Archived (H20).

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState, useApi, type ApiError } from '../../../shell';
import { asApiError, dataOf, download, manuscriptPath, rawGet } from '../model';
import { useBuilds, useManuscript } from '../state';
import { Dialog } from '../ui';
import './build.css';

type Ask = { kind: 'old'; pdf: number; current: number; revisionId: string } | { kind: 'none'; current: number } | { kind: 'error'; error: ApiError; format: 'pdf' | 'zip' };

export function ExportMenu() {
  const { t } = useTranslation('manuscript');
  const api = useApi();
  const { projectId, manuscript, archived, build, setRightPane } = useManuscript();
  const { withPdf } = useBuilds();
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const menuId = useId();
  const current = dataOf(manuscript);
  const currentNumber = current?.currentRevisionNumber ?? 0;

  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = (focus = true) => {
    setOpen(false);
    if (focus) button.current?.focus();
  };

  const onMenuKeys = (event: KeyboardEvent<HTMLUListElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    }
  };

  const fetchExport = async (format: 'pdf' | 'zip', revisionId?: string, fallback?: string) => {
    setBusy(true);
    try {
      const response = await rawGet(api, `${manuscriptPath(projectId)}/export`, { format, ...(revisionId ? { revisionId } : {}) });
      const revision = response.headers.get('x-build-revision') ?? String(currentNumber);
      await download(response, fallback ?? `manuscript-r${revision}.${format}`);
      setAsk(null);
    } catch (error) {
      setAsk({ kind: 'error', error: asApiError(error), format });
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = () => {
    close(false);
    if (!withPdf) {
      setAsk({ kind: 'none', current: currentNumber });
      return;
    }
    const pdfNumber = withPdf.revisionNumber ?? 0;
    if (pdfNumber < currentNumber) {
      setAsk({ kind: 'old', pdf: pdfNumber, current: currentNumber, revisionId: withPdf.revisionId });
      return;
    }
    void fetchExport('pdf', withPdf.revisionId, `manuscript-r${pdfNumber}.pdf`);
  };

  const exportZip = () => {
    close(false);
    void fetchExport('zip', current?.currentRevisionId, `manuscript-r${currentNumber}.zip`);
  };

  const buildCurrent = () => {
    setAsk(null);
    setRightPane('pdf');
    void build();
  };

  return (
    <span className="ms-export">
      <button
        ref={button}
        type="button"
        className="sires-button"
        data-variant="secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={!current || busy}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {busy ? t('build.export.working') : t('build.export.button')}
      </button>
      {open && (
        <ul ref={menu} id={menuId} role="menu" aria-label={t('build.export.button')} className="ms-export__menu" onKeyDown={onMenuKeys}>
          <li role="none">
            <button type="button" role="menuitem" tabIndex={-1} className="ms-export__item" onClick={exportPdf}>
              <span>{t('build.export.pdf')}</span>
              <span className="ms-export__hint">{withPdf ? t('build.export.pdfHint', { n: withPdf.revisionNumber }) : t('build.export.pdfNone')}</span>
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" tabIndex={-1} className="ms-export__item" onClick={exportZip}>
              <span>{t('build.export.zip')}</span>
              <span className="ms-export__hint">{t('build.export.zipHint', { n: currentNumber })}</span>
            </button>
          </li>
        </ul>
      )}
      {ask?.kind === 'old' && (
        <Dialog title={t('build.export.oldTitle')} onClose={() => setAsk(null)}>
          <p className="ms-dialog__body">{t('build.export.oldBody', { pdf: ask.pdf, current: ask.current })}</p>
          <p className="ms-dialog__body ms-muted">{archived ? t('build.export.oldArchived') : t('build.export.oldHint')}</p>
          <div className="ms-dialog__actions">
            <button type="button" className="sires-button" data-variant="secondary" disabled={busy} onClick={() => void fetchExport('pdf', ask.revisionId, `manuscript-r${ask.pdf}.pdf`)}>
              {t('build.export.downloadOld', { n: ask.pdf })}
            </button>
            {!archived && (
              <button type="button" className="sires-button" data-variant="outline" onClick={buildCurrent}>
                {t('build.export.buildCurrent', { n: ask.current })}
              </button>
            )}
          </div>
        </Dialog>
      )}
      {ask?.kind === 'none' && (
        <Dialog title={t('build.export.noneTitle')} onClose={() => setAsk(null)}>
          <p className="ms-dialog__body">{t('build.export.noneBody')}</p>
          <div className="ms-dialog__actions">
            <button type="button" className="sires-button" data-variant="secondary" disabled={busy} onClick={() => void fetchExport('zip', current?.currentRevisionId, `manuscript-r${currentNumber}.zip`)}>
              {t('build.export.zipInstead')}
            </button>
            {!archived && (
              <button type="button" className="sires-button" data-variant="outline" onClick={buildCurrent}>
                {t('build.export.buildCurrent', { n: ask.current })}
              </button>
            )}
          </div>
        </Dialog>
      )}
      {ask?.kind === 'error' && (
        <Dialog title={t('build.export.failed')} onClose={() => setAsk(null)}>
          <ErrorState
            error={ask.error}
            ns="manuscript"
            notSaved={t('build.export.nothing')}
            onRetry={() => (ask.format === 'zip' ? exportZip() : exportPdf())}
            actions={
              <button type="button" className="sires-button" data-variant="secondary" data-size="sm" onClick={() => setAsk(null)}>
                {t('common.close')}
              </button>
            }
          />
        </Dialog>
      )}
    </span>
  );
}
