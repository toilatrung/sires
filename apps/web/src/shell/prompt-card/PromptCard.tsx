// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Interactive Agent Prompt card (H8, design.md §3 and §4, Components, Chat, MobilePrompt): a presentational
// component for every PromptType of the contract. The feature area loads the prompt and sends the PromptResponse
// from `onAnswer` with answerPrompt; the card never calls the API (N14).
// - Open: 1.5px brand border, actions per type:
//   choice — full-width radio rows (checkboxes when multiSelect) with their consequence; Confirm.
//   approval — “Duyệt”, “Từ chối”; with choices, “Duyệt” needs one chosen.
//   edit_and_approve — fields of editablePayload, “Sửa và duyệt” (sends editedPayload), “Từ chối”.
//   information_request — an answer field and “Gửi câu trả lời”.
//   Nothing is pre-selected, not even the agent's suggestion; a disabled action always says why.
// - Answered: normal border, read-only, the answer, who and when.
// - Expired, Cancelled: dashed muted border on ground, read-only, always “Không được tính là đồng ý”.
// Keyboard (UX-A11Y-002): Tab into the group, arrow keys choose, Tab to the action, Enter or Space confirms.

import type { PublicApi } from '@sires/contracts';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatShortDate, formatTime, type DateInput } from '../format';

type Schemas = PublicApi.components['schemas'];
export type InteractiveAgentPrompt = Schemas['InteractiveAgentPrompt'];
export type PromptResponse = Schemas['PromptResponse'];
export type PromptType = Schemas['PromptType'];

export interface PromptCardProps {
  prompt: InteractiveAgentPrompt;
  /** The answer to send with answerPrompt, for every prompt type (objectVersion included when the prompt has it). */
  onAnswer?: (response: PromptResponse) => void | Promise<void>;
  /** Choice prompts: the chosen choice ids (same moment as `onAnswer`). */
  onConfirm?: (choiceIds: string[]) => void | Promise<void>;
  /** While the feature sends the answer: every action disabled. */
  submitting?: boolean;
  /** Agent name as shown in the feature (e.g. “Discovery Agent”); omitted → nothing shown. */
  agentLabel?: ReactNode;
  /** Who answered, as the feature displays it; defaults to “Bạn” when answered by a researcher. */
  answeredByLabel?: string;
  /** Time shown in the header; defaults to createdAt, or the answer time once answered. */
  at?: DateInput;
  /** edit_and_approve: labels of editablePayload fields, e.g. `{ title: 'Tiêu đề' }`; default: the field name. */
  fieldLabels?: Record<string, string>;
  /** edit_and_approve: replaces the default editor (flat text and number fields) for a richer payload. */
  renderEditor?: (value: unknown, onChange: (next: unknown) => void) => ReactNode;
  /** Extra content under the question, owned by the feature (e.g. the object and its consequence). */
  children?: ReactNode;
}

type Fields = Record<string, unknown>;

function isPlainObject(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function headerTime(value: DateInput | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString() ? formatTime(date) : formatShortDate(date);
}

/** Default editor of edit_and_approve: one labelled field per text or number value of a flat object. */
function FieldsEditor({ value, onChange, labels, disabled }: { value: unknown; onChange: (next: unknown) => void; labels?: Record<string, string>; disabled: boolean }) {
  if (!isPlainObject(value)) return null;
  const entries = Object.entries(value).filter(([, v]) => typeof v === 'string' || typeof v === 'number');
  if (entries.length === 0) return null;
  return (
    <div className="sires-prompt__fields">
      {entries.map(([key, v]) => (
        <label key={key} className="sires-field">
          <span className="sires-field__label">{labels?.[key] ?? key}</span>
          <input
            className="sires-input"
            type={typeof v === 'number' ? 'number' : 'text'}
            value={String(v)}
            disabled={disabled}
            onChange={(e) => {
              const raw = e.currentTarget.value;
              const next = typeof v === 'number' && raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
              onChange({ ...value, [key]: next });
            }}
          />
        </label>
      ))}
    </div>
  );
}

export function PromptCard({
  prompt,
  onAnswer,
  onConfirm,
  submitting = false,
  agentLabel,
  answeredByLabel,
  at,
  fieldLabels,
  renderEditor,
  children,
}: PromptCardProps) {
  const { t } = useTranslation('shell');
  const name = useId();
  const [selected, setSelected] = useState<string[]>([]);
  const [edited, setEdited] = useState<unknown>(() => (isPlainObject(prompt.editablePayload) ? { ...prompt.editablePayload } : prompt.editablePayload));
  const [text, setText] = useState('');
  const choices = prompt.choices ?? [];
  const multi = prompt.multiSelect === true;
  const status = prompt.status;
  const type = prompt.type;
  const ended = status === 'Expired' || status === 'Cancelled';
  const time = headerTime(at ?? (status === 'Answered' ? prompt.response?.respondedAt : undefined) ?? prompt.createdAt);
  const objectVersion = prompt.pendingAction?.objectVersion;

  const answer = (response: PromptResponse) => {
    if (submitting) return;
    void onAnswer?.(objectVersion === undefined ? response : { ...response, objectVersion });
  };

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => (multi ? (checked ? [...prev, id] : prev.filter((x) => x !== id)) : checked ? [id] : prev));
  };

  const header = (
    <div className="sires-prompt__header">
      <span className="sires-prompt__kind">{t('prompt.header', { type, status })}</span>
      {time && <span className="sires-num sires-prompt__time">{time}</span>}
    </div>
  );
  const agent = agentLabel && <span className="sires-prompt__agent">{agentLabel}</span>;

  if (status === 'Open') {
    const choiceRows = choices.map((choice) => (
      <label key={choice.id} className="sires-prompt__choice">
        <input
          type={multi ? 'checkbox' : 'radio'}
          name={name}
          value={choice.id}
          checked={selected.includes(choice.id)}
          disabled={submitting}
          onChange={(e) => toggle(choice.id, e.currentTarget.checked)}
        />
        <span>
          {choice.label}
          {choice.recommended && <span className="sires-prompt__recommended">{` · ${t('prompt.recommended')}`}</span>}
          {choice.consequence && <span className="sires-prompt__consequence">{` ${choice.consequence}`}</span>}
        </span>
      </label>
    ));
    const chosen = selected.length > 0;

    let body: ReactNode;
    if (type === 'choice') {
      const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!chosen || submitting) return;
        answer({ choiceIds: selected });
        void onConfirm?.(selected);
      };
      body = (
        <form onSubmit={submit} className="sires-prompt__form">
          <fieldset className="sires-prompt__choices">
            <legend className="sires-prompt__question">{prompt.question}</legend>
            {children}
            {choiceRows}
          </fieldset>
          <div className="sires-prompt__actions">
            <button type="submit" className="sires-button" data-variant="outline" data-size="sm" disabled={!chosen || submitting}>
              {chosen ? t('prompt.confirm') : t('prompt.confirmDisabled')}
            </button>
          </div>
        </form>
      );
    } else if (type === 'approval') {
      const needsChoice = choices.length > 0;
      const canApprove = (!needsChoice || chosen) && !submitting;
      body = (
        <form
          className="sires-prompt__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (canApprove) answer(needsChoice ? { decision: 'approved', choiceIds: selected } : { decision: 'approved' });
          }}
        >
          {needsChoice ? (
            <fieldset className="sires-prompt__choices">
              <legend className="sires-prompt__question">{prompt.question}</legend>
              {children}
              {choiceRows}
            </fieldset>
          ) : (
            <>
              <p className="sires-prompt__question">{prompt.question}</p>
              {children}
            </>
          )}
          <div className="sires-prompt__actions">
            <button type="submit" className="sires-button" data-variant="outline" data-size="sm" disabled={!canApprove}>
              {canApprove || submitting ? t('prompt.approve') : t('prompt.approveDisabled')}
            </button>
            <button type="button" className="sires-button" data-variant="secondary" data-size="sm" disabled={submitting} onClick={() => answer({ decision: 'rejected' })}>
              {t('prompt.reject')}
            </button>
          </div>
        </form>
      );
    } else if (type === 'edit_and_approve') {
      body = (
        <form
          className="sires-prompt__form"
          onSubmit={(e) => {
            e.preventDefault();
            answer({ decision: 'approved', editedPayload: edited });
          }}
        >
          <p className="sires-prompt__question">{prompt.question}</p>
          {children}
          {renderEditor ? renderEditor(edited, setEdited) : <FieldsEditor value={edited} onChange={setEdited} labels={fieldLabels} disabled={submitting} />}
          <span className="sires-prompt__note">{t('prompt.bothKept')}</span>
          <div className="sires-prompt__actions">
            <button type="submit" className="sires-button" data-variant="outline" data-size="sm" disabled={submitting}>
              {t('prompt.editApprove')}
            </button>
            <button type="button" className="sires-button" data-variant="secondary" data-size="sm" disabled={submitting} onClick={() => answer({ decision: 'rejected' })}>
              {t('prompt.reject')}
            </button>
          </div>
        </form>
      );
    } else {
      const filled = text.trim().length > 0;
      body = (
        <form
          className="sires-prompt__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (filled) answer({ text: text.trim() });
          }}
        >
          <p className="sires-prompt__question">{prompt.question}</p>
          {children}
          <label className="sires-field">
            <span className="sires-field__label">{t('prompt.answerLabel')}</span>
            <textarea className="sires-input" rows={3} value={text} disabled={submitting} onChange={(e) => setText(e.currentTarget.value)} />
          </label>
          <div className="sires-prompt__actions">
            <button type="submit" className="sires-button" data-variant="outline" data-size="sm" disabled={!filled || submitting}>
              {filled ? t('prompt.send') : t('prompt.sendDisabled')}
            </button>
          </div>
        </form>
      );
    }

    return (
      <article className="sires-prompt" data-status="Open" data-type={type}>
        {header}
        {body}
        {agent}
      </article>
    );
  }

  if (status === 'Answered') {
    const response = prompt.response;
    const chosenLabels = (response?.choiceIds ?? []).map((id) => choices.find((c) => c.id === id)?.label ?? id);
    let summary: ReactNode = null;
    if (chosenLabels.length) {
      summary = (
        <>
          {t('prompt.answered')} <strong>{chosenLabels.join(', ')}</strong>
        </>
      );
    }
    if (response?.decision) {
      const decision =
        response.decision === 'rejected' ? t('prompt.rejected') : response.editedPayload !== undefined ? t('prompt.editedApproved') : t('prompt.approved');
      summary = (
        <>
          <strong>{decision}</strong>
          {chosenLabels.length > 0 && <> · {chosenLabels.join(', ')}</>}
          {response.text && <> — {response.text}</>}
        </>
      );
    } else if (response?.text) {
      summary = (
        <>
          {t('prompt.answeredText')} <strong>{response.text}</strong>
        </>
      );
    }
    const who = answeredByLabel ?? (response?.respondedBy?.type === 'researcher' ? t('prompt.you') : undefined);
    const when = response?.respondedAt ? formatTime(response.respondedAt) : undefined;
    return (
      <article className="sires-prompt" data-status="Answered" data-type={type}>
        {header}
        <p className="sires-prompt__question">{prompt.question}</p>
        {summary && <p className="sires-prompt__text">{summary}</p>}
        {(who || when) && <span className="sires-prompt__agent">{t('prompt.answeredMeta', { who: who ?? '', time: when ?? '' })}</span>}
      </article>
    );
  }

  return (
    <article className="sires-prompt" data-status={status} data-type={type} data-ended={ended ? '' : undefined}>
      {header}
      <p className="sires-prompt__question">{prompt.question}</p>
      <p className="sires-prompt__text">
        {prompt.statusReason && <>{prompt.statusReason} </>}
        <strong>{t('prompt.notConsent')}</strong>
      </p>
    </article>
  );
}
