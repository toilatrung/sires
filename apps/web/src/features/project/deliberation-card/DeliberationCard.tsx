// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Deliberation proposal card (PID-00084, block “Đề xuất thảo luận” of Chat.dc.html, UX-MONITOR-007): an Interactive
// Agent Prompt with purpose deliberation_proposal and both choices deliberate / skip. Shows the problem, why, the
// parties, the cost on the Researcher's API key and a same-model warning; answers once with answerPrompt; Answered,
// Expired and Cancelled are read only. A prompt without both choices falls back to the shell's standard card (EC10).
//
// PID-00058's Chat uses it with one import, in place of PromptCard for these prompts:
//   import { DeliberationCard, isDeliberationProposal } from './deliberation-card';
//   isDeliberationProposal(prompt) ? <DeliberationCard prompt={prompt} projectId={projectId} /> : <PromptCard … />

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

export const DELIBERATE = 'deliberate';
export const SKIP = 'skip';

/** The card applies: purpose deliberation_proposal, a proposal, and both choices deliberate and skip (EC10). */
export function isDeliberationProposal(prompt: InteractiveAgentPrompt): boolean {
  if (prompt.purpose !== 'deliberation_proposal' || !prompt.deliberationProposal) return false;
  const ids = new Set((prompt.choices ?? []).map((c) => c.id));
  return ids.has(DELIBERATE) && ids.has(SKIP);
}

/** The Deliberation tab of the workflow page (PID-00083, monitoring). */
export const deliberationTabHref = (projectId: string, workflowId: string) =>
  `/projects/${encodeURIComponent(projectId)}/activity/workflows/${encodeURIComponent(workflowId)}?view=deliberation`;

export interface DeliberationCardProps {
  prompt: InteractiveAgentPrompt;
  projectId: string;
  /** Called with the prompt as the server returns it after an answer or a refresh. */
  onChange?: (prompt: InteractiveAgentPrompt) => void;
}

export function DeliberationCard(props: DeliberationCardProps) {
  return isDeliberationProposal(props.prompt) ? <ProposalCard {...props} /> : <StandardCard {...props} />;
}

/** Shared answer flow: answerPrompt once with Idempotency-Key; 409 or prompt.status_changed → read the prompt again. */
function usePromptAnswer({ prompt: initial, projectId, onChange }: DeliberationCardProps) {
  const api = useApi();
  const { idempotency } = useShell();
  const [prompt, setPrompt] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const [elsewhere, setElsewhere] = useState(false);
  const sending = useRef(false);

  useEffect(() => setPrompt(initial), [initial]);

  const refresh = async (fromElsewhere: boolean) => {
    try {
      const { data } = await api.get('/prompts/{promptId}', { path: { promptId: initial.id } });
      setPrompt(data);
      onChange?.(data);
      if (fromElsewhere && data.status !== 'Open') setElsewhere(true);
    } catch (err) {
      setError(isApiError(err) ? err : new ApiError('network'));
    }
  };

  // Answered or closed elsewhere (another tab, the Orchestrator): read it again, never send again (EC07).
  useEvents({ types: ['prompt.status_changed'], projectId }, (event) => {
    if (event.objectId === initial.id && !sending.current) void refresh(true);
  });

  const answer = async (response: Schemas['PromptResponse']) => {
    // One call only, even on a double click (EC06).
    if (sending.current || prompt.status !== 'Open') return;
    sending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const { data } = await idempotency.run(`answerPrompt:${prompt.id}`, (key) =>
        api.post('/prompts/{promptId}/response', { path: { promptId: prompt.id }, idempotencyKey: key, body: response }),
      );
      setPrompt(data);
      onChange?.(data);
    } catch (err) {
      const apiError = isApiError(err) ? err : new ApiError('network');
      if (apiError.status === 409) await refresh(true);
      else setError(apiError);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  return { prompt, busy, error, elsewhere, answer };
}

/** The shell's card with the same answer flow, for a deliberation_proposal prompt missing a choice (EC10). */
function StandardCard(props: DeliberationCardProps) {
  const { prompt, busy, answer } = usePromptAnswer(props);
  return <PromptCard prompt={prompt} submitting={busy} agentLabel="Orchestrator" onAnswer={(response) => answer(response)} />;
}

function ProposalCard(props: DeliberationCardProps) {
  const { projectId } = props;
  const { t } = useTranslation('project');
  const api = useApi();
  const { prompt, busy, error, elsewhere, answer } = usePromptAnswer(props);
  const [connections, setConnections] = useState<ReadonlyMap<string, Schemas['ProviderConnection']>>();
  const [step, setStep] = useState<{ current: number; total: number }>();
  const cardRef = useRef<HTMLElement>(null);
  const headingId = useId();
  const proposal = prompt.deliberationProposal!;

  // Connection names for the cost line; unknown → the party's model (EC03).
  useEffect(() => {
    let live = true;
    api
      .get('/provider-connections')
      .then(({ data }) => {
        const items = (data.items ?? []) as Schemas['ProviderConnection'][];
        if (live) setConnections(new Map(items.map((c) => [c.id, c])));
      })
      .catch(() => live && setConnections(new Map()));
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

  const choice = (choiceId: string) => (prompt.choices ?? []).find((c) => c.id === choiceId);
  const deliberate = choice(DELIBERATE)!;
  const skip = choice(SKIP)!;
  const analysis = proposal.participants.filter((p) => p.agent === 'analysis');
  const partyName = (p: Participant) => (p.agent === 'orchestrator' ? 'Orchestrator' : `Analysis Agent${p.instance ? ` ${p.instance}` : ''}`);
  const connectionName = (p: Participant) => connections?.get(p.providerConnectionId)?.name ?? `${p.model}`;
  const costConnections = [...new Set(analysis.map(connectionName))].join(', ');
  // An Analysis Agent whose connection is listed but not valid needs configuring (EC09); an unknown connection only
  // loses its name on the cost line (EC03).
  const configIssue = analysis.some((p) => {
    const connection = connections?.get(p.providerConnectionId);
    return connection !== undefined && connection.testStatus !== 'Valid';
  });
  const chosen = prompt.response?.choiceIds?.[0];
  const closed = prompt.status === 'Expired' || prompt.status === 'Cancelled';
  const workflowLabel = `wf-${prompt.workflowId.slice(0, 3)}`;

  return (
    <article ref={cardRef} tabIndex={-1} className="deliberation-card" data-status={prompt.status} aria-labelledby={headingId}>
      <div className="deliberation-card__top">
        <span className="deliberation-card__kind">
          {t('deliberationCard.title')} · <span lang="en">{proposal.problemType}</span>
        </span>
        <span className="deliberation-card__meta">
          Orchestrator · <span className="sires-num">{formatTime(prompt.createdAt)}</span>
          {step && (
            <>
              {' · '}
              {t('deliberationCard.step', { current: step.current, total: step.total })} <span className="sires-id">{workflowLabel}</span>
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
          {configIssue && (
            <>
              {' '}
              <Link to="/settings/agents">{t('deliberationCard.openModels')}</Link>
            </>
          )}
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
          {t('deliberationCard.sameModel')} <span className="sires-id">{analysis[0]?.model}</span>.{' '}
          <Link to="/settings/agents">{t('deliberationCard.changeModels')}</Link>
        </p>
      )}
      {error && <ErrorState error={error} title={t('deliberationCard.answerFailed')} notSaved={t('deliberationCard.notSent')} />}
      {elsewhere && (
        <p role="status" className="deliberation-card__elsewhere">
          {t('deliberationCard.elsewhere')}
        </p>
      )}

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

      {prompt.status === 'Answered' && chosen && (
        <p className="deliberation-card__answered">
          {t('deliberationCard.youChose', { label: choice(chosen)?.label ?? chosen })}
          {prompt.response?.respondedAt && (
            <>
              {' · '}
              <span className="sires-num">{formatTime(prompt.response.respondedAt)}</span>
            </>
          )}
          {chosen === DELIBERATE && (
            <>
              {' · '}
              <Link to={deliberationTabHref(projectId, prompt.workflowId)}>{t('deliberationCard.openTab')}</Link>
            </>
          )}
        </p>
      )}

      {closed && (
        <p className="deliberation-card__closed">
          {prompt.statusReason && <>{prompt.statusReason} </>}
          {t('deliberationCard.notConsent')}
        </p>
      )}
    </article>
  );
}
