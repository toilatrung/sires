// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Deliberation proposal card (PID-00084, block “Đề xuất thảo luận” of Chat.dc.html, UX-MONITOR-007): an Interactive
// Agent Prompt with purpose deliberation_proposal and both choices deliberate / skip. Shows the problem, why, the
// parties, the cost on the Researcher's API key and a same-model warning; answers once with answerPrompt; Answered,
// Expired and Cancelled are read only. A prompt without both choices falls back to the shell's standard card (EC10).
//
// Mounting contract with PID-00058's Chat (one import, in place of PromptCard for these prompts):
//   import { DeliberationCard, isDeliberationProposal } from './deliberation-card';
//   isDeliberationProposal(prompt)
//     ? <DeliberationCard key={prompt.id} prompt={prompt} projectId={projectId} onChange={updatePrompt} />
//     : <PromptCard … />
// - The card answers by itself (answerPrompt with Idempotency-Key) and reads the prompt again on 409 or on a
//   prompt.status_changed from elsewhere; `onChange` hands the Chat every prompt the server returns, so the Chat can
//   replace its own copy.
// - A `prompt` prop replaces the card's copy only when it is newer (another prompt, a higher rowVersion, or no longer
//   Open while the card still is): a Chat that re-renders with its old Open copy does not reopen an answered card.

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { PublicApi } from '@sires/contracts';
import {
  ApiError,
  ErrorState,
  formatTime,
  isApiError,
  PromptCard,
  StatusChip,
  useApi,
  useEvents,
  useShell,
  type InteractiveAgentPrompt,
} from '../../../shell';
import './deliberation-card.css';

type Schemas = PublicApi.components['schemas'];
type Participant = Schemas['DeliberationProposal']['participants'][number];
type Choice = NonNullable<InteractiveAgentPrompt['choices']>[number];

export const DELIBERATE = 'deliberate';
export const SKIP = 'skip';

interface ProposalParts {
  proposal: Schemas['DeliberationProposal'];
  deliberate: Choice;
  skip: Choice;
}

/** The proposal and its two choices, or undefined when the card does not apply. */
function proposalParts(prompt: InteractiveAgentPrompt): ProposalParts | undefined {
  if (prompt.purpose !== 'deliberation_proposal' || !prompt.deliberationProposal) return undefined;
  const choices = prompt.choices ?? [];
  const deliberate = choices.find((c) => c.id === DELIBERATE);
  const skip = choices.find((c) => c.id === SKIP);
  return deliberate && skip ? { proposal: prompt.deliberationProposal, deliberate, skip } : undefined;
}

/** The card applies: purpose deliberation_proposal, a proposal, and both choices deliberate and skip (EC10). */
export function isDeliberationProposal(prompt: InteractiveAgentPrompt): boolean {
  return proposalParts(prompt) !== undefined;
}

const workflowHref = (projectId: string, workflowId: string) =>
  `/projects/${encodeURIComponent(projectId)}/activity/workflows/${encodeURIComponent(workflowId)}`;

/** The Deliberation tab of the workflow page (PID-00083, monitoring). */
export const deliberationTabHref = (projectId: string, workflowId: string) => `${workflowHref(projectId, workflowId)}?view=deliberation`;

/** Short code as the monitoring area writes it (`dl-301`): a prefix and the last three characters of the id. */
const shortCode = (prefix: string, id: string) => `${prefix}-${id.replace(/-/g, '').slice(-3)}`;

export interface DeliberationCardProps {
  prompt: InteractiveAgentPrompt;
  projectId: string;
  /** Called with the prompt as the server returns it after an answer or a refresh; the Chat replaces its copy. */
  onChange?: (prompt: InteractiveAgentPrompt) => void;
}

export function DeliberationCard(props: DeliberationCardProps) {
  const state = usePromptAnswer(props);
  // The prompt the card holds decides: a refresh that no longer carries a full proposal falls back to the standard card.
  const parts = proposalParts(state.prompt);
  return parts ? <ProposalCard projectId={props.projectId} parts={parts} state={state} /> : <StandardCard state={state} />;
}

/** Newer than the card's copy: another prompt, a higher rowVersion, or closed while the card still shows it Open. */
const isNewer = (next: InteractiveAgentPrompt, current: InteractiveAgentPrompt) =>
  next.id !== current.id || next.rowVersion > current.rowVersion || (current.status === 'Open' && next.status !== 'Open');

type AnswerState = ReturnType<typeof usePromptAnswer>;

/** Shared answer flow: answerPrompt once with Idempotency-Key; 409 or prompt.status_changed → read the prompt again. */
function usePromptAnswer({ prompt: initial, projectId, onChange }: DeliberationCardProps) {
  const api = useApi();
  const { idempotency } = useShell();
  const [prompt, setPrompt] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const [elsewhere, setElsewhere] = useState(false);
  const sending = useRef(false);
  const current = useRef(prompt);
  current.current = prompt;

  // A prop older than the card's copy (the Chat's Open copy after the card answered) changes nothing (G4).
  useEffect(() => {
    if (!isNewer(initial, current.current)) return;
    if (initial.id !== current.current.id) {
      setError(undefined);
      setElsewhere(false);
    }
    current.current = initial;
    setPrompt(initial);
  }, [initial]);

  const update = (next: InteractiveAgentPrompt) => {
    current.current = next;
    setPrompt(next);
    onChange?.(next);
  };

  // Read the prompt again after it changed elsewhere (409, or an event while the card shows it Open).
  const refresh = async () => {
    try {
      const { data } = await api.get('/prompts/{promptId}', { path: { promptId: current.current.id } });
      update(data);
      if (data.status !== 'Open') setElsewhere(true);
    } catch (err) {
      setError(isApiError(err) ? err : new ApiError('network'));
    }
  };

  // Answered or closed elsewhere (another tab, the Orchestrator): read it again, never send again (EC07). Answered,
  // Expired and Cancelled are final, so once the card holds one of them (its own answer included, whose
  // prompt.status_changed arrives after the POST returned) events of this prompt change nothing (G1).
  useEvents({ types: ['prompt.status_changed'], projectId }, (event) => {
    if (event.objectId !== current.current.id || sending.current || current.current.status !== 'Open') return;
    void refresh();
  });

  const answer = async (response: Schemas['PromptResponse']) => {
    // One call only, even on a double click (EC06).
    if (sending.current || current.current.status !== 'Open') return;
    const promptId = current.current.id;
    sending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const { data } = await idempotency.run(`answerPrompt:${promptId}`, (key) =>
        api.post('/prompts/{promptId}/response', { path: { promptId }, idempotencyKey: key, body: response }),
      );
      update(data);
    } catch (err) {
      const apiError = isApiError(err) ? err : new ApiError('network');
      if (apiError.status === 409) await refresh();
      else setError(apiError);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  return { prompt, busy, error, elsewhere, answer };
}

/** The shell's card with the same answer flow, for a deliberation_proposal prompt missing a choice (EC10). */
function StandardCard({ state }: { state: AnswerState }) {
  const { t } = useTranslation('project');
  const { prompt, busy, error, elsewhere, answer } = state;
  return (
    <div className="deliberation-card__standard">
      <PromptCard prompt={prompt} submitting={busy} agentLabel="Orchestrator" onAnswer={(response) => answer(response)} />
      {error && <ErrorState error={error} title={t('deliberationCard.answerFailed')} notSaved={t('deliberationCard.notSent')} />}
      <div role="status" className="deliberation-card__result">
        {elsewhere && <p className="deliberation-card__elsewhere">{t('deliberationCard.elsewhere')}</p>}
      </div>
    </div>
  );
}

/** Connections of the account: a map once listed, 'error' when the list failed, undefined while loading. */
type Connections = ReadonlyMap<string, Schemas['ProviderConnection']> | 'error' | undefined;

function ProposalCard({ projectId, parts, state }: { projectId: string; parts: ProposalParts; state: AnswerState }) {
  const { t } = useTranslation('project');
  const api = useApi();
  const { prompt, busy, error, elsewhere, answer } = state;
  const { proposal, deliberate, skip } = parts;
  const [connections, setConnections] = useState<Connections>();
  const [step, setStep] = useState<{ current: number; total: number }>();
  const cardRef = useRef<HTMLElement>(null);
  const headingId = useId();

  // Connection names for the cost line; unknown → the party's model (EC03).
  useEffect(() => {
    let live = true;
    api
      .get('/provider-connections')
      .then(({ data }) => {
        const items = (data.items ?? []) as Schemas['ProviderConnection'][];
        if (live) setConnections(new Map(items.map((c) => [c.id, c])));
      })
      .catch(() => live && setConnections('error'));
    return () => {
      live = false;
    };
  }, [api]);

  // “bước m/n của wf-…” from the workflow's steps; left out when the workflow cannot be read.
  useEffect(() => {
    let live = true;
    api
      .get('/workflows/{workflowId}', { path: { workflowId: prompt.workflowId } })
      .then(({ data }) => {
        const steps = data.steps ?? [];
        const index = steps.findIndex((s) => s.id === prompt.stepId);
        if (live && index >= 0) setStep({ current: index + 1, total: steps.length });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, prompt.workflowId, prompt.stepId]);

  const choose = async (choiceId: string) => {
    await answer({ choiceIds: [choiceId] });
    // Focus stays on the card after answering (EC11).
    cardRef.current?.focus();
  };

  const listed = connections instanceof Map ? connections : undefined;
  const analysis = proposal.participants.filter((p) => p.agent === 'analysis');
  const partyName = (p: Participant) => (p.agent === 'orchestrator' ? 'Orchestrator' : `Analysis Agent${p.instance ? ` ${p.instance}` : ''}`);
  const connectionName = (p: Participant) => listed?.get(p.providerConnectionId)?.name ?? `${p.model}`;
  const costConnections = [...new Set(analysis.map(connectionName))].join(', ');
  // An Analysis Agent may miss a valid configuration (EC09) when it has no model, when its connection is not Valid or
  // not in the account's list, or when the list cannot be read: the card then links to Agent Models. The contract
  // has no flag for this flow yet (report.md, Đề xuất cho PO); an unknown connection also loses its name (EC03).
  const configIssue =
    connections !== undefined &&
    analysis.some((p) => {
      if (!p.model.trim() || connections === 'error') return true;
      const connection = connections.get(p.providerConnectionId);
      return connection === undefined || connection.testStatus !== 'Valid';
    });
  const chosenId = prompt.response?.choiceIds?.[0];
  const chosen = chosenId === DELIBERATE ? deliberate : chosenId === SKIP ? skip : undefined;
  const closed = prompt.status === 'Expired' || prompt.status === 'Cancelled';
  const modelsLink = <Link to="/settings/agents">{t('deliberationCard.openModels')}</Link>;

  return (
    <article ref={cardRef} tabIndex={-1} className="deliberation-card" data-status={prompt.status} aria-labelledby={headingId}>
      <div className="deliberation-card__top">
        <span className="deliberation-card__kind">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 16.5v.5" />
          </svg>
          {t('deliberationCard.title')} · <span lang="en">{proposal.problemType}</span>
        </span>
        <span className="deliberation-card__meta">
          Orchestrator · <span className="sires-num">{formatTime(prompt.createdAt)}</span>
          {step && (
            <>
              {' · '}
              {t('deliberationCard.step', { current: step.current, total: step.total })}{' '}
              <Link className="sires-id" to={workflowHref(projectId, prompt.workflowId)}>
                {shortCode('wf', prompt.workflowId)}
              </Link>
            </>
          )}
          {prompt.status !== 'Open' && (
            <>
              {' '}
              <StatusChip status={prompt.status} entity="prompt" />
            </>
          )}
        </span>
      </div>
      <h3 id={headingId} className="deliberation-card__problem">
        {proposal.problem}
      </h3>
      <dl className="deliberation-card__facts">
        <dt>{t('deliberationCard.why')}</dt>
        <dd>
          {proposal.reason}
          {configIssue && <> {modelsLink}</>}
        </dd>
        <dt>{t('deliberationCard.parties')}</dt>
        <dd>{proposal.participants.map((p) => (p.perspective ? `${partyName(p)} (${p.perspective})` : partyName(p))).join(' · ')}</dd>
        <dt>{t('deliberationCard.cost')}</dt>
        <dd>
          {t('deliberationCard.costLine', { runs: proposal.estimatedAgentRuns, connections: costConnections, rounds: proposal.maxRounds })}
          {proposal.costNote && <span className="deliberation-card__note"> {proposal.costNote}</span>}
        </dd>
      </dl>
      {proposal.sameModelWarning && (
        <p className="deliberation-card__warning" role="note">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M12 3l9.5 17h-19z" />
            <path d="M12 10v4.5M12 17.5v.5" />
          </svg>
          <span>
            {t('deliberationCard.sameModel')} <span className="sires-id">{analysis[0]?.model}</span>.{' '}
            <Link to="/settings/agents">{t('deliberationCard.changeModels')}</Link>
          </span>
        </p>
      )}
      {error && <ErrorState error={error} title={t('deliberationCard.answerFailed')} notSaved={t('deliberationCard.notSent')} />}

      {prompt.status === 'Open' && (
        <>
          <div className="deliberation-card__actions" role="group" aria-label={t('deliberationCard.actions')}>
            <button type="button" className="sires-button" data-variant="outline" disabled={busy} onClick={() => void choose(DELIBERATE)}>
              {deliberate.label}
            </button>
            <button type="button" className="sires-button" data-variant="secondary" disabled={busy} onClick={() => void choose(SKIP)}>
              {skip.label}
            </button>
            {skip.consequence && <span className="deliberation-card__explain">{`${skip.label}: ${skip.consequence}`}</span>}
          </div>
          {deliberate.consequence && <p className="deliberation-card__explain">{`${deliberate.label}: ${deliberate.consequence}`}</p>}
        </>
      )}

      {/* One live region for what changes after an answer or an event (G11): elsewhere, the choice, closed. */}
      <div role="status" className="deliberation-card__result">
        {elsewhere && <p className="deliberation-card__elsewhere">{t('deliberationCard.elsewhere')}</p>}
        {prompt.status === 'Answered' && chosenId && (
          <p className="deliberation-card__answered">
            {t('deliberationCard.youChose', { label: chosen?.label ?? chosenId })}
            {prompt.response?.respondedAt && (
              <>
                {' · '}
                <span className="sires-num">{formatTime(prompt.response.respondedAt)}</span>
              </>
            )}
            {chosenId === DELIBERATE && (
              <>
                {' · '}
                {/* Missing configuration: the System checks again and opens no session yet, so Agent Models (G12). */}
                {configIssue ? modelsLink : <Link to={deliberationTabHref(projectId, prompt.workflowId)}>{t('deliberationCard.openTab')}</Link>}
              </>
            )}
          </p>
        )}
        {closed && (
          <p className="deliberation-card__closed">
            {prompt.statusReason && <>{prompt.statusReason} </>}
            <strong>{t('deliberationCard.notConsent')}</strong>
          </p>
        )}
      </div>
    </article>
  );
}
