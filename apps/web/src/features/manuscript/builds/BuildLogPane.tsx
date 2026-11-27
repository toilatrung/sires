// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Build log in two layers (PID-00115 S08, H16, UX-MS-004): layer 1 summarises the latest build — titles translated
// and sentences from BuildIssue.code and params (friendlyMessage is a hint), file, line, “Đi tới main.tex:4”; layer 2 is
// the raw log, loaded only when opened (EC49) and shown verbatim as text in every language (MS-BUILD-001-AC02).

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, formatTime, useApi, type ApiError } from '../../../shell';
import { asApiError, baseName, manuscriptPath, rawGet, type Build, type BuildIssue } from '../model';
import { useBuilds, useManuscript } from '../state';
import { buildTime, isBuilding } from './BuildChip';
import { compilerName } from './PdfPane';
import './build.css';

/** The catalog of BuildIssue.code (contract 27/11/2026); other codes get the generic title of their severity (EC47). */
export const KNOWN_CODES = [
  'unbalanced_braces', 'undefined_control_sequence', 'missing_file', 'missing_package', 'undefined_citation',
  'shell_escape_disabled', 'path_outside_manuscript', 'timeout', 'memory_limit', 'infrastructure_unavailable',
] as const;
type KnownCode = (typeof KNOWN_CODES)[number];

/** Parameters each sentence needs; when one is missing the code's general sentence is used, never an invented name. */
const NEEDS: Record<KnownCode, readonly string[]> = {
  unbalanced_braces: [], undefined_control_sequence: ['command'], missing_file: ['path'], missing_package: ['package'],
  undefined_citation: ['key'], shell_escape_disabled: ['command'], path_outside_manuscript: ['path'], timeout: ['limit'],
  memory_limit: ['limit'], infrastructure_unavailable: [],
};

/** i18n key of the explanation of a catalog issue, built from its params (UX-MS-004-AC01). */
export function sentenceKey(code: KnownCode, params: Record<string, string>): string {
  if (code === 'memory_limit' && params.reason === 'tex_capacity') return 'build.issue.text.memory_limit_tex';
  if (code === 'missing_package' && params.package && params.command) return 'build.issue.text.missing_package_command';
  return NEEDS[code].every((name) => params[name]) ? `build.issue.text.${code}` : `build.issue.general.${code}`;
}

function IssueRow({ issue }: { issue: BuildIssue }) {
  const { t } = useTranslation('manuscript');
  const { openFile, fileList } = useManuscript();
  const code = (KNOWN_CODES as readonly string[]).includes(issue.code ?? '') ? (issue.code as KnownCode) : undefined;
  const severity = issue.severity === 'warning' ? 'warning' : 'error';
  const params = issue.params ?? {};
  const title = code ? t(`build.issue.${code}`) : t(`build.issue.generic.${severity}`, { code: issue.code ?? '—' });
  // Catalog codes: the sentence comes from code and params in the interface language; friendlyMessage (written in the
  // account's language at build time) is only a hint. Other codes: the hint, else the compiler's own message.
  const sentence = code ? t(sentenceKey(code, params), { ...params, interpolation: { escapeValue: false } }) : undefined;
  const hint = issue.friendlyMessage;
  const body = sentence ?? (hint ? undefined : issue.message);
  const canGo = Boolean(issue.file && issue.line && fileList.some((file) => file.path === issue.file));
  return (
    <li className="ms-issue" data-severity={severity}>
      <div className="ms-issue__head">
        <strong className="ms-issue__title">{title}</strong>
        <span className="ms-issue__severity">{t(`build.severity.${severity}`)}</span>
      </div>
      {body && <p className="ms-issue__body">{body}</p>}
      {hint && <p className="ms-issue__hint">{t('build.issue.hint', { text: hint, interpolation: { escapeValue: false } })}</p>}
      {(issue.file || issue.line) && (
        <p className="ms-issue__where">
          {issue.file && <span className="sires-id">{issue.file}</span>}
          {issue.line !== undefined && <> {t('build.issue.line', { line: issue.line })}</>}
        </p>
      )}
      {canGo && (
        <button
          type="button"
          className="sires-button"
          data-variant="secondary"
          data-size="xs"
          title={`${issue.file}:${issue.line}`}
          onClick={() => openFile(issue.file!, { line: issue.line })}
        >
          {t('build.issue.goTo', { file: baseName(issue.file!), line: issue.line })}
        </button>
      )}
    </li>
  );
}

type Raw = { status: 'closed' } | { status: 'loading' } | { status: 'ready'; text: string } | { status: 'error'; error: ApiError };

function RawLog({ build }: { build: Build }) {
  const { t } = useTranslation('manuscript');
  const api = useApi();
  const { projectId } = useManuscript();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState<Raw>({ status: 'closed' });

  // Layer 2 is loaded only when opened (EC49), once per build (the component is keyed by build id).
  const load = useCallback(async () => {
    setRaw({ status: 'loading' });
    try {
      const response = await rawGet(api, `${manuscriptPath(projectId)}/builds/${encodeURIComponent(build.id)}/log`);
      setRaw({ status: 'ready', text: await response.text() });
    } catch (error) {
      setRaw({ status: 'error', error: asApiError(error) });
    }
  }, [api, build.id, projectId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && (raw.status === 'closed' || raw.status === 'error')) void load();
  };

  const panel = `ms-rawlog-${build.id}`;
  return (
    <section className="ms-rawlog">
      <button type="button" className="ms-rawlog__toggle" aria-expanded={open} aria-controls={panel} onClick={toggle}>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span> {t('build.log.raw', { compiler: compilerName(build.compiler) })}
      </button>
      {open && (
        <div id={panel} className="ms-rawlog__panel">
          {raw.status === 'loading' || raw.status === 'closed' ? (
            <p role="status" className="ms-muted">
              {t('build.log.loading')}
            </p>
          ) : raw.status === 'error' ? (
            <ErrorState error={raw.error} ns="manuscript" title={t('build.log.loadFailed')} onRetry={() => void load()} />
          ) : (
            <pre className="ms-rawlog__text" tabIndex={0} aria-label={t('build.log.rawLabel')}>
              {raw.text}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}

export function BuildLogPane() {
  const { t } = useTranslation('manuscript');
  const { latest, withPdf } = useBuilds();

  if (!latest) {
    return (
      <div className="ms-buildlog">
        <h2 className="ms-pane-title">{t('pane.log')}</h2>
        <div className="ms-buildlog__body">
          <EmptyState title={t('build.log.noneTitle')} reason={t('build.log.noneReason')} />
        </div>
      </div>
    );
  }

  const issues = latest.issues ?? [];
  const errors = issues.filter((issue) => issue.severity !== 'warning');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const time = formatTime(buildTime(latest));
  const heading = isBuilding(latest)
    ? t('build.log.buildingTitle', { n: latest.revisionNumber })
    : latest.status === 'Failed'
      ? t('build.log.failedTitle', { time, n: latest.revisionNumber })
      : t('build.log.okTitle', { time, n: latest.revisionNumber });

  return (
    <div className="ms-buildlog">
      <h2 className="ms-pane-title ms-buildlog__title" data-status={latest.status}>
        {heading}
      </h2>
      <div className="ms-buildlog__body">
        {latest.status === 'Failed' && (
          <p className="ms-buildlog__kept">
            {withPdf && withPdf.id !== latest.id ? t('build.log.keptPdf', { n: withPdf.revisionNumber }) : t('build.log.noPdf')}
          </p>
        )}
        {isBuilding(latest) && <p className="ms-buildlog__kept">{t('build.log.buildingBody')}</p>}
        {issues.length > 0 ? (
          <ul className="ms-issues" aria-label={t('build.log.issues', { errors: errors.length, warnings: warnings.length })}>
            {[...errors, ...warnings].map((issue, index) => (
              <IssueRow key={`${issue.code}-${issue.file}-${issue.line}-${index}`} issue={issue} />
            ))}
          </ul>
        ) : (
          !isBuilding(latest) && <p className="ms-muted">{t('build.log.noIssues')}</p>
        )}
        {!isBuilding(latest) && <RawLog key={latest.id} build={latest} />}
      </div>
    </div>
  );
}
