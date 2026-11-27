// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Mocks the manuscript area owns (PID-00115 S01, H3): the 20 operations of path 12 with state, 409 and 422 as the
// contract describes them. listProjectReferences, getTask, getClaim, uploadFile, listConversations,
// createConversation and sendMessage belong to other areas; tests override them locally.

import { defineMocks } from '../../../shell/mock';
import { researcher } from '../../../shell/mock/fixtures/ids';
import type { Schemas } from '../../../shell/mock/types';
import { makeZip } from './binary';
import { demoProjectReferences } from './fixtures';
import { operations } from './generated';
import {
  activeFiles, addEntry, commit, currentSnapshot, emit, fileBytes, fileRow, initProject, invalidPath, isArchived,
  manuscriptBody, manuscriptStore, nextId, outdate, pdfBytes, proposalChanges, restoredVersion, serverEdit, snapshotOf, startBuild,
  type ManuscriptStore,
} from './store';

type Problem = Schemas['Problem'];
type ErrorCode = Schemas['ErrorCode'];

const PAGE = 20;

function problem(status: number, code: ErrorCode, detail?: string, extra: Partial<Problem> = {}): Problem {
  return { type: `https://sires.etroy.local/problems/${code}`, title: code, status, code, ...(detail ? { detail } : {}), ...extra };
}

function page<T>(rows: T[], cursor: string | undefined, limit: string | undefined) {
  const start = Number(cursor ?? 0) || 0;
  const size = Math.max(1, Math.min(200, Number(limit ?? PAGE) || PAGE));
  return { items: rows.slice(start, start + size), nextCursor: start + size < rows.length ? String(start + size) : null };
}

function raw(body: BodyInit, status: number, type: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'Content-Type': type, ...headers } });
}

function problemResponse(status: number, code: ErrorCode, detail?: string): Response {
  return raw(JSON.stringify(problem(status, code, detail)), status, 'application/problem+json');
}

const toBody = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;
const newestFirst = <T extends { createdAt: string }>(rows: T[]) => [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const key = (request: Request, operation: string) => {
  const value = request.headers.get('Idempotency-Key');
  return value ? `${operation}:${value}` : undefined;
};

/** Reply of an idempotent write: the stored one when the key was seen, else run and store (DATA-IDEMP-001). */
function once<R extends { status: number; body?: unknown }>(store: ManuscriptStore, id: string | undefined, run: () => R): R {
  const seen = id ? store.replies.get(id) : undefined;
  if (seen) return structuredClone(seen) as R;
  const reply = run();
  if (id && reply.status < 500) store.replies.set(id, structuredClone({ status: reply.status, body: reply.body }));
  return reply;
}

export default defineMocks({
  operations,
  // Contributed for the dev demo only (citation suggestions show smith2020); the library area owns these rows.
  fixtures: { ProjectReferenceSelection: demoProjectReferences() },
  overrides: {
    getManuscript: ({ params, fixtures }) => {
      const pm = manuscriptStore(fixtures).projects.get(params.projectId);
      if (!pm) return { status: 404, body: problem(404, 'not_found') };
      return { status: 200, body: manuscriptBody(pm), headers: { ETag: `"${pm.manuscript.rowVersion}"` } };
    },

    initManuscript: ({ params, body, request, fixtures }) => {
      const store = manuscriptStore(fixtures);
      return once(store, key(request, 'initManuscript'), () => {
        if (isArchived(store, fixtures, params.projectId)) return { status: 409 as const, body: problem(409, 'project_archived', undefined, { currentState: 'Archived' }) };
        if (store.projects.has(params.projectId)) return { status: 409 as const, body: problem(409, 'invalid_transition', 'Project đã có Manuscript.', { currentState: 'Initialized' }) };
        if (body?.initMode !== 'Default' && body?.initMode !== 'Blank') return { status: 400 as const, body: problem(400, 'validation_failed', undefined, { errors: [{ field: 'initMode', code: 'required' }] }) };
        const pm = initProject(store, params.projectId, body.initMode, body.compiler ?? 'pdflatex');
        return { status: 201 as const, body: manuscriptBody(pm) };
      });
    },

    listManuscriptFiles: ({ params, query, fixtures }) => {
      const pm = manuscriptStore(fixtures).projects.get(params.projectId);
      const snapshot = pm && snapshotOf(pm, query.revisionId);
      if (!snapshot) return { status: 200, body: { items: [] } };
      return { status: 200, body: { revisionId: snapshot.revision.id, items: activeFiles(snapshot).map(fileRow) } };
    },

    getManuscriptFileContent: ({ params, query, fixtures }) => {
      const pm = manuscriptStore(fixtures).projects.get(params.projectId);
      const snapshot = pm && snapshotOf(pm, query.revisionId);
      const version = snapshot?.files.get(params.fileId);
      if (!version || version.status !== 'Active') return { status: 404, body: problem(404, 'not_found') };
      const etag = `"${fileRow(version).contentHash}"`;
      if (version.binary) return raw(toBody(fileBytes(version)), 200, 'application/octet-stream', { ETag: etag });
      return raw(version.content, 200, 'text/plain; charset=utf-8', { ETag: etag });
    },

    commitManuscriptChanges: ({ params, body, request, fixtures }) => {
      const store = manuscriptStore(fixtures);
      return once(store, key(request, 'commitManuscriptChanges'), () => {
        const pm = store.projects.get(params.projectId);
        if (!pm) return { status: 409 as const, body: problem(409, 'invalid_transition', 'Project chưa có Manuscript.') };
        if (isArchived(store, fixtures, params.projectId)) return { status: 409 as const, body: problem(409, 'project_archived', undefined, { currentState: 'Archived' }) };
        const changes = body?.changes ?? [];
        const errors: NonNullable<Problem['errors']> = [];
        const active = activeFiles(currentSnapshot(pm));
        changes.forEach((change, index) => {
          if (invalidPath(change.path)) errors.push({ field: `changes[${index}].path`, code: 'invalid_format', message: 'Đường dẫn phải tương đối, không có .., không bắt đầu bằng /.' });
          if (change.operation === 'rename' && invalidPath(change.newPath)) errors.push({ field: `changes[${index}].newPath`, code: 'invalid_format' });
          if (change.operation === 'add' && active.some((row) => row.path === change.path)) errors.push({ field: `changes[${index}].path`, code: 'invalid_value', message: 'Đã có file với đường dẫn này.' });
          if (change.operation !== 'add' && !active.some((row) => row.path === change.path)) errors.push({ field: `changes[${index}].path`, code: 'invalid_value', message: 'Không có file này ở revision hiện hành.' });
          if (/^bibliography\/references\.bib$/.test(change.path)) errors.push({ field: `changes[${index}].path`, code: 'invalid_value', message: 'references.bib do System sinh từ Trusted Reference.' });
          if (change.restoreFromRevisionId && !restoredVersion(pm, change.restoreFromRevisionId, change.path)) {
            errors.push({ field: `changes[${index}].restoreFromRevisionId`, code: 'invalid_value', message: 'Revision không có file với đường dẫn này.' });
          }
        });
        if (!changes.length) errors.push({ field: 'changes', code: 'too_small' });
        if (errors.length) return { status: 400 as const, body: problem(400, 'validation_failed', undefined, { errors }) };
        if (store.conflictOnNextSave) {
          const text = changes.find((change) => change.operation === 'modify' && active.find((row) => row.path === change.path && !row.binary));
          if (text) {
            store.conflictOnNextSave = false;
            const row = active.find((candidate) => candidate.path === text.path)!;
            serverEdit(store, pm, row.path, `${row.content.trimEnd()}\n% Sửa ở tab khác.\n`);
          }
        }
        if (body?.baseRevisionId !== pm.manuscript.currentRevisionId) {
          return { status: 409 as const, body: problem(409, 'base_revision_mismatch', undefined, { currentState: String(pm.manuscript.currentRevisionNumber) }) };
        }
        const revision = commit(store, pm, changes, { createdBy: researcher, source: 'direct_edit', ...(body?.message ? { message: body.message } : {}) });
        return { status: 201 as const, body: revision };
      });
    },

    listManuscriptRevisions: ({ params, query, fixtures }) => {
      const pm = manuscriptStore(fixtures).projects.get(params.projectId);
      const rows = pm ? [...pm.revisions].reverse().map((snapshot) => structuredClone(snapshot.revision)) : [];
      return { status: 200, body: page(rows, query.cursor, query.limit) };
    },

    getManuscriptRevision: ({ params, fixtures }) => {
      const pm = manuscriptStore(fixtures).projects.get(params.projectId);
      const snapshot = pm?.revisions.find((row) => row.revision.id === params.revisionId);
      if (!snapshot) return { status: 404, body: problem(404, 'not_found') };
      return { status: 200, body: structuredClone(snapshot.revision) };
    },

    listChangeProposals: ({ params, query, fixtures }) => {
      const pm = manuscriptStore(fixtures).projects.get(params.projectId);
      const rows = newestFirst(pm?.proposals ?? []).filter((row) => !query.status || row.status === query.status);
      return { status: 200, body: page(structuredClone(rows), query.cursor, query.limit) };
    },

    getChangeProposal: ({ params, fixtures }) => {
      const pm = manuscriptStore(fixtures).projects.get(params.projectId);
      const proposal = pm?.proposals.find((row) => row.id === params.proposalId);
      if (!proposal) return { status: 404, body: problem(404, 'not_found') };
      return { status: 200, body: structuredClone(proposal) };
    },

    acceptChangeProposal: ({ params, request, fixtures }) => {
      const store = manuscriptStore(fixtures);
      return once(store, key(request, 'acceptChangeProposal'), () => {
        const pm = store.projects.get(params.projectId);
        const proposal = pm?.proposals.find((row) => row.id === params.proposalId);
        if (!pm || !proposal) return { status: 400 as const, body: problem(400, 'validation_failed', 'Không tìm thấy Change Proposal.') };
        if (isArchived(store, fixtures, params.projectId)) return { status: 409 as const, body: problem(409, 'project_archived', undefined, { currentState: 'Archived' }) };
        if (proposal.status !== 'Proposed') return { status: 409 as const, body: problem(409, 'invalid_transition', undefined, { currentState: proposal.status }) };
        if (proposal.citationCheck?.passed !== true) return { status: 409 as const, body: problem(409, 'citation_check_failed', undefined, { currentState: proposal.status }) };
        const base = snapshotOf(pm, proposal.baseRevisionId);
        const now = currentSnapshot(pm);
        const changedSinceBase = !base || proposal.diff.some((entry) => {
          const before = [...base.files.values()].find((row) => row.path === entry.path && row.status === 'Active')?.content;
          const after = activeFiles(now).find((row) => row.path === entry.path)?.content;
          return before !== after;
        });
        const changes = changedSinceBase ? null : proposalChanges(pm, proposal);
        if (!changes) {
          outdate(pm, (row) => row.id === proposal.id);
          return { status: 409 as const, body: problem(409, 'base_revision_mismatch', undefined, { currentState: 'Outdated' }) };
        }
        proposal.status = 'Accepted';
        proposal.rowVersion += 1;
        proposal.updatedAt = new Date().toISOString();
        proposal.approval = {
          approvedBy: researcher, decidedAt: proposal.updatedAt, decision: 'approved', objectType: 'change_proposal',
          objectId: proposal.id, objectVersion: proposal.rowVersion - 1, apr: 'APR-05',
        };
        const revision = commit(store, pm, changes, {
          createdBy: proposal.provenance.createdBy, source: 'change_proposal', changeProposalId: proposal.id,
          ...(proposal.taskId ? { taskId: proposal.taskId } : {}), ...(proposal.summary ? { message: proposal.summary } : {}),
          ...(proposal.artifactVersionIds?.length ? { artifactVersionIds: proposal.artifactVersionIds } : {}),
        });
        proposal.resultingRevisionId = revision.id;
        emit(pm.projectId, 'change_proposal', proposal.id, 'Proposed', 'Accepted');
        return { status: 200 as const, body: { proposal: structuredClone(proposal), revision } };
      });
    },

    rejectChangeProposal: ({ params, body, request, fixtures }) => {
      const store = manuscriptStore(fixtures);
      return once(store, key(request, 'rejectChangeProposal'), () => {
        const pm = store.projects.get(params.projectId);
        const proposal = pm?.proposals.find((row) => row.id === params.proposalId);
        if (!pm || !proposal) return { status: 400 as const, body: problem(400, 'validation_failed', 'Không tìm thấy Change Proposal.') };
        if (isArchived(store, fixtures, params.projectId)) return { status: 409 as const, body: problem(409, 'project_archived', undefined, { currentState: 'Archived' }) };
        if (proposal.status !== 'Proposed') return { status: 409 as const, body: problem(409, 'invalid_transition', undefined, { currentState: proposal.status }) };
        proposal.status = 'Rejected';
        proposal.rowVersion += 1;
        proposal.updatedAt = new Date().toISOString();
        proposal.approval = {
          approvedBy: researcher, decidedAt: proposal.updatedAt, decision: 'rejected', objectType: 'change_proposal',
          objectId: proposal.id, objectVersion: proposal.rowVersion - 1, apr: 'APR-05', ...(body?.reason ? { reason: body.reason } : {}),
        };
        emit(pm.projectId, 'change_proposal', proposal.id, 'Proposed', 'Rejected');
        return { status: 200 as const, body: structuredClone(proposal) };
      });
    },

    insertDiagramIntoManuscript: ({ params, body, request, fixtures }) => {
      const store = manuscriptStore(fixtures);
      return once(store, key(request, 'insertDiagramIntoManuscript'), () => {
        const pm = store.projects.get(params.projectId);
        if (!pm) return { status: 409 as const, body: problem(409, 'invalid_transition', 'Project chưa có Manuscript.') };
        if (isArchived(store, fixtures, params.projectId)) return { status: 409 as const, body: problem(409, 'project_archived', undefined, { currentState: 'Archived' }) };
        const target = activeFiles(currentSnapshot(pm)).find((row) => row.path === body?.targetPath);
        if (!target || invalidPath(body?.targetPath)) return { status: 400 as const, body: problem(400, 'validation_failed', undefined, { errors: [{ field: 'targetPath', code: 'invalid_value' }] }) };
        const lines = target.content.split('\n');
        const after = Math.min(lines.length, Math.max(0, body?.afterLine ?? lines.length - 1));
        const label = body?.label ?? 'fig:diagram';
        const figure = ['\\begin{figure}[t]', '  \\centering', '  \\includegraphics[width=\\linewidth]{figures/pipeline.png}', `  \\caption{${body?.caption ?? 'Sơ đồ'}}`, `  \\label{${label}}`, '\\end{figure}'];
        const proposal: Schemas['ChangeProposal'] = {
          id: nextId(store, 'e2'), accountId: pm.manuscript.accountId, projectId: pm.projectId, createdAt: new Date().toISOString(), createdBy: { type: 'agent', agent: 'writing', agentRunId: nextId(store, '7c') }, rowVersion: 1,
          manuscriptId: pm.manuscript.id, baseRevisionId: pm.manuscript.currentRevisionId, status: 'Proposed', summary: `Chèn sơ đồ ${label} vào ${target.path}.`,
          diff: [{ path: target.path, operation: 'modify', hunks: [{ oldStart: after, oldLines: 1, newStart: after, newLines: 1 + figure.length, lines: [` ${lines[after - 1] ?? ''}`, ...figure.map((line) => `+${line}`)] }] }],
          artifactVersionIds: body?.artifactVersionId ? [body.artifactVersionId] : [], createdByAgentRunId: nextId(store, '7c'),
          citationCheck: { passed: true, unresolvedKeys: [], mismatches: [] },
          provenance: { createdBy: researcher, inputs: body?.artifactVersionId ? [{ type: 'artifact_version', id: body.artifactVersionId }] as Schemas['Provenance']['inputs'] : [] },
        };
        pm.proposals.push(proposal);
        emit(pm.projectId, 'change_proposal', proposal.id, undefined, 'Proposed');
        return { status: 201 as const, body: structuredClone(proposal) };
      });
    },

    listBibliography: ({ params, fixtures }) => {
      const pm = manuscriptStore(fixtures).projects.get(params.projectId);
      return { status: 200, body: { items: structuredClone(pm?.bibliography ?? []) } };
    },

    addBibliographyEntry: ({ params, body, fixtures }) => {
      const store = manuscriptStore(fixtures);
      const pm = store.projects.get(params.projectId);
      if (!pm) return { status: 422, body: problem(422, 'validation_failed', 'Project chưa có Manuscript.') };
      const existing = pm.bibliography.find((entry) => entry.referenceId === body?.referenceId);
      if (existing) return { status: 200, body: structuredClone(existing) };
      const selection = store.references.find((row) => row.referenceId === body?.referenceId && row.status === 'Active' && row.reference && (!row.projectId || row.projectId === params.projectId));
      if (!selection?.reference || selection.reference.approvalStatus !== 'Trusted') {
        return { status: 422, body: problem(422, 'reference_not_trusted', 'Reference chưa là Trusted Reference của project.') };
      }
      return { status: 201, body: structuredClone(addEntry(store, pm, selection)) };
    },

    listBuilds: ({ params, query, fixtures }) => {
      const pm = manuscriptStore(fixtures).projects.get(params.projectId);
      const rows = [...(pm?.builds ?? [])].sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));
      return { status: 200, body: page(structuredClone(rows), query.cursor, query.limit) };
    },

    startBuild: ({ params, body, fixtures }) => {
      const store = manuscriptStore(fixtures);
      const pm = store.projects.get(params.projectId);
      if (!pm) return problemResponse(409, 'invalid_transition', 'Project chưa có Manuscript.');
      if (isArchived(store, fixtures, params.projectId)) return problemResponse(409, 'project_archived');
      const snapshot = snapshotOf(pm, body?.revisionId);
      if (!snapshot) return problemResponse(400, 'validation_failed', 'Không có revision này.');
      const { build, created } = startBuild(store, pm, snapshot.revision);
      return created ? { status: 202, body: structuredClone(build) } : { status: 200, body: structuredClone(build) };
    },

    getBuild: ({ params, fixtures }) => {
      const pm = manuscriptStore(fixtures).projects.get(params.projectId);
      const build = pm?.builds.find((row) => row.id === params.buildId);
      if (!build) return { status: 404, body: problem(404, 'not_found') };
      return { status: 200, body: structuredClone(build) };
    },

    getBuildLog: ({ params, fixtures }) => {
      const pm = manuscriptStore(fixtures).projects.get(params.projectId);
      const log = pm?.logs.get(params.buildId);
      if (log === undefined) return problemResponse(404, 'not_found');
      return raw(log, 200, 'text/plain; charset=utf-8');
    },

    getBuildPdf: ({ params, fixtures }) => {
      const pm = manuscriptStore(fixtures).projects.get(params.projectId);
      const build = pm?.builds.find((row) => row.id === params.buildId);
      const bytes = pm && build ? pdfBytes(pm, build) : undefined;
      if (!bytes) return problemResponse(404, 'not_found');
      return raw(toBody(bytes), 200, 'application/pdf');
    },

    exportManuscript: ({ params, query, fixtures }) => {
      const pm = manuscriptStore(fixtures).projects.get(params.projectId);
      if (!pm) return problemResponse(404, 'not_found');
      if (query.format === 'zip') {
        const snapshot = snapshotOf(pm, query.revisionId);
        if (!snapshot) return problemResponse(404, 'not_found');
        const zip = makeZip(activeFiles(snapshot).map((row) => ({ path: row.path, bytes: fileBytes(row) })));
        return raw(toBody(zip), 200, 'application/zip', {
          'Content-Disposition': `attachment; filename="manuscript-r${snapshot.revision.revisionNumber}.zip"`, 'X-Build-Revision': String(snapshot.revision.revisionNumber),
        });
      }
      const builds = pm.builds.filter((row) => row.status === 'Succeeded' && pm.pdfs.has(row.id) && (!query.revisionId || row.revisionId === query.revisionId));
      const build = builds.sort((a, b) => b.queuedAt.localeCompare(a.queuedAt))[0];
      if (!build) return problemResponse(404, 'not_found', 'Chưa có PDF.');
      return raw(toBody(pdfBytes(pm, build)!), 200, 'application/pdf', {
        'Content-Disposition': `attachment; filename="manuscript-r${build.revisionNumber}.pdf"`, 'X-Build-Revision': String(build.revisionNumber),
      });
    },
  },
});

