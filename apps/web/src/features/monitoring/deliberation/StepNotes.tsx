// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Parts of PID-00083 that PID-00059's screens show with one import each:
// - next to a step of the workflow's step list: “Xem thảo luận” and the label “Qua thảo luận” / “Không qua thảo
//   luận” (S01, S04, EC18): `<DeliberationStepNote projectId workflowId step tab />`, `tab` from useDeliberationTab;
// - in the Agent List, the note of an agent in a session (S04, EC21): `<DeliberationAgentNote state />`, `state` from
//   deliberationAgentStates.

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { InteractiveAgentPrompt } from '../../../shell';
import type { DeliberationTabState } from './DeliberationTab';
import { deliberationHref, type DeliberationAgentState, type Schemas } from './model';

/** The deliberation proposal was answered “skip”. */
export const isSkipped = (prompt: InteractiveAgentPrompt | undefined) => prompt?.status === 'Answered' && Boolean(prompt.response?.choiceIds?.includes('skip'));

export function DeliberationStepNote({
  projectId,
  workflowId,
  step,
  tab,
}: {
  projectId: string;
  workflowId: string;
  step: Schemas['WorkflowStep'];
  tab: DeliberationTabState;
}) {
  const { t } = useTranslation('monitoring');
  const deliberationId = step.deliberationId ?? undefined;
  const session = deliberationId ? tab.sessions.find((s) => s.id === deliberationId) : undefined;
  const skipped = tab.proposal?.stepId === step.id && isSkipped(tab.proposal);
  if (!deliberationId && !skipped) return null;
  return (
    <span className="dl-step">
      {deliberationId && <Link to={deliberationHref(projectId, workflowId, deliberationId)}>{t('deliberation.viewDeliberation')}</Link>}
      {session?.status === 'Completed' && (
        <span className="dl-label" data-status="deliberated">
          {t('deliberation.deliberated')}
        </span>
      )}
      {skipped && <span className="dl-label">{t('deliberation.skipped')}</span>}
    </span>
  );
}

/** “thảo luận bước 4/5 · Vòng 2”, “bước 4/5 · chờ bạn chọn chạy lại phiên hoặc tiếp tục”, “Vòng 1 · lỗi” (AgentList.dc.html). */
export function DeliberationAgentNote({ state }: { state: DeliberationAgentState }) {
  const { t } = useTranslation('monitoring');
  const { step, round } = state;
  if (state.state === 'error') return <>{t('deliberation.agentNoteError', { round })}</>;
  if (state.state === 'waiting') {
    return <>{step ? t('deliberation.agentNoteWaiting', { current: step.current, total: step.total }) : t('deliberation.agentNoteWaitingNoStep')}</>;
  }
  return <>{step ? t('deliberation.agentNote', { current: step.current, total: step.total, round }) : t('deliberation.agentNoteRound', { round })}</>;
}
