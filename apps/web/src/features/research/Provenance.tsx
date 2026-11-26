// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Provenance of an artifact version (S05, H8; DATA-PROV-001, PRD 18.3): who created it (agent with its Agent Run linked
// to the workflow, Researcher, or the System component), provider · model, Task, inputs, sources, approval. Missing
// fields read “—”; `inputs: []` reads “Không có đầu vào” (PC-05 P11). No “Dùng trong” row this round (N10).

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useTask, type Schemas } from './data';
import { AGENT_NAMES, formatWhen, paths, referenceShort, runCode, shortId } from './labels';

type Version = Schemas['ArtifactVersion'];

const INPUT_TYPES: Record<string, string> = {
  research_context_version: 'Research context',
  artifact_version: 'Artifact version',
  evidence: 'Evidence',
  claim: 'Claim',
  reference: 'Reference',
  context_item: 'Context item',
  deliberation_entry: 'Deliberation entry',
};

function Actor({ projectId, provenance }: { projectId: string; provenance: Version['provenance'] }) {
  const { t } = useTranslation('research');
  const actor = provenance.createdBy;
  if (actor.type === 'researcher') return <>Researcher</>;
  if (actor.type === 'system') return <>System{actor.component ? <> · <span className="sires-id">{actor.component}</span></> : null}</>;
  const name = actor.agent ? `${AGENT_NAMES[actor.agent]}${actor.instance ? ` ${actor.instance}` : ''}` : t('provenance.unknownAgent');
  if (!actor.agentRunId) return <>{name}</>;
  const code = <span className="sires-id">{runCode(actor.agentRunId)}</span>;
  // Without a workflowId the Agent Run code has no link (EC28).
  return <>{name} · {provenance.workflowId ? <Link to={paths.workflow(projectId, provenance.workflowId)}>{code}</Link> : code}</>;
}

function TaskLine({ projectId, taskId }: { projectId: string; taskId?: string }) {
  const task = useTask(taskId);
  if (!taskId || task === null) return <>—</>;
  if (task === undefined) return <span className="sires-id">…</span>;
  return (
    <Link to={paths.task(projectId, taskId)}>
      <span className="sires-id">{task.stableKey}</span>{task.currentDefinition?.title ? ` ${task.currentDefinition.title}` : ''}
    </Link>
  );
}

function Input({ projectId, input }: { projectId: string; input: Schemas['TypedRef'] }) {
  const label = `${INPUT_TYPES[input.type] ?? input.type}${input.version !== undefined ? ` v${input.version}` : ''}`;
  // Artifact version inputs stay text this round (H8; TypedRef.artifactId waits for the PO's next clarification).
  if (input.type === 'evidence') return <Link to={paths.evidenceItem(projectId, input.id)}>{label}</Link>;
  if (input.type === 'claim') return <Link to={paths.claim(projectId, input.id)}>{label}</Link>;
  if (input.type === 'reference') return <Link to={paths.reference(input.id)}>{label}</Link>;
  return <>{label}</>;
}

export function Provenance({ projectId, version, references }: { projectId: string; version: Version; references: Schemas['ProjectReferenceSelection'][] }) {
  const { t } = useTranslation('research');
  const provenance = version.provenance;
  const approval = provenance.approval ?? version.approval;
  const model = [provenance.provider, provenance.model].filter(Boolean).join(' · ');
  return (
    <section className="research-stack" aria-labelledby="research-provenance-title">
      <h3 id="research-provenance-title" className="research-subhead">Provenance</h3>
      <dl className="research-dl">
        <dt>{t('provenance.createdBy')}</dt>
        <dd><Actor projectId={projectId} provenance={provenance} /></dd>
        <dt>Model</dt>
        <dd>{model ? <span className="sires-id">{model}</span> : '—'}</dd>
        <dt>Task</dt>
        <dd><TaskLine projectId={projectId} taskId={provenance.taskId} /></dd>
        <dt>{t('provenance.inputs')}</dt>
        <dd>
          {provenance.inputs.length === 0 ? t('provenance.noInputs') : provenance.inputs.map((input, index) => (
            <span key={`${input.type}-${input.id}`}>{index > 0 && ' · '}<Input projectId={projectId} input={input} /></span>
          ))}
        </dd>
        <dt>{t('provenance.sources')}</dt>
        <dd>
          {provenance.sources?.length ? provenance.sources.map((source, index) => {
            const reference = references.find((row) => row.referenceId === source.referenceId)?.reference;
            return (
              <span key={`${source.referenceId}-${source.chunkId}-${index}`}>
                {index > 0 && ' · '}
                {source.referenceId ? <Link to={paths.reference(source.referenceId)}>{referenceShort(reference) || shortId(source.referenceId)}</Link> : '—'}
              </span>
            );
          }) : '—'}
        </dd>
        <dt>{t('provenance.approval')}</dt>
        <dd className="sires-num">
          {approval
            ? t('provenance.approvalLine', { decision: approval.decision, when: formatWhen(approval.decidedAt), apr: approval.apr })
            : t('provenance.noApproval')}
        </dd>
      </dl>
      {version.status === 'Draft' && <p className="research-meta">{t('provenance.draftNote')}</p>}
    </section>
  );
}
