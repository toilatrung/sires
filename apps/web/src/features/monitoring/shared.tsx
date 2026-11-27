// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Shared pieces of the monitoring area (PID-00059): namespace, loader hook, workflow states and the commands each one
// allows (PRD 18.2; H8, DEC-53), the command hook (one Idempotency-Key per action, 409 → read again), the Cancel
// dialog, elapsed time, names of agents and actors, links to the routes of other areas.

import type { PublicApi } from '@sires/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ConfirmDialog, formatElapsed, isApiError, useApi, useSession, useShell, type ApiError } from '../../shell';

export const NS = 'monitoring';

export type Schemas = PublicApi.components['schemas'];
export type Workflow = Schemas['Workflow'];
export type Step = Schemas['WorkflowStep'];
export type AgentRun = Schemas['AgentRun'];
export type AuditEvent = Schemas['AuditEvent'];
export type TypedRef = Schemas['TypedRef'];
export type WorkflowStatus = Schemas['WorkflowStatus'];

export const ACTIVE: WorkflowStatus[] = ['Created', 'Running', 'Waiting for User', 'Paused', 'Interrupted'];
export const ENDED: WorkflowStatus[] = ['Succeeded', 'Failed', 'Cancelled'];
export const isActive = (w: Pick<Workflow, 'status'>) => ACTIVE.includes(w.status);

export type Loadable<T> = { state: 'loading' } | { state: 'ready'; data: T } | { state: 'error'; error: ApiError };

/** A page of a list (contract `Page`). */
export interface Page<T> {
  items?: T[];
  nextCursor?: string | null;
}

/** Load data for a view; `reload` reruns the loader, `setData` replaces it after a write or an event. */
export function useResource<T>(load: () => Promise<T>, deps: readonly unknown[] = []): { value: Loadable<T>; reload: () => Promise<void>; setData: (update: (old: T) => T) => void } {
  const [value, setValue] = useState<Loadable<T>>({ state: 'loading' });
  const loadRef = useRef(load);
  loadRef.current = load;
  const ticket = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++ticket.current;
    setValue((old) => (old.state === 'ready' ? old : { state: 'loading' }));
    try {
      const data = await loadRef.current();
      if (mine === ticket.current) setValue({ state: 'ready', data });
    } catch (error) {
      if (mine === ticket.current) setValue({ state: 'error', error: error as ApiError });
    }
  }, []);
  useEffect(() => {
    setValue({ state: 'loading' });
    void reload();
    // `deps` lists what the loader reads (project id, filter); the loader itself is kept in a ref.
  }, deps);
  const setData = useCallback((update: (old: T) => T) => setValue((old) => (old.state === 'ready' ? { state: 'ready', data: update(old.data) } : old)), []);
  return { value, reload, setData };
}

/** Every page of a list (nextCursor), for lists the screen sums or groups (Agent Runs of a workflow). */
export async function allPages<T>(read: (cursor: string | undefined) => Promise<Page<T>>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await read(cursor);
    items.push(...(page.items ?? []));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

/* ---------- Commands of a workflow (H8) ---------- */

export type Command = 'pause' | 'resume' | 'cancel';

/** Controls valid in a state: Running, Waiting for User → pause, cancel; Paused → resume, cancel; Interrupted → the
 * Recovery decision; Created and ended workflows → none (EC08). */
export function controlsFor(status: WorkflowStatus): { commands: Command[]; recovery: boolean } {
  switch (status) {
    case 'Running':
    case 'Waiting for User':
      return { commands: ['pause', 'cancel'], recovery: false };
    case 'Paused':
      return { commands: ['resume', 'cancel'], recovery: false };
    case 'Interrupted':
      return { commands: [], recovery: true };
    default:
      return { commands: [], recovery: false };
  }
}

export interface CommandNotice {
  /** 409: the workflow was in another state; it was read again (EC10). */
  conflict?: WorkflowStatus;
  error?: ApiError;
}

/**
 * Send pause, resume, cancel or the Recovery decision: one Idempotency-Key per action (a second click while sending
 * reuses it), `busy` while sending; on 409 invalid_transition read the workflow again and report its current state.
 */
export function useWorkflowCommands(onWorkflow: (workflow: Workflow) => void) {
  const api = useApi();
  const { idempotency } = useShell();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Record<string, CommandNotice>>({});

  const finish = async (workflow: Workflow, send: (key: string) => Promise<{ data: Workflow }>, operation: string) => {
    setBusy(workflow.id);
    setNotice((old) => ({ ...old, [workflow.id]: {} }));
    try {
      const res = await idempotency.run(operation, send);
      onWorkflow(res.data);
    } catch (caught) {
      if (isApiError(caught) && caught.status === 409) {
        try {
          const fresh = (await api.get('/workflows/{workflowId}', { path: { workflowId: workflow.id } })).data;
          onWorkflow(fresh);
          setNotice((old) => ({ ...old, [workflow.id]: { conflict: fresh.status } }));
        } catch (reread) {
          setNotice((old) => ({ ...old, [workflow.id]: { error: reread as ApiError } }));
        }
      } else {
        setNotice((old) => ({ ...old, [workflow.id]: { error: caught as ApiError } }));
      }
    } finally {
      setBusy(null);
    }
  };

  const run = (workflow: Workflow, command: Command, reason?: string) => {
    const path = { workflowId: workflow.id };
    const operation = `${command}Workflow:${workflow.id}:${workflow.rowVersion}`;
    if (command === 'cancel') {
      return finish(workflow, (key) => api.post('/workflows/{workflowId}/cancel', { path, body: reason ? { reason } : {}, idempotencyKey: key }), operation);
    }
    if (command === 'pause') return finish(workflow, (key) => api.post('/workflows/{workflowId}/pause', { path, idempotencyKey: key }), operation);
    return finish(workflow, (key) => api.post('/workflows/{workflowId}/resume', { path, idempotencyKey: key }), operation);
  };

  const recover = (workflow: Workflow, decision: Schemas['RecoveryDecision']) =>
    finish(
      workflow,
      (key) => api.post('/workflows/{workflowId}/recovery-decision', { path: { workflowId: workflow.id }, body: decision, idempotencyKey: key }),
      `decideWorkflowRecovery:${workflow.id}:${workflow.rowVersion}:${decision.decision}:${decision.stepId ?? ''}`,
    );

  return { run, recover, busy, notice };
}

/** Buttons of a workflow row or page header; Cancel asks first (EC09); Interrupted links to the Recovery decision. */
export function WorkflowControls({
  workflow,
  taskLabel,
  commands,
  size,
  recoveryHref,
}: {
  workflow: Workflow;
  taskLabel?: string;
  commands: ReturnType<typeof useWorkflowCommands>;
  size?: 'sm';
  recoveryHref?: string;
}) {
  const { t } = useTranslation(NS);
  const [asking, setAsking] = useState(false);
  const allowed = controlsFor(workflow.status);
  const sending = commands.busy === workflow.id;
  const notice = commands.notice[workflow.id];
  if (!allowed.commands.length && !allowed.recovery && !notice?.conflict && !notice?.error) return null;
  return (
    <div className="sires-mon__controls">
      {allowed.commands.includes('pause') && (
        <button type="button" className="sires-button" data-size={size} disabled={sending} onClick={() => void commands.run(workflow, 'pause')}>
          {t('control.pause')}
        </button>
      )}
      {allowed.commands.includes('resume') && (
        <button type="button" className="sires-button" data-variant="outline" data-size={size} disabled={sending} onClick={() => void commands.run(workflow, 'resume')}>
          {t('control.resume')}
        </button>
      )}
      {allowed.commands.includes('cancel') && (
        <button type="button" className="sires-button" data-variant="danger" data-size={size} disabled={sending} onClick={() => setAsking(true)}>
          {t('control.cancel')}
        </button>
      )}
      {allowed.recovery && recoveryHref && (
        <Link className="sires-button" data-variant="outline" data-size={size} to={recoveryHref}>
          {t('control.recovery')}
        </Link>
      )}
      {notice?.conflict && (
        <p role="status" className="sires-mon__notice">
          {t('control.conflict', { state: notice.conflict })}
        </p>
      )}
      {notice?.error && (
        <p role="alert" className="sires-mon__notice" data-tone="danger">
          {t('control.failed')}
        </p>
      )}
      {asking && (
        <CancelDialog
          workflow={workflow}
          taskLabel={taskLabel}
          busy={sending}
          onCancel={() => setAsking(false)}
          onConfirm={async (reason) => {
            await commands.run(workflow, 'cancel', reason);
            setAsking(false);
          }}
        />
      )}
    </div>
  );
}

/** Cancel asks first and states what happens to the Task (EC09): back to Ready or Blocked, saved outputs stay Draft,
 * Open prompts become Cancelled; optional reason; “Giữ workflow” keeps it. */
export function CancelDialog({ workflow, taskLabel, busy, onConfirm, onCancel }: { workflow: Workflow; taskLabel?: string; busy: boolean; onConfirm: (reason?: string) => void | Promise<void>; onCancel: () => void }) {
  const { t } = useTranslation(NS);
  const [reason, setReason] = useState('');
  const openPrompts = (workflow.steps ?? []).filter((s) => s.openPromptId).length;
  return (
    <ConfirmDialog
      title={t('cancel.title', { id: shortId('wf', workflow.id) })}
      confirmLabel={t('cancel.confirm')}
      cancelLabel={t('cancel.keep')}
      busy={busy}
      danger
      onConfirm={() => void onConfirm(reason.trim() || undefined)}
      onCancel={onCancel}
    >
      <ul className="sires-mon__consequences">
        <li>{taskLabel ? t('cancel.task', { task: taskLabel }) : t('cancel.taskNone')}</li>
        <li>{t('cancel.outputs')}</li>
        {openPrompts > 0 && <li>{t('cancel.prompts', { count: openPrompts })}</li>}
      </ul>
      <label className="sires-field">
        <span className="sires-field__label">{t('cancel.reason')}</span>
        <textarea className="sires-input sires-mon__textarea" value={reason} maxLength={500} onChange={(e) => setReason(e.currentTarget.value)} />
      </label>
    </ConfirmDialog>
  );
}

/* ---------- Time, names, links ---------- */

/** Seconds from start to end (or now), waiting time included (EC07); undefined before the workflow starts. */
export function elapsedSeconds(item: { startedAt?: string; endedAt?: string }, now: number): number | undefined {
  if (!item.startedAt) return undefined;
  const end = item.endedAt ? Date.parse(item.endedAt) : now;
  return Math.max(0, (end - Date.parse(item.startedAt)) / 1000);
}

export const elapsedText = (item: { startedAt?: string; endedAt?: string }, now: number) => {
  const s = elapsedSeconds(item, now);
  return s === undefined ? '—' : formatElapsed(s);
};

/** Current time, ticking every second while `live` (a running workflow on the screen). */
export function useNow(live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);
  return now;
}

/** Short id shown in the reference screens (“wf-52d”, “ar-7f3a”): prefix and the last three hex digits. */
export function shortId(prefix: string, value: string): string {
  return `${prefix}-${value.replace(/-/g, '').slice(-3)}`;
}

/** Display name of an agent (Analysis Agent with its instance, H12). */
export function useAgentName() {
  const { t } = useTranslation(NS);
  return (agent: string | undefined, instance?: string | null) => (agent ? t(`agent.${agent}`, { defaultValue: agent }) + (agent === 'analysis' && instance ? ` ${instance}` : '') : '—');
}

/** Name of an actor: the signed-in researcher, an agent, or System. */
export function useActorName() {
  const { t } = useTranslation(NS);
  const agentName = useAgentName();
  const session = useSession();
  const me = session.status === 'signed-in' ? session.account?.profile?.displayName : undefined;
  return (actor: Schemas['ActorRef'] | undefined) => {
    if (!actor) return '—';
    if (actor.type === 'agent') return agentName(actor.agent, actor.instance);
    if (actor.type === 'system') return t('actor.system');
    return me ?? t('actor.researcher');
  };
}

const seg = encodeURIComponent;

export const hrefs = {
  activity: (projectId?: string) => (projectId ? `/projects/${seg(projectId)}/activity` : '/activity'),
  workflow: (projectId: string, workflowId: string, query = '') => `/projects/${seg(projectId)}/activity/workflows/${seg(workflowId)}${query}`,
  agentRun: (projectId: string, workflowId: string, agentRunId: string) => `/projects/${seg(projectId)}/activity/workflows/${seg(workflowId)}?view=steps&agentRun=${seg(agentRunId)}`,
  task: (projectId: string, taskId: string) => `/projects/${seg(projectId)}/tasks/${seg(taskId)}`,
  providers: () => '/settings/providers',
  chat: (projectId: string) => `/projects/${seg(projectId)}/chat`,
};

/** Route of an entity a step reads or writes (TypedRef), when the web has one; others show as text (EC17). */
export function refHref(projectId: string, ref: { type: string; id: string; version?: number }): string | undefined {
  switch (ref.type) {
    case 'reference':
      return `/library/${seg(ref.id)}`;
    case 'evidence':
      return `/projects/${seg(projectId)}/evidence?evidence=${seg(ref.id)}`;
    case 'claim':
      return `/projects/${seg(projectId)}/evidence/claims/${seg(ref.id)}`;
    case 'artifact_version':
      return `/projects/${seg(projectId)}/artifacts?version=${seg(ref.id)}`;
    case 'task':
      return hrefs.task(projectId, ref.id);
    case 'plan_version':
      return `/projects/${seg(projectId)}/plan/versions/${seg(ref.id)}`;
    case 'research_context_version':
      return `/projects/${seg(projectId)}/overview`;
    case 'workflow':
      return hrefs.workflow(projectId, ref.id);
    default:
      return undefined;
  }
}

/** Label of a TypedRef: its type and version (“reference · v2”), the id short. */
export function useRefLabel() {
  const { t } = useTranslation(NS);
  return (ref: { type: string; id: string; version?: number }) =>
    `${t(`ref.${ref.type}`, { defaultValue: ref.type })} ${shortId(ref.type.slice(0, 2), ref.id)}${ref.version ? ` · v${ref.version}` : ''}`;
}

export function RefLink({ projectId, value }: { projectId: string; value: TypedRef }) {
  const label = useRefLabel()(value);
  const href = refHref(projectId, value);
  return href ? (
    <Link to={href} className="sires-mon__link">
      {label}
    </Link>
  ) : (
    <span>{label}</span>
  );
}

/** Task label “T-2.3 · title” from the Task list of the project. */
export type TaskNames = Map<string, { key: string; title: string }>;

export function taskLabel(tasks: TaskNames, taskId: string | undefined): string | undefined {
  if (!taskId) return undefined;
  const task = tasks.get(taskId);
  return task ? `${task.key} · ${task.title}` : shortId('t', taskId);
}

/** Tasks of the given projects (planning's listTasks), for names on rows and filters. */
export async function loadTaskNames(api: ReturnType<typeof useApi>, projectIds: string[]): Promise<TaskNames> {
  const names: TaskNames = new Map();
  await Promise.all(
    [...new Set(projectIds)].map(async (projectId) => {
      try {
        const tasks = await allPages((cursor) => api.get('/projects/{projectId}/tasks', { path: { projectId }, query: { limit: 100, ...(cursor ? { cursor } : {}) } }).then((r) => r.data));
        for (const task of tasks) names.set(task.id, { key: task.stableKey, title: task.currentDefinition?.title ?? '' });
      } catch {
        // Names are a convenience: without them the row shows the short id.
      }
    }),
  );
  return names;
}
