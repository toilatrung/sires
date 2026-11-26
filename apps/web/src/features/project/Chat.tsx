// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Project AI Chat (PID-00058 S03–S06; H2, H6–H11, H14, H15): one project conversation, history by page, the composer
// with the shell's draft store and the active task, the Orchestrator's answer appearing as `chat.delta` arrives,
// prompts in the flow (shell PromptCard), the context panel and provider errors.

import type { ChatDeltaMessage } from '@sires/contracts';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import {
  ErrorState,
  LoadingState,
  formatTime,
  useApi,
  useDraft,
  useEvents,
  useSession,
  useShell,
  useStreamSignal,
  type ApiError,
  type StreamEvent,
} from '../../shell';
import { PromptInline } from './PromptInline';
import { NS, agentKey, agentRunHref, objectHref, shortId, useResource, workflowHref, type Schemas } from './shared';

type Message = Schemas['Message'];
type Task = Schemas['Task'];
type Delta = Omit<ChatDeltaMessage, 'accountId'>;

const PAGE = 50;
const MAX_LENGTH = 20000;

interface Draft {
  agentRunId: string;
  seq: number;
  text: string;
  at: string;
}

interface Failure {
  agent?: string;
  instance?: string | null;
  code?: string;
  connection?: string;
}

interface Data {
  project: Schemas['ResearchProject'];
  conversationId: string | null;
  messages: Message[];
  nextCursor: string | null;
  tasks: Task[];
}

async function loadChat(api: ReturnType<typeof useApi>, projectId: string): Promise<Data> {
  const [project, conversations, tasks] = await Promise.all([
    api.get('/projects/{projectId}', { path: { projectId } }),
    api.get('/conversations', { query: { scope: 'project', projectId } }),
    api.get('/projects/{projectId}/tasks', { path: { projectId } }),
  ]);
  // One project conversation: the one with the latest message (H9).
  const latest = [...(conversations.data.items ?? [])].sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))[0];
  const page = latest ? await api.get('/conversations/{conversationId}/messages', { path: { conversationId: latest.id }, query: { limit: PAGE } }) : null;
  return {
    project: project.data,
    conversationId: latest?.id ?? null,
    messages: [...(page?.data.items ?? [])].reverse(),
    nextCursor: page?.data.nextCursor ?? null,
    tasks: tasks.data.items ?? [],
  };
}

/** chat.delta fields on the stream (H6): Event plus the ChatDeltaMessage payload without accountId. */
function asDelta(event: StreamEvent): Delta | null {
  const data = event as StreamEvent & Partial<Delta>;
  return data.conversationId && data.agentRunId && typeof data.seq === 'number' && typeof data.text === 'string'
    ? { conversationId: data.conversationId, agentRunId: data.agentRunId, seq: data.seq, text: data.text, final: data.final }
    : null;
}

export function ChatScreen() {
  const { t } = useTranslation(NS);
  const { projectId = '' } = useParams();
  const api = useApi();
  const resource = useResource(() => loadChat(api, projectId), [projectId]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [failures, setFailures] = useState<Failure[]>([]);
  const workflows = useRef(new Set<string>());
  const data = resource.value.state === 'ready' ? resource.value.data : null;
  const conversationId = data?.conversationId ?? null;

  /** Latest page again: saved messages replace the drafts of their Agent Run (EC15, EC16). */
  const refresh = useCallback(
    async (dropDrafts: boolean) => {
      if (!conversationId) return;
      const page = await api.get('/conversations/{conversationId}/messages', { path: { conversationId }, query: { limit: PAGE } });
      const latest = [...(page.data.items ?? [])].reverse();
      resource.setData((d) => {
        const older = d.messages.filter((m) => !latest.some((x) => x.id === m.id) && m.createdAt < (latest[0]?.createdAt ?? ''));
        return { ...d, messages: [...older, ...latest], nextCursor: d.nextCursor ?? page.data.nextCursor ?? null };
      });
      setDrafts((old) => (dropDrafts ? [] : old.filter((draft) => !latest.some((m) => m.agentRunId === draft.agentRunId))));
    },
    [api, conversationId, resource],
  );

  const failureOf = useCallback(
    async (code: string | undefined, agentRunId: string | undefined) => {
      let failure: Failure = { code };
      if (agentRunId) {
        try {
          const run = (await api.get('/agent-runs/{agentRunId}', { path: { agentRunId } })).data;
          failure = { agent: run.agent, instance: run.instance, code: run.error?.code ?? code };
          if (run.providerConnectionId) {
            const connections = (await api.get('/provider-connections')).data.items ?? [];
            failure.connection = connections.find((c) => c.id === run.providerConnectionId)?.name;
          }
        } catch {
          // the block still shows the code
        }
      }
      setFailures((old) => [...old, failure]);
      setWaiting(false);
    },
    [api],
  );

  useEvents(
    { types: ['chat.delta', 'message.posted', 'workflow.status_changed', 'agent_run.status_changed', 'project.lifecycle_changed'], projectId },
    (event) => {
      if (event.type === 'chat.delta') {
        const delta = asDelta(event);
        if (!delta || delta.conversationId !== conversationId) return;
        setWaiting(false);
        setDrafts((old) => {
          const current = old.find((d) => d.agentRunId === delta.agentRunId);
          if (current && delta.seq <= current.seq) return old; // duplicate or out of order (EC14)
          if (!current) return [...old, { agentRunId: delta.agentRunId, seq: delta.seq, text: delta.text, at: event.at }];
          return old.map((d) => (d.agentRunId === delta.agentRunId ? { ...d, seq: delta.seq, text: d.text + delta.text } : d));
        });
      } else if (event.type === 'message.posted') {
        void refresh(false);
      } else if (event.type === 'workflow.status_changed' && event.toState === 'Failed' && event.objectId && workflows.current.has(event.objectId)) {
        void api.get('/workflows/{workflowId}', { path: { workflowId: event.objectId } }).then(
          (res) => failureOf(res.data.lastError?.code, res.data.lastError?.agentRunId),
          () => failureOf(undefined, undefined),
        );
      } else if (event.type === 'agent_run.status_changed' && event.toState === 'Failed' && event.objectId && drafts.some((d) => d.agentRunId === event.objectId)) {
        void failureOf(undefined, event.objectId);
      } else if (event.type === 'project.lifecycle_changed') {
        void resource.reload();
      }
    },
  );

  // The stream reconnected or asks for a reload: drop the drafts and read the latest page (EC16).
  useStreamSignal(() => void refresh(true));

  if (resource.value.state === 'loading') return <LoadingState what={t('chat.title')} />;
  if (resource.value.state === 'error' || !data) {
    return <ErrorState error={resource.value.state === 'error' ? (resource.value.error as ApiError) : undefined} ns={NS} onRetry={() => void resource.reload()} />;
  }

  const archived = data.project.status === 'Archived';

  const loadOlder = async () => {
    if (!conversationId || !data.nextCursor) return;
    const page = await api.get('/conversations/{conversationId}/messages', { path: { conversationId }, query: { limit: PAGE, cursor: data.nextCursor } });
    resource.setData((d) => ({ ...d, messages: [...[...(page.data.items ?? [])].reverse(), ...d.messages], nextCursor: page.data.nextCursor ?? null }));
  };

  return (
    <div className="sires-chat">
      <section className="sires-chat__main" aria-label={t('chat.title')}>
        {data.nextCursor && (
          <button type="button" className="sires-button sires-chat__older" onClick={() => void loadOlder()}>
            {t('chat.older')}
          </button>
        )}
        {!data.messages.length && !drafts.length && <p className="sires-chat__empty">{t('chat.empty')}</p>}
        <ol className="sires-chat__messages">
          {data.messages.map((message) => (
            <MessageItem key={message.id} projectId={projectId} message={message} tasks={data.tasks} archived={archived} />
          ))}
          {drafts.map((draft) => (
            <li key={draft.agentRunId} className="sires-chat__message" data-draft="">
              <MessageHead projectId={projectId} name={t('agent.orchestrator')} at={draft.at} agentRunId={draft.agentRunId} />
              <p className="sires-chat__content">{draft.text}</p>
            </li>
          ))}
        </ol>
        {waiting && (
          <p role="status" className="sires-chat__waiting">
            <span className="sires-chat__dot" data-running="" aria-hidden="true" />
            {t('chat.answering')}
          </p>
        )}
        {failures.map((failure, i) => (
          <ProviderFailure key={i} projectId={projectId} failure={failure} />
        ))}
        {archived ? (
          <p className="sires-chat__readonly">{t('chat.archived')}</p>
        ) : (
          <Composer
            projectId={projectId}
            project={data.project}
            tasks={data.tasks}
            conversationId={conversationId}
            onConversation={(id) => resource.setData((d) => ({ ...d, conversationId: id }))}
            onSent={(accepted) => {
              if (accepted.workflowId) workflows.current.add(accepted.workflowId);
              resource.setData((d) => ({ ...d, messages: [...d.messages, accepted.message] }));
              setWaiting(true);
            }}
            onActiveTask={(project) => resource.setData((d) => ({ ...d, project }))}
          />
        )}
      </section>
      <ContextPanel projectId={projectId} project={data.project} tasks={data.tasks} />
    </div>
  );
}

function MessageHead({ projectId, name, at, agentRunId, taskCode, deliberation }: { projectId: string; name: string; at: string; agentRunId?: string; taskCode?: string; deliberation?: Schemas['DeliberationLabel'] | null }) {
  const { t } = useTranslation(NS);
  return (
    <p className="sires-chat__head">
      <span className="sires-chat__sender">{name}</span>
      <span className="sires-chat__meta"> · {formatTime(at)}</span>
      {taskCode && (
        <span className="sires-chat__meta">
          {' '}
          · <span className="sires-id">{taskCode}</span>
        </span>
      )}
      {agentRunId && (
        <span className="sires-chat__meta">
          {' '}
          ·{' '}
          <Link to={agentRunHref(projectId, agentRunId)}>
            {t('chat.agentRun')} <span className="sires-id">{shortId('ar', agentRunId)}</span>
          </Link>
        </span>
      )}
      {deliberation && (
        <span className="sires-chip" data-tone="neutral">
          {deliberation.status === 'deliberated' ? t('chat.deliberated') : t('chat.notDeliberated')}
        </span>
      )}
    </p>
  );
}

function MessageItem({ projectId, message, tasks, archived }: { projectId: string; message: Message; tasks: Task[]; archived: boolean }) {
  const { t } = useTranslation(NS);
  const sender = message.sender;
  const who = agentKey(sender.agent, sender.instance);
  const name = sender.type === 'researcher' ? t('chat.you') : sender.type === 'agent' ? t(who.key, { instance: who.instance, defaultValue: sender.agent ?? '' }) + (who.instance ? ` ${who.instance}` : '') : t('chat.system');
  const task = message.activeTaskId ? tasks.find((x) => x.id === message.activeTaskId) : undefined;
  const links = (message.links ?? []).map((link) => ({ ...link, href: objectHref(projectId, link.objectType, link.objectId) })).filter((link) => link.href);
  return (
    <li className="sires-chat__message" data-sender={sender.type}>
      <MessageHead projectId={projectId} name={name} at={message.createdAt} agentRunId={message.agentRunId ?? sender.agentRunId} taskCode={task?.stableKey} deliberation={message.deliberation} />
      {/* Plain text, line breaks kept; React escapes it, so no HTML is ever inserted (EC19). */}
      <p className="sires-chat__content">{message.content}</p>
      {links.length > 0 && (
        <p className="sires-chat__links">
          {links.map((link) => (
            <Link key={`${link.objectType}-${link.objectId}`} to={link.href!}>
              {link.label ?? link.objectType}
            </Link>
          ))}
        </p>
      )}
      {message.embeddedPromptId && <PromptInline projectId={projectId} promptId={message.embeddedPromptId} archived={archived} />}
    </li>
  );
}

function Composer({
  projectId,
  project,
  tasks,
  conversationId,
  onConversation,
  onSent,
  onActiveTask,
}: {
  projectId: string;
  project: Schemas['ResearchProject'];
  tasks: Task[];
  conversationId: string | null;
  onConversation: (id: string) => void;
  onSent: (accepted: Schemas['MessageAccepted']) => void;
  onActiveTask: (project: Schemas['ResearchProject']) => void;
}) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const { idempotency } = useShell();
  // The composer is in the shell's draft store: an expired session does not lose it (H2, EC12).
  const draft = useDraft(`project.chat.${projectId}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [taskError, setTaskError] = useState<ApiError | null>(null);
  const text = draft.value;
  const length = [...text].length;
  const task = project.activeTaskId ? tasks.find((x) => x.id === project.activeTaskId) : undefined;
  const canSend = text.trim().length > 0 && length <= MAX_LENGTH && !busy;

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      let id = conversationId;
      if (!id) {
        // First message of the project: create the conversation, then send (EC07).
        const created = await api.post('/conversations', { body: { scope: 'project', projectId } });
        id = created.data.id;
        onConversation(id);
      }
      const content = text;
      // One Idempotency-Key per message; a retry of the same text reuses it (EC09).
      const accepted = await idempotency.run(`sendMessage:${id}:${content}`, (key) =>
        api.post('/conversations/{conversationId}/messages', {
          path: { conversationId: id! },
          body: { content, ...(project.activeTaskId ? { activeTaskId: project.activeTaskId } : {}) },
          idempotencyKey: key,
        }),
      );
      draft.clear();
      onSent(accepted.data);
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const clearTask = async () => {
    setTaskError(null);
    try {
      const res = await api.put('/projects/{projectId}/active-task', { path: { projectId }, body: { taskId: null } });
      onActiveTask(res.data);
    } catch (caught) {
      setTaskError(caught as ApiError);
    }
  };

  return (
    <form
      className="sires-chat__composer"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {project.activeTaskId && (
        <div className="sires-chat__active-task">
          <span>
            {t('chat.activeTask', { code: task?.stableKey ?? '—', title: task?.currentDefinition.title ?? '' })}
            <span className="sires-chat__meta"> · {t('chat.activeTaskHint', { code: task?.stableKey ?? '—' })}</span>
          </span>
          <button type="button" className="sires-icon-button" aria-label={t('chat.clearTask')} onClick={() => void clearTask()}>
            ×
          </button>
        </div>
      )}
      {taskError && <ErrorState error={taskError} ns={NS} notSaved={t('chat.taskNotCleared')} />}
      <label className="sires-field">
        <span className="sires-field__label">{t('chat.composer')}</span>
        <textarea className="sires-input" rows={3} value={text} aria-invalid={length > MAX_LENGTH} onChange={(e) => draft.setValue(e.currentTarget.value)} />
      </label>
      <div className="sires-chat__composer-foot">
        <span className="sires-chat__meta" aria-live="polite">
          {length > MAX_LENGTH ? t('chat.tooLong', { max: MAX_LENGTH }) : t('chat.count', { count: length, max: MAX_LENGTH })}
        </span>
        <button type="submit" className="sires-button" data-variant="primary" disabled={!canSend}>
          {busy ? t('chat.sending') : t('chat.send')}
        </button>
      </div>
      {error && <ErrorState error={error} ns={NS} notSaved={t('chat.notSent')} />}
    </form>
  );
}

function ProviderFailure({ projectId, failure }: { projectId: string; failure: Failure }) {
  const { t } = useTranslation(NS);
  const who = agentKey(failure.agent, failure.instance);
  const auth = failure.code === 'auth_failed' || failure.code === 'permission_denied';
  return (
    <div role="alert" className="sires-chat__failure">
      <p>
        <strong>{t('chat.failure.title', { agent: failure.agent ? t(who.key) + (who.instance ? ` ${who.instance}` : '') : t('agent.orchestrator') })}</strong>{' '}
        {failure.connection && t('chat.failure.connection', { name: failure.connection })}{' '}
        {auth ? t('chat.failure.auth') : t('chat.failure.retried')}
      </p>
      <p className="sires-chat__meta">
        {t('chat.failure.code')} <code className="sires-id">{failure.code ?? '—'}</code>
      </p>
      {auth ? (
        <Link className="sires-button" to="/settings/providers">
          {t('chat.failure.openProviders')}
        </Link>
      ) : (
        <Link className="sires-button" to={`/projects/${projectId}/activity`}>
          {t('chat.failure.openActivity')}
        </Link>
      )}
    </div>
  );
}

/** “Context của cuộc trò chuyện” (S06, EC29): what the next message carries. */
function ContextPanel({ projectId, project, tasks }: { projectId: string; project: Schemas['ResearchProject']; tasks: Task[] }) {
  const { t } = useTranslation(NS);
  const api = useApi();
  const session = useSession();
  const resource = useResource(async () => {
    const [context, plan, references] = await Promise.all([
      api.get('/projects/{projectId}/shared-context', { path: { projectId } }),
      api.get('/projects/{projectId}/plan', { path: { projectId } }),
      api.get('/projects/{projectId}/references', { path: { projectId } }),
    ]);
    const me = session.status === 'signed-in' && session.account ? session.account : (await api.get('/me')).data;
    return { context: context.data, plan: plan.data, references: references.data.items ?? [], includeField: me.preferences.includeResearchFieldInContext ?? false };
  }, [projectId]);
  const task = useMemo(() => (project.activeTaskId ? tasks.find((x) => x.id === project.activeTaskId) : undefined), [project.activeTaskId, tasks]);

  if (resource.value.state !== 'ready') {
    return (
      <aside className="sires-chat__context" aria-label={t('chat.context.title')}>
        {resource.value.state === 'loading' ? <LoadingState what={t('chat.context.title')} /> : <ErrorState error={resource.value.error as ApiError} ns={NS} onRetry={() => void resource.reload()} />}
      </aside>
    );
  }
  const { context, plan, references, includeField } = resource.value.data;
  const rc = context.researchContext;
  const assumptions = (context.activeContextItems ?? []).filter((item) => item.kind === 'assumption' && item.status === 'Active').length;
  const baseline = plan.baselineVersionId ? plan.versions?.find((v) => v.id === plan.baselineVersionId) : undefined;
  const selected = context.selectedReferenceIds ?? [];
  const indexed = references.filter((r) => selected.includes(r.referenceId ?? r.id) && (r as { indexingStatus?: string }).indexingStatus === 'Indexed').length;
  const running = context.activeWorkflowIds?.[0];
  const none = t('chat.context.none');
  return (
    <aside className="sires-chat__context" aria-label={t('chat.context.title')}>
      <h2 className="sires-chat__context-title">{t('chat.context.title')}</h2>
      <dl className="sires-chat__facts">
        <dt>{t('chat.context.research')}</dt>
        <dd>{rc ? t('chat.context.researchValue', { version: rc.versionNumber, count: assumptions }) : none}</dd>
        <dt>{t('chat.context.plan')}</dt>
        <dd>{baseline ? t('chat.context.planValue', { version: baseline.versionNumber, status: baseline.status }) : none}</dd>
        <dt>{t('chat.context.task')}</dt>
        <dd>{task ? `${task.stableKey} · ${task.currentDefinition.title}` : none}</dd>
        <dt>{t('chat.context.references')}</dt>
        <dd>{selected.length ? t('chat.context.referencesValue', { count: selected.length, indexed }) : none}</dd>
        <dt>{t('chat.context.field')}</dt>
        <dd>
          {includeField ? t('chat.context.fieldSent') : t('chat.context.fieldNotSent')} <Link to="/settings/profile">{t('chat.context.profile')}</Link>
        </dd>
      </dl>
      {running && (
        <Link className="sires-project__link" to={workflowHref(projectId, running)}>
          {t('chat.context.workflow')}
        </Link>
      )}
    </aside>
  );
}
