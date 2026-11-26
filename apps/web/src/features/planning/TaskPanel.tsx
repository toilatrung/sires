// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Task panel of the Plan screen (PID-00082 S04, UX-TASK-003–005, UX-LABEL-002, H10–H12): definition of the version
// being viewed, readiness with one action per failing check, Execute only when Ready and readiness passed (always
// confirmed, one Task at a time), the manual flow, checklist (If-Match), workflow history with artifacts, review
// feedback, needs review. Every command follows allowedActions; an Archived project is read-only.

import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  ApiError,
  ConfirmDialog,
  ErrorState,
  ExecutionLabel,
  formatDateTime,
  formatTime,
  isApiError,
  LoadingState,
  StatusChip,
  useApi,
  useDraft,
  useRefreshNavigation,
  type DraftField,
  useEvents,
  useShell,
} from '../../shell';
import { isManual, itemsOf, keyOf, useResource, type Resource, type Schemas, type Task, type TaskDefinition, type TaskStatus } from './common';

type Check = Schemas['ReadinessCheck'];

export const AGENT_NAMES: Record<Schemas['AgentName'], string> = {
  orchestrator: 'Orchestrator',
  discovery: 'Discovery Agent',
  reference_processing: 'Reference Processing Agent',
  evidence_retrieval: 'Evidence Retrieval Agent',
  synthesis: 'Synthesis Agent',
  writing: 'Writing Agent',
  verification: 'Verification Agent',
  diagram: 'Diagram Agent',
  analysis: 'Analysis Agent',
};

export interface TaskPanelProps {
  projectId: string;
  taskId: string;
  /** Definition of the version on screen (“định nghĩa theo vN”); defaults to the Task's current definition. */
  definition?: TaskDefinition;
  versionNumber?: number;
  /** Stable keys and titles of the plan's tasks, to name prerequisites. */
  taskName: (taskId: string) => string;
  openTaskHref: (taskId: string) => string;
  /** Proposed Plan Version to open for RC-01. */
  proposedVersionId?: string | null;
  /** Status of another Task of the plan, to offer “Mở T-x” only for prerequisites not Completed. */
  taskStatus?: (taskId: string) => TaskStatus | undefined;
  archived: boolean;
  /**
   * Another primary action is on screen (“Trình duyệt” of a Draft): the panel's main button uses the outline style, so
   * the screen keeps one filled primary button (design.md §1.5, §8).
   */
  quiet?: boolean;
  onChanged: () => void;
  onClose: () => void;
}

type MainVariant = 'primary' | 'outline';

type Pending = { kind: 'activate' | 'start' | 'dequeue' } | { kind: 'cancel' | 'reopen' };

export function TaskPanel(props: TaskPanelProps) {
  const { projectId, taskId, archived, onChanged } = props;
  const { t } = useTranslation('planning');
  const api = useApi();
  const { idempotency } = useShell();
  const task = useResource(() => api.get('/projects/{projectId}/tasks/{taskId}', { path: { projectId, taskId } }), [api, projectId, taskId]);
  const [pending, setPending] = useState<Pending>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; error: ApiError }>();
  const [reason, setReason] = useState('');
  // Readiness as the panel decides Execute on it: lastReadiness, else getTaskReadiness; unknown never counts as passed.
  const loaded = task.status === 'ready' && Boolean(task.data);
  const lastReadiness = task.data?.lastReadiness;
  const readiness = useResource<Schemas['ReadinessResult'] | undefined>(
    () =>
      !loaded
        ? Promise.resolve({ data: undefined })
        : lastReadiness
          ? Promise.resolve({ data: lastReadiness })
          : api.get('/projects/{projectId}/tasks/{taskId}/readiness', { path: { projectId, taskId } }),
    [api, projectId, taskId, loaded, lastReadiness],
  );
  // 409 readiness_failed of activateTask carries the readiness the server just computed (EC16).
  const [returnedReadiness, setReturnedReadiness] = useState<Schemas['ReadinessResult']>();

  useEvents({ types: ['task.status_changed'], projectId }, (event) => {
    if (event.objectId === taskId) void task.reload();
  });

  if (task.status === 'loading') return <PanelFrame onClose={props.onClose}><LoadingState what={t('panel.loadingTask')} rows={2} /></PanelFrame>;
  if ((task.status === 'error' || !task.data) && task.error?.status === 404 && props.definition) {
    // A Task the version on screen adds: it exists once that version is approved (“mới trong vN”).
    return (
      <PanelFrame onClose={props.onClose}>
        <header className="planning-panel__head">
          <h2 className="planning-panel__title">{props.definition.title}</h2>
          <span className="planning-panel__meta">
            <span className="sires-id">{keyOf(props.definition)}</span> · {t('panel.newInVersion', { version: props.versionNumber })}
          </span>
          <ExecutionLabel kind={props.definition.executionLabel} />
        </header>
        <p>{props.definition.objective}</p>
      </PanelFrame>
    );
  }
  if (task.status === 'error' || !task.data) {
    return (
      <PanelFrame onClose={props.onClose}>
        <ErrorState error={task.error} title={t('panel.loadFailed')} onRetry={() => void task.reload()} />
      </PanelFrame>
    );
  }
  const current = task.data;
  const definition = props.definition ?? current.currentDefinition;
  const allowed = new Set(current.allowedActions ?? []);
  const manual = isManual(definition);
  const shownReadiness = returnedReadiness ?? readiness.data;
  const readinessPassed = shownReadiness?.passed === true;
  const canActivate = !archived && current.status === 'Ready' && readinessPassed && allowed.has('activate');

  const run = async (title: string, send: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await send();
      setPending(undefined);
      setReason('');
      setReturnedReadiness(undefined);
      await task.reload();
      onChanged();
    } catch (err) {
      const apiError = isApiError(err) ? err : new ApiError('network');
      if (apiError.code === 'readiness_failed') {
        // The 409 carries the readiness just computed; the shell's ApiError keeps only the standard Problem members,
        // so read that result again (getTaskReadiness) and show it in place of the old one (EC16).
        const returned = (apiError.problem as { readiness?: Schemas['ReadinessResult'] } | undefined)?.readiness;
        try {
          setReturnedReadiness(returned ?? (await api.get('/projects/{projectId}/tasks/{taskId}/readiness', { path: { projectId, taskId } })).data);
        } catch {
          // The error below still says why Execute failed.
        }
      }
      setError({ title, error: apiError });
      setPending(undefined);
      await task.reload();
    } finally {
      setBusy(false);
    }
  };

  const path = { projectId, taskId };
  const activate = () =>
    run(t('panel.activateFailed'), () => idempotency.run(`activateTask:${taskId}`, (key) => api.post('/projects/{projectId}/tasks/{taskId}/activate', { path, idempotencyKey: key })));
  const disabledReason = archived ? t('panel.archived') : undefined;

  return (
    <PanelFrame onClose={props.onClose}>
      <header className="planning-panel__head">
        <h2 id="planning-task-title" className="planning-panel__title">{definition.title}</h2>
        <span className="planning-panel__meta">
          <span className="sires-id">{keyOf(definition)}</span>
          {props.versionNumber !== undefined && (
            <> · {props.definition ? t('panel.definedBy', { version: props.versionNumber }) : t('panel.notInVersion', { version: props.versionNumber })}</>
          )}
        </span>
        <span className="planning-panel__chips">
          <StatusChip status={current.status} entity="task" />
          <ExecutionLabel kind={definition.executionLabel} />
          {definition.proposedAgent && !manual && <span className="planning-muted">{AGENT_NAMES[definition.proposedAgent]}</span>}
        </span>
      </header>

      {error && (
        <ErrorState
          error={error.error}
          title={error.title}
          actions={
            error.error.code === 'active_workflow_exists' ? (
              <Link
                to={
                  current.activeWorkflowId
                    ? `/projects/${encodeURIComponent(projectId)}/activity/workflows/${encodeURIComponent(current.activeWorkflowId)}`
                    : `/projects/${encodeURIComponent(projectId)}/activity`
                }
              >
                {t('rc.openWorkflow')}
              </Link>
            ) : undefined
          }
        />
      )}
      {disabledReason && <p className="planning-note">{disabledReason}</p>}

      {current.needsReview && <NeedsReview projectId={projectId} task={current} archived={archived} onDone={() => { void task.reload(); onChanged(); }} />}

      {!['Completed', 'Cancelled', 'In Review'].includes(current.status) && (
        <Readiness {...props} task={current} result={readiness} returned={returnedReadiness} />
      )}

      {manual ? (
        <ManualWork
          variant={props.quiet ? 'outline' : 'primary'}
          projectId={projectId}
          task={current}
          definition={definition}
          archived={archived}
          onStart={() => setPending({ kind: 'start' })}
          onSubmitted={() => {
            void task.reload();
            onChanged();
          }}
        />
      ) : (
        <section className="planning-panel__actions" aria-label={t('panel.actions')}>
          <div className="planning-row">
            <button type="button" className="sires-button" data-variant={props.quiet ? 'outline' : 'primary'} disabled={!canActivate} onClick={() => setPending({ kind: 'activate' })}>
              {t('panel.activate')}
            </button>
            {allowed.has('recheck_readiness') && (
              <RecheckButton
                projectId={projectId}
                taskId={taskId}
                disabled={archived}
                onDone={() => {
                  setReturnedReadiness(undefined);
                  void task.reload();
                }}
              />
            )}
            {!['Completed', 'Cancelled'].includes(current.status) && <ActiveTaskButton projectId={projectId} taskId={taskId} disabled={archived} />}
          </div>
          {!archived && <span className="planning-muted">{canActivate ? t('panel.activateRule') : t('panel.activateBlocked', { status: current.status })}</span>}
        </section>
      )}

      <div className="planning-row">
        {allowed.has('dequeue') && (
          <button type="button" className="sires-button" data-variant="secondary" data-size="sm" disabled={archived} onClick={() => setPending({ kind: 'dequeue' })}>
            {t('panel.dequeue')}
          </button>
        )}
        {allowed.has('reopen') && (
          <button type="button" className="sires-button" data-variant="secondary" data-size="sm" disabled={archived} onClick={() => setPending({ kind: 'reopen' })}>
            {t('panel.reopen')}
          </button>
        )}
        {allowed.has('cancel') && (
          <button type="button" className="sires-button" data-variant="danger" data-size="sm" disabled={archived} onClick={() => setPending({ kind: 'cancel' })}>
            {t('panel.cancel')}
          </button>
        )}
      </div>

      <Checklist projectId={projectId} task={current} definition={definition} etag={task.etag} archived={archived} onChanged={() => void task.reload()} />
      <History projectId={projectId} taskId={taskId} />
      <Reviews projectId={projectId} taskId={taskId} />

      {pending?.kind === 'activate' && (
        <ConfirmDialog
          title={t('panel.activateTitle', { key: keyOf(definition) })}
          confirmLabel={t('panel.activateConfirm')}
          cancelLabel={t('panel.activateCancel')}
          busy={busy}
          onCancel={() => setPending(undefined)}
          onConfirm={() => void activate()}
        >
          <p>{t('panel.activateConsequence', { agent: definition.proposedAgent ? AGENT_NAMES[definition.proposedAgent] : t('panel.agent') })}</p>
        </ConfirmDialog>
      )}
      {pending?.kind === 'start' && (
        <ConfirmDialog
          title={t('panel.startTitle', { key: keyOf(definition) })}
          confirmLabel={t('panel.start')}
          cancelLabel={t('panel.activateCancel')}
          busy={busy}
          onCancel={() => setPending(undefined)}
          onConfirm={() => void activate()}
        >
          <p>{t('panel.startConsequence')}</p>
        </ConfirmDialog>
      )}
      {pending?.kind === 'dequeue' && (
        <ConfirmDialog
          title={t('panel.dequeueTitle', { key: keyOf(definition) })}
          confirmLabel={t('panel.dequeue')}
          cancelLabel={t('panel.keep')}
          busy={busy}
          onCancel={() => setPending(undefined)}
          onConfirm={() => void run(t('panel.commandFailed'), () => idempotency.run(`dequeueTask:${taskId}`, (key) => api.post('/projects/{projectId}/tasks/{taskId}/dequeue', { path, idempotencyKey: key })))}
        >
          <p>{t('panel.dequeueConsequence')}</p>
        </ConfirmDialog>
      )}
      {(pending?.kind === 'cancel' || pending?.kind === 'reopen') && (
        <ConfirmDialog
          title={pending.kind === 'cancel' ? t('panel.cancelTitle', { key: keyOf(definition) }) : t('panel.reopenTitle', { key: keyOf(definition) })}
          confirmLabel={reason.trim() ? (pending.kind === 'cancel' ? t('panel.cancel') : t('panel.reopen')) : t('panel.reasonFirst')}
          cancelLabel={t('panel.keep')}
          busy={busy || !reason.trim()}
          onCancel={() => {
            setPending(undefined);
            setReason('');
          }}
          onConfirm={() =>
            void run(t('panel.commandFailed'), () =>
              pending.kind === 'cancel'
                ? idempotency.run(`cancelTask:${taskId}`, (key) => api.post('/projects/{projectId}/tasks/{taskId}/cancel', { path, idempotencyKey: key, body: { reason: reason.trim() } }))
                : idempotency.run(`reopenTask:${taskId}`, (key) => api.post('/projects/{projectId}/tasks/{taskId}/reopen', { path, idempotencyKey: key, body: { reason: reason.trim() } })),
            )
          }
        >
          <p>{pending.kind === 'cancel' ? t('panel.cancelConsequence') : t('panel.reopenConsequence')}</p>
          <label className="sires-field">
            <span className="sires-field__label">{t('panel.reason')}</span>
            <textarea className="sires-input" rows={2} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
          </label>
        </ConfirmDialog>
      )}
    </PanelFrame>
  );
}

function PanelFrame({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const { t } = useTranslation('planning');
  return (
    <aside className="planning-panel" aria-label={t('panel.label')}>
      <button type="button" className="sires-button planning-panel__close" data-variant="secondary" data-size="xs" onClick={onClose}>
        {t('panel.close')}
      </button>
      {children}
    </aside>
  );
}

/** Action of a failing readiness check (H11). */
function checkAction(check: Check, props: TaskPanelProps, task: Task, t: (key: string, o?: Record<string, unknown>) => string): ReactNode[] {
  const p = encodeURIComponent(props.projectId);
  switch (check.code) {
    case 'RC-01':
      return [<Link key="rc1" to={props.proposedVersionId ? `/projects/${p}/plan/versions/${encodeURIComponent(props.proposedVersionId)}` : `/projects/${p}/plan`}>{t('rc.openPlan')}</Link>];
    case 'RC-02':
      return [<Link key="rc2" to={`/projects/${p}/overview`}>{t('rc.reopenProject')}</Link>];
    case 'RC-03':
      return [<Link key="rc3" to={task.activeWorkflowId ? `/projects/${p}/activity/workflows/${encodeURIComponent(task.activeWorkflowId)}` : `/projects/${p}/activity`}>{t('rc.openWorkflow')}</Link>];
    case 'RC-04': {
      // Only the prerequisites not Completed yet (H11).
      const deps = ((props.definition ?? task.currentDefinition).dependsOn ?? []).filter((dep) => props.taskStatus?.(dep) !== 'Completed');
      return deps.map((dep) => (
        <Link key={dep} to={props.openTaskHref(dep)} className="sires-button" data-variant="outline" data-size="xs">
          {t('rc.openTask', { key: props.taskName(dep) })}
        </Link>
      ));
    }
    case 'RC-05':
      return [<Link key="rc5" to="/library">{t('rc.chooseReference')}</Link>];
    case 'RC-06':
      return [<Link key="rc6" to={`/projects/${p}/artifacts`}>{t('rc.openArtifact')}</Link>];
    case 'RC-07':
    case 'RC-09':
      return [<Link key="rc7" to={`/projects/${p}/chat`} className="sires-button" data-variant="outline" data-size="xs">{t('rc.answer')}</Link>];
    case 'RC-08':
      return [<Link key="rc8" to="/settings/agents" className="sires-button" data-variant="outline" data-size="xs">{t('rc.agentModels')}</Link>];
    default:
      return [];
  }
}

function Readiness(props: TaskPanelProps & { task: Task; result: Resource<Schemas['ReadinessResult'] | undefined>; returned?: Schemas['ReadinessResult'] }) {
  const { t } = useTranslation('planning');
  const { task, result: fetched } = props;
  const result = props.returned ?? fetched.data;
  if (!result && fetched.status !== 'error') return <LoadingState what={t('panel.readiness')} rows={0} />;
  if (!result) return <ErrorState error={fetched.error} title={t('panel.readinessFailed')} onRetry={() => void fetched.reload()} />;
  const failing = result.checks.filter((c) => !c.passed);
  const passing = result.checks.filter((c) => c.passed);
  return (
    <section className="planning-block" aria-labelledby="planning-readiness">
      <h3 id="planning-readiness" className="planning-block__title">
        {t('panel.readinessTitle', { result: result.passed ? t('panel.passed') : t('panel.failed'), time: formatTime(result.at) })}
      </h3>
      <ul className="planning-checks">
        {failing.map((check) => (
          <li key={check.code} className="planning-check" data-passed="false">
            <span>
              <span className="sires-id">{check.code}</span> {check.detail ?? check.suggestedAction ?? check.code}
            </span>
            <span className="planning-row">{checkAction(check, props, task, t)}</span>
          </li>
        ))}
        {passing.length > 0 && (
          <li className="planning-check" data-passed="true">
            {t('panel.passedChecks', { list: passing.map((c) => c.detail ?? c.code).join(' · ') })}
          </li>
        )}
      </ul>
    </section>
  );
}

function RecheckButton({ projectId, taskId, disabled, onDone }: { projectId: string; taskId: string; disabled: boolean; onDone: () => void }) {
  const { t } = useTranslation('planning');
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  return (
    <>
      <button
        type="button"
        className="sires-button"
        data-variant="secondary"
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            await api.post('/projects/{projectId}/tasks/{taskId}/readiness', { path: { projectId, taskId } });
            onDone();
          } catch (err) {
            setError(isApiError(err) ? err : new ApiError('network'));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t('panel.rechecking') : t('panel.recheck')}
      </button>
      {error && <ErrorState error={error} title={t('panel.readinessFailed')} />}
    </>
  );
}

function ActiveTaskButton({ projectId, taskId, disabled }: { projectId: string; taskId: string; disabled: boolean }) {
  const { t } = useTranslation('planning');
  const api = useApi();
  const refreshNavigation = useRefreshNavigation();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<ApiError>();
  return (
    <>
      <button
        type="button"
        className="sires-button"
        data-variant="secondary"
        disabled={disabled || done}
        onClick={async () => {
          setError(undefined);
          try {
            await api.put('/projects/{projectId}/active-task', { path: { projectId }, body: { taskId } });
            setDone(true);
            void refreshNavigation();
          } catch (err) {
            setError(isApiError(err) ? err : new ApiError('network'));
          }
        }}
      >
        {done ? t('panel.isActiveTask') : t('panel.setActiveTask')}
      </button>
      {error && <ErrorState error={error} title={t('panel.activeTaskFailed')} />}
    </>
  );
}

function ManualWork({
  projectId,
  task,
  definition,
  archived,
  variant,
  onStart,
  onSubmitted,
}: {
  projectId: string;
  task: Task;
  definition: TaskDefinition;
  archived: boolean;
  variant: MainVariant;
  onStart: () => void;
  onSubmitted: () => void;
}) {
  const { t } = useTranslation('planning');
  const required = definition.expectedOutputs.filter((o) => o.required);
  const allowed = new Set(task.allowedActions ?? []);
  return (
    <section className="planning-block planning-manual" aria-labelledby="planning-manual">
      <h3 id="planning-manual" className="planning-block__title">{t('manual.youDo')}</h3>
      <p>{definition.description ?? definition.objective}</p>
      <ul className="planning-list">
        {required.map((output, i) => (
          <li key={i}>
            {t('manual.requiredOutput')}: <span className="sires-id">{output.artifactType}</span> {output.description}
          </li>
        ))}
      </ul>
      {task.status === 'Ready' && allowed.has('activate') && (
        <div className="planning-row">
          <button type="button" className="sires-button" data-variant={variant} disabled={archived} onClick={onStart}>
            {t('panel.start')}
          </button>
        </div>
      )}
      {task.status === 'In Progress' && allowed.has('submit_manual') && <ManualForm projectId={projectId} task={task} definition={definition} archived={archived} variant={variant} onSubmitted={onSubmitted} />}
    </section>
  );
}

interface OutputDraft {
  title: DraftField;
  content: DraftField;
}

function OutputField({ taskId, index, label, required, missing, fields }: { taskId: string; index: number; label: string; required: boolean; missing: boolean; fields: Map<number, OutputDraft> }) {
  const { t } = useTranslation('planning');
  const title = useDraft(`manual.${taskId}.${index}.title`);
  const content = useDraft(`manual.${taskId}.${index}.content`);
  fields.set(index, { title, content });
  return (
    <fieldset className="planning-fieldset" data-output={index}>
      <legend>
        {label} · {required ? t('manual.required') : t('manual.optional')}
      </legend>
      <label className="sires-field">
        <span className="sires-field__label">{t('manual.title')}</span>
        <input className="sires-input" value={title.value} onChange={(e) => title.setValue(e.currentTarget.value)} />
      </label>
      <label className="sires-field">
        <span className="sires-field__label">{t('manual.content')}</span>
        <textarea
          className="sires-input"
          rows={4}
          aria-required={required}
          aria-invalid={missing || undefined}
          value={content.value}
          onChange={(e) => content.setValue(e.currentTarget.value)}
        />
      </label>
      {missing && <span className="planning-field-error">{t('manual.contentRequired')}</span>}
    </fieldset>
  );
}

function ManualForm({
  projectId,
  task,
  definition,
  archived,
  variant,
  onSubmitted,
}: {
  projectId: string;
  task: Task;
  definition: TaskDefinition;
  archived: boolean;
  variant: MainVariant;
  onSubmitted: () => void;
}) {
  const { t } = useTranslation('planning');
  const api = useApi();
  const { idempotency } = useShell();
  const note = useDraft(`manual.${task.id}.note`);
  const fields = useRef(new Map<number, OutputDraft>()).current;
  const outputs = definition.expectedOutputs.map((o, i) => ({ ...o, index: i }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const [missing, setMissing] = useState<ReadonlySet<number>>(new Set());
  const contentOf = (index: number) => fields.get(index)?.content.value.trim() ?? '';
  const submit = async () => {
    // A required output needs content before anything is sent; an optional one is sent only when filled.
    const empty = new Set(outputs.filter((o) => o.required && !contentOf(o.index)).map((o) => o.index));
    setMissing(empty);
    if (empty.size > 0) return;
    setBusy(true);
    setError(undefined);
    try {
      await idempotency.run(`submitManualWork:${task.id}`, (key) =>
        api.post('/projects/{projectId}/tasks/{taskId}/manual-submissions', {
          path: { projectId, taskId: task.id },
          idempotencyKey: key,
          body: {
            note: note.value.trim() || undefined,
            outputs: outputs
              .filter((o) => o.required || contentOf(o.index))
              .map((o) => {
                const field = fields.get(o.index);
                return { artifactType: o.artifactType, title: field?.title.value.trim() || o.description || o.artifactType, content: field?.content.value ?? '' };
              }),
          },
        }),
      );
      for (const o of outputs) {
        fields.get(o.index)?.title.clear();
        fields.get(o.index)?.content.clear();
      }
      note.clear();
      onSubmitted();
    } catch (err) {
      setError(isApiError(err) ? err : new ApiError('network'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="planning-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {outputs.map((o) => (
        <OutputField
          key={o.index}
          taskId={task.id}
          index={o.index}
          fields={fields}
          required={o.required}
          missing={missing.has(o.index)}
          label={`${o.artifactType} — ${o.description ?? ''}`}
        />
      ))}
      <label className="sires-field">
        <span className="sires-field__label">{t('manual.note')}</span>
        <textarea className="sires-input" rows={2} value={note.value} onChange={(e) => note.setValue(e.currentTarget.value)} />
      </label>
      <p className="planning-muted">{t('manual.fileLater')}</p>
      {error && (
        <ErrorState
          error={error}
          title={t('manual.submitFailed')}
          saved={t('manual.keptInDraft')}
          description={
            error.problem?.errors?.length ? (
              <ul className="planning-list">
                {error.problem.errors.map((f, i) => (
                  <li key={i}>
                    <span className="sires-id">{f.field}</span> {f.message ?? f.code}
                  </li>
                ))}
              </ul>
            ) : undefined
          }
        />
      )}
      <button type="submit" className="sires-button" data-variant={variant} disabled={archived || busy}>
        {t('manual.submit')}
      </button>
    </form>
  );
}

function Checklist({ projectId, task, definition, etag, archived, onChanged }: { projectId: string; task: Task; definition: TaskDefinition; etag?: string; archived: boolean; onChanged: () => void }) {
  const { t } = useTranslation('planning');
  const api = useApi();
  const [error, setError] = useState<ApiError>();
  const checked = new Map((task.checklistState ?? []).map((s) => [s.id, s.checked]));
  const toggle = async (itemId: string, value: boolean) => {
    setError(undefined);
    const items = (definition.checklist ?? []).map((item) => ({ id: item.id, checked: item.id === itemId ? value : (checked.get(item.id) ?? false) }));
    try {
      await api.patch('/projects/{projectId}/tasks/{taskId}/checklist', {
        path: { projectId, taskId: task.id },
        body: { items },
        ifMatch: etag ?? `"${task.rowVersion}"`,
      });
    } catch (err) {
      setError(isApiError(err) ? err : new ApiError('network'));
    }
    onChanged();
  };
  return (
    <section className="planning-block" aria-labelledby="planning-checklist">
      <h3 id="planning-checklist" className="planning-block__title">{t('panel.checklistTitle')}</h3>
      {error && <ErrorState error={error} title={t('panel.checklistFailed')} next={error.status === 412 ? t('panel.reloaded') : undefined} />}
      {(definition.checklist ?? []).length > 0 && (
        <ul className="planning-list planning-list--plain">
          {(definition.checklist ?? []).map((item) => (
            <li key={item.id}>
              <label className="planning-checkbox">
                <input type="checkbox" checked={checked.get(item.id) ?? false} disabled={archived} onChange={(e) => void toggle(item.id, e.currentTarget.checked)} />
                {item.text}
              </label>
            </li>
          ))}
        </ul>
      )}
      <ul className="planning-list">
        {definition.acceptanceCriteria.map((c) => (
          <li key={c.id}>{c.text}</li>
        ))}
        {definition.expectedOutputs
          .filter((o) => o.required)
          .map((o, i) => (
            <li key={`o${i}`}>
              {t('panel.requiredOutput')} <span className="sires-id">{o.artifactType}</span> {t('panel.needsAccepted')}
            </li>
          ))}
      </ul>
    </section>
  );
}

function History({ projectId, taskId }: { projectId: string; taskId: string }) {
  const { t } = useTranslation('planning');
  const api = useApi();
  const data = useResource(async () => {
    const [workflows, artifacts] = await Promise.all([
      api.get('/workflows', { query: { projectId, taskId } }),
      api.get('/projects/{projectId}/artifacts', { path: { projectId }, query: { taskId } }),
    ]);
    return { data: { workflows: itemsOf<Schemas['Workflow']>(workflows.data), artifacts: itemsOf<Schemas['Artifact']>(artifacts.data) } };
  }, [api, projectId, taskId]);
  return (
    <section className="planning-block" aria-labelledby="planning-history">
      <h3 id="planning-history" className="planning-block__title">{t('panel.historyTitle')}</h3>
      {data.status === 'loading' && <LoadingState what={t('panel.historyTitle')} rows={1} />}
      {data.status === 'error' && <ErrorState error={data.error} title={t('panel.historyFailed')} onRetry={() => void data.reload()} />}
      {data.status === 'ready' && data.data && (
        data.data.workflows.length === 0 ? (
          <p className="planning-muted">{t('panel.neverRun')}</p>
        ) : (
          <ol className="planning-history">
            {[...data.data.workflows]
              .sort((a, b) => (a.startedAt ?? a.createdAt).localeCompare(b.startedAt ?? b.createdAt))
              .map((workflow) => {
                const start = workflow.startedAt ?? workflow.createdAt;
                const end = workflow.endedAt ?? new Date().toISOString();
                // An artifact belongs to the run during which it was created (Artifact carries no workflow id).
                const produced = data.data!.artifacts.filter((a) => a.createdAt >= start && a.createdAt <= end);
                return (
                  <li key={workflow.id} className="planning-history__row">
                    <span className="planning-row">
                      <Link to={`/projects/${encodeURIComponent(projectId)}/activity/workflows/${encodeURIComponent(workflow.id)}`} className="sires-id">
                        {workflow.id.slice(0, 8)}
                      </Link>
                      <StatusChip status={workflow.status} entity="workflow" />
                      <span className="planning-muted sires-num">{formatDateTime(start)}</span>
                    </span>
                    {produced.length > 0 ? (
                      <ul className="planning-list planning-list--plain">
                        {produced.map((artifact) => (
                          <li key={artifact.id}>
                            <Link to={`/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifact.id)}`}>{artifact.title}</Link>{' '}
                            {artifact.latestVersion?.status && <StatusChip status={artifact.latestVersion.status} entity="artifact" />}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="planning-muted">{t('panel.noArtifact')}</span>
                    )}
                  </li>
                );
              })}
          </ol>
        )
      )}
    </section>
  );
}

function Reviews({ projectId, taskId }: { projectId: string; taskId: string }) {
  const { t } = useTranslation('planning');
  const api = useApi();
  const data = useResource(() => api.get('/projects/{projectId}/tasks/{taskId}/reviews', { path: { projectId, taskId } }), [api, projectId, taskId]);
  const items = itemsOf<Schemas['TaskReview']>(data.data);
  if (data.status !== 'ready' || items.length === 0) return null;
  return (
    <section className="planning-block" aria-labelledby="planning-reviews">
      <h3 id="planning-reviews" className="planning-block__title">{t('panel.reviewsTitle')}</h3>
      <ul className="planning-list planning-list--plain">
        {items.map((review) => (
          <li key={review.id}>
            <strong>{t(`review.outcome.${review.outcome}`)}</strong>
            {review.reasonCode && <> · {t(`review.reason.${review.reasonCode}`)}</>}
            {review.feedback && <> — {review.feedback}</>} <span className="planning-muted sires-num">{formatDateTime(review.createdAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NeedsReview({ projectId, task, archived, onDone }: { projectId: string; task: Task; archived: boolean; onDone: () => void }) {
  const { t } = useTranslation('planning');
  const api = useApi();
  const allowed = new Set(task.allowedActions ?? []);
  const [error, setError] = useState<ApiError>();
  return (
    <section className="planning-block" aria-labelledby="planning-needs-review">
      <h3 id="planning-needs-review" className="planning-block__title">
        <StatusChip status="needs review" />
      </h3>
      <ul className="planning-list">
        {(task.needsReviewReasons ?? []).map((reason, i) => (
          <li key={i}>{reason.cause}</li>
        ))}
      </ul>
      {error && <ErrorState error={error} title={t('panel.commandFailed')} />}
      {allowed.has('confirm_valid') && (
        <button
          type="button"
          className="sires-button"
          data-variant="outline"
          data-size="sm"
          disabled={archived}
          onClick={async () => {
            try {
              await api.post('/projects/{projectId}/tasks/{taskId}/confirm-valid', { path: { projectId, taskId: task.id }, body: {} });
              onDone();
            } catch (err) {
              setError(isApiError(err) ? err : new ApiError('network'));
            }
          }}
        >
          {t('panel.confirmValid')}
        </button>
      )}
    </section>
  );
}
