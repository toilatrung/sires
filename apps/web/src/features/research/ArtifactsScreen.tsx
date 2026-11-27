// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Research Artifacts (P7 Artifacts; S05, H3, H8): one row per artifact (listArtifacts returns Artifact, not versions),
// “type · v{n}”, Task key, title, chip of latestVersion, “Đang dùng: v{k} Accepted” when the current Accepted version
// is not the latest; filters by type and hasAccepted, “Chỉ liên quan T-x”; the detail on the right.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { EmptyState, ErrorState, LoadingState, StatusChip, useApi, useNavigationData } from '../../shell';
import { ArtifactDetail } from './ArtifactDetail';
import { TaskKeysProvider, useLoad, usePaged, useReloadSignal, useResearchObjectEvents, type Schemas } from './data';
import { paths } from './labels';
import { TaskKey } from './Panel';

type Artifact = Schemas['Artifact'];
const TYPES: Schemas['ArtifactType'][] = ['note', 'table', 'synthesis', 'diagram', 'draft_section', 'file', 'manual_submission', 'verification_report', 'deliberation_record'];
const PAGE = 20;

/** Number of the current Accepted version when it is not the latest (EC27); listArtifactVersions of that artifact. */
function InUse({ projectId, artifact }: { projectId: string; artifact: Artifact }) {
  const { t } = useTranslation('research');
  const api = useApi();
  const acceptedId = artifact.currentAcceptedVersionId;
  const versions = useLoad(
    () => api.get('/projects/{projectId}/artifacts/{artifactId}/versions', { path: { projectId, artifactId: artifact.id } }).then((result) => result.data.items ?? []),
    [api, projectId, artifact.id, acceptedId],
  );
  const accepted = versions.data?.find((row) => row.id === acceptedId);
  return <span>{accepted ? t('artifacts.inUse', { version: accepted.versionNumber }) : t('artifacts.inUseUnknown')}</span>;
}

export function ResearchArtifacts() {
  const { projectId = '' } = useParams();
  return (
    <TaskKeysProvider key={projectId} projectId={projectId}>
      <ArtifactsFrame projectId={projectId} />
    </TaskKeysProvider>
  );
}

function ArtifactsFrame({ projectId }: { projectId: string }) {
  const { t } = useTranslation('research');
  const api = useApi();
  const { artifactId } = useParams();
  const navigation = useNavigationData();
  const activeTask = navigation.project?.id === projectId ? navigation.project.activeTask : undefined;
  const [onlyTask, setOnlyTask] = useState(false);
  const taskId = onlyTask && activeTask ? activeTask.id : undefined;
  const [type, setType] = useState<Schemas['ArtifactType'] | ''>('');
  const [accepted, setAccepted] = useState<'' | 'true' | 'false'>('');

  const artifacts = usePaged(
    (cursor) => api.get('/projects/{projectId}/artifacts', {
      path: { projectId },
      query: {
        limit: PAGE, ...(cursor ? { cursor } : {}), ...(taskId ? { taskId } : {}), ...(type ? { type } : {}),
        ...(accepted ? { hasAccepted: accepted === 'true' } : {}),
      },
    }).then((result) => result.data),
    [api, projectId, taskId, type, accepted],
  );
  const references = useLoad(
    () => api.get('/projects/{projectId}/references', { path: { projectId } }).then((result) => result.data.items ?? []),
    [api, projectId],
  );
  useResearchObjectEvents(projectId, ['artifact_version', 'artifact'], artifacts.reload);
  useReloadSignal(() => {
    artifacts.reload();
    references.reload();
  });
  const filtered = Boolean(type || accepted || taskId);

  return (
    <div className="research-artifacts">
      <section className="research-artifacts__list" aria-labelledby="research-artifacts-title">
        <div className="research-artifacts__head">
          <h1 id="research-artifacts-title" className="research-artifacts__title">Research Artifacts</h1>
          <div className="research-filters research-filters--bare">
            <select className="research-select" aria-label={t('filter.type')} value={type} onChange={(event) => setType(event.currentTarget.value as Schemas['ArtifactType'] | '')}>
              <option value="">{t('filter.allTypes')}</option>
              {TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select className="research-select" aria-label={t('filter.status')} value={accepted} onChange={(event) => setAccepted(event.currentTarget.value as '' | 'true' | 'false')}>
              <option value="">{t('filter.allStatus')}</option>
              <option value="true">{t('filter.hasAccepted')}</option>
              <option value="false">{t('filter.noAccepted')}</option>
            </select>
          </div>
          {activeTask && (
            <label className="research-check">
              <input type="checkbox" checked={onlyTask} onChange={(event) => setOnlyTask(event.currentTarget.checked)} />
              {t('toolbar.onlyTask', { task: activeTask.key ?? '…' })}
            </label>
          )}
        </div>
        {artifacts.error && !artifacts.data && (
          <div className="research-region"><ErrorState error={artifacts.error} ns="research" title={t('artifacts.loadFailed')} next={t('list.otherAreasWork')} onRetry={artifacts.reload} /></div>
        )}
        {!artifacts.data && !artifacts.error && <div className="research-region"><LoadingState what={t('artifacts.loading')} /></div>}
        {artifacts.data?.length === 0 && (
          <div className="research-region">
            {filtered
              ? <EmptyState title={t('artifacts.noMatchTitle')} reason={t('list.noMatchReason')} />
              : <EmptyState title={t('artifacts.emptyTitle')} reason={t('artifacts.emptyReason')} action={<Link className="sires-button" to={paths.plan(projectId)}>Plan and Tasks</Link>} />}
          </div>
        )}
        {artifacts.data && artifacts.data.length > 0 && (
          <ul className="research-rows" aria-label={t('artifacts.listLabel')}>
            {artifacts.data.map((artifact) => {
              const latest = artifact.latestVersion;
              const inUse = Boolean(artifact.currentAcceptedVersionId && latest && artifact.currentAcceptedVersionId !== latest.id);
              return (
                <li key={artifact.id}>
                  <Link to={paths.artifact(projectId, artifact.id)} className="research-row research-row--compact" aria-current={artifact.id === artifactId ? 'page' : undefined}>
                    <span className="research-row__line research-meta">
                      <span className="sires-id">{`${artifact.type}${latest ? ` · v${latest.versionNumber}` : ''}`}</span>
                      <TaskKey taskId={artifact.taskId} />
                    </span>
                    <span className="research-row__title">{artifact.title}</span>
                    <span className="research-row__meta">
                      {latest?.status && <StatusChip status={latest.status} entity="artifact" />}
                      {inUse && <InUse projectId={projectId} artifact={artifact} />}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <div className="research-listfoot">
          {artifacts.nextCursor && (
            <button type="button" className="sires-button" data-size="sm" disabled={artifacts.loadingMore} onClick={artifacts.loadMore}>{t('list.loadMore')}</button>
          )}
          {artifacts.moreError && <ErrorState error={artifacts.moreError} ns="research" title={t('list.moreFailed')} onRetry={artifacts.loadMore} />}
        </div>
      </section>
      {artifactId
        ? <ArtifactDetail key={artifactId} projectId={projectId} artifactId={artifactId} references={references.data ?? []} />
        : <div className="research-detail"><p className="research-meta">{t('artifacts.choose')}</p></div>}
    </div>
  );
}
