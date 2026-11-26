// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// State of the Manuscript screen (PID-00115): what the server holds (manuscript, files, proposals, bibliography,
// builds), the open documents with their unsaved text, and the commands every slice uses. Saving sends every changed
// file in one commit = one revision (H6); a 409 is resolved as H7 says; unsaved text is kept in the shell's draft
// store (H8); events and stream signals reload with GET, never from the payload (H19).

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { isApiError, useApi, useEvents, useNavigationData, useShell, useStreamSignal, type ApiError } from '../../shell';
import {
  asApiError, dataOf, failed, fileContent, isImage, isText, loading, manuscriptPath, ready,
  type BibliographyEntry, type Build, type FileChange, type Load, type Manuscript, type ManuscriptFile, type Proposal, type Revision, type ActorRef,
} from './model';

export type RightPane = 'pdf' | 'log' | 'history';
export type TabletTab = 'files' | 'editor' | 'view';
export type Part = 'manuscript' | 'files' | 'proposals' | 'bibliography' | 'builds';
const ALL_PARTS: readonly Part[] = ['manuscript', 'files', 'proposals', 'bibliography', 'builds'];

export interface Conflict {
  /** Revision that last changed the file on the server, and who made it (H7). */
  revisionNumber?: number;
  actor?: ActorRef;
  serverText: string;
  serverHash?: string;
  /** The file was deleted or renamed away on the server. */
  gone?: boolean;
}

export interface Doc {
  file: ManuscriptFile;
  kind: 'text' | 'image' | 'binary';
  status: 'loading' | 'ready' | 'error';
  error?: ApiError;
  /** Text of the server version `baseHash` (what “no change” means). */
  server: string;
  /** Text in the editor. */
  text: string;
  /** contentHash of the server version the text started from. */
  baseHash?: string;
  imageUrl?: string;
  conflict?: Conflict;
  /** Unsaved text found in the draft store when the file opened (H8); `stale`: the file changed since. */
  draft?: { text: string; stale: boolean; baseHash?: string };
}

export type SaveOutcome = 'nothing' | 'saved' | 'conflict' | 'error' | 'blocked';

export interface CursorRequest {
  fileId: string;
  line: number;
  seq: number;
}

interface State {
  manuscript: Load<Manuscript | null>;
  files: Load<ManuscriptFile[]>;
  proposals: Load<Proposal[]>;
  bibliography: Load<BibliographyEntry[]>;
  builds: Load<Build[]>;
  docs: Record<string, Doc>;
  tabs: string[];
  active?: string;
  cursor?: CursorRequest;
  rightPane: RightPane | null;
  lastPane: RightPane;
  tabletTab: TabletTab;
  saving: boolean;
  saveError?: ApiError;
  /** Path the deep link asked for, opened once the file list arrives. */
  wanted?: string;
}

export interface ManuscriptContextValue extends State {
  projectId: string;
  /** Project Archived: read-only (H20). */
  archived: boolean;
  /** Current revision's files that are not loaded yet are Active only. */
  fileList: ManuscriptFile[];
  dirtyDocs: Doc[];
  isDirty: (path: string) => boolean;
  reload: (parts?: readonly Part[]) => Promise<void>;
  openFile: (idOrPath: string, options?: { line?: number }) => void;
  closeTab: (fileId: string) => void;
  setText: (fileId: string, text: string) => void;
  /** Throw away unsaved text of a file (keeps the server version). */
  discard: (fileId: string) => void;
  restoreDraft: (fileId: string) => void;
  dropDraft: (fileId: string) => void;
  keepMine: (fileId: string) => void;
  useServer: (fileId: string) => void;
  save: () => Promise<SaveOutcome>;
  /** One commit for file operations and restores (S03, S07); a 409 reloads, then resends once if `retry` allows. */
  commit: (changes: FileChange[], options?: { message?: string; retry?: (files: ManuscriptFile[]) => FileChange[] | null }) => Promise<Revision>;
  /** After an accepted proposal or another server change: reload everything, refresh files without changes. */
  refresh: () => Promise<void>;
  build: () => Promise<Build | undefined>;
  setRightPane: (pane: RightPane | null) => void;
  setTabletTab: (tab: TabletTab) => void;
  clearSaveError: () => void;
  init: (mode: Manuscript['initMode']) => Promise<void>;
}

const Context = createContext<ManuscriptContextValue | null>(null);

export function useManuscript(): ManuscriptContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('useManuscript outside ManuscriptProvider');
  return value;
}

const draftRoute = (projectId: string) => manuscriptPath(projectId);
const draftField = (fileId: string) => `file:${fileId}`;

interface DraftValue {
  text: string;
  baseHash?: string;
  path: string;
}

function parseDraft(raw: string | undefined): DraftValue | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<DraftValue>;
    return typeof value.text === 'string' ? { text: value.text, baseHash: value.baseHash, path: value.path ?? '' } : undefined;
  } catch {
    return undefined;
  }
}

const dirty = (doc: Doc) => doc.kind === 'text' && doc.status === 'ready' && doc.text !== doc.server;

export function ManuscriptProvider({ projectId, initialPath, children }: { projectId: string; initialPath?: string; children: ReactNode }) {
  const api = useApi();
  const shell = useShell();
  const navigate = useNavigate();
  const location = useLocation();
  const where = useRef(location);
  where.current = location;
  const autoOpened = useRef(false);
  const navigation = useNavigationData();
  const archived = navigation.project?.id === projectId && navigation.project.status === 'Archived';
  const ref = useRef<State>({
    manuscript: loading, files: loading, proposals: loading, bibliography: loading, builds: loading,
    docs: {}, tabs: [], rightPane: 'pdf', lastPane: 'pdf', tabletTab: 'editor', saving: false, wanted: initialPath || undefined,
  });
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  const drafts = useRef(new Map<string, ReturnType<typeof shell.drafts.register>>());
  const seq = useRef(0);
  const alive = useRef(true);

  const set = useCallback((patch: Partial<State> | ((state: State) => Partial<State>)) => {
    if (!alive.current) return;
    ref.current = { ...ref.current, ...(typeof patch === 'function' ? patch(ref.current) : patch) };
    bump();
  }, []);
  const setDoc = useCallback((fileId: string, patch: Partial<Doc> | ((doc: Doc) => Partial<Doc>)) => {
    set((state) => {
      const doc = state.docs[fileId];
      if (!doc) return {};
      return { docs: { ...state.docs, [fileId]: { ...doc, ...(typeof patch === 'function' ? patch(doc) : patch) } } };
    });
  }, [set]);

  const path = useMemo(() => ({ path: { projectId } }), [projectId]);

  const load = useCallback(async (part: Part) => {
    try {
      if (part === 'manuscript') {
        try {
          const { data } = await api.get('/projects/{projectId}/manuscript', path);
          set({ manuscript: ready(data) });
        } catch (error) {
          if (isApiError(error) && error.status === 404) set({ manuscript: ready(null), files: ready([]), proposals: ready([]), bibliography: ready([]), builds: ready([]) });
          else throw error;
        }
      } else if (part === 'files') {
        const { data } = await api.get('/projects/{projectId}/manuscript/files', path);
        set({ files: ready((data.items ?? []) as ManuscriptFile[]) });
      } else if (part === 'proposals') {
        const { data } = await api.get('/projects/{projectId}/manuscript/change-proposals', { ...path, query: { limit: 200 } });
        set({ proposals: ready((data.items ?? []) as Proposal[]) });
      } else if (part === 'bibliography') {
        const { data } = await api.get('/projects/{projectId}/manuscript/bibliography', path);
        set({ bibliography: ready((data.items ?? []) as BibliographyEntry[]) });
      } else {
        const { data } = await api.get('/projects/{projectId}/manuscript/builds', { ...path, query: { limit: 50 } });
        set({ builds: ready((data.items ?? []) as Build[]) });
      }
    } catch (error) {
      set({ [part]: failed(error) } as Partial<State>);
    }
  }, [api, path, set]);

  /** Loads the content of an open document (text, image or other binary) and offers its draft (H8). */
  const loadDoc = useCallback(async (file: ManuscriptFile) => {
    const kind: Doc['kind'] = isText(file) ? 'text' : isImage(file) ? 'image' : 'binary';
    const known = ref.current.docs[file.id];
    if (!known || known.status !== 'ready') {
      set((state) => ({ docs: { ...state.docs, [file.id]: { file, kind, status: 'loading', server: '', text: '' } } }));
    }
    if (kind === 'binary') {
      setDoc(file.id, { status: 'ready', baseHash: file.contentHash });
      return;
    }
    try {
      const content = await fileContent(api, projectId, file);
      if ('blob' in content) {
        const url = typeof URL.createObjectURL === 'function' && content.blob ? URL.createObjectURL(content.blob) : undefined;
        setDoc(file.id, { status: 'ready', baseHash: content.etag ?? file.contentHash, ...(url ? { imageUrl: url } : {}) });
        return;
      }
      const baseHash = content.etag ?? file.contentHash;
      let handle = drafts.current.get(file.id);
      if (!handle) {
        handle = shell.drafts.register(draftRoute(projectId), draftField(file.id));
        drafts.current.set(file.id, handle);
      }
      const latest = ref.current.docs[file.id];
      if (latest?.status === 'ready' && dirty(latest)) {
        // Typed while the new version loaded: keep the text, move the base (a later save meets H7).
        setDoc(file.id, { server: content.text, baseHash, file });
        return;
      }
      const saved = parseDraft(shell.drafts.get(draftRoute(projectId), draftField(file.id)) ?? handle.initial);
      const draft = saved && saved.text !== content.text ? { text: saved.text, stale: Boolean(saved.baseHash && saved.baseHash !== baseHash), baseHash: saved.baseHash } : undefined;
      setDoc(file.id, { status: 'ready', file, server: content.text, text: content.text, baseHash, ...(draft ? { draft } : { draft: undefined }) });
    } catch (error) {
      setDoc(file.id, { status: 'error', error: asApiError(error) });
    }
  }, [api, projectId, set, setDoc, shell.drafts]);

  /** After the file list changed: follow renames, reload clean documents whose server version changed (EC24). */
  const syncDocs = useCallback(() => {
    const files = dataOf(ref.current.files);
    if (!files) return;
    for (const doc of Object.values(ref.current.docs)) {
      const now = files.find((file) => file.id === doc.file.id);
      if (!now) {
        if (!dirty(doc)) set((state) => {
          const docs = { ...state.docs };
          delete docs[doc.file.id];
          const tabs = state.tabs.filter((id) => id !== doc.file.id);
          return { docs, tabs, active: state.active === doc.file.id ? tabs[0] : state.active };
        });
        continue;
      }
      if (now.path !== doc.file.path) setDoc(doc.file.id, { file: { ...doc.file, path: now.path, fileType: now.fileType } });
      if (doc.status === 'ready' && !dirty(doc) && now.contentHash !== doc.baseHash) void loadDoc(now);
    }
  }, [loadDoc, set, setDoc]);

  const reload = useCallback(async (parts: readonly Part[] = ALL_PARTS) => {
    await Promise.all(parts.map((part) => load(part)));
    if (parts.includes('files')) syncDocs();
  }, [load, syncDocs]);

  useEffect(() => {
    alive.current = true;
    void reload();
    const handles = drafts.current;
    return () => {
      alive.current = false;
      for (const handle of handles.values()) handle.release();
      handles.clear();
    };
  }, [reload]);

  const openFile = useCallback((idOrPath: string, options: { line?: number } = {}) => {
    const files = dataOf(ref.current.files) ?? [];
    const file = files.find((row) => row.id === idOrPath) ?? files.find((row) => row.path === idOrPath);
    if (!file) {
      if (ref.current.files.status === 'loading') set({ wanted: idOrPath });
      return;
    }
    if (!ref.current.docs[file.id]) void loadDoc(file);
    seq.current += 1;
    set((state) => ({
      tabs: state.tabs.includes(file.id) ? state.tabs : [...state.tabs, file.id],
      active: file.id,
      tabletTab: 'editor',
      wanted: undefined,
      ...(options.line ? { cursor: { fileId: file.id, line: options.line, seq: seq.current } } : {}),
    }));
    const { pathname, search } = where.current;
    const target = `${manuscriptPath(projectId)}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
    if (pathname !== target) navigate(`${target}${search}`, { replace: true });
  }, [loadDoc, navigate, projectId, set]);

  // Open the deep-linked file, or the main file, once the list is there (H11).
  useEffect(() => {
    const state = ref.current;
    const files = dataOf(state.files);
    const manuscript = dataOf(state.manuscript);
    if (!files || !manuscript || state.tabs.length || autoOpened.current) return;
    const wanted = state.wanted && files.find((file) => file.path === state.wanted) ? state.wanted : manuscript.mainFile;
    if (files.some((file) => file.path === wanted)) {
      autoOpened.current = true;
      openFile(wanted);
    }
  }, [version, openFile]);

  const closeTab = useCallback((fileId: string) => {
    set((state) => {
      const index = state.tabs.indexOf(fileId);
      const tabs = state.tabs.filter((id) => id !== fileId);
      return { tabs, active: state.active === fileId ? tabs[Math.max(0, index - 1)] : state.active };
    });
  }, [set]);

  const writeDraft = useCallback((doc: Doc) => {
    const handle = drafts.current.get(doc.file.id);
    if (!handle) return;
    if (dirty(doc)) handle.update(JSON.stringify({ text: doc.text, baseHash: doc.baseHash, path: doc.file.path } satisfies DraftValue));
    else handle.clear();
  }, []);

  const setText = useCallback((fileId: string, text: string) => {
    const doc = ref.current.docs[fileId];
    if (!doc || doc.text === text) return;
    setDoc(fileId, { text });
    writeDraft({ ...doc, text });
  }, [setDoc, writeDraft]);

  const discard = useCallback((fileId: string) => {
    const doc = ref.current.docs[fileId];
    if (!doc) return;
    setDoc(fileId, { text: doc.server, conflict: undefined });
    drafts.current.get(fileId)?.clear();
  }, [setDoc]);

  const restoreDraft = useCallback((fileId: string) => {
    const doc = ref.current.docs[fileId];
    if (!doc?.draft) return;
    // A draft made on an older version keeps that base, so saving meets the conflict of EC19 (EC22).
    const next = { ...doc, text: doc.draft.text, draft: undefined, ...(doc.draft.stale && doc.draft.baseHash ? { baseHash: doc.draft.baseHash } : {}) };
    setDoc(fileId, next);
    writeDraft(next);
  }, [setDoc, writeDraft]);

  const dropDraft = useCallback((fileId: string) => {
    drafts.current.get(fileId)?.clear();
    setDoc(fileId, { draft: undefined });
  }, [setDoc]);

  /** Which dirty documents changed on the server since their base; marks them with a conflict (H7, EC19). */
  const findConflicts = useCallback(async (docs: Doc[]): Promise<boolean> => {
    const files = dataOf(ref.current.files) ?? [];
    let any = false;
    let revisions: Revision[] | undefined;
    for (const doc of docs) {
      const now = files.find((file) => file.id === doc.file.id && file.path === doc.file.path);
      if (now && now.contentHash === doc.baseHash) continue;
      any = true;
      if (!now) {
        setDoc(doc.file.id, { conflict: { serverText: '', gone: true } });
        continue;
      }
      try {
        revisions ??= ((await api.get('/projects/{projectId}/manuscript/revisions', { ...path, query: { limit: 50 } })).data.items ?? []) as Revision[];
      } catch {
        revisions = [];
      }
      const last = revisions.find((revision) => revision.changes.some((change) => change.path === now.path || change.newPath === now.path));
      let serverText = '';
      try {
        const content = await fileContent(api, projectId, now);
        serverText = 'text' in content ? content.text ?? '' : '';
      } catch {
        // The conflict box still offers to keep my version.
      }
      setDoc(doc.file.id, { conflict: { serverText, serverHash: now.contentHash, ...(last ? { revisionNumber: last.revisionNumber, actor: last.createdBy } : {}) } });
    }
    return any;
  }, [api, path, projectId, setDoc]);

  const afterCommit = useCallback(async (sent: Record<string, string>) => {
    for (const [fileId, text] of Object.entries(sent)) setDoc(fileId, { server: text, conflict: undefined });
    await reload(['manuscript', 'files', 'proposals', 'bibliography']);
    const files = dataOf(ref.current.files) ?? [];
    for (const fileId of Object.keys(sent)) {
      const now = files.find((file) => file.id === fileId);
      const doc = ref.current.docs[fileId];
      if (now) setDoc(fileId, { baseHash: now.contentHash, file: { ...(doc?.file ?? now), path: now.path, contentHash: now.contentHash } });
      const after = ref.current.docs[fileId];
      if (after) writeDraft(after);
    }
  }, [reload, setDoc, writeDraft]);

  const save = useCallback(async (): Promise<SaveOutcome> => {
    const docs = Object.values(ref.current.docs).filter(dirty);
    if (!docs.length) return 'nothing';
    if (archived || ref.current.saving) return 'blocked';
    set({ saving: true, saveError: undefined });
    try {
      if (await findConflicts(docs)) return 'conflict';
      for (let attempt = 0; ; attempt += 1) {
        const manuscript = dataOf(ref.current.manuscript);
        const current = Object.values(ref.current.docs).filter(dirty).filter((doc) => !doc.conflict);
        if (!manuscript || !current.length) return 'nothing';
        const sent = Object.fromEntries(current.map((doc) => [doc.file.id, doc.text]));
        try {
          await shell.idempotency.run(`commitManuscriptChanges:${projectId}`, (key) => api.post('/projects/{projectId}/manuscript/revisions', {
            ...path, idempotencyKey: key,
            body: { baseRevisionId: manuscript.currentRevisionId, changes: current.map((doc) => ({ path: doc.file.path, operation: 'modify' as const, content: doc.text, ...(doc.baseHash ? { beforeHash: doc.baseHash } : {}) })) },
          }));
          await afterCommit(sent);
          return 'saved';
        } catch (error) {
          const code = isApiError(error) ? error.code : undefined;
          if (code === 'base_revision_mismatch' && attempt === 0) {
            // Another revision came first (e.g. System regenerated references.bib): resend once if my files did not change (EC18).
            await reload(['manuscript', 'files']);
            if (await findConflicts(current)) return 'conflict';
            continue;
          }
          if (code === 'project_archived') void reload();
          set({ saveError: asApiError(error) });
          return 'error';
        }
      }
    } finally {
      set({ saving: false });
    }
  }, [afterCommit, api, archived, findConflicts, path, projectId, reload, set, shell.idempotency]);

  const keepMine = useCallback((fileId: string) => {
    const doc = ref.current.docs[fileId];
    if (!doc?.conflict) return;
    // My text now replaces the server version: its base becomes the server's current version.
    const next = { ...doc, server: doc.conflict.gone ? doc.server : doc.conflict.serverText, baseHash: doc.conflict.serverHash ?? doc.baseHash, conflict: undefined };
    setDoc(fileId, next);
    writeDraft(next);
  }, [setDoc, writeDraft]);

  const useServer = useCallback((fileId: string) => {
    const doc = ref.current.docs[fileId];
    if (!doc?.conflict) return;
    const next = { ...doc, server: doc.conflict.serverText, text: doc.conflict.serverText, baseHash: doc.conflict.serverHash ?? doc.baseHash, conflict: undefined };
    setDoc(fileId, next);
    writeDraft(next);
  }, [setDoc, writeDraft]);

  const commit = useCallback(async (changes: FileChange[], options: { message?: string; retry?: (files: ManuscriptFile[]) => FileChange[] | null } = {}) => {
    let body = changes;
    for (let attempt = 0; ; attempt += 1) {
      const manuscript = dataOf(ref.current.manuscript);
      if (!manuscript) throw asApiError(undefined);
      try {
        const { data } = await shell.idempotency.run(`commitManuscriptChanges:${projectId}`, (key) => api.post('/projects/{projectId}/manuscript/revisions', {
          ...path, idempotencyKey: key, body: { baseRevisionId: manuscript.currentRevisionId, changes: body, ...(options.message ? { message: options.message } : {}) },
        }));
        await reload(['manuscript', 'files', 'proposals', 'bibliography']);
        return data;
      } catch (error) {
        if (isApiError(error) && error.code === 'base_revision_mismatch' && attempt === 0 && options.retry) {
          await reload(['manuscript', 'files']);
          const next = options.retry(dataOf(ref.current.files) ?? []);
          if (next) {
            body = next;
            continue;
          }
        }
        if (isApiError(error) && error.code === 'project_archived') void reload();
        throw error;
      }
    }
  }, [api, path, projectId, reload, shell.idempotency]);

  const refresh = useCallback(() => reload(), [reload]);

  const build = useCallback(async () => {
    if (archived) return undefined;
    if (Object.values(ref.current.docs).some(dirty)) {
      // Build PDF saves first; a failed or conflicting save builds nothing (H6, EC44).
      const outcome = await save();
      if (outcome !== 'saved' && outcome !== 'nothing') return undefined;
    }
    const manuscript = dataOf(ref.current.manuscript);
    if (!manuscript) return undefined;
    try {
      const { data } = await api.post('/projects/{projectId}/manuscript/builds', { ...path, body: { revisionId: manuscript.currentRevisionId } });
      await reload(['builds', 'manuscript']);
      return data;
    } catch (error) {
      if (isApiError(error) && error.code === 'project_archived') void reload();
      set({ saveError: asApiError(error) });
      return undefined;
    }
  }, [api, archived, path, reload, save, set]);

  const init = useCallback(async (mode: Manuscript['initMode']) => {
    try {
      await shell.idempotency.run(`initManuscript:${projectId}`, (key) => api.post('/projects/{projectId}/manuscript', { ...path, idempotencyKey: key, body: { initMode: mode, compiler: 'pdflatex' } }));
    } catch (error) {
      // Created meanwhile in another tab: show the existing manuscript, no red error (MS-INIT-001-AC03, EC02).
      if (!(isApiError(error) && error.status === 409 && error.code !== 'project_archived')) throw error;
    }
    set({ tabs: [], active: undefined, docs: {} });
    autoOpened.current = false;
    await reload();
  }, [api, path, projectId, reload, set, shell.idempotency]);

  useEvents({ types: ['manuscript.object_status_changed'], projectId }, (event) => {
    if (event.objectType === 'revision') void reload(['manuscript', 'files', 'bibliography']);
    else if (event.objectType === 'change_proposal') void reload(['proposals']);
    else if (event.objectType === 'build') void reload(['builds', 'manuscript']);
  });
  useStreamSignal(() => {
    void reload();
  });

  const value = useMemo<ManuscriptContextValue>(() => {
    const state = ref.current;
    const docs = Object.values(state.docs);
    return {
      ...state,
      projectId,
      archived,
      fileList: dataOf(state.files) ?? [],
      dirtyDocs: docs.filter(dirty),
      isDirty: (target: string) => docs.some((doc) => doc.file.path === target && dirty(doc)),
      reload, openFile, closeTab, setText, discard, restoreDraft, dropDraft, keepMine, useServer, save, commit, refresh, build, init,
      setRightPane: (pane) => set((current) => ({ rightPane: pane, lastPane: pane ?? current.lastPane })),
      setTabletTab: (tab) => set({ tabletTab: tab }),
      clearSaveError: () => set({ saveError: undefined }),
    };
    // `version` changes on every state update.
  }, [version, archived, projectId, reload, openFile, closeTab, setText, discard, restoreDraft, dropDraft, keepMine, useServer, save, commit, refresh, build, init, set]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Latest build, and the latest one with a PDF (H17). */
export function useBuilds() {
  const { builds, manuscript } = useManuscript();
  const rows = dataOf(builds) ?? [];
  const latest = rows[0] ?? dataOf(manuscript)?.latestBuild;
  const withPdf = rows.find((build) => build.status === 'Succeeded' && build.hasPdf !== false);
  return { latest, withPdf, rows };
}
