// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// “Thảo luận” tab of the workflow page (PID-00083, Workflow--view-deliberation-*): sessions of the workflow (newest
// first, `?deliberation=`), session header and warnings, Problem Brief, Deliberation Board, synthesis, decision prompt,
// usage; “Chưa mở phiên” while a proposal waits without a session (EC17); deliberated / not deliberated labels.
//
// PID-00059's workflow page shows it with one import:
//   const tab = useDeliberationTab(projectId, workflow);
//   {tab.visible && <Tab …>Thảo luận</Tab>}  …  {view === 'deliberation' && <DeliberationTab projectId={projectId} workflow={workflow} />}

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import {
  ApiError,
  EmptyState,
  ErrorState,
  formatNumber,
  formatTime,
  isApiError,
  LoadingState,
  PromptCard,
  StatusChip,
  useApi,
  useEvents,
  useShell,
  useStreamSignal,
  type InteractiveAgentPrompt,
  type PromptCardProps,
} from '../../../shell';
import { Board, focusAnchor, pointAnchor } from './Board';
import { partyName, shortCode, stepPosition, type Deliberation, type Detail, type Schemas } from './model';
import './deliberation.css';

type Workflow = Schemas['Workflow'];
type Synthesis = Schemas['SynthesisContent'];

const DELIBERATION_EVENTS = ['deliberation.started', 'deliberation.round_closed', 'deliberation.entry_retracted', 'deliberation.status_changed', 'context_snapshot.outdated'] as const;

/** Load with the API client; a newer load wins; `reload` reads again. */
function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; data?: T; error?: ApiError }>({ status: 'loading' });
  const ticket = useRef(0);
  // The caller lists what `load` reads, like useEffect deps.
  const run = useCallback(load, deps);
  const reload = useCallback(async () => {
    const mine = ++ticket.current;
    try {
      const data = await run();
      if (mine === ticket.current) setState({ status: 'ready', data });
    } catch (error) {
      if (mine === ticket.current) setState((prev) => ({ ...prev, status: 'error', error: isApiError(error) ? error : new ApiError('network') }));
    }
  }, [run]);
  useEffect(() => {
    setState({ status: 'loading' });
    void reload();
  }, [reload]);
  return { ...state, reload };
}

export interface DeliberationTabState {
  loading: boolean;
  error?: ApiError;
  /** The tab is shown: the workflow has a session, or a step waits on a deliberation proposal (EC01). */
  visible: boolean;
  sessions: Deliberation[];
  /** The deliberation_proposal prompt of a step of the workflow, if any. */
  proposal?: InteractiveAgentPrompt;
  reload: () => Promise<void>;
}

/** Whether the workflow page shows the “Thảo luận” tab, and the data the tab starts from. */
export function useDeliberationTab(projectId: string, workflow: Workflow): DeliberationTabState {
  const api = useApi();
  const promptIds = (workflow.steps ?? []).map((s) => s.openPromptId).filter(Boolean) as string[];
  const key = promptIds.join(',');
  const data = useLoad(async () => {
    const [{ data: page }, prompts] = await Promise.all([
      api.get('/projects/{projectId}/deliberations', { path: { projectId }, query: { workflowId: workflow.id } }),
      Promise.all(promptIds.map((promptId) => api.get('/prompts/{promptId}', { path: { promptId } }).then((r) => r.data, () => undefined))),
    ]);
    const sessions = ((page.items ?? []) as Deliberation[]).slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const proposal = prompts.find((p) => p?.purpose === 'deliberation_proposal');
    return { sessions, proposal };
  }, [api, projectId, workflow.id, key]);
  useEvents({ types: [...DELIBERATION_EVENTS, 'prompt.status_changed'], projectId }, () => void data.reload());
  const sessions = data.data?.sessions ?? [];
  const proposal = data.data?.proposal;
  return {
    loading: data.status === 'loading' && !data.data,
    error: data.status === 'error' ? data.error : undefined,
    visible: sessions.length > 0 || proposal?.status === 'Open',
    sessions,
    proposal,
    reload: data.reload,
  };
}

export function DeliberationTab({ projectId, workflow }: { projectId: string; workflow: Workflow }) {
  const { t } = useTranslation('monitoring');
  const tab = useDeliberationTab(projectId, workflow);
  const [search, setSearch] = useSearchParams();

  if (tab.loading) return <LoadingState what={t('deliberation.loading')} />;
  if (tab.error && tab.sessions.length === 0) return <ErrorState error={tab.error} title={t('deliberation.loadFailed')} onRetry={() => void tab.reload()} />;
  if (tab.sessions.length === 0) return <NotOpened projectId={projectId} workflow={workflow} proposal={tab.proposal} onChanged={() => void tab.reload()} />;

  const selectedId = search.get('deliberation') && tab.sessions.some((s) => s.id === search.get('deliberation')) ? search.get('deliberation')! : tab.sessions[0]!.id;
  return (
    <div className="dl-tab">
      {tab.proposal?.status === 'Answered' && tab.proposal.response?.choiceIds?.includes('skip') && <span className="dl-label">{t('deliberation.skipped')}</span>}
      {tab.sessions.length > 1 && (
        <label className="sires-field dl-picker">
          <span className="sires-field__label">{t('deliberation.pickSession')}</span>
          <select
            className="sires-input"
            value={selectedId}
            onChange={(e) => {
              const next = new URLSearchParams(search);
              next.set('deliberation', e.currentTarget.value);
              setSearch(next);
            }}
          >
            {tab.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {`${shortCode('dl', s.id)} · ${s.problemType} · ${s.status} · ${formatTime(s.startedAt)}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <Session key={selectedId} projectId={projectId} workflow={workflow} deliberationId={selectedId} />
    </div>
  );
}

/** A proposal waits but no session is open, e.g. an Analysis Agent without a valid configuration (EC17). */
function NotOpened({ projectId, workflow, proposal, onChanged }: { projectId: string; workflow: Workflow; proposal?: InteractiveAgentPrompt; onChanged: () => void }) {
  const { t } = useTranslation('monitoring');
  if (!proposal) return <EmptyState title={t('deliberation.none')} reason={t('deliberation.noneReason')} />;
  const skipped = proposal.status === 'Answered' && proposal.response?.choiceIds?.includes('skip');
  return (
    <div className="dl-tab">
      {skipped && <span className="dl-label">{t('deliberation.skipped')}</span>}
      <section className="dl-notopened" aria-labelledby="dl-notopened">
        <h2 id="dl-notopened" className="dl-title">
          {t('deliberation.notOpened')}
        </h2>
        {proposal.deliberationProposal?.reason && <p>{proposal.deliberationProposal.reason}</p>}
        <p>
          <Link to="/settings/agents">{t('deliberation.openModels')}</Link>
        </p>
        {proposal.status === 'Open' && <DecisionCard projectId={projectId} prompt={proposal} step={stepPosition(workflow, proposal.stepId)} onAnswered={onChanged} />}
      </section>
    </div>
  );
}

function Session({ projectId, workflow, deliberationId }: { projectId: string; workflow: Workflow; deliberationId: string }) {
  const { t } = useTranslation('monitoring');
  const api = useApi();
  const detail = useLoad(async () => (await api.get('/projects/{projectId}/deliberations/{deliberationId}', { path: { projectId, deliberationId } })).data as Detail, [api, projectId, deliberationId]);
  const decisionId = detail.data?.decisionPromptId ?? undefined;
  const decision = useLoad(async () => (decisionId ? (await api.get('/prompts/{promptId}', { path: { promptId: decisionId } })).data : undefined), [api, decisionId]);

  // Round closed, entry retracted, status changed, snapshot outdated: read the session again (EC19); a repeated event
  // reads the same data, so nothing changes twice.
  useEvents({ types: DELIBERATION_EVENTS, projectId }, (event) => {
    if (event.objectId === deliberationId || event.objectId === detail.data?.contextSnapshotId) void detail.reload();
  });
  useEvents({ types: ['prompt.status_changed'], projectId }, (event) => {
    if (decisionId && event.objectId === decisionId) void decision.reload();
  });
  useStreamSignal((signal) => {
    if (signal === 'reload') {
      void detail.reload();
      void decision.reload();
    }
  });

  if (detail.status === 'loading' && !detail.data) return <LoadingState what={t('deliberation.loading')} />;
  if (!detail.data) return <ErrorState error={detail.error} title={t('deliberation.loadFailed')} onRetry={() => void detail.reload()} />;
  const d = detail.data;
  const step = stepPosition(workflow, d.stepId);
  const synthesisEntry = d.synthesisEntryId ? d.entries.find((e) => e.id === d.synthesisEntryId) : undefined;
  const brief = d.brief;
  const lastClosed = [...d.rounds].filter((r) => r.closed && r.kind !== 'synthesis').pop()?.round ?? d.currentRound;

  return (
    <article className="dl-session" aria-labelledby="dl-session-title">
      <header className="dl-session__head">
        <h2 id="dl-session-title" className="dl-title">
          {t('deliberation.session', { code: shortCode('dl', d.id) })} <span className="dl-kind">{d.problemType}</span> <StatusChip status={d.status} entity="deliberation" />
          {d.status === 'Running' && <span className="dl-round-count">{t('deliberation.roundOf', { current: d.currentRound, total: d.maxRounds + 1 })}</span>}
        </h2>
        {d.status !== 'Running' && (
          <p className="dl-muted">
            {d.status === 'Completed' ? t('deliberation.endedAfter', { round: lastClosed }) : t('deliberation.stoppedAt', { round: d.currentRound })}
          </p>
        )}
        <p className="dl-muted">
          {step && <>{t('deliberation.step', { current: step.current, total: step.total })} · </>}
          {t('deliberation.meta', { time: formatTime(d.startedAt), snapshot: shortCode('cs', d.contextSnapshotId), count: d.contextSnapshot.entities.length, max: d.maxRounds })}
        </p>
        {d.status === 'Completed' && (
          <span className="dl-label" data-status="deliberated">
            {t('deliberation.deliberated')}
            {d.recordArtifactVersionId && (
              <>
                {' · '}
                <Link to={`/projects/${encodeURIComponent(projectId)}/artifacts?version=${encodeURIComponent(d.recordArtifactVersionId)}`}>{t('deliberation.record')}</Link>
              </>
            )}
          </span>
        )}
      </header>

      {d.sameModelWarning && (
        <div className="dl-banner" data-tone="warn" role="note">
          <strong>{t('deliberation.sameModelTitle')}</strong>{' '}
          {t('deliberation.sameModelBody', {
            model: d.participants.find((p) => p.agent === 'analysis')?.model ?? '',
            connection: d.participants.find((p) => p.agent === 'analysis')?.providerConnectionName ?? '',
          })}{' '}
          <Link to="/settings/agents">{t('deliberation.changeModels')}</Link>
        </div>
      )}
      {(d.snapshotOutdated || d.contextSnapshot.outdated) && (
        <div className="dl-banner" data-tone="warn" role="note">
          <strong>{t('deliberation.outdatedTitle')}</strong>{' '}
          {t('deliberation.outdatedBody', {
            list: (d.contextSnapshot.changedEntities ?? []).map((c) => t('deliberation.changedEntity', { type: c.type, version: c.newVersion })).join(', '),
          })}
        </div>
      )}
      {d.status === 'Cancelled' && (
        <p className="dl-banner" data-tone="neutral">
          {t('deliberation.cancelled')}
        </p>
      )}

      <section className="dl-brief" aria-labelledby="dl-brief">
        <h3 id="dl-brief" className="dl-subtitle">
          {t('deliberation.brief.title')}
        </h3>
        <dl className="dl-facts">
          <Fact term={t('deliberation.brief.problem')}>{brief.problem}</Fact>
          <Fact term={t('deliberation.brief.type')}>
            <span lang="en">{brief.problemType}</span>
          </Fact>
          <Fact term={t('deliberation.brief.context')}>
            {brief.contextRefs.length
              ? brief.contextRefs
                  .map((ref) => `${t(`deliberation.refType.${ref.type}`, { defaultValue: ref.type })}${ref.version !== undefined ? ` v${ref.version}` : ''}`)
                  .join(' · ')
              : t('deliberation.brief.contextCount', { count: 0 })}
          </Fact>
          {(brief.constraints ?? []).length > 0 && <Fact term={t('deliberation.brief.constraints')}>{brief.constraints!.join(' · ')}</Fact>}
          <Fact term={t('deliberation.brief.criteria')}>{brief.criteria.join(' · ')}</Fact>
          {(brief.knownOptions ?? []).length > 0 && <Fact term={t('deliberation.brief.options')}>{brief.knownOptions!.join(' · ')}</Fact>}
          <Fact term={t('deliberation.brief.perspectives')}>{brief.perspectives.map((p) => `${partyName(p.participant)}: ${p.perspective}`).join(' · ')}</Fact>
        </dl>
      </section>

      <Board projectId={projectId} detail={d} />

      <Usage detail={d} />

      {synthesisEntry && <SynthesisView detail={d} synthesis={synthesisEntry.content as Synthesis} projectId={projectId} />}
      {d.status === 'Running' && !synthesisEntry && <p className="dl-muted">{t('deliberation.synthesisLater')}</p>}

      {decision.data && (
        <section className="dl-decision" aria-label={t('deliberation.decision')}>
          {decision.data.status === 'Open' ? (
            <DecisionCard projectId={projectId} prompt={decision.data} step={step} onAnswered={() => void Promise.all([decision.reload(), detail.reload()])} />
          ) : (
            <Chosen prompt={decision.data} detail={d} synthesis={synthesisEntry?.content as Synthesis | undefined} />
          )}
        </section>
      )}
    </article>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** Decision prompt with the shell's card; answering here or in Chat is the same answer (EC15). */
function DecisionCard({ prompt, step, onAnswered }: { projectId: string; prompt: InteractiveAgentPrompt; step?: { current: number; total: number }; onAnswered: () => void }) {
  const { t } = useTranslation('monitoring');
  const api = useApi();
  const { idempotency } = useShell();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const onAnswer: PromptCardProps['onAnswer'] = async (response) => {
    setBusy(true);
    setError(undefined);
    try {
      await idempotency.run(`answerPrompt:${prompt.id}`, (key) => api.post('/prompts/{promptId}/response', { path: { promptId: prompt.id }, idempotencyKey: key, body: response }));
    } catch (err) {
      setError(isApiError(err) ? err : new ApiError('network'));
    } finally {
      setBusy(false);
      onAnswered();
    }
  };
  return (
    <>
      <PromptCard prompt={prompt} submitting={busy} agentLabel="Orchestrator" onAnswer={onAnswer}>
        {step && <p className="dl-muted">{t('deliberation.step', { current: step.current, total: step.total })}</p>}
      </PromptCard>
      <p className="dl-muted">{t('deliberation.alsoInChat')}</p>
      {error && <ErrorState error={error} title={t('deliberation.answerFailed')} />}
    </>
  );
}

function Chosen({ prompt, detail, synthesis }: { prompt: InteractiveAgentPrompt; detail: Detail; synthesis?: Synthesis }) {
  const { t } = useTranslation('monitoring');
  const ids = detail.chosenOptionIds?.length ? detail.chosenOptionIds : (prompt.response?.choiceIds ?? []);
  const label = (optionId: string) => synthesis?.options.find((o) => o.id === optionId)?.label ?? prompt.choices?.find((c) => c.id === optionId)?.label ?? optionId;
  const who = prompt.response?.respondedBy?.type === 'researcher' || !prompt.response?.respondedBy ? t('deliberation.you') : partyName({ agent: 'orchestrator' });
  return (
    <div className="dl-chosen">
      <p className="dl-subtitle">{t('deliberation.youChose')}</p>
      <p>{ids.map(label).join(', ') || (prompt.response?.text ?? '')}</p>
      <p className="dl-muted">
        {who}
        {prompt.response?.respondedAt && (
          <>
            {' · '}
            <span className="sires-num">{formatTime(prompt.response.respondedAt)}</span>
          </>
        )}
        {prompt.status !== 'Answered' && <> · <StatusChip status={prompt.status} entity="prompt" /></>}
      </p>
    </div>
  );
}

function SynthesisView({ detail, synthesis, projectId }: { detail: Detail; synthesis: Synthesis; projectId: string }) {
  const { t } = useTranslation('monitoring');
  const criteria = detail.brief.criteria;
  return (
    <section className="dl-synthesis" aria-labelledby="dl-synthesis">
      <h3 id="dl-synthesis" className="dl-subtitle">
        {t('deliberation.synthesis.title')}
      </h3>
      {detail.recordArtifactVersionId && (
        <p className="dl-muted">
          <Link to={`/projects/${encodeURIComponent(projectId)}/artifacts?version=${encodeURIComponent(detail.recordArtifactVersionId)}`}>{t('deliberation.record')}</Link>
        </p>
      )}
      <h4 className="dl-subtitle">{t('deliberation.synthesis.consensus')}</h4>
      <ul className="dl-list">
        {synthesis.consensus.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
      {synthesis.disagreements.length > 0 && (
        <>
          <h4 className="dl-subtitle">{t('deliberation.synthesis.disagreements')}</h4>
          <ul className="dl-list">
            {synthesis.disagreements.map((d, i) => (
              <li key={i} className="dl-disagreement">
                <strong>{d.point}</strong> —{' '}
                {d.positions.map((p, j) => {
                  const anchor = pointAnchor(p.entryId, p.pointId);
                  return (
                    <span key={j}>
                      {j > 0 && ' · '}
                      <a href={`#${anchor}`} onClick={(e) => focusAnchor(e, anchor)}>
                        {partyName(p.participant)}
                      </a>
                      {p.summary && `: ${p.summary}`}
                    </span>
                  );
                })}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="dl-table-scroll">
        <table className="dl-table">
          <thead>
            <tr>
              <th scope="col">{t('deliberation.synthesis.option')}</th>
              {criteria.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {synthesis.options.map((o) => (
              <tr key={o.id} data-recommended={o.id === synthesis.recommendation.optionId ? '' : undefined}>
                <th scope="row">{o.label}</th>
                {criteria.map((c) => (
                  <td key={c}>{o.tradeoffs?.find((x) => x.criterion === c)?.assessment ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <strong>{t('deliberation.synthesis.recommendation')}</strong> {synthesis.recommendation.rationale}
      </p>
      {(synthesis.questions ?? []).length > 0 && (
        <>
          <h4 className="dl-subtitle">{t('deliberation.synthesis.questions')}</h4>
          <ul className="dl-list">
            {synthesis.questions!.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Usage({ detail }: { detail: Detail }) {
  const { t, i18n } = useTranslation('monitoring');
  const total = detail.usageTotal;
  const money = (value: number | null | undefined, currency?: string | null) =>
    value === null || value === undefined ? '—' : formatNumber(value, { locale: i18n.language === 'en' ? 'en' : 'vi', style: 'currency', currency: currency ?? 'USD' });
  const rows = detail.usageByParticipant;
  return (
    <section className="dl-usage" aria-labelledby="dl-usage">
      <h3 id="dl-usage" className="dl-subtitle">
        {t('deliberation.usage.title')}
      </h3>
      <div className="dl-table-scroll">
        <table className="dl-table">
          <thead>
            <tr>
              <th scope="col">{t('deliberation.usage.party')}</th>
              <th scope="col">Agent Run</th>
              <th scope="col">{t('deliberation.usage.in')}</th>
              <th scope="col">{t('deliberation.usage.out')}</th>
              <th scope="col">{t('deliberation.usage.cost')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={partyName(r)}>
                <th scope="row">{partyName(r)}</th>
                <td className="sires-num">{r.agentRunCount}</td>
                <td className="sires-num">{formatNumber(r.inputTokens)}</td>
                <td className="sires-num">{formatNumber(r.outputTokens)}</td>
                <td className="sires-num">{money(r.cost, r.currency)}</td>
              </tr>
            ))}
            {total && (
              <tr className="dl-table__total">
                <th scope="row">{t('deliberation.usage.total')}</th>
                <td className="sires-num">{total.agentRunCount}</td>
                <td className="sires-num">{formatNumber(total.inputTokens)}</td>
                <td className="sires-num">{formatNumber(total.outputTokens)}</td>
                <td className="sires-num">{money(total.cost, total.currency)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="dl-muted">
        {t('deliberation.usage.estimate')}
        {total && total.noDataAgentRunCount > 0 && <> {t('deliberation.usage.noData', { count: total.noDataAgentRunCount })}</>}
      </p>
    </section>
  );
}
