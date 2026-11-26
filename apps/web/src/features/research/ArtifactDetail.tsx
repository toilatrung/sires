// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Detail of a research artifact (S05–S08, H8–H11): title, “type · v · T-x”, the version shown (?version=, latest by
// default), “So sánh với” (?compare=, side by side, stacked when narrow, no line diff), content by format, Provenance,
// the list of versions, accept/reject of a Draft version, the Diagram Agent revision card.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ErrorState, LoadingState, LongOperation, useApi, useEvents, type ApiError } from '../../shell';
import { ArtifactDecision, type DecisionBlocker } from './ArtifactDecision';
import { allPages, useLoad, useReloadSignal, useResearchObjectEvents, toApiError, type Loaded, type Schemas } from './data';
import { DiagramContent, DiagramFigure, RequestDiagramDialog } from './DiagramContent';
import { AGENT_NAMES, formatWhen, paths } from './labels';
import { PanelNotFound, TaskKey } from './Panel';
import { Provenance } from './Provenance';
import { SynthesisContent } from './SynthesisContent';
import { FormatContent } from './VersionContent';

type Version = Schemas['ArtifactVersion'];
type Claim = Schemas['Claim'];
type Workflow = Schemas['Workflow'];

/** Claims of one synthesis version (listClaims with artifactVersionId, every page). */
function useVersionClaims(projectId: string, version: Version | undefined, enabled: boolean): Loaded<Claim[]> {
  const api = useApi();
  return useLoad(
    () => (version && enabled
      ? allPages((cursor) => api.get('/projects/{projectId}/claims', {
        path: { projectId }, query: { artifactVersionId: version.id, limit: 100, ...(cursor ? { cursor } : {}) },
      }).then((result) => result.data))
      : Promise.resolve([])),
    [api, projectId, version?.id, enabled],
  );
}

/** Compare column of a synthesis: loads its own claims so no claim loses its label (KPI-01). */
function ComparedSynthesis({ projectId, version }: { projectId: string; version: Version }) {
  const claims = useVersionClaims(projectId, version, true);
  useResearchObjectEvents(projectId, ['claim'], claims.reload);
  return <SynthesisContent projectId={projectId} version={version} claims={claims} />;
}

export function ArtifactDetail({ projectId, artifactId, references }: { projectId: string; artifactId: string; references: Schemas['ProjectReferenceSelection'][] }) {
  const { t } = useTranslation('research');
  const api = useApi();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const artifact = useLoad(() => api.get('/projects/{projectId}/artifacts/{artifactId}', { path: { projectId, artifactId } }).then((result) => result.data), [api, projectId, artifactId]);
  const versions = useLoad(
    () => api.get('/projects/{projectId}/artifacts/{artifactId}/versions', { path: { projectId, artifactId } }).then((result) => result.data.items ?? []),
    [api, projectId, artifactId],
  );
  const list = versions.data ?? [];
  const versionParam = search.get('version');
  const compareParam = search.get('compare');
  const selected = versionParam ? list.find((row) => row.id === versionParam) : list[0];
  const compared = compareParam && compareParam !== selected?.id ? list.find((row) => row.id === compareParam) : undefined;
  const type = artifact.data?.type;
  const claims = useVersionClaims(projectId, selected, type === 'synthesis');
  const [requesting, setRequesting] = useState(false);
  const [revision, setRevision] = useState<{ workflow: Workflow; refreshError?: ApiError } | undefined>();
  const [revisionEnded, setRevisionEnded] = useState<Workflow | undefined>();

  const reload = () => {
    artifact.reload();
    versions.reload();
  };
  useResearchObjectEvents(projectId, ['artifact_version', 'artifact'], reload);
  useResearchObjectEvents(projectId, ['claim'], (event) => {
    if (type === 'synthesis' && claims.data?.some((claim) => claim.id === event.objectId)) claims.reload();
  });
  useReloadSignal(() => {
    reload();
    claims.reload();
  });
  const refreshRevision = async (workflowId: string) => {
    try {
      const { data } = await api.get('/workflows/{workflowId}', { path: { workflowId } });
      if (data.status === 'Succeeded') {
        setRevision(undefined);
        reload();
      } else if (data.status === 'Failed' || data.status === 'Cancelled') {
        setRevision(undefined);
        setRevisionEnded(data);
      } else {
        setRevision({ workflow: data });
      }
    } catch (error) {
      setRevision((current) => (current ? { ...current, refreshError: toApiError(error) } : current));
    }
  };
  useEvents({ types: ['workflow.status_changed'], projectId }, (event) => {
    if (revision && event.objectId === revision.workflow.id) void refreshRevision(revision.workflow.id);
  });

  if (artifact.error?.status === 404) return <PanelNotFound kind="artifact" />;
  if ((artifact.error && !artifact.data) || (versions.error && !versions.data)) {
    return <div className="research-detail"><ErrorState error={artifact.error ?? versions.error} ns="research" title={t('artifact.loadFailed')} onRetry={reload} /></div>;
  }
  if (!artifact.data || !versions.data) return <div className="research-detail"><LoadingState what={t('artifact.loadingOne')} rows={2} /></div>;
  if (!selected) return versionParam ? <PanelNotFound kind="version" /> : <div className="research-detail"><p className="research-meta">{t('artifact.noVersions')}</p></div>;

  const current = artifact.data;
  let blocker: DecisionBlocker | undefined;
  if (current.type === 'synthesis') {
    const open = (claims.data ?? []).filter((claim) => claim.approvalStatus === 'Draft');
    if (claims.error) blocker = { reason: t('decision.claimsFailed') };
    else if (!claims.data) blocker = { reason: t('decision.loadingClaims') };
    else if (open.length) blocker = { reason: t('decision.openClaims', { count: open.length }), claims: open };
  }
  if (current.type === 'diagram' && selected.validation?.status !== 'valid') blocker = { reason: t('decision.diagramErrors') };

  const content = (version: Version, main: boolean) => {
    if (current.type === 'diagram') {
      return main ? (
        <DiagramContent
          key={version.id}
          projectId={projectId}
          artifact={current}
          version={version}
          onSaved={(id) => { navigate(paths.artifact(projectId, artifactId, { version: id })); reload(); }}
          onConflict={reload}
          onRequest={() => setRequesting(true)}
          requestDisabled={Boolean(revision)}
        />
      ) : <DiagramFigure key={version.id} projectId={projectId} artifactId={artifactId} version={version} />;
    }
    if (current.type === 'synthesis') {
      return main ? <SynthesisContent projectId={projectId} version={version} claims={claims} /> : <ComparedSynthesis key={version.id} projectId={projectId} version={version} />;
    }
    return <FormatContent version={version} />;
  };
  const versionLine = (version: Version) => [
    `v${version.versionNumber}`, version.status,
    version.status === 'Rejected' && version.review?.note ? `“${version.review.note}”` : formatWhen(version.createdAt),
  ].filter(Boolean).join(' · ');

  return (
    <div className="research-detail">
      <div className="research-detail__head">
        <div className="research-stack research-stack--tight">
          <h2 className="research-detail__title">{current.title}</h2>
          <span className="research-meta sires-num">
            {current.type} · v{selected.versionNumber}
            <TaskKey taskId={current.taskId} prefix=" · " />
          </span>
          {selected.status === 'Rejected' && selected.review?.note && <span className="research-meta">{t('decision.rejectedNote', { note: selected.review.note })}</span>}
        </div>
        <div className="research-stack research-stack--tight research-detail__actions">
          {list.length > 1 && (
            <label className="research-check">
              {t('artifact.compareWith')}
              <select
                className="research-select research-select--mono"
                value={compared?.id ?? ''}
                onChange={(event) => {
                  const next = new URLSearchParams(search);
                  if (event.currentTarget.value) next.set('compare', event.currentTarget.value);
                  else next.delete('compare');
                  setSearch(next);
                }}
              >
                <option value="">{t('artifact.noCompare')}</option>
                {list.filter((row) => row.id !== selected.id).map((row) => <option key={row.id} value={row.id}>{`v${row.versionNumber} · ${row.status}`}</option>)}
              </select>
            </label>
          )}
          <ArtifactDecision key={selected.id} projectId={projectId} artifact={current} version={selected} versions={list} blocker={blocker} onDecided={() => { reload(); claims.reload(); }} />
        </div>
      </div>
      {revision && (
        <div className="research-stack">
          <LongOperation
            title={t('diagram.revisingTitle')}
            actor={AGENT_NAMES.diagram}
            startedAt={revision.workflow.startedAt ?? revision.workflow.createdAt}
            step={revision.workflow.steps?.length ? {
              current: Math.min(revision.workflow.steps.length, revision.workflow.steps.filter((step) => step.status === 'Succeeded').length + 1),
              total: revision.workflow.steps.length,
            } : undefined}
          />
          <Link className="research-textbutton" to={paths.workflow(projectId, revision.workflow.id)}>{t('workflow.open')}</Link>
          {revision.refreshError && <ErrorState error={revision.refreshError} ns="research" title={t('workflow.refreshFailed')} onRetry={() => void refreshRevision(revision.workflow.id)} />}
        </div>
      )}
      {revisionEnded && (
        <div role="alert" className="sires-error">
          <strong className="sires-error__title">{t('diagram.revisionFailed', { status: revisionEnded.status })}</strong>
          {revisionEnded.lastError?.message && <span>{revisionEnded.lastError.message}</span>}
          <span className="sires-error__footer">
            <Link to={paths.workflow(projectId, revisionEnded.id)}>{t('workflow.open')}</Link>
            {revisionEnded.lastError?.code && <span className="sires-error__code">{revisionEnded.lastError.code}</span>}
          </span>
        </div>
      )}
      <div className="research-detail__body">
        <div className="research-detail__content">
          {compared ? (
            <div className="research-compare">
              {[selected, compared].map((version, index) => (
                <section key={version.id} className="research-compare__column research-stack" aria-label={`v${version.versionNumber} · ${version.status}`}>
                  <h3 className="research-subhead">{`v${version.versionNumber} · ${version.status}`}</h3>
                  {content(version, index === 0)}
                </section>
              ))}
            </div>
          ) : content(selected, true)}
        </div>
        <aside className="research-provenance research-stack" aria-label={t('artifact.versionInfo')}>
          <Provenance projectId={projectId} version={selected} references={references} />
          <section className="research-stack" aria-labelledby="research-versions-title">
            <h3 id="research-versions-title" className="research-subhead">{t('artifact.versions')}</h3>
            <ol className="research-versions">
              {list.map((version) => (
                <li key={version.id}>
                  <Link
                    to={paths.artifact(projectId, artifactId, { version: version.id })}
                    aria-current={version.id === selected.id ? 'true' : undefined}
                    className="sires-num"
                  >
                    {versionLine(version)}
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
      {requesting && (
        <RequestDiagramDialog
          projectId={projectId}
          artifact={current}
          onCancel={() => setRequesting(false)}
          onStarted={(workflow) => { setRequesting(false); setRevisionEnded(undefined); setRevision({ workflow }); }}
        />
      )}
    </div>
  );
}
