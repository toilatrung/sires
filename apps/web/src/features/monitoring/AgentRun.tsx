// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Agent Run (PID-00059 S04; H12–H14): the panel of the workflow page (`?agentRun=`) with agent, Provider Connection
// and actual model, input context, tools, outputs, usage, time and attempts, error; the debug part (collapsed, auto
// deletion date; opened → getAgentRunDebugTranscript); the workflow's usage total; the route
// /projects/:projectId/activity/agent-runs/:agentRunId that opens the panel on its workflow (EC29; PID-00058 H8).
// No internal reasoning of the model, no API key or key field (UX-MONITOR-003); no budget warning (NFR-USAGE-004).

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router';
import { ErrorState, LoadingState, NotFound, StatusChip, formatDate, formatDateTime, formatNumber, isApiError, useApi, useEvents, type ApiError } from '../../shell';
import { NS, RefLink, hrefs, shortId, useAgentName, useResource, type AgentRun, type Workflow } from './shared';

/** Debug transcripts are kept 30 days (NFR-RET-009): the date shown before the transcript is opened. */
const DEBUG_DAYS = 30;

export interface UsageTotal {
  inputTokens: number | null;
  outputTokens: number | null;
  calls: number;
  /** Only when every run that reports a cost uses one currency (provider's cost, never a price table). */
  cost?: { amount: number; currency: string };
}

/** Exact sum over the Agent Runs of a workflow, discarded ones included (NFR-USAGE-002, EC26); a field nobody reported stays null. */
export function workflowUsage(runs: AgentRun[]): UsageTotal {
  let input: number | null = null;
  let output: number | null = null;
  let calls = 0;
  let cost = 0;
  const currencies = new Set<string>();
  for (const run of runs) {
    const u = run.usage;
    calls += u.calls;
    if (u.inputTokens !== null) input = (input ?? 0) + u.inputTokens;
    if (u.outputTokens !== null) output = (output ?? 0) + u.outputTokens;
    const extra = u.extra as { cost?: number; currency?: string } | undefined;
    if (typeof extra?.cost === 'number') {
      cost += extra.cost;
      currencies.add(extra.currency ?? '');
    }
  }
  const currency = [...currencies][0];
  return { inputTokens: input, outputTokens: output, calls, ...(currencies.size === 1 && currency ? { cost: { amount: cost, currency } } : {}) };
}

/** /projects/:projectId/activity/agent-runs/:agentRunId → the workflow page with the panel open (EC29). */
export function AgentRunRoute() {
  const { t } = useTranslation(NS);
  const api = useApi();
  const { projectId = '', agentRunId = '' } = useParams();
  const resource = useResource(async () => (await api.get('/agent-runs/{agentRunId}', { path: { agentRunId } })).data, [agentRunId]);
  if (resource.value.state === 'loading') return <LoadingState what={t('agentRun.loading')} rows={2} />;
  if (resource.value.state === 'error') {
    if (isApiError(resource.value.error) && resource.value.error.status === 404) return <NotFound />;
    return (
      <section className="sires-mon">
        <ErrorState error={resource.value.error} ns={NS} title={t('agentRun.loadFailed')} onRetry={() => void resource.reload()} />
      </section>
    );
  }
  const run = resource.value.data;
  return <Navigate replace to={hrefs.agentRun(run.projectId ?? projectId, run.workflowId, run.id)} />;
}

export function AgentRunPanel({ projectId, agentRunId, workflow, onClose }: { projectId: string; agentRunId: string; workflow: Workflow; onClose: () => void }) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const agentName = useAgentName();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const resource = useResource(async () => {
    const run = (await api.get('/agent-runs/{agentRunId}', { path: { agentRunId } })).data;
    let connection: string | undefined;
    try {
      const connections = (await api.get('/provider-connections')).data.items ?? [];
      connection = connections.find((c) => c.id === run.providerConnectionId)?.name;
    } catch {
      // The panel then names the connection by its short id.
    }
    return { run, connection };
  }, [agentRunId]);
  // A running Agent Run finishes while the panel is open (UX-MONITOR-005, EC24): read it again.
  useEvents({ types: ['agent_run.status_changed'], projectId }, (event) => {
    if (event.objectId === agentRunId) void resource.reload();
  });
  const ready = resource.value.state === 'ready';
  useEffect(() => {
    if (ready) titleRef.current?.focus();
  }, [ready, agentRunId]);

  return (
    <section className="sires-mon__panel" aria-labelledby="sires-mon-agent-run">
      {resource.value.state === 'loading' && <LoadingState what={t('agentRun.loading')} rows={2} />}
      {resource.value.state === 'error' &&
        (isApiError(resource.value.error) && resource.value.error.status === 404 ? (
          <p role="alert">{t('agentRun.notFound')}</p>
        ) : (
          <ErrorState error={resource.value.error} ns={NS} title={t('agentRun.loadFailed')} onRetry={() => void resource.reload()} />
        ))}
      {resource.value.state === 'ready' && (
        <RunDetail
          projectId={projectId}
          run={resource.value.data.run}
          connection={resource.value.data.connection}
          step={(workflow.steps ?? []).findIndex((s) => resource.value.state === 'ready' && s.id === resource.value.data.run.stepId) + 1}
          total={(workflow.steps ?? []).length}
          titleRef={titleRef}
          agentName={agentName}
        />
      )}
      <div className="sires-mon__controls">
        <button type="button" className="sires-button" data-size="sm" onClick={onClose}>
          {t('agentRun.close')}
        </button>
      </div>
    </section>
  );
}

function RunDetail({
  projectId,
  run,
  connection,
  step,
  total,
  titleRef,
  agentName,
}: {
  projectId: string;
  run: AgentRun;
  connection?: string;
  step: number;
  total: number;
  titleRef: React.RefObject<HTMLHeadingElement>;
  agentName: ReturnType<typeof useAgentName>;
}) {
  const { t } = useTranslation(NS);
  const open = run.status === 'Pending' || run.status === 'Running';
  const pending = <span className="sires-mon__muted">{t('agentRun.running')}</span>;
  const manifest = run.contextManifest as { entities?: AgentRun['outputRefs']; truncated?: { layer?: string; reason?: string }[] } | undefined;
  const output = Object.entries(run.structuredOutput ?? {});
  const extra = run.usage.extra as { cost?: number; currency?: string } | undefined;
  const num = (value: number | null) => (value === null ? '—' : formatNumber(value));

  return (
    <>
      <h2 id="sires-mon-agent-run" ref={titleRef} tabIndex={-1} className="sires-mon__section-title sires-mon__title-row">
        <span>{agentName(run.agent, run.instance)}</span>
        <span className="sires-id">{shortId('ar', run.id)}</span>
        <StatusChip status={run.status} entity="agent-run" />
        {run.discarded && <span className="sires-mon__label">{t('agentRun.discarded')}</span>}
      </h2>
      {step > 0 && <p className="sires-mon__lede">{t('agentRun.ofStep', { current: step, total })}</p>}
      <dl className="sires-mon__facts">
        <dt>{t('agentRun.connection')}</dt>
        <dd>{connection ?? t('agentRun.connectionUnknown', { id: shortId('pc', run.providerConnectionId) })}</dd>
        <dt>{t('agentRun.model')}</dt>
        <dd>
          <span className="sires-id">{run.model}</span> <span className="sires-mon__muted">({run.provider})</span>
        </dd>
        <dt>{t('agentRun.context')}</dt>
        <dd>
          {open && !run.inputSummary ? (
            pending
          ) : (
            <>
              <span className="sires-mon__block">{run.inputSummary || '—'}</span>
              {manifest?.entities?.length ? (
                <ul className="sires-mon__refs">
                  {manifest.entities.map((ref) => (
                    <li key={`${ref.type}:${ref.id}`}>
                      <RefLink projectId={projectId} value={ref} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {manifest?.truncated?.map((cut, i) => (
                <span key={i} className="sires-mon__block sires-mon__muted">
                  {t('agentRun.truncated', { layer: cut.layer ?? '—', reason: cut.reason ?? '—' })}
                </span>
              ))}
            </>
          )}
        </dd>
        <dt>{t('agentRun.tools')}</dt>
        <dd>
          {open && !run.toolCalls?.length ? (
            pending
          ) : run.toolCalls?.length ? (
            <ul className="sires-mon__refs">
              {run.toolCalls.map((call, i) => (
                <li key={i}>
                  <span className="sires-id">{call.name}</span> {call.argumentsSummary && `— ${call.argumentsSummary}`} {call.resultSummary && `→ ${call.resultSummary}`}
                </li>
              ))}
            </ul>
          ) : (
            '—'
          )}
        </dd>
        <dt>{t('agentRun.output')}</dt>
        <dd>
          {open && !output.length && !run.outputRefs?.length ? (
            pending
          ) : (
            <>
              {run.outputRefs?.length ? (
                <ul className="sires-mon__refs">
                  {run.outputRefs.map((ref) => (
                    <li key={`${ref.type}:${ref.id}`}>
                      <RefLink projectId={projectId} value={ref} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {output.length > 0 && (
                <dl className="sires-mon__kv" aria-label={t('agentRun.structured')}>
                  {output.slice(0, 8).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{typeof value === 'object' ? JSON.stringify(value).slice(0, 120) : String(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {!run.outputRefs?.length && !output.length && '—'}
            </>
          )}
        </dd>
        <dt>{t('agentRun.usage')}</dt>
        <dd data-testid="run-usage">
          {run.usage.noData ? (
            t('usage.noData')
          ) : (
            <>
              {t('usage.run', { input: num(run.usage.inputTokens), output: num(run.usage.outputTokens), calls: formatNumber(run.usage.calls) })}
              {typeof extra?.cost === 'number' && <> · {t('usage.costEstimate', { cost: formatNumber(extra.cost, { maximumFractionDigits: 4 }), currency: extra.currency ?? '' })}</>}
            </>
          )}
        </dd>
        <dt>{t('agentRun.time')}</dt>
        <dd className="sires-num">
          {run.startedAt ? formatDateTime(run.startedAt) : '—'} – {run.endedAt ? formatDateTime(run.endedAt) : open ? t('agentRun.running') : '—'} · {t('agentRun.attempts', { count: run.attempts })}
        </dd>
        {run.error?.code && (
          <>
            <dt>{t('agentRun.error')}</dt>
            <dd>
              {t(`error.${run.error.code}`, { defaultValue: t('error.other') })} ({t('banner.code', { code: run.error.code })})
            </dd>
          </>
        )}
      </dl>
      <Debug run={run} />
      <p className="sires-mon__hint">{t('agentRun.noSecrets')}</p>
    </>
  );
}

/** Debug part (EC23): off → a line; on → collapsed with the deletion date, the transcript read when opened; 404 → gone. */
function Debug({ run }: { run: AgentRun }) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'gone' | 'error'; text?: string; expiresAt?: string; error?: ApiError }>({ status: 'idle' });
  if (!run.hasDebugTranscript) return <p className="sires-mon__muted">{t('debug.off')}</p>;
  const captured = run.startedAt ?? run.createdAt;
  const expires = state.expiresAt ?? new Date(Date.parse(captured) + DEBUG_DAYS * 86_400_000).toISOString();
  const load = async () => {
    if (state.status !== 'idle' && state.status !== 'error') return;
    setState({ status: 'loading' });
    try {
      const transcript = (await api.get('/agent-runs/{agentRunId}/debug-transcript', { path: { agentRunId: run.id } })).data;
      setState({ status: 'ready', expiresAt: transcript.expiresAt, text: JSON.stringify({ request: transcript.request, response: transcript.response }, null, 2) });
    } catch (error) {
      setState(isApiError(error) && error.status === 404 ? { status: 'gone' } : { status: 'error', error: error as ApiError });
    }
  };
  return (
    <details className="sires-mon__debug" onToggle={(e) => (e.currentTarget.open ? void load() : undefined)}>
      <summary>
        {t('debug.title')} · {t('debug.expires', { date: formatDate(expires) })}
      </summary>
      {state.status === 'loading' && <LoadingState what={t('debug.title')} rows={1} />}
      {state.status === 'gone' && <p role="status">{t('debug.gone')}</p>}
      {state.status === 'error' && state.error && <ErrorState error={state.error} ns={NS} onRetry={() => void load()} />}
      {state.status === 'ready' && (
        <pre className="sires-mon__transcript" tabIndex={0}>
          {state.text}
        </pre>
      )}
    </details>
  );
}
