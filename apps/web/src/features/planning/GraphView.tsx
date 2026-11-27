// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Dependency graph of the Plan Version on screen (PID-00082 S03, H9, Plan--view-graph, Plan--view-graph-cycle):
// layers by dependency depth, edges satisfied / blocking / in a cycle, Blocked Tasks linked to what blocks them, and
// for a Draft the cycle banner, “Bỏ dependency X → Y” (If-Match) and “Trình duyệt” (disabled while a cycle exists).
// No graph library: a fixed grid, edges drawn in one SVG.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError, ErrorState, isApiError, StatusChip, useApi, useShell } from '../../shell';
import { keyOf, type PlanVersion, type Task, type TaskDefinition } from './common';
import { addedEdges, cycleEdges, edgeKey, edgesOf, findCycles, layersOf, type Edge } from './graph';

const NODE_W = 196;
const NODE_H = 76;
const GAP_X = 50;
const GAP_Y = 16;

type EdgeState = 'satisfied' | 'blocking' | 'cycle';

export interface GraphViewProps {
  projectId: string;
  version: PlanVersion;
  tasks: ReadonlyMap<string, Task>;
  hrefOf: (taskId: string) => string;
  selectedTaskId?: string | null;
}

export function GraphView({ version, tasks, hrefOf, selectedTaskId }: GraphViewProps) {
  const { t } = useTranslation('planning');
  const defs = version.tasks ?? [];
  const byId = useMemo(() => new Map(defs.map((d) => [d.taskId, d])), [defs]);
  const layers = useMemo(() => layersOf(defs), [defs]);
  const cycles = useMemo(() => findCycles(defs), [defs]);
  const inCycle = useMemo(() => new Set(cycles.flatMap((c) => cycleEdges(c).map(edgeKey))), [cycles]);
  const edges = useMemo(() => edgesOf(defs), [defs]);
  const phaseOrder = new Map((version.phases ?? []).map((p) => [p.id, p.order]));

  const statusOf = (taskId: string) => tasks.get(taskId)?.status ?? 'Draft';
  const stateOf = (edge: Edge): EdgeState => {
    if (inCycle.has(edgeKey(edge))) return 'cycle';
    const from = tasks.get(edge.from);
    return from?.status === 'Completed' && !from.needsReview ? 'satisfied' : 'blocking';
  };

  // Columns = layers; inside a column, plan order.
  const columns: TaskDefinition[][] = [];
  for (const def of defs) {
    const layer = layers.get(def.taskId) ?? 0;
    (columns[layer] ??= []).push(def);
  }
  const position = new Map<string, { x: number; y: number }>();
  columns.forEach((column, c) => column.forEach((def, r) => position.set(def.taskId, { x: c * (NODE_W + GAP_X), y: r * (NODE_H + GAP_Y) })));
  const width = Math.max(1, columns.length) * (NODE_W + GAP_X) - GAP_X;
  const height = Math.max(1, ...columns.map((c) => c.length)) * (NODE_H + GAP_Y) - GAP_Y;

  const connected = new Set(edges.flatMap((e) => [e.from, e.to]));
  const isolated = defs.filter((d) => !connected.has(d.taskId));
  const blocked = defs.filter((d) => statusOf(d.taskId) === 'Blocked');
  const name = (taskId: string) => keyOf(byId.get(taskId));

  return (
    <section className="planning-graph" aria-labelledby="planning-graph-title">
      <h2 id="planning-graph-title" className="planning-section-title">
        {version.status === 'Draft'
          ? t('graph.titleDraft', { version: version.versionNumber })
          : t('graph.title', { version: version.versionNumber, status: version.status })}
      </h2>
      <ul className="planning-legend" aria-label={t('graph.legend')}>
        <li data-edge="satisfied">{t('graph.satisfied')}</li>
        <li data-edge="blocking">{t('graph.blocking')}</li>
        <li data-edge="cycle">{t('graph.cycle')}</li>
      </ul>
      <div className="planning-graph__scroll" role="region" aria-label={t('graph.region')} tabIndex={0}>
        <div className="planning-graph__canvas" style={{ width, height }}>
          <svg className="planning-graph__edges" width={width} height={height} aria-hidden="true">
            <defs>
              {(['satisfied', 'blocking', 'cycle'] as const).map((state) => (
                <marker key={state} id={`planning-arrow-${state}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0 0L10 5L0 10z" data-edge={state} />
                </marker>
              ))}
            </defs>
            {edges.map((edge) => {
              const a = position.get(edge.from);
              const b = position.get(edge.to);
              if (!a || !b) return null;
              let d: string;
              if (b.x > a.x) {
                // Forward: right side of the prerequisite to the left side of the dependent Task.
                const [x1, y1, x2, y2] = [a.x + NODE_W, a.y + NODE_H / 2, b.x, b.y + NODE_H / 2];
                const mid = (x1 + x2) / 2;
                d = `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
              } else {
                // Going back (the edge that closes a cycle): over the top, from the source's top to the target's top.
                const lift = Math.min(a.y, b.y) - 14;
                d = `M${a.x + NODE_W / 2},${a.y} C${a.x + NODE_W / 2},${lift} ${b.x + NODE_W / 2},${lift} ${b.x + NODE_W / 2},${b.y}`;
              }
              const state = stateOf(edge);
              return <path key={edgeKey(edge)} d={d} data-edge={state} data-from={edge.from} data-to={edge.to} markerEnd={`url(#planning-arrow-${state})`} />;
            })}
          </svg>
          {defs.map((def) => {
            const pos = position.get(def.taskId)!;
            const status = statusOf(def.taskId);
            const phase = phaseOrder.get(def.phaseId);
            return (
              <Link
                key={def.taskId}
                to={hrefOf(def.taskId)}
                className="planning-node"
                draggable={false}
                data-status={status}
                data-cycle={cycles.some((c) => c.includes(def.taskId)) ? '' : undefined}
                aria-current={selectedTaskId === def.taskId ? 'true' : undefined}
                aria-label={t('graph.node', { key: keyOf(def), title: def.title, status, phase: phase ?? '–' })}
                style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
              >
                <span className="sires-id">{keyOf(def)}</span>
                <span className="planning-node__title">{def.title}</span>
                <StatusChip status={status} entity="task" />
              </Link>
            );
          })}
        </div>
      </div>

      {blocked.length > 0 && (
        <div className="planning-block">
          <h3 className="planning-block__title">{t('graph.blockedTitle')}</h3>
          <ul className="planning-list planning-list--plain">
            {blocked.map((def) => {
              const blockers = (def.dependsOn ?? []).filter((dep) => stateOf({ from: dep, to: def.taskId }) !== 'satisfied');
              return (
                <li key={def.taskId}>
                  <Link to={hrefOf(def.taskId)}>{keyOf(def)}</Link> {def.title}
                  {blockers.length > 0 ? (
                    <>
                      {' — '}
                      {t('graph.waitsFor')}{' '}
                      {blockers.map((dep, i) => (
                        <span key={dep}>
                          {i > 0 && ', '}
                          <Link to={hrefOf(dep)}>{name(dep)}</Link>
                        </span>
                      ))}
                    </>
                  ) : (
                    <> — {t('graph.blockedOther')}</>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {isolated.length > 0 && (
        <p className="planning-muted">
          {t('graph.isolated')}{' '}
          {isolated.map((def, i) => (
            <span key={def.taskId}>
              {i > 0 && ', '}
              <Link to={hrefOf(def.taskId)}>{keyOf(def)}</Link>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

export interface DraftActionsProps {
  projectId: string;
  version: PlanVersion;
  etag?: string;
  /** Version the Draft is based on, to tell which dependency was just added. */
  base?: PlanVersion;
  archived: boolean;
  onChanged: () => Promise<void> | void;
  onSubmitted: () => void;
}

/** Cycle banner, “Bỏ dependency X → Y” and “Trình duyệt” of a Draft (PID-00082-AC02, EC10–EC12). */
export function DraftActions({ projectId, version, etag, base, archived, onChanged, onSubmitted }: DraftActionsProps) {
  const { t } = useTranslation('planning');
  const api = useApi();
  const { idempotency } = useShell();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; error: ApiError; next?: string }>();
  const defs = version.tasks ?? [];
  const keyById = new Map(defs.map((d) => [d.taskId, keyOf(d)]));
  const cycles = findCycles(defs);
  const cycleKeys = new Set(cycles.flatMap((c) => cycleEdges(c).map(edgeKey)));
  const added = base ? addedEdges(defs, base.tasks ?? []).filter((e) => cycleKeys.has(edgeKey(e))) : [];
  const removable = added.length > 0 ? added : cycles.flatMap(cycleEdges);
  const label = (edge: Edge) => `${keyById.get(edge.from)} → ${keyById.get(edge.to)}`;

  const removeEdge = async (edge: Edge) => {
    setBusy(true);
    setError(undefined);
    const tasks = defs.map((d) => (d.taskId === edge.to ? { ...d, dependsOn: (d.dependsOn ?? []).filter((dep) => dep !== edge.from) } : d));
    try {
      await api.put('/projects/{projectId}/plan/versions/{planVersionId}', {
        path: { projectId, planVersionId: version.id },
        body: { tasks },
        ifMatch: etag ?? `"${version.rowVersion}"`,
      });
    } catch (err) {
      const apiError = isApiError(err) ? err : new ApiError('network');
      setError({ title: t('draft.removeFailed'), error: apiError, next: apiError.status === 412 ? t('draft.reloaded') : undefined });
    }
    await onChanged();
    setBusy(false);
  };

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await idempotency.run(`submitPlanVersion:${version.id}`, (key) =>
        api.post('/projects/{projectId}/plan/versions/{planVersionId}/submit', { path: { projectId, planVersionId: version.id }, idempotencyKey: key }),
      );
      onSubmitted();
    } catch (err) {
      setError({ title: t('draft.submitFailed'), error: isApiError(err) ? err : new ApiError('network') });
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const fieldErrors = error?.error.problem?.errors ?? [];
  return (
    <section className="planning-draft" aria-label={t('draft.label', { version: version.versionNumber })}>
      {cycles.map((cycle) => (
        <div key={cycle.join()} role="alert" className="planning-banner" data-tone="danger">
          <p className="planning-banner__title">
            {t('draft.cycleTitle', { version: version.versionNumber, path: [...cycle, cycle[0]!].map((id) => keyById.get(id)).join(' → ') })}
          </p>
          <p>
            {added.length > 0
              ? t('draft.cycleAdded', { edge: added.map(label).join(', '), count: cycle.length })
              : t('draft.cycleConsequence', { count: cycle.length })}{' '}
            <span className="sires-id">dependency_cycle</span>
          </p>
          <div className="planning-row">
            {removable
              .filter((edge) => cycle.includes(edge.from) && cycle.includes(edge.to))
              .map((edge) => (
                <button key={edgeKey(edge)} type="button" className="sires-button" data-variant="danger" data-size="sm" disabled={busy || archived} onClick={() => void removeEdge(edge)}>
                  {t('draft.removeEdge', { edge: label(edge) })}
                </button>
              ))}
          </div>
        </div>
      ))}
      {error && (
        <ErrorState
          error={error.error}
          title={error.title}
          next={error.next}
          description={
            fieldErrors.length > 0 ? (
              <ul className="planning-list">
                {fieldErrors.map((f, i) => (
                  <li key={i}>
                    <span className="sires-id">{f.field}</span> {f.message ?? f.code}
                  </li>
                ))}
              </ul>
            ) : undefined
          }
        />
      )}
      <div className="planning-row">
        <button type="button" className="sires-button" data-variant="primary" disabled={busy || archived || cycles.length > 0} onClick={() => void submit()}>
          {t('draft.submit')}
        </button>
        <span className="planning-muted">{archived ? t('panel.archived') : cycles.length > 0 ? t('draft.cycleBlocks') : t('draft.submitHint')}</span>
      </div>
    </section>
  );
}
