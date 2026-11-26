// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Stateful store behind the manuscript area's mock overrides (PID-00115 S01, H3). One store per page: saving makes a
// revision, a revision outdates the proposals on the files it changed, accepting applies the whole diff, a build
// runs Queued → Running → Succeeded/Failed on timers and reads the revision's own text. Every change emits
// `manuscript.object_status_changed` like the backend would (H19). Tests reset, seed and drive it.

import type { EventInput } from '../../../shell/mock/events';
import { researcher } from '../../../shell/mock/fixtures/ids';
import type { Fixtures, Schemas } from '../../../shell/mock/types';
import { base64ToBytes, contentHash, makePdf } from './binary';
import {
  ARCHIVED_BUILD_ID, ARCHIVED_MANUSCRIPT_ID, ARCHIVED_PROJECT, BUILD_LOG_R16, BUILD_LOG_R17, MANUSCRIPT_ID, PRISMA_PNG_BASE64, RAG, SYSTEM,
  archivedRevisions, demoBibliography, demoBuilds, demoProjectReferences, demoProposals, demoRevisions, manuscriptRow, referencesBib, templateFiles,
  type FileVersion, type RevisionSnapshot,
} from './fixtures';

type Proposal = Schemas['ChangeProposal'];
type Build = Schemas['Build'];
type Revision = Schemas['ManuscriptRevision'];
type FileChange = Schemas['FileChange'];

export interface ProjectManuscript {
  projectId: string;
  manuscript: Schemas['Manuscript'];
  /** Oldest first; the last one is the current revision. */
  revisions: RevisionSnapshot[];
  proposals: Proposal[];
  builds: Build[];
  bibliography: Schemas['BibliographyEntry'][];
  logs: Map<string, string>;
  pdfs: Map<string, Uint8Array>;
}

export interface ManuscriptStore {
  projects: Map<string, ProjectManuscript>;
  /** Project references the mock can resolve for addBibliographyEntry (its own, plus the shared fixtures). */
  references: Schemas['ProjectReferenceSelection'][];
  /** Idempotency-Key → reply already sent (DATA-IDEMP-001). */
  replies: Map<string, { status: number; body: unknown }>;
  /** Projects the mock treats as Archived besides the fixture status (tests). */
  archived: Set<string>;
  /** Delays of the build phases; null = builds wait for `finishBuilds()` (tests). */
  buildTiming: { queuedMs: number; runningMs: number } | null;
  /** Dev scenario `conflict`: the next save of a text file meets a newer server edit of that file. */
  conflictOnNextSave: boolean;
  counter: number;
}

export type Scenario = 'demo' | 'not-initialized' | 'conflict' | 'building';

let current: ManuscriptStore | undefined;
let seedScenario: Scenario | undefined;
let sink: ((event: EventInput) => void) | undefined;
const timers = new Set<ReturnType<typeof setTimeout>>();

/** Dev scenario chosen in the browser: `sessionStorage.setItem('sires.mock.manuscript', 'conflict')`, then reload. */
function devScenario(): Scenario {
  try {
    const value = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem('sires.mock.manuscript');
    return value === 'not-initialized' || value === 'conflict' || value === 'building' ? value : 'demo';
  } catch {
    return 'demo';
  }
}

const isTest = () => typeof process !== 'undefined' && Boolean(process.env?.VITEST);

function ragProject(): ProjectManuscript {
  const revisions = demoRevisions();
  const builds = demoBuilds();
  const pm: ProjectManuscript = {
    projectId: RAG,
    manuscript: manuscriptRow(RAG, MANUSCRIPT_ID, revisions.at(-1)!.revision),
    revisions, proposals: demoProposals(), builds, bibliography: demoBibliography(),
    logs: new Map([[builds[0]!.id, BUILD_LOG_R16], [builds[1]!.id, BUILD_LOG_R17]]),
    pdfs: new Map(),
  };
  pm.pdfs.set(builds[0]!.id, pdfOf(pm, revisions[1]!));
  return pm;
}

function archivedProject(): ProjectManuscript {
  const revisions = archivedRevisions();
  const revision = revisions[0]!.revision;
  const build: Build = {
    id: ARCHIVED_BUILD_ID, manuscriptId: ARCHIVED_MANUSCRIPT_ID, revisionId: revision.id, revisionNumber: 1, compiler: 'pdflatex',
    status: 'Succeeded', queuedAt: revision.createdAt, startedAt: revision.createdAt, endedAt: revision.createdAt, hasPdf: true, issues: [],
  };
  const pm: ProjectManuscript = {
    projectId: ARCHIVED_PROJECT,
    manuscript: manuscriptRow(ARCHIVED_PROJECT, ARCHIVED_MANUSCRIPT_ID, revision, 'Default', 24 * 60),
    revisions, proposals: [], builds: [build], bibliography: [], logs: new Map([[build.id, 'Output written on main.pdf (1 page).\n']]), pdfs: new Map(),
  };
  pm.pdfs.set(build.id, pdfOf(pm, revisions[0]!));
  return pm;
}

function create(fixtures: Fixtures, scenario: Scenario): ManuscriptStore {
  const own = demoProjectReferences();
  const shared = (fixtures.ProjectReferenceSelection ?? []).filter((row) => !own.some((mine) => mine.id === row.id));
  const store: ManuscriptStore = {
    projects: new Map(), references: [...own, ...structuredClone([...shared])], replies: new Map(), archived: new Set(),
    buildTiming: isTest() ? null : { queuedMs: 1200, runningMs: 3500 }, conflictOnNextSave: scenario === 'conflict', counter: 1000,
  };
  if (scenario !== 'not-initialized') store.projects.set(RAG, ragProject());
  store.projects.set(ARCHIVED_PROJECT, archivedProject());
  if (scenario === 'building') {
    const pm = store.projects.get(RAG)!;
    startBuild(store, pm, currentSnapshot(pm).revision);
  }
  return store;
}

/** The store, created from the demo on first use. */
export function manuscriptStore(fixtures: Fixtures): ManuscriptStore {
  current ??= create(fixtures, seedScenario ?? devScenario());
  return current;
}

/** Tests: start the next request from the demo (or a scenario); pending build timers are dropped. */
export function resetManuscriptStore(scenario: Scenario = 'demo'): void {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  current = undefined;
  seedScenario = scenario;
}

/** The store of the current test, created from the demo when no request made it yet. */
export function testStore(): ManuscriptStore {
  current ??= create({}, seedScenario ?? 'demo');
  return current;
}

/** Where events go: the dev page's mock stream by default; tests pass `mock.events.emit`. */
export function setManuscriptEventSink(next: ((event: EventInput) => void) | undefined): void {
  sink = next;
}

export function emit(projectId: string, objectType: 'change_proposal' | 'build' | 'revision', objectId: string, fromState: string | undefined, toState: string): void {
  const event: EventInput = { type: 'manuscript.object_status_changed', projectId, objectType, objectId, ...(fromState ? { fromState } : {}), toState };
  const target = sink ?? (globalThis as { siresMock?: { events?: { emit: (input: EventInput) => void } } }).siresMock?.events?.emit;
  target?.(event);
}

export function nextId(store: ManuscriptStore, prefix: string): string {
  store.counter += 1;
  return `${prefix}000000-0000-4000-8000-${String(store.counter).padStart(12, '0')}`;
}

export function isArchived(store: ManuscriptStore, fixtures: Fixtures, projectId: string): boolean {
  return store.archived.has(projectId) || fixtures.ResearchProject?.find((row) => row.id === projectId)?.status === 'Archived';
}

export const currentSnapshot = (pm: ProjectManuscript): RevisionSnapshot => pm.revisions.at(-1)!;

export function snapshotOf(pm: ProjectManuscript, revisionId: string | undefined): RevisionSnapshot | undefined {
  return revisionId ? pm.revisions.find((snapshot) => snapshot.revision.id === revisionId) : currentSnapshot(pm);
}

export function activeFiles(snapshot: RevisionSnapshot): FileVersion[] {
  return [...snapshot.files.values()].filter((row) => row.status === 'Active').sort((a, b) => a.path.localeCompare(b.path));
}

export function fileRow(version: FileVersion): Schemas['ManuscriptFile'] {
  const size = version.binary ? Math.floor((version.content.length * 3) / 4) : new TextEncoder().encode(version.content).length;
  return {
    id: version.id, path: version.path, fileType: version.fileType, contentHash: contentHash(version.content), sizeBytes: size,
    status: version.status, updatedInRevision: version.updatedInRevision,
  };
}

export function fileType(path: string): FileVersion['fileType'] {
  if (/\.tex$/i.test(path)) return 'tex';
  if (/\.bib$/i.test(path)) return 'bib';
  if (/\.(png|jpe?g|pdf|eps|svg)$/i.test(path)) return 'figure';
  return 'other';
}

/** Path rule of ManuscriptFile.path (H9): relative, no `..`, no leading `/`, no `\`, no empty segment. */
export function invalidPath(path: string | undefined): boolean {
  if (!path) return true;
  return path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => part === '' || part === '.' || part === '..');
}

/** Applies a commit's changes on the current revision and appends the new revision (one commit = one revision, H6). */
export function commit(
  store: ManuscriptStore, pm: ProjectManuscript, changes: FileChange[], meta: Partial<Revision> & { createdBy: Schemas['ActorRef']; source: Revision['source'] },
): Revision {
  const base = currentSnapshot(pm);
  const files = new Map([...base.files].map(([key, row]) => [key, { ...row }]));
  const number = base.revision.revisionNumber + 1;
  const find = (path: string) => [...files.values()].find((row) => row.path === path && row.status === 'Active');
  const recorded: FileChange[] = [];
  for (const change of changes) {
    const row = find(change.path);
    const beforeHash = row ? contentHash(row.content) : undefined;
    if (change.operation === 'add') {
      const binary = Boolean(change.fileUploadId);
      const added: FileVersion = {
        id: row?.id ?? nextId(store, 'e1'), path: change.path, fileType: fileType(change.path),
        content: binary ? PRISMA_PNG_BASE64 : change.content ?? '', ...(binary ? { binary: true } : {}), status: 'Active', updatedInRevision: number,
      };
      files.set(added.id, added);
    } else if (row && change.operation === 'modify') {
      row.content = change.content ?? '';
      row.updatedInRevision = number;
    } else if (row && change.operation === 'delete') {
      row.status = 'Deleted';
      row.updatedInRevision = number;
    } else if (row && change.operation === 'rename' && change.newPath) {
      row.path = change.newPath;
      row.fileType = fileType(change.newPath);
      row.updatedInRevision = number;
    }
    const after = find(change.newPath ?? change.path);
    recorded.push({
      path: change.path, operation: change.operation, ...(change.newPath ? { newPath: change.newPath } : {}),
      ...(beforeHash ? { beforeHash } : {}), ...(after && change.operation !== 'delete' ? { afterHash: contentHash(after.content) } : {}),
    });
  }
  const revision: Revision = {
    ...meta, id: nextId(store, '9b'), revisionNumber: number, parentRevisionId: base.revision.id, changes: recorded, createdAt: new Date().toISOString(),
  };
  pm.revisions.push({ revision, files });
  pm.manuscript.currentRevisionId = revision.id;
  pm.manuscript.currentRevisionNumber = number;
  pm.manuscript.rowVersion += 1;
  pm.manuscript.updatedAt = revision.createdAt;
  emit(pm.projectId, 'revision', revision.id, undefined, 'Created');
  const touched = new Set(recorded.flatMap((change) => [change.path, change.newPath].filter(Boolean) as string[]));
  outdate(pm, (proposal) => proposal.diff.some((entry) => entry.path && touched.has(entry.path)));
  return revision;
}

/** Proposed proposals matching `which` become Outdated (MS-DIFF-001). */
export function outdate(pm: ProjectManuscript, which: (proposal: Proposal) => boolean): void {
  for (const proposal of pm.proposals) {
    if (proposal.status === 'Proposed' && which(proposal)) {
      proposal.status = 'Outdated';
      proposal.rowVersion += 1;
      proposal.updatedAt = new Date().toISOString();
      emit(pm.projectId, 'change_proposal', proposal.id, 'Proposed', 'Outdated');
    }
  }
}

/** Applies the hunks of one file's diff to its text; null when a removed or context line does not match. */
export function applyHunks(text: string, hunks: Schemas['DiffHunk'][]): string | null {
  const lines = text.split('\n');
  let shift = 0;
  for (const hunk of [...hunks].sort((a, b) => (a.oldStart ?? 0) - (b.oldStart ?? 0))) {
    const start = Math.max(0, (hunk.oldStart ?? 1) - 1 + shift);
    const removed: string[] = [];
    const added: string[] = [];
    for (const line of hunk.lines ?? []) {
      const mark = line[0];
      const body = line.slice(1);
      if (mark === '-') removed.push(body);
      else if (mark === '+') added.push(body);
      else {
        removed.push(body);
        added.push(body);
      }
    }
    if (removed.some((line, index) => lines[start + index] !== line)) return null;
    lines.splice(start, removed.length, ...added);
    shift += added.length - removed.length;
  }
  return lines.join('\n');
}

/** Changes of a proposal on the current revision; null when its diff no longer applies. */
export function proposalChanges(pm: ProjectManuscript, proposal: Proposal): FileChange[] | null {
  const files = activeFiles(currentSnapshot(pm));
  const changes: FileChange[] = [];
  for (const entry of proposal.diff) {
    if (!entry.path) continue;
    const existing = files.find((row) => row.path === entry.path);
    if (entry.operation === 'delete') {
      if (existing) changes.push({ path: entry.path, operation: 'delete' });
      continue;
    }
    if (entry.operation === 'add' || !existing) {
      const content = (entry.hunks ?? []).flatMap((hunk) => (hunk.lines ?? []).filter((line) => line[0] === '+').map((line) => line.slice(1))).join('\n');
      changes.push({ path: entry.path, operation: 'add', content: `${content}\n` });
      continue;
    }
    const next = applyHunks(existing.content, entry.hunks ?? []);
    if (next === null) return null;
    changes.push({ path: entry.path, operation: 'modify', content: next });
  }
  return changes;
}

/** A self-made PDF of the revision: the title, then each \input file's text, six pages for the RAG demo. */
export function pdfOf(pm: ProjectManuscript, snapshot: RevisionSnapshot): Uint8Array {
  const files = activeFiles(snapshot).filter((row) => row.fileType === 'tex');
  const main = files.find((row) => row.path === pm.manuscript.mainFile) ?? files[0];
  const title = /\\title\{([^}]*)\}/.exec(main?.content ?? '')?.[1] ?? 'Manuscript';
  const plain = (text: string) => text.split('\n').filter((line) => line && !line.startsWith('%') && !line.startsWith('\\label'))
    .map((line) => line.replace(/\\section\{([^}]*)\}/, '$1').replace(/\\cite[pt]?\{[^}]*\}/g, '[1]'));
  const sections = files.filter((row) => row !== main).map((row) => plain(row.content));
  const pages = [{ title, lines: [`revision ${snapshot.revision.revisionNumber}`, '', ...(sections[0] ?? [])] }];
  for (const section of sections.slice(1)) pages.push({ title, lines: section });
  const target = pm.projectId === RAG ? 6 : pages.length;
  while (pages.length < target) pages.push({ title, lines: [`[Trang ${pages.length + 1}]`] });
  return makePdf(pages);
}

/** What the build of a revision reports, read from its text (missing package, missing file, unknown key). */
export function analyse(pm: ProjectManuscript, snapshot: RevisionSnapshot): { issues: Schemas['BuildIssue'][]; log: string; found: string[]; unresolved: string[] } {
  const files = activeFiles(snapshot);
  const paths = new Set(files.map((row) => row.path));
  const keys = new Set(pm.bibliography.map((entry) => entry.bibtexKey));
  const issues: Schemas['BuildIssue'][] = [];
  const found = new Set<string>();
  const unresolved = new Set<string>();
  const log: string[] = ['This is pdfTeX, Version 3.141592653-2.6-1.40.25 (TeX Live 2023) (preloaded format=pdflatex)', `(./${pm.manuscript.mainFile}`];
  for (const row of files.filter((candidate) => candidate.fileType === 'tex')) {
    row.content.split('\n').forEach((text, index) => {
      const line = index + 1;
      const code = text.replace(/(^|[^\\])%.*$/, '$1');
      if (/\\usepackage(\[[^\]]*\])?\{booktabs\}/.test(code)) {
        issues.push({ severity: 'error', file: row.path, line, code: 'missing_package', message: "! LaTeX Error: File `booktabs.sty' not found.", friendlyMessage: 'Môi trường build chưa có package booktabs. Bỏ dòng \\usepackage{booktabs} hoặc dựng bảng không cần booktabs.' });
        log.push('', "! LaTeX Error: File `booktabs.sty' not found.", `l.${line} ${text.trim()}`);
      }
      for (const match of code.matchAll(/\\(input|include)\{([^}]+)\}/g)) {
        const target = /\.tex$/.test(match[2]!) ? match[2]! : `${match[2]}.tex`;
        if (!paths.has(target)) {
          issues.push({ severity: 'error', file: row.path, line, code: 'missing_file', message: `! LaTeX Error: File \`${target}' not found.`, friendlyMessage: `Không tìm thấy ${target}. Sửa đường dẫn trong \\${match[1]} hoặc thêm file.` });
          log.push('', `! LaTeX Error: File \`${target}' not found.`, `l.${line} ${text.trim()}`);
        }
      }
      for (const match of code.matchAll(/\\includegraphics(\[[^\]]*\])?\{([^}]+)\}/g)) {
        if (!paths.has(match[2]!) && ![...paths].some((path) => path.startsWith(`${match[2]}.`))) {
          issues.push({ severity: 'error', file: row.path, line, code: 'missing_file', message: `! LaTeX Error: File \`${match[2]}' not found.`, friendlyMessage: `Không tìm thấy hình ${match[2]}. Tải hình lên hoặc sửa đường dẫn.` });
          log.push('', `! LaTeX Error: File \`${match[2]}' not found.`, `l.${line} ${text.trim()}`);
        }
      }
      for (const match of code.matchAll(/\\cite[a-z]*\*?(\[[^\]]*\])*\{([^}]*)\}/g)) {
        for (const key of match[2]!.split(',').map((part) => part.trim()).filter(Boolean)) {
          found.add(key);
          if (!keys.has(key)) {
            unresolved.add(key);
            issues.push({ severity: 'warning', file: row.path, line, code: 'undefined_citation', message: `LaTeX Warning: Citation \`${key}' on page 1 undefined on input line ${line}.`, friendlyMessage: `Key ${key} không có trong references.bib.` });
            log.push(`LaTeX Warning: Citation \`${key}' on page 1 undefined on input line ${line}.`);
          }
        }
      }
    });
  }
  const failed = issues.some((issue) => issue.severity === 'error');
  log.push(failed ? 'No pages of output.' : 'Output written on main.pdf.', 'Transcript written on main.log.', '');
  return { issues, log: log.join('\n'), found: [...found], unresolved: [...unresolved] };
}

function later(ms: number, run: () => void): void {
  const timer = setTimeout(() => {
    timers.delete(timer);
    run();
  }, ms);
  timers.add(timer);
}

function advance(pm: ProjectManuscript, build: Build): void {
  const now = new Date().toISOString();
  if (build.status === 'Queued') {
    build.status = 'Running';
    build.startedAt = now;
    emit(pm.projectId, 'build', build.id, 'Queued', 'Running');
    return;
  }
  if (build.status !== 'Running') return;
  const snapshot = snapshotOf(pm, build.revisionId) ?? currentSnapshot(pm);
  const result = analyse(pm, snapshot);
  const failed = result.issues.some((issue) => issue.severity === 'error');
  build.status = failed ? 'Failed' : 'Succeeded';
  build.endedAt = now;
  build.issues = result.issues;
  build.citationKeysFound = result.found;
  build.unresolvedKeys = result.unresolved;
  build.hasPdf = !failed;
  pm.logs.set(build.id, result.log);
  if (!failed) pm.pdfs.set(build.id, pdfOf(pm, snapshot));
  emit(pm.projectId, 'build', build.id, 'Running', build.status);
}

/** Starts the build of a revision, or returns the one that already exists (DATA-IDEMP-005, H15). */
export function startBuild(store: ManuscriptStore, pm: ProjectManuscript, revision: Revision): { build: Build; created: boolean } {
  const existing = pm.builds.find((build) => build.revisionId === revision.id);
  if (existing) return { build: existing, created: false };
  const build: Build = {
    id: nextId(store, '9c'), manuscriptId: pm.manuscript.id, revisionId: revision.id, revisionNumber: revision.revisionNumber,
    compiler: pm.manuscript.compiler, status: 'Queued', queuedAt: new Date().toISOString(), issues: [],
  };
  pm.builds.push(build);
  emit(pm.projectId, 'build', build.id, undefined, 'Queued');
  const timing = store.buildTiming;
  if (timing) later(timing.queuedMs, () => {
    advance(pm, build);
    later(timing.runningMs, () => advance(pm, build));
  });
  return { build, created: true };
}

/** Tests: move every unfinished build one step (Queued → Running), or to the end with `toEnd`. */
export function finishBuilds(store: ManuscriptStore, toEnd = true): void {
  for (const pm of store.projects.values()) {
    for (const build of pm.builds) {
      if (build.status === 'Queued') advance(pm, build);
      if (toEnd && build.status === 'Running') advance(pm, build);
    }
  }
}

export function latestBuild(pm: ProjectManuscript): Build | undefined {
  return [...pm.builds].sort((a, b) => b.queuedAt.localeCompare(a.queuedAt))[0];
}

export function manuscriptBody(pm: ProjectManuscript): Schemas['Manuscript'] {
  const build = latestBuild(pm);
  return { ...structuredClone(pm.manuscript), ...(build ? { latestBuild: structuredClone(build) } : {}) };
}

/** initManuscript: a new manuscript from the template, revision 1 by System (MS-INIT-001). */
export function initProject(store: ManuscriptStore, projectId: string, mode: Schemas['Manuscript']['initMode'], compiler: Schemas['Compiler']): ProjectManuscript {
  const files = templateFiles(mode, () => nextId(store, 'e1'));
  const revision: Revision = {
    id: nextId(store, '9b'), revisionNumber: 1, changes: files.map((row) => ({ path: row.path, operation: 'add' })), source: 'init',
    createdBy: SYSTEM, createdAt: new Date().toISOString(), message: mode,
  };
  const pm: ProjectManuscript = {
    projectId, manuscript: { ...manuscriptRow(projectId, nextId(store, '9a'), revision, mode, 0), compiler, createdAt: revision.createdAt },
    revisions: [{ revision, files: new Map(files.map((row) => [row.id, row])) }], proposals: [], builds: [], bibliography: [], logs: new Map(), pdfs: new Map(),
  };
  store.projects.set(projectId, pm);
  emit(projectId, 'revision', revision.id, undefined, 'Created');
  return pm;
}

/** addBibliographyEntry: a new entry regenerates references.bib in a System revision (MS-BIB-001; EC18 follows). */
export function addEntry(store: ManuscriptStore, pm: ProjectManuscript, selection: Schemas['ProjectReferenceSelection']): Schemas['BibliographyEntry'] {
  const reference = selection.reference!;
  const entry: Schemas['BibliographyEntry'] = {
    id: nextId(store, 'e3'), manuscriptId: pm.manuscript.id, bibtexKey: reference.bibtexKey, referenceId: reference.id,
    referenceApprovalStatus: reference.approvalStatus, generatedFromMetadataVersion: reference.metadataVersion, citedInFiles: [],
    bibtex: `@${reference.metadata.publicationType === 'conference' ? 'inproceedings' : 'article'}{${reference.bibtexKey},\n  author = {${reference.metadata.authors.map((author) => author.name).join(' and ')}},\n  title = {${reference.metadata.title}},\n  year = {${reference.metadata.year ?? ''}}\n}`,
  };
  pm.bibliography.push(entry);
  const bib = activeFiles(currentSnapshot(pm)).find((row) => row.fileType === 'bib');
  if (bib) commit(store, pm, [{ path: bib.path, operation: 'modify', content: referencesBib(pm.bibliography) }], { createdBy: SYSTEM, source: 'direct_edit', message: 'references.bib' });
  return entry;
}

/** Simulates an edit made elsewhere (another tab, System), for the save-conflict scenario and tests (H7). */
export function serverEdit(store: ManuscriptStore, pm: ProjectManuscript, path: string, content: string, by: Schemas['ActorRef'] = researcher): Revision {
  return commit(store, pm, [{ path, operation: 'modify', content }], { createdBy: by, source: 'direct_edit' });
}

export function pdfBytes(pm: ProjectManuscript, build: Build): Uint8Array | undefined {
  return pm.pdfs.get(build.id);
}

export function fileBytes(version: FileVersion): Uint8Array {
  return version.binary ? base64ToBytes(version.content) : new TextEncoder().encode(version.content);
}
