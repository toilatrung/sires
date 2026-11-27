// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Content of the shell's Assistant panel (G6, Assistant.html; PID-00060 S04, H6): the account's global
// conversation with the Orchestrator. The panel never sends project context: only the typed text, in a
// conversation with scope global and no projectId (WS-CHAT-001, TS-01-05). Replies arrive as message.posted.

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { PublicApi } from '@sires/contracts';
import { ErrorState, isApiError, useApi, useDraft, useEvents, useMarkScreenOpened, useShell, type ApiError } from '../../../shell';
import { objectLink } from '../labels';

type Schemas = PublicApi.components['schemas'];
type Message = Schemas['Message'];
type Conversation = Schemas['Conversation'];
const PAGE = 30;

const chronological = (rows: Message[]) => [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export function AssistantPanel() {
  const { t } = useTranslation('global');
  const api = useApi();
  const { idempotency } = useShell();
  const markOpened = useMarkScreenOpened();
  const draft = useDraft('assistant.composer');
  const inputId = useId();
  const sendKey = useRef(`sendMessage:${globalThis.crypto.randomUUID()}`);
  const [conversation, setConversation] = useState<Conversation | null>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<ApiError>();
  const [sendError, setSendError] = useState<ApiError>();
  const [sending, setSending] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [noProvider, setNoProvider] = useState(false);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      const { data } = await api.get('/conversations/{conversationId}/messages', { path: { conversationId }, query: { limit: PAGE } });
      const rows = data.items as Message[];
      setMessages(chronological(rows));
      setOlderCursor(data.nextCursor ?? null);
      return rows;
    },
    [api],
  );

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      const { data } = await api.get('/conversations', { query: { scope: 'global' } });
      // Only global conversations, even if a server answered more (cách ly context, PRD 4.3).
      const global = (data.items ?? []).filter((row) => row.scope === 'global');
      const latest = global.sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt))[0] ?? null;
      setConversation(latest);
      if (latest) await loadMessages(latest.id);
    } catch (error) {
      if (!isApiError(error)) throw error;
      setLoadError(error);
      setConversation(null);
    }
  }, [api, loadMessages]);

  useEffect(() => {
    void markOpened();
    void load();
    void api
      .get('/provider-connections')
      .then(({ data }) => setNoProvider((data.items ?? []).length === 0))
      .catch(() => setNoProvider(false));
  }, [api, load, markOpened]);

  useEvents({ types: ['message.posted'] }, () => {
    if (!conversation) return;
    void loadMessages(conversation.id).then((rows) => {
      const last = chronological(rows).at(-1);
      if (last && last.sender.type !== 'researcher') setWaiting(false);
    });
  });

  const loadOlder = async () => {
    if (!conversation || !olderCursor) return;
    const { data } = await api.get('/conversations/{conversationId}/messages', { path: { conversationId: conversation.id }, query: { limit: PAGE, cursor: olderCursor } });
    setMessages((current) => chronological([...(data.items as Message[]), ...current]));
    setOlderCursor(data.nextCursor ?? null);
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.value.trim();
    if (!content || sending) return;
    setSending(true);
    setSendError(undefined);
    try {
      let target = conversation;
      if (!target) {
        // EC13: the global conversation is created with the first message, never on opening the panel.
        const created = await api.post('/conversations', { body: { scope: 'global' } });
        target = created.data;
        setConversation(target);
      }
      const conversationId = target.id;
      const { data } = await idempotency.run(sendKey.current, (key) =>
        api.post('/conversations/{conversationId}/messages', { path: { conversationId }, body: { content }, idempotencyKey: key }),
      );
      setMessages((current) => chronological([...current.filter((row) => row.id !== data.message.id), data.message]));
      draft.clear();
      sendKey.current = `sendMessage:${globalThis.crypto.randomUUID()}`;
      setWaiting(true);
    } catch (error) {
      if (!isApiError(error)) throw error;
      setSendError(error); // EC14: the text stays in the box; a retry reuses the same key after a 5xx.
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="g-assistant">
      <div className="g-assistant__scope">
        <strong>Global AI Assistant</strong>
        <span className="g-meta">{t('assistant.scope')}</span>
      </div>
      {noProvider && (
        <p className="g-notice g-assistant__notice">
          {t('assistant.noProvider')}{' '}
          <Link className="g-link" to="/settings/agents">
            Settings › Agent Models
          </Link>
        </p>
      )}
      {loadError && <ErrorState error={loadError} ns="global" onRetry={() => void load()} />}
      <div className="g-assistant__log" aria-label={t('assistant.history')} role="log">
        {olderCursor && (
          <button type="button" className="sires-button" data-variant="secondary" data-size="sm" onClick={() => void loadOlder()}>
            {t('assistant.older')}
          </button>
        )}
        {conversation === null && !loadError && <p className="g-meta">{t('assistant.empty')}</p>}
        {messages.map((message) => {
          const mine = message.sender.type === 'researcher';
          return (
            <div key={message.id} className="g-message" data-mine={mine || undefined}>
              <span className="g-meta">{mine ? t('assistant.you') : message.sender.agent === 'orchestrator' || !message.sender.agent ? 'Orchestrator' : message.sender.agent}</span>
              <p className="g-message__text">{message.content}</p>
              {(message.links ?? []).length > 0 && (
                <ul className="g-list g-message__links">
                  {(message.links ?? []).map((item, index) => {
                    const link = objectLink(item.objectType, item.objectId, undefined);
                    return (
                      <li key={`${item.objectId ?? index}`}>
                        {link ? (
                          <Link className="g-link" to={link.to}>
                            {item.label ?? t(`link.${link.label}`)}
                          </Link>
                        ) : (
                          <span className="g-meta">{item.label}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {/* aria-live without role=status: the panel sits next to other status regions of the page. */}
      <p aria-live="polite" className="g-meta">
        {waiting ? t('assistant.waiting') : ''}
      </p>
      {sendError && <ErrorState error={sendError} ns="global" notSaved={t('assistant.notSent')} />}
      <form className="g-assistant__form" onSubmit={send}>
        <label htmlFor={inputId} className="g-field">
          {t('assistant.input')}
        </label>
        <textarea id={inputId} className="g-textarea" rows={3} value={draft.value} onChange={(event) => draft.setValue(event.currentTarget.value)} />
        <button type="submit" className="sires-button" data-variant="primary" disabled={sending || !draft.value.trim()}>
          {sending ? t('assistant.sending') : t('assistant.send')}
        </button>
        {!draft.value.trim() && <span className="g-field__hint">{t('assistant.typeFirst')}</span>}
      </form>
      <p className="g-note">{t('assistant.limits')}</p>
    </div>
  );
}
