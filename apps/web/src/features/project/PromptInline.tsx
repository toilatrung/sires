// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// A prompt embedded in a chat message (PID-00058 S05; H3): getPrompt, then the shell's PromptCard. The area only sends
// the answer (answerPrompt, one Idempotency-Key per confirmation) and keeps the card in step with
// prompt.status_changed. Nothing is sent before the Researcher confirms (UX-PROMPT-002).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ErrorState, PromptCard, isApiError, useApi, useEvents, useShell, type ApiError, type InteractiveAgentPrompt } from '../../shell';
import { NS, agentKey, objectHref, useResource, type Schemas } from './shared';

type PromptResponse = Schemas['PromptResponse'];

export function PromptInline({ projectId, promptId, archived }: { projectId: string; promptId: string; archived: boolean }) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const { idempotency } = useShell();
  const resource = useResource(async () => (await api.get('/prompts/{promptId}', { path: { promptId } })).data, [promptId]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [elsewhere, setElsewhere] = useState(false);

  // Answered, expired or cancelled elsewhere (Pending Actions, Agent Activity): read it again (AC02, EC21).
  useEvents({ types: ['prompt.status_changed'], projectId }, (event) => {
    if (event.objectId === promptId) void reread();
  });

  const reread = async () => {
    try {
      const fresh = (await api.get('/prompts/{promptId}', { path: { promptId } })).data;
      resource.setData(() => fresh);
    } catch {
      // keep the card as it is; the next event or a reload brings it up to date
    }
  };

  if (resource.value.state === 'loading') return <p className="sires-chat__meta">{t('prompt.loading')}</p>;
  if (resource.value.state === 'error') {
    return (
      <p className="sires-chat__prompt-error" role="alert">
        {t('prompt.loadFailed')}{' '}
        <button type="button" className="sires-button" onClick={() => void resource.reload()}>
          {t('prompt.retry')}
        </button>
      </p>
    );
  }
  const prompt: InteractiveAgentPrompt = resource.value.data;
  const who = agentKey(prompt.agent ?? prompt.createdBy?.agent, prompt.createdBy?.instance);
  const objectLink = objectHref(projectId, prompt.pendingAction?.objectType, prompt.pendingAction?.objectId);

  const answer = async (response: PromptResponse) => {
    setSubmitting(true);
    setError(null);
    setElsewhere(false);
    try {
      const res = await idempotency.run(`answerPrompt:${prompt.id}:${JSON.stringify(response)}`, (key) =>
        api.post('/prompts/{promptId}/response', { path: { promptId: prompt.id }, body: response, idempotencyKey: key }),
      );
      resource.setData(() => res.data);
    } catch (caught) {
      // Already answered, expired or cancelled elsewhere: read it again, say so, never resend (EC22).
      if (isApiError(caught) && caught.status === 409) {
        setElsewhere(true);
        await reread();
      } else {
        setError(caught as ApiError);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // PID-00084 slot (one line, added by the PR merged later): isDeliberationProposal(prompt) ? <DeliberationCard … /> : <PromptCard … />
  return (
    <div className="sires-chat__prompt">
      <PromptCard
        prompt={archived && prompt.status === 'Open' ? { ...prompt, status: 'Expired' } : prompt}
        submitting={submitting}
        agentLabel={t(who.key) + (who.instance ? ` ${who.instance}` : '')}
        onAnswer={answer}
      >
        {objectLink && (
          <Link to={objectLink} className="sires-project__link">
            {t('prompt.related', { type: prompt.pendingAction?.objectType })}
          </Link>
        )}
      </PromptCard>
      {elsewhere && (
        <p role="status" className="sires-chat__meta">
          {t('prompt.handledElsewhere')}
        </p>
      )}
      {error && <ErrorState error={error} ns={NS} notSaved={t('prompt.notSent')} />}
    </div>
  );
}
