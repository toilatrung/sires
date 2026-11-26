// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Change Proposal boxes inside the editor of a file (PID-00115 S06, H11): one box per Proposed or Outdated proposal
// that changes the file (and per proposal acted on or deep-linked here, so its new state stays visible), placed
// after the last old line of its first hunk. The file's text stays the server's until the proposal is accepted
// (MS-AIWRITE-001-AC01): the diff lives only in the box.

import { useMemo } from 'react';
import type { EditorBlock } from '../editor/Editor';
import { dataOf } from '../model';
import { useManuscript, type Doc } from '../state';
import { boxLine } from './data';
import { ProposalBox } from './ProposalBox';
import { useProposalSession } from './session';

export function useProposalBlocks(doc: Doc): EditorBlock[] {
  const { proposals } = useManuscript();
  const session = useProposalSession();
  const path = doc.file.path;
  const placed = (dataOf(proposals) ?? [])
    .filter((proposal) => proposal.status === 'Proposed' || proposal.status === 'Outdated' || session.sticky.has(proposal.id))
    .flatMap((proposal) => {
      const entry = proposal.diff.find((row) => row.path === path);
      return entry ? [{ id: proposal.id, line: boxLine(entry) }] : [];
    });
  const signature = placed.map((row) => `${row.id}@${row.line}`).join('|');
  return useMemo(
    () => placed.map((row) => ({ key: `proposal:${row.id}:${path}`, afterLine: row.line, render: () => <ProposalBox proposalId={row.id} path={path} variant="editor" /> })),
    // The blocks change only when a box appears, moves or goes away; each box reads its proposal itself.
    [signature, path],
  );
}
