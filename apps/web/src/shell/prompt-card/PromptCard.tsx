// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Interactive Agent Prompt card (H8, design.md §3 and §4, Components): a presentational component. The feature
// area loads the prompt and calls answerPrompt in `onConfirm`; the card never calls the API (N14).
// - Open: 1.5px brand border; options are full-width radio rows with their consequence; nothing is pre-selected,
//   not even the agent's suggestion; Confirm stays disabled, with its reason, until the Researcher chooses.
// - Answered: normal border, read-only, who and when.
// - Expired, Cancelled: dashed muted border on ground, read-only, always “Không được tính là đồng ý”.
// Keyboard (UX-A11Y-002): Tab into the group, arrow keys choose, Tab to Confirm, Enter or Space confirms.

import type { PublicApi } from '@sires/contracts';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatShortDate, formatTime, type DateInput } from '../format';

export type InteractiveAgentPrompt = PublicApi.components['schemas']['InteractiveAgentPrompt'];

export interface PromptCardProps {
  prompt: InteractiveAgentPrompt;
  /** Called with the chosen choice ids when the Researcher confirms an Open prompt. */
  onConfirm?: (choiceIds: string[]) => void | Promise<void>;
  /** While the feature sends the answer: Confirm disabled. */
  submitting?: boolean;
  /** Agent name as shown in the feature (e.g. “Discovery Agent”); omitted → nothing shown. */
  agentLabel?: ReactNode;
  /** Who answered, as the feature displays it; defaults to “Bạn” when answered by a researcher. */
  answeredByLabel?: string;
  /** Time shown in the header; defaults to createdAt, or the answer time once answered. */
  at?: DateInput;
  /** Extra content under the question (e.g. the object and its consequence, owned by the feature). */
  children?: ReactNode;
}

function headerTime(value: DateInput | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString() ? formatTime(date) : formatShortDate(date);
}

export function PromptCard({ prompt, onConfirm, submitting = false, agentLabel, answeredByLabel, at, children }: PromptCardProps) {
  const { t } = useTranslation('shell');
  const name = useId();
  const [selected, setSelected] = useState<string[]>([]);
  const choices = prompt.choices ?? [];
  const multi = prompt.multiSelect === true;
  const status = prompt.status;
  const ended = status === 'Expired' || status === 'Cancelled';
  const time = headerTime(at ?? (status === 'Answered' ? prompt.response?.respondedAt : undefined) ?? prompt.createdAt);

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => (multi ? (checked ? [...prev, id] : prev.filter((x) => x !== id)) : checked ? [id] : prev));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (selected.length === 0 || submitting) return;
    void onConfirm?.(selected);
  };

  const header = (
    <div className="sires-prompt__header">
      <span className="sires-prompt__kind">{t('prompt.header', { type: prompt.type, status })}</span>
      {time && <span className="sires-num sires-prompt__time">{time}</span>}
    </div>
  );

  if (status === 'Open') {
    const canConfirm = selected.length > 0 && !submitting;
    return (
      <article className="sires-prompt" data-status="Open">
        {header}
        <form onSubmit={submit} className="sires-prompt__form">
          <fieldset className="sires-prompt__choices">
            <legend className="sires-prompt__question">{prompt.question}</legend>
            {children}
            {choices.map((choice) => (
              <label key={choice.id} className="sires-prompt__choice">
                <input
                  type={multi ? 'checkbox' : 'radio'}
                  name={name}
                  value={choice.id}
                  checked={selected.includes(choice.id)}
                  onChange={(e) => toggle(choice.id, e.currentTarget.checked)}
                />
                <span>
                  {choice.label}
                  {choice.recommended && <span className="sires-prompt__recommended">{` · ${t('prompt.recommended')}`}</span>}
                  {choice.consequence && <span className="sires-prompt__consequence">{` ${choice.consequence}`}</span>}
                </span>
              </label>
            ))}
          </fieldset>
          <button type="submit" className="sires-button" data-variant="primary" data-size="sm" disabled={!canConfirm}>
            {selected.length === 0 ? t('prompt.confirmDisabled') : t('prompt.confirm')}
          </button>
        </form>
        {agentLabel && <span className="sires-prompt__agent">{agentLabel}</span>}
      </article>
    );
  }

  if (status === 'Answered') {
    const chosen = (prompt.response?.choiceIds ?? []).map((id) => choices.find((c) => c.id === id)?.label ?? id);
    const answer = chosen.length ? chosen.join(', ') : prompt.response?.decision ?? prompt.response?.text;
    const who = answeredByLabel ?? (prompt.response?.respondedBy?.type === 'researcher' ? t('prompt.you') : undefined);
    const when = prompt.response?.respondedAt ? formatTime(prompt.response.respondedAt) : undefined;
    return (
      <article className="sires-prompt" data-status="Answered">
        {header}
        <p className="sires-prompt__question">{prompt.question}</p>
        {answer && (
          <p className="sires-prompt__text">
            {t('prompt.answered')} <strong>{answer}</strong>
          </p>
        )}
        {(who || when) && <span className="sires-prompt__agent">{t('prompt.answeredMeta', { who: who ?? '', time: when ?? '' })}</span>}
      </article>
    );
  }

  return (
    <article className="sires-prompt" data-status={status} data-ended={ended ? '' : undefined}>
      {header}
      <p className="sires-prompt__question">{prompt.question}</p>
      <p className="sires-prompt__text">
        {prompt.statusReason && <>{prompt.statusReason} </>}
        <strong>{t('prompt.notConsent')}</strong>
      </p>
    </article>
  );
}
