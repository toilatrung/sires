// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Decisions on a Change Proposal (PID-00115 S06, S09; H12, H13): accept or reject the whole proposal (APR-05) with an
// Idempotency-Key and one request in flight (EC34); a 409 reloads and shows the new state without resending
// (EC32, EC33); “Yêu cầu tạo lại” sends one message to the Orchestrator in the project conversation (EC38).

import { useRef, useState } from 'react';
import { useApi, useShell, type ApiError } from '../../../shell';
import { asApiError, type Proposal } from '../model';
import { useManuscript } from '../state';
import { keepProposal } from './session';

export type Busy = 'accept' | 'reject' | 'regenerate' | null;
/** done: sent; refused: 409, reloaded; failed: error kept for the box or dialog; busy: another request in flight. */
export type Outcome = 'done' | 'refused' | 'failed' | 'busy';

export function useProposalActions(proposal: Proposal) {
  const api = useApi();
  const shell = useShell();
  const { projectId, refresh, reload } = useManuscript();
  const [busy, setBusy] = useState<Busy>(null);
  const busyRef = useRef(false);
  /** Conversation found or created by the first attempt; a retry after an error uses it again (EC38). */
  const conversationRef = useRef<string | undefined>(undefined);
  const [error, setError] = useState<{ action: 'accept' | 'reject'; error: ApiError } | undefined>();
  const path = { projectId, proposalId: proposal.id };

  /** A refused decision (409): reload, keep the box with its new state, never resend (EC32, EC33). */
  const refused = async (caught: ApiError) => {
    const code = caught.code;
    keepProposal(proposal.id, {
      kind: code === 'base_revision_mismatch' ? 'outdated' : code === 'citation_check_failed' ? 'citation' : 'processed',
      ...(caught.problem?.currentState ? { status: caught.problem.currentState } : {}),
    });
    // Files are not reloaded here: the editor keeps the text it shows; a revision event refreshes it (H19).
    await reload(code === 'project_archived' ? undefined : ['proposals', 'manuscript']);
  };

  const run = async (action: 'accept' | 'reject', send: () => Promise<void>): Promise<Outcome> => {
    if (busyRef.current) return 'busy';
    busyRef.current = true;
    setBusy(action);
    setError(undefined);
    try {
      await send();
      return 'done';
    } catch (caught) {
      const failure = asApiError(caught);
      if (failure.status === 409) {
        await refused(failure);
        return 'refused';
      }
      setError({ action, error: failure });
      return 'failed';
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const accept = () =>
    run('accept', async () => {
      const { data } = await shell.idempotency.run(`acceptChangeProposal:${proposal.id}`, (key) =>
        api.post('/projects/{projectId}/manuscript/change-proposals/{proposalId}/accept', { path, idempotencyKey: key }),
      );
      keepProposal(proposal.id, { kind: 'accepted', ...(data.revision?.revisionNumber !== undefined ? { revision: data.revision.revisionNumber } : {}) });
      // The new revision holds every block of the proposal; open files show it (MS-DIFF-001-AC02).
      await refresh();
    });

  const reject = (reason: string) =>
    run('reject', async () => {
      await shell.idempotency.run(`rejectChangeProposal:${proposal.id}`, (key) =>
        api.post('/projects/{projectId}/manuscript/change-proposals/{proposalId}/reject', { path, idempotencyKey: key, body: reason.trim() ? { reason: reason.trim() } : {} }),
      );
      keepProposal(proposal.id, { kind: 'rejected' });
      await reload(['proposals']);
    });

  /** Sends the instruction to the Orchestrator; throws so the dialog keeps the text and shows the error (EC38). */
  const regenerate = async (content: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('regenerate');
    try {
      if (!conversationRef.current) {
        const { data } = await api.get('/conversations', { query: { scope: 'project', projectId } });
        const found = (data.items ?? []).find((row) => row.scope === 'project' && (!row.projectId || row.projectId === projectId));
        // No project conversation yet: create it, then send (EC38, PID-00060 H6).
        conversationRef.current = found?.id ?? (await api.post('/conversations', { body: { scope: 'project', projectId } })).data.id;
      }
      const conversationId = conversationRef.current;
      await shell.idempotency.run(`sendMessage:regenerate:${proposal.id}`, (key) =>
        api.post('/conversations/{conversationId}/messages', {
          path: { conversationId }, idempotencyKey: key,
          body: { content: content.trim(), ...(proposal.taskId ? { activeTaskId: proposal.taskId } : {}) },
        }),
      );
      keepProposal(proposal.id, { kind: 'requested' });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  return { accept, reject, regenerate, busy, error, clearError: () => setError(undefined) };
}
