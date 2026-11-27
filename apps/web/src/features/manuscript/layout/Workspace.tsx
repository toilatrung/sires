// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Workspace of the Manuscript screen (PID-00115 S02, H2, H4): toolbar (Project, build chip, revision, right-pane
// tabs, hide right pane, Lưu, Export, Build PDF), three panes at ≥1280 px (files and outline | editor | PDF, build
// log or history), three tabs Tệp / Soạn thảo / Xem at 768–1279 px, footer with the active task. Archived: read-only
// banner, no write actions (H20).

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ErrorState, formatTime, LoadingState, useNavigationData } from '../../../shell';
import { BuildChip } from '../builds/BuildChip';
import { BuildLogPane } from '../builds/BuildLogPane';
import { ExportMenu } from '../builds/ExportMenu';
import { PdfPane } from '../builds/PdfPane';
import { EditorPane } from '../editor/EditorPane';
import { FilePanel } from '../files/FilePanel';
import { HistoryPane } from '../history/HistoryPane';
import { dataOf } from '../model';
import { useProposalDeepLink } from '../proposals/useProposalDeepLink';
import { useBuilds, useManuscript, type RightPane, type TabletTab } from '../state';
import { Banner, type Layout } from '../ui';

const PANES: readonly RightPane[] = ['pdf', 'log', 'history'];
const TABLET_TABS: readonly TabletTab[] = ['files', 'editor', 'view'];

/** Arrow keys move between tabs of a tablist (design.md §7). */
function onTabKeys(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  const tabs = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
  const index = tabs.indexOf(document.activeElement as HTMLElement);
  if (index < 0) return;
  event.preventDefault();
  const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]!;
  next.focus();
  next.click();
}

function Toolbar({ layout }: { layout: Layout }) {
  const { t } = useTranslation('manuscript');
  const ctx = useManuscript();
  const { manuscript, archived, rightPane, lastPane, setRightPane, setTabletTab, dirtyDocs, saving, save, build, projectId } = ctx;
  const { latest } = useBuilds();
  const current = dataOf(manuscript);
  const buildingCurrent = Boolean(latest && current && latest.revisionId === current.currentRevisionId && (latest.status === 'Queued' || latest.status === 'Running'));
  const revisionLabel = current?.currentRevisionNumber !== undefined ? t('toolbar.revision', { n: current.currentRevisionNumber }) : '';
  const savedAt = current?.updatedAt ?? current?.createdAt;

  const choose = (pane: RightPane) => {
    setRightPane(pane);
    if (layout === 'tablet') setTabletTab('view');
  };

  return (
    <div className="ms-toolbar" role="toolbar" aria-label={t('toolbar.label')}>
      <div className="ms-toolbar__start">
        <Link className="ms-toolbar__project" to={`/projects/${encodeURIComponent(projectId)}/overview`}>
          {t('toolbar.project')}
        </Link>
        <BuildChip />
        <span className="ms-toolbar__revision">
          <span className="sires-id">{revisionLabel}</span>
          {' · '}
          {dirtyDocs.length ? t('toolbar.unsaved', { count: dirtyDocs.length }) : savedAt ? t('toolbar.savedAt', { time: formatTime(savedAt) }) : ''}
        </span>
      </div>
      <div className="ms-toolbar__panes" role="tablist" aria-label={t('toolbar.panes')} onKeyDown={onTabKeys}>
        {PANES.map((pane) => {
          const selected = (layout === 'desktop' ? rightPane : rightPane ?? lastPane) === pane;
          return (
            <button
              key={pane}
              type="button"
              role="tab"
              id={`ms-tab-${pane}`}
              aria-selected={selected}
              aria-controls="ms-right"
              tabIndex={selected || (!rightPane && pane === lastPane) ? 0 : -1}
              className="ms-tab"
              onClick={() => choose(pane)}
            >
              {t(`pane.${pane}`)}
            </button>
          );
        })}
        {layout === 'desktop' && rightPane && (
          <button type="button" className="sires-button" data-variant="secondary" data-size="sm" onClick={() => setRightPane(null)}>
            {t('toolbar.hidePane')}
          </button>
        )}
      </div>
      <div className="ms-toolbar__end">
        {!archived && (
          <button type="button" className="sires-button" data-variant="secondary" disabled={!dirtyDocs.length || saving} onClick={() => void save()}>
            {saving ? t('toolbar.saving') : t('toolbar.save')}
          </button>
        )}
        <ExportMenu />
        {!archived && (
          <button
            type="button"
            className="sires-button"
            data-variant="primary"
            disabled={buildingCurrent && !dirtyDocs.length}
            title={buildingCurrent && !dirtyDocs.length ? t('toolbar.buildingCurrent') : undefined}
            onClick={() => {
              void build();
              choose('pdf');
            }}
          >
            {t('toolbar.build')}
          </button>
        )}
      </div>
    </div>
  );
}

function Footer() {
  const { t } = useTranslation('manuscript');
  const navigation = useNavigationData();
  const { manuscript, projectId } = useManuscript();
  const current = dataOf(manuscript);
  const task = navigation.project?.id === projectId ? navigation.project.activeTask : undefined;
  const compiler = current?.compiler === 'xelatex' ? 'XeLaTeX' : current?.compiler === 'lualatex' ? 'LuaLaTeX' : 'pdfLaTeX';
  return (
    <footer className="ms-footer">
      <span className="ms-footer__task">
        {task ? (
          <>
            {t('footer.activeTask')}{' '}
            <Link to={`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}`} className="sires-id">
              {task.key ?? t('footer.task')}
            </Link>
            {task.title && <> · {task.title}</>}
          </>
        ) : (
          t('footer.noTask')
        )}
      </span>
      <span className="ms-footer__meta">
        {compiler} · {current?.bibliographyTool.package ?? 'natbib'} · {t('footer.drafts')}
      </span>
    </footer>
  );
}

function RightPaneBody({ pane }: { pane: RightPane }) {
  if (pane === 'log') return <BuildLogPane />;
  if (pane === 'history') return <HistoryPane />;
  return <PdfPane />;
}

function Region({ id, label, className, children, hidden }: { id: string; label: string; className: string; children: ReactNode; hidden?: boolean }) {
  return (
    <section id={id} className={className} aria-label={label} hidden={hidden}>
      {children}
    </section>
  );
}

export function Workspace({ layout }: { layout: Layout }) {
  const { t } = useTranslation('manuscript');
  const ctx = useManuscript();
  const { manuscript, archived, rightPane, lastPane, tabletTab, setTabletTab, save, reload } = ctx;
  const root = useRef<HTMLDivElement>(null);
  // Notice of a ?proposal= deep link that cannot be shown (EC37), rendered above the panes.
  const deepLink = useProposalDeepLink();

  // Ctrl/Cmd+S anywhere on the screen saves (H6); the editor handles it itself when focused.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!(event.target as HTMLElement | null)?.closest?.('.cm-editor')) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  if (manuscript.status === 'loading') {
    return (
      <div className="ms-workspace" data-layout={layout}>
        <div className="ms-panes">
          <div className="ms-files">
            <LoadingState what={t('files.title')} rows={6} />
          </div>
          <div className="ms-center">
            <LoadingState rows={0} />
            <div className="ms-skeleton-lines" aria-hidden="true">
              {Array.from({ length: 12 }, (_, index) => (
                <span key={index} data-skeleton="" style={{ width: `${[72, 58, 0, 81, 64, 40, 77, 0, 69, 52, 74, 33][index]}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (manuscript.status === 'error') {
    return (
      <div className="ms-workspace" data-layout={layout}>
        <ErrorState error={manuscript.error} ns="manuscript" onRetry={() => void reload()} />
      </div>
    );
  }

  const pane = layout === 'desktop' ? rightPane : rightPane ?? lastPane;
  const show = (tab: TabletTab) => layout !== 'tablet' || tabletTab === tab;

  return (
    <div ref={root} className="ms-workspace" data-layout={layout}>
      <h1 className="sires-visually-hidden">{t('title')}</h1>
      <Toolbar layout={layout} />
      {archived && (
        <Banner tone="info" title={t('archived.title')} label={t('archived.title')}>
          {t('archived.body')}
        </Banner>
      )}
      {deepLink}
      {layout === 'tablet' && (
        <div className="ms-tablet-tabs" role="tablist" aria-label={t('tablet.label')} onKeyDown={onTabKeys}>
          {TABLET_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={tabletTab === tab}
              tabIndex={tabletTab === tab ? 0 : -1}
              className="ms-tab"
              onClick={() => setTabletTab(tab)}
            >
              {t(`tablet.${tab}`)}
            </button>
          ))}
        </div>
      )}
      <div className="ms-panes" data-right={pane ? '' : undefined}>
        <Region id="ms-files" label={t('files.title')} className="ms-files" hidden={!show('files')}>
          <FilePanel />
        </Region>
        <Region id="ms-center" label={t('editor.region')} className="ms-center" hidden={!show('editor')}>
          <EditorPane />
        </Region>
        {pane && (
          <Region id="ms-right" label={t(`pane.${pane}`)} className="ms-right" hidden={!show('view')}>
            <RightPaneBody pane={pane} />
          </Region>
        )}
      </div>
      <Footer />
    </div>
  );
}
