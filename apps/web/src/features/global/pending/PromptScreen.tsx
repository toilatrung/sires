// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// M2 MobilePrompt (MobilePrompt.html; PID-00060 S05, H2, H3, H9): one Interactive Agent Prompt answered with the
// shell's prompt card. choice, approval and information_request are answered here at any width; edit_and_approve
// is read-only on the phone with a link to Project AI Chat (UX-RESP-001: no editing commitment on the phone).

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import type { PublicApi } from '@sires/contracts';
import { ErrorState, LoadingState, NotFound, PromptCard, isApiError, useApi, useEvents, useRefreshNavigation, useShell, type ApiError, type InteractiveAgentPrompt } from '../../../shell';
import { agentLabel, usePhone, useProjectNames } from '../labels';

type PromptResponse = PublicApi.components['schemas']['PromptResponse'];
type State = { status: 'loading' } | { status: 'ready'; prompt: InteractiveAgentPrompt } | { status: 'missing' } | { status: 'error'; error: ApiError };

export function PromptScreen() {
  const { t } = useTranslation('global');
  const { promptId = '' } = useParams();
  const api = useApi();
  const { idempotency } = useShell();
  const phone = usePhone();
  const names = useProjectNames();
  const refreshNavigation = useRefreshNavigation();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<ApiError>();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/prompts/{promptId}', { path: { promptId } });
      setState({ status: 'ready', prompt: data });
    } catch (failure) {
      if (!isApiError(failure)) throw failure;
      setState(failure.status === 404 ? { status: 'missing' } : { status: 'error', error: failure });
    }
  }, [api, promptId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEvents({ types: ['prompt.status_changed'] }, (event) => {
    if (event.objectId === promptId) void load();
  });

  const answer = async (response: PromptResponse) => {
    if (submitting) return;
    setSubmitting(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const { data } = await idempotency.run(`answerPrompt:${promptId}`, (key) =>
        api.post('/prompts/{promptId}/response', { path: { promptId }, body: response, idempotencyKey: key }),
      );
      setState({ status: 'ready', prompt: data });
      setNotice(t('prompt.answered'));
      void refreshNavigation();
    } catch (failure) {
      if (!isApiError(failure)) throw failure;
      if (failure.status === 409) {
        // EC20: answered elsewhere or cancelled because the object changed — show the current state, do not resend.
        setNotice(t('prompt.conflict'));
        await load();
      } else {
        setError(failure);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (state.status === 'loading') return <LoadingState what={t('prompt.loadingWhat')} rows={2} />;
  if (state.status === 'missing') return <NotFound />;
  if (state.status === 'error') return <ErrorState error={state.error} ns="global" onRetry={() => void load()} />;

  const { prompt } = state;
  const project = prompt.projectId ? names.get(prompt.projectId) : undefined;
  const chat = prompt.projectId ? `/projects/${prompt.projectId}/chat` : undefined;
  const readOnlyOnPhone = phone && prompt.type === 'edit_and_approve' && prompt.status === 'Open';

  return (
    <div className="g-page g-page--tight g-prompt-page">
      <Link className="g-link" to="/pending-actions">
        {t('prompt.back')}
      </Link>
      <div className="g-prompt-context">
        <span className="g-meta">Project</span>
        <strong>{project ?? t('prompt.unknownProject')}</strong>
      </div>
      <h1 className="sires-visually-hidden">{t('prompt.title')}</h1>
      <div role="status" aria-live="polite">
        {notice && <p className="g-notice">{notice}</p>}
      </div>
      {readOnlyOnPhone ? (
        <section className="g-readonly-prompt" aria-label={t('prompt.title')}>
          <p className="g-pending__title">{prompt.question}</p>
          <p className="g-meta">{[agentLabel(prompt.agent), 'edit_and_approve'].filter(Boolean).join(' · ')}</p>
          <p className="g-dialog__body">{t('prompt.editOnDesktop')}</p>
          {chat && (
            <Link className="sires-button" data-variant="outline" to={chat}>
              {t('prompt.openChat')}
            </Link>
          )}
        </section>
      ) : (
        <PromptCard prompt={prompt} onAnswer={answer} submitting={submitting} agentLabel={agentLabel(prompt.agent)} />
      )}
      {error && <ErrorState error={error} ns="global" notSaved={t('prompt.notSent')} />}
    </div>
  );
}
