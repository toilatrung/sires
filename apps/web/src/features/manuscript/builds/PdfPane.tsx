// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PDF preview (PID-00115 S08, H15, H17): the PDF of the latest Succeeded build with its revision, page control
// “Trang 1 / 6” kept across new builds (EC50), the long-operation card while a build is Queued or Running (no
// cancel, no latest-activity line: N8), the failed build named above the older PDF (EC48), “Chưa có PDF” otherwise.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, LoadingState, LongOperation, StatusChip, useApi, type ApiError } from '../../../shell';
import { asApiError, manuscriptPath, pdfPageCount, rawGet } from '../model';
import { useBuilds, useManuscript } from '../state';
import { isBuilding } from './BuildChip';
import './build.css';

type Loaded = { status: 'loading' } | { status: 'ready'; url?: string; pages?: number } | { status: 'error'; error: ApiError };

export function PdfPane() {
  const { t } = useTranslation('manuscript');
  const api = useApi();
  const { projectId, setRightPane } = useManuscript();
  const { latest, withPdf } = useBuilds();
  const [pdf, setPdf] = useState<Loaded>({ status: 'loading' });
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const pageRef = useRef(page);
  pageRef.current = page;

  const pdfBuildId = withPdf?.id;
  useEffect(() => {
    if (!pdfBuildId) return undefined;
    let cancelled = false;
    let url: string | undefined;
    setPdf((current) => (current.status === 'ready' ? current : { status: 'loading' }));
    void (async () => {
      try {
        const response = await rawGet(api, `${manuscriptPath(projectId)}/builds/${encodeURIComponent(pdfBuildId)}/pdf`);
        const blob = await response.blob();
        const pages = await pdfPageCount(blob);
        url = objectUrl(blob);
        if (cancelled) return;
        // A new PDF keeps the page being read when it still has it (EC50).
        if (pages && pageRef.current > pages) setPage(pages);
        setPdf({ status: 'ready', ...(url ? { url } : {}), ...(pages ? { pages } : {}) });
      } catch (error) {
        if (!cancelled) setPdf({ status: 'error', error: asApiError(error) });
      }
    })();
    return () => {
      cancelled = true;
      if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
    };
  }, [api, attempt, pdfBuildId, projectId]);

  const building = isBuilding(latest) ? latest : undefined;
  const failedAfter = latest?.status === 'Failed' && (!withPdf || latest.id !== withPdf.id) ? latest : undefined;
  const pages = pdf.status === 'ready' ? pdf.pages : undefined;

  const heading = withPdf
    ? `${t('build.pdf.title')} · ${t('build.revision', { n: withPdf.revisionNumber })}${building && building.revisionNumber !== withPdf.revisionNumber ? ` ${t('build.pdf.latestBuilt')}` : ''}`
    : t('build.pdf.title');

  return (
    <div className="ms-pdf">
      <div className="ms-pdf__head">
        <h2 className="ms-pane-title ms-pdf__title">{heading}</h2>
        {withPdf && pdf.status === 'ready' && (
          <div className="ms-pdf__pages" role="group" aria-label={t('build.pdf.pages')}>
            <button type="button" className="sires-button" data-variant="secondary" data-size="xs" disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))}>
              {t('build.pdf.previous')}
            </button>
            <span className="ms-pdf__page sires-num" aria-live="polite">
              {pages ? t('build.pdf.pageOf', { page, pages }) : t('build.pdf.page', { page })}
            </span>
            <button
              type="button"
              className="sires-button"
              data-variant="secondary"
              data-size="xs"
              disabled={pages !== undefined && page >= pages}
              onClick={() => setPage((n) => (pages ? Math.min(pages, n + 1) : n + 1))}
            >
              {t('build.pdf.next')}
            </button>
          </div>
        )}
      </div>
      {building && (
        <div className="ms-pdf__building">
          <LongOperation
            chip={<StatusChip status={building.status} entity="build" />}
            title={t('build.pdf.building', { n: building.revisionNumber, compiler: compilerName(building.compiler) })}
            actor="System"
            startedAt={building.startedAt ?? building.queuedAt}
          />
        </div>
      )}
      {failedAfter && !building && (
        <div className="ms-pdf__failed">
          <p className="ms-pdf__failed-text">
            {withPdf
              ? t('build.pdf.failedKept', { n: failedAfter.revisionNumber, kept: withPdf.revisionNumber })
              : t('build.pdf.failedNone', { n: failedAfter.revisionNumber })}
          </p>
          <button type="button" className="sires-button" data-variant="secondary" data-size="sm" onClick={() => setRightPane('log')}>
            {t('build.pdf.openLog')}
          </button>
        </div>
      )}
      {!withPdf ? (
        !building && (
          <div className="ms-pdf__empty">
            <EmptyState title={t('build.pdf.noneTitle')} reason={t('build.pdf.noneReason')} />
          </div>
        )
      ) : pdf.status === 'loading' ? (
        <div className="ms-pdf__empty">
          <LoadingState what={t('build.pdf.title')} rows={0} />
        </div>
      ) : pdf.status === 'error' ? (
        <div className="ms-pdf__empty">
          <ErrorState error={pdf.error} ns="manuscript" onRetry={() => setAttempt((n) => n + 1)} />
        </div>
      ) : pdf.url ? (
        <iframe className="ms-pdf__frame" title={t('build.pdf.frame', { n: withPdf.revisionNumber })} src={`${pdf.url}#page=${page}`} />
      ) : (
        <p className="ms-pdf__nopreview">{t('build.pdf.noViewer')}</p>
      )}
    </div>
  );
}

/** Blob URL for the viewer; undefined where the environment cannot make one (the page then says so). */
function objectUrl(blob: Blob): string | undefined {
  try {
    return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : undefined;
  } catch {
    return undefined;
  }
}

export function compilerName(compiler: string | undefined): string {
  if (compiler === 'xelatex') return 'XeLaTeX';
  if (compiler === 'lualatex') return 'LuaLaTeX';
  return 'pdfLaTeX';
}
