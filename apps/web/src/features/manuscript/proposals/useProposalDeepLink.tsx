// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Deep link ?proposal=<id> (PID-00115 S06, H11, EC37): the pending action “Manuscript change proposal” lands here.
// The first file of the proposal opens and its box comes into view; a proposal already decided still shows with its
// state; an unknown one gives “Không tìm thấy proposal”. Returns the notice to show above the panes, or null.

import { EditorView } from '@codemirror/view';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useApi } from '../../../shell';
import { viewOf } from '../editor/Editor';
import { dataOf, type Proposal } from '../model';
import { useManuscript } from '../state';
import { Banner } from '../ui';
import { boxLine } from './data';
import { focusProposal, startProposalSession } from './session';

/** Brings the box of a proposal into view and focus once the editor rendered it. */
export function revealProposal(proposalId: string, line?: number): void {
  let tries = 0;
  const step = () => {
    tries += 1;
    const box = document.querySelector<HTMLElement>(`[data-proposal-box="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(proposalId) : proposalId}"]`);
    // Scrolling the editor needs layout (Range.getClientRects); without it (tests) the box is already rendered.
    if (!box && line !== undefined && typeof Range !== 'undefined' && typeof Range.prototype.getClientRects === 'function') {
      const editor = viewOf(document.getElementById('ms-center') ?? document.body);
      if (editor && line <= editor.state.doc.lines) {
        const pos = editor.state.doc.line(Math.max(1, line)).to;
        editor.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
      }
    }
    if (box) {
      box.scrollIntoView?.({ block: 'center' });
      box.focus({ preventScroll: true });
      return;
    }
    if (tries < 40) setTimeout(step, 50);
  };
  setTimeout(step, 0);
}

export function useProposalDeepLink(): ReactNode {
  const { t } = useTranslation('manuscript');
  const api = useApi();
  const [params, setParams] = useSearchParams();
  const wanted = params.get('proposal');
  const { projectId, proposals, files, fileList, openFile, manuscript } = useManuscript();
  const [missing, setMissing] = useState<string | undefined>();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    startProposalSession(projectId);
  }, [projectId]);

  useEffect(() => {
    const list = dataOf(proposals);
    if (!wanted || handled.current === wanted || !list || files.status !== 'ready' || !dataOf(manuscript)) return;
    handled.current = wanted;
    const show = (proposal: Proposal) => {
      setMissing(undefined);
      focusProposal(proposal.id);
      const entry = proposal.diff.find((row) => row.path && fileList.some((file) => file.path === row.path));
      if (!entry?.path) return;
      openFile(entry.path);
      revealProposal(proposal.id, boxLine(entry));
    };
    const found = list.find((proposal) => proposal.id === wanted);
    if (found) {
      show(found);
      return;
    }
    // Not in the list (older page or another state): ask for it before saying it does not exist.
    api.get('/projects/{projectId}/manuscript/change-proposals/{proposalId}', { path: { projectId, proposalId: wanted } }).then(
      ({ data }) => show(data),
      () => setMissing(wanted),
    );
  }, [api, fileList, files.status, manuscript, openFile, projectId, proposals, wanted]);

  if (!missing || missing !== wanted) return null;
  return (
    <Banner
      tone="warn"
      label={t('proposal.notFound.title')}
      title={t('proposal.notFound.title')}
      actions={
        <button
          type="button"
          className="sires-button"
          data-variant="secondary"
          data-size="sm"
          onClick={() => {
            setMissing(undefined);
            const next = new URLSearchParams(params);
            next.delete('proposal');
            setParams(next, { replace: true });
          }}
        >
          {t('proposal.dismiss')}
        </button>
      }
    >
      {t('proposal.notFound.body')}
    </Banner>
  );
}
