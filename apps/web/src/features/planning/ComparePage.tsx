// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Plan Version compare and approval (PID-00082 S05, reference PlanCompare, UX-PLAN-001, UX-PLAN-002): changes against
// the baseline (or `?against=`), goals and methods before/after, Task / dependency / label table with MC codes, cycle
// and impact check, then the approval bar (only for Proposed): open assumptions first, Approve with versionNumber,
// Reject with a required reason (draft store), Withdraw into a new Draft.

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  ApiError,
  ErrorState,
  formatDateTime,
  isApiError,
  LoadingState,
  StatusChip,
  useApi,
  useDraft,
  useEvents,
  useRefreshNavigation,
  useShell,
} from '../../shell';
import { contextText, keyOf, useResource, type PlanVersion, type Schemas } from './common';
import { findCycles } from './graph';
import { useArchived } from './PlanPage';
import { AGENT_NAMES } from './TaskPanel';

type Change = NonNullable<Schemas['PlanDiff']['changes']>[number];

const GOAL_PATHS = ['goals', 'methods'] as const;

export function ComparePage() {
  const { projectId = '', versionId = '' } = useParams();
  const { t } = useTranslation('planning');
  const api = useApi();
  const [search, setSearch] = useSearchParams();
  const plan = useResource(() => api.get('/projects/{projectId}/plan', { path: { projectId } }), [api, projectId]);
  const version = useResource(
    () => api.get('/projects/{projectId}/plan/versions/{planVersionId}', { path: { projectId, planVersionId: versionId } }),
    [api, projectId, versionId],
  );
  // ?against= only when the Researcher picks another version; without it the server compares with the baseline.
  const againstParam = search.get('against') ?? undefined;
  const against = againstParam ?? plan.data?.baselineVersionId ?? version.data?.basedOnVersionId ?? undefined;
  const from = useResource(
    () => (against ? api.get('/projects/{projectId}/plan/versions/{planVersionId}', { path: { projectId, planVersionId: against } }) : Promise.resolve({ data: undefined })),
    [api, projectId, against],
  );
  const diff = useResource(
    () => api.get('/projects/{projectId}/plan/versions/{planVersionId}/diff', { path: { projectId, planVersionId: versionId }, query: { against: againstParam } }),
    [api, projectId, versionId, againstParam],
  );
  const impact = useResource(() => api.get('/projects/{projectId}/plan/versions/{planVersionId}/impact', { path: { projectId, planVersionId: versionId } }), [api, projectId, versionId]);

  const reloadAll = async () => {
    await Promise.all([plan.reload(), version.reload(), diff.reload(), impact.reload()]);
  };
  useEvents({ types: ['plan_version.status_changed'], projectId }, (event) => {
    if (event.objectId === versionId || event.objectId === against) void reloadAll();
  });

  if (version.status === 'loading' && !version.data) return <LoadingState what={t('compare.loading')} />;
  if (!version.data) return <ErrorState error={version.error} title={t('version.loadFailed')} onRetry={() => void version.reload()} />;
  const current = version.data;
  const changes = diff.data?.changes ?? [];
  const otherVersions = [...(plan.data?.versions ?? [])].filter((v) => v.id !== versionId).sort((a, b) => b.versionNumber - a.versionNumber);
  const fromSummary = plan.data?.versions?.find((v) => v.id === against);

  return (
    <div className="planning-page planning-compare">
      <div className="planning-main">
        <header className="planning-header">
          <h1 className="planning-title">
            {t('compare.title', { version: current.versionNumber })} <StatusChip status={current.status} entity="plan-version" />
          </h1>
          <p className="planning-muted">
            {t('compare.proposedBy', { actor: actorName(current.createdBy, t), at: formatDateTime(current.createdAt) })} ·{' '}
            <label className="planning-inline-field">
              {t('compare.against')}{' '}
              <select className="sires-input" value={against ?? ''} onChange={(e) => setSearch(e.currentTarget.value ? { against: e.currentTarget.value } : {})}>
                {otherVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {`v${v.versionNumber} ${v.status}`}
                    {v.id === plan.data?.baselineVersionId ? ` ${t('version.baseline')}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {current.changeSummary && <> · {t('compare.reason', { reason: current.changeSummary })}</>}
          </p>
          <p>
            <Link to={`/projects/${encodeURIComponent(projectId)}/plan?version=${encodeURIComponent(current.id)}`}>{t('compare.openInPlan')}</Link>
          </p>
        </header>

        {diff.status === 'loading' && !diff.data && <LoadingState what={t('compare.diffLoading')} />}
        {diff.status === 'error' && <ErrorState error={diff.error} title={t('compare.diffFailed')} onRetry={() => void diff.reload()} />}
        {diff.data && (
          <>
            <Counts changes={changes} />
            <GoalsAndMethods changes={changes} from={from.data} fromNumber={fromSummary?.versionNumber} to={current} />
            <TaskTable changes={changes} from={from.data} to={current} />
            <CheckLine version={current} impact={impact.data} />
          </>
        )}
      </div>
      <ApprovalBar projectId={projectId} version={current} from={from.data} changes={changes} onChanged={reloadAll} />
    </div>
  );
}

function actorName(actor: Schemas['ActorRef'] | undefined, t: (k: string) => string): string {
  if (!actor) return '';
  if (actor.type === 'agent' && actor.agent) return AGENT_NAMES[actor.agent];
  return actor.type === 'researcher' ? t('compare.you') : actor.type;
}

function Counts({ changes }: { changes: Change[] }) {
  const { t } = useTranslation('planning');
  const count = (op: Change['operation']) => changes.filter((c) => c.operation === op && c.path?.startsWith('tasks/') && c.path.split('/').length === 2).length;
  const modifiedTasks = new Set(changes.filter((c) => c.operation === 'modified' && c.path?.startsWith('tasks/')).map((c) => c.path!.split('/')[1])).size;
  return (
    <p className="planning-counts" aria-label={t('compare.countsLabel')}>
      <span data-op="added">{t('compare.added', { count: count('added') })}</span>
      <span data-op="removed">{t('compare.removed', { count: count('removed') })}</span>
      <span data-op="modified">{t('compare.modified', { count: modifiedTasks })}</span>
    </p>
  );
}

const asList = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : value === undefined || value === null ? [] : [String(value)]);

function GoalsAndMethods({ changes, from, fromNumber, to }: { changes: Change[]; from?: PlanVersion; fromNumber?: number; to: PlanVersion }) {
  const { t } = useTranslation('planning');
  const rows = GOAL_PATHS.map((path) => ({ path, change: changes.find((c) => c.path === path) }));
  if (!rows.some((r) => r.change)) return null;
  return (
    <section className="planning-block" aria-labelledby="planning-goals">
      <h2 id="planning-goals" className="planning-section-title">{t('compare.goalsTitle')}</h2>
      {rows.map(({ path, change }) => (
        <div key={path} className="planning-beforeafter">
          <div>
            <h3 className="planning-block__title">{t('compare.side', { version: fromNumber ?? from?.versionNumber ?? '–', part: t(`content.${path}`) })}</h3>
            <ul className="planning-list">
              {asList(change ? change.before : from?.[path]).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
          <div data-changed={change ? '' : undefined}>
            <h3 className="planning-block__title">
              {t('compare.side', { version: to.versionNumber, part: t(`content.${path}`) })}
              {change && ` · ${t('compare.op.modified')}`}
              {change?.materialChangeCode && <Material code={change.materialChangeCode} />}
            </h3>
            <ul className="planning-list">
              {asList(change ? change.after : to[path]).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </section>
  );
}

function Material({ code }: { code: string }) {
  const { t } = useTranslation('planning');
  return <span className="planning-mc">{t('compare.material', { code })}</span>;
}

/** Changes grouped by Task: one row per Task, the operation, and before → after of each field. */
function TaskTable({ changes, from, to }: { changes: Change[]; from?: PlanVersion; to: PlanVersion }) {
  const { t } = useTranslation('planning');
  const groups = new Map<string, Change[]>();
  for (const change of changes) {
    const [root, key] = (change.path ?? '').split('/');
    if (root !== 'tasks' || !key) continue;
    groups.set(key, [...(groups.get(key) ?? []), change]);
  }
  if (groups.size === 0) return null;
  const phaseName = (id: unknown) => [...(to.phases ?? []), ...(from?.phases ?? [])].find((p) => p.id === id)?.name ?? String(id);
  const value = (field: string, v: unknown): string => {
    if (field === 'phaseId') return phaseName(v);
    const list = asList(v);
    return list.length ? list.join(', ') : t('compare.none');
  };
  const definition = (key: string) => to.tasks?.find((d) => keyOf(d) === key) ?? from?.tasks?.find((d) => keyOf(d) === key);
  return (
    <section className="planning-block" aria-labelledby="planning-task-changes">
      <h2 id="planning-task-changes" className="planning-section-title">{t('compare.tasksTitle')}</h2>
      <table className="planning-table">
        <thead>
          <tr>
            <th scope="col">{t('compare.colChange')}</th>
            <th scope="col">{t('compare.colTask')}</th>
            <th scope="col">{t('compare.colDetail')}</th>
          </tr>
        </thead>
        <tbody>
          {[...groups].map(([key, list]) => {
            const whole = list.find((c) => c.path === `tasks/${key}`);
            const op = whole?.operation ?? 'modified';
            const def = definition(key);
            const title = (whole?.after as { title?: string } | undefined)?.title ?? (whole?.before as { title?: string } | undefined)?.title ?? def?.title;
            const details: ReactNode[] = list
              .filter((c) => c !== whole)
              .map((c) => {
                const field = c.path!.split('/')[2] ?? '';
                return (
                  <li key={c.path}>
                    {t(`compare.field.${field}`, { defaultValue: field })}: {value(field, c.before)} → {value(field, c.after)}
                    {c.materialChangeCode && <Material code={c.materialChangeCode} />}
                  </li>
                );
              });
            if (whole && op === 'added' && def) {
              details.push(
                <li key="added">
                  {def.executionLabel}
                  {def.proposedAgent && ` · ${AGENT_NAMES[def.proposedAgent]}`}
                  {(def.dependsOn ?? []).length > 0 && ` · ${t('compare.dependsOn', { list: (def.dependsOn ?? []).map((id) => keyOf(to.tasks?.find((d) => d.taskId === id))).join(', ') })}`}
                </li>,
              );
            }
            return (
              <tr key={key} data-op={op}>
                <td>
                  {t(`compare.op.${op}`)}
                  {whole?.materialChangeCode && <Material code={whole.materialChangeCode} />}
                </td>
                <td>
                  <span className="sires-id">{key}</span> {title}
                </td>
                <td>
                  <ul className="planning-list planning-list--plain">{details}</ul>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function CheckLine({ version, impact }: { version: PlanVersion; impact?: Schemas['ImpactReport'] }) {
  const { t } = useTranslation('planning');
  const cycles = findCycles(version.tasks ?? []);
  const keyOfTask = (id?: string) => keyOf(version.tasks?.find((d) => d.taskId === id)) || id?.slice(0, 8);
  const affected = (impact?.affected ?? []).filter((a) => a.effect && a.effect !== 'unchanged');
  return (
    <p className="planning-check-line" data-cycle={cycles.length ? '' : undefined}>
      {cycles.length
        ? t('compare.hasCycle', { version: version.versionNumber, path: [...cycles[0]!, cycles[0]![0]!].map(keyOfTask).join(' → ') })
        : t('compare.noCycle', { version: version.versionNumber })}{' '}
      {impact &&
        (affected.length
          ? t('compare.impact', { list: affected.map((a) => `${keyOfTask(a.objectId)} ${t(`compare.effect.${a.effect}`)}`).join('; ') })
          : t('compare.noImpact'))}
    </p>
  );
}

function ApprovalBar({ projectId, version, from, changes, onChanged }: { projectId: string; version: PlanVersion; from?: PlanVersion; changes: Change[]; onChanged: () => Promise<void> }) {
  const { t } = useTranslation('planning');
  const api = useApi();
  const navigate = useNavigate();
  const refreshNavigation = useRefreshNavigation();
  const { idempotency } = useShell();
  const archived = useArchived(projectId);
  const reason = useDraft(`compare.${version.id}.rejectReason`);
  const [seen, setSeen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; error: ApiError; next?: string }>();
  const [done, setDone] = useState<string>();
  const proposed = version.status === 'Proposed';
  const shared = useResource(() => (proposed ? api.get('/projects/{projectId}/shared-context', { path: { projectId } }) : Promise.resolve({ data: undefined })), [api, projectId, proposed]);

  if (!proposed) {
    return (
      <aside className="planning-approval" aria-label={t('approve.label', { version: version.versionNumber })}>
        {done && <p role="status">{done}</p>}
        <p className="planning-note" role="note">
          {t('approve.readOnly', { version: version.versionNumber, status: version.status })}
        </p>
      </aside>
    );
  }

  const assumptions = shared.data
    ? (shared.data.activeContextItems ?? []).filter((item) => item.kind === 'assumption' && item.status === 'Active').map(contextText)
    : shared.status === 'error'
      ? (version.assumptions ?? [])
      : [];
  const needsSeen = assumptions.length > 0 && !seen;
  const removed = changes.filter((c) => c.operation === 'removed' && c.path?.split('/').length === 2).length;
  const path = { projectId, planVersionId: version.id };

  const act = async (title: string, send: () => Promise<unknown>, after?: (result: unknown) => void) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await send();
      after?.(result);
      void refreshNavigation();
    } catch (err) {
      const apiError = isApiError(err) ? err : new ApiError('network');
      setError({ title, error: apiError, next: apiError.status === 409 ? t('approve.reloaded') : undefined });
    } finally {
      setBusy(false);
      await onChanged();
    }
  };

  return (
    <aside className="planning-approval" aria-labelledby="planning-approve-title">
      <h2 id="planning-approve-title" className="planning-section-title">{t('approve.title', { version: version.versionNumber })}</h2>
      {shared.status === 'loading' && <LoadingState what={t('approve.assumptionsLoading')} rows={1} />}
      {assumptions.length > 0 && (
        <div className="planning-assumptions">
          <p className="planning-block__title">{t('approve.assumptions', { count: assumptions.length })}</p>
          <ul className="planning-list">
            {assumptions.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
          <label className="planning-checkbox">
            <input type="checkbox" checked={seen} onChange={(e) => setSeen(e.currentTarget.checked)} />
            {t('approve.seen')}
          </label>
        </div>
      )}
      <p>{t('approve.consequence', { version: version.versionNumber, previous: from ? `v${from.versionNumber}` : t('approve.noBaseline'), count: removed })}</p>
      {error && <ErrorState error={error.error} title={error.title} next={error.next} />}
      <button
        type="button"
        className="sires-button"
        data-variant="primary"
        disabled={busy || archived || needsSeen || shared.status === 'loading'}
        onClick={() =>
          void act(
            t('approve.approveFailed'),
            () =>
              idempotency.run(`approvePlanVersion:${version.id}`, (key) =>
                api.post('/projects/{projectId}/plan/versions/{planVersionId}/approve', { path, idempotencyKey: key, body: { versionNumber: version.versionNumber } }),
              ),
            // Approved: back to the Plan, which opens on the new baseline.
            () => navigate(`/projects/${encodeURIComponent(projectId)}/plan`),
          )
        }
      >
        {t('approve.approve', { version: version.versionNumber })}
      </button>
      {needsSeen && <p className="planning-muted">{t('approve.seenFirst')}</p>}
      {archived && <p className="planning-muted">{t('panel.archived')}</p>}

      <label className="sires-field">
        <span className="sires-field__label">{t('approve.rejectReason')}</span>
        <textarea className="sires-input" rows={3} value={reason.value} onChange={(e) => reason.setValue(e.currentTarget.value)} />
      </label>
      <button
        type="button"
        className="sires-button"
        data-variant="secondary"
        disabled={busy || archived || !reason.value.trim()}
        onClick={() =>
          void act(
            t('approve.rejectFailed'),
            () =>
              idempotency.run(`rejectPlanVersion:${version.id}`, (key) =>
                api.post('/projects/{projectId}/plan/versions/{planVersionId}/reject', { path, idempotencyKey: key, body: { reason: reason.value.trim() } }),
              ),
            () => {
              reason.clear();
              setDone(t('approve.rejected', { version: version.versionNumber }));
            },
          )
        }
      >
        {reason.value.trim() ? t('approve.reject', { version: version.versionNumber }) : t('approve.rejectNeedsReason')}
      </button>
      <button
        type="button"
        className="sires-button"
        data-variant="outline"
        disabled={busy || archived}
        onClick={() =>
          void act(
            t('approve.withdrawFailed'),
            () =>
              idempotency.run(`withdrawPlanVersion:${version.id}`, (key) =>
                api.post('/projects/{projectId}/plan/versions/{planVersionId}/withdraw', { path, idempotencyKey: key }),
              ),
            (result) => {
              const draft = (result as { data?: PlanVersion }).data;
              if (draft) navigate(`/projects/${encodeURIComponent(projectId)}/plan?version=${encodeURIComponent(draft.id)}&view=graph`);
            },
          )
        }
      >
        {t('approve.withdraw')}
      </button>
    </aside>
  );
}
