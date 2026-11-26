// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Test helpers of the manuscript area (PID-00115): the shell on the mock server with this area's stateful mocks,
// a fake viewport width (H4, H21), the CodeMirror view of the open file, and overrides of the operations other
// areas own (H3: listProjectReferences, getTask, getClaim, listConversations, createConversation, sendMessage).

import { screen, waitFor, within } from '@testing-library/react';
import type { EditorView } from '@codemirror/view';
import { renderShell, waitForFrame } from '../../../shell/test/render';
import { FetchStub } from '../../../shell/test/stub';
import { mockFetch, type MockServer } from '../../../shell/mock/node';
import type { Overrides } from '../../../shell/mock/types';
import { viewOf } from '../editor/Editor';
import { demoProjectReferences, RAG, WRITING_TASK } from './fixtures';
import { finishBuilds, setManuscriptEventSink, testStore } from './store';
// The route loads the screen lazily (own chunk); tests load it up front so the first render does not wait on it.
import '../ManuscriptScreen';

// jsdom has no layout: CodeMirror measures ranges when it scrolls to a line (go to line, outline, banners).
if (typeof Range !== 'undefined') {
  const empty = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Range.prototype.getClientRects ??= empty;
  Range.prototype.getBoundingClientRect ??= () => ({ x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect;
}

export const projectPath = (projectId = RAG, rest = '') => `/projects/${projectId}/manuscript${rest}`;

/** The shell at `path` with the real fetch going to the mock server (this area's mocks and the fallback). */
export function renderManuscript(path = projectPath()) {
  const stub = new FetchStub();
  Object.defineProperty(stub, 'fetch', { value: mockFetch });
  return renderShell({ path, stub });
}

/** Opens the screen and waits until the editor shows the given file (main.tex by default). */
export async function openManuscript(path = projectPath(), file = 'main.tex') {
  const view = renderManuscript(path);
  await waitForFrame();
  await screen.findByRole('textbox', { name: new RegExp(`${file.replace(/[.]/g, '\\.')}$`) }, { timeout: 4000 });
  return view;
}

/** Events the store emits reach the shell's stream, as the backend's would (H19). */
export function wireEvents(mock: MockServer): void {
  setManuscriptEventSink((event) => mock.events.emit(event));
}

export function stopEvents(): void {
  setManuscriptEventSink(undefined);
}

/** Fakes the viewport width for useLayout (desktop ≥1280, tablet 768–1279, phone <768); returns the restore. */
export function viewport(width: number): () => void {
  const original = window.matchMedia;
  const matches = (query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query);
    const min = /min-width:\s*(\d+)px/.exec(query);
    if (max && width > Number(max[1])) return false;
    if (min && width < Number(min[1])) return false;
    return Boolean(max || min);
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: matches(query), media: query, onchange: null,
      addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
    }),
  });
  return () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: original });
  };
}

/** CodeMirror view of the editor on screen. */
export function editorView(): EditorView {
  const region = screen.getByRole('region', { name: /^(Soạn thảo|Editor)$/ });
  const view = viewOf(region);
  if (!view) throw new Error('No editor on screen');
  return view;
}

/** Replaces the whole text of the open file, as typing would. */
export function typeInEditor(text: string): void {
  const view = editorView();
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}

/** Inserts text at a position (end by default) and puts the cursor after it. */
export function insertInEditor(text: string, at?: number): void {
  const view = editorView();
  const pos = at ?? view.state.doc.length;
  view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } });
}

/** Puts the cursor at the first occurrence of `needle` (+ offset). */
export function cursorAt(needle: string, offset = 0): void {
  const view = editorView();
  const index = view.state.doc.toString().indexOf(needle);
  if (index < 0) throw new Error(`“${needle}” is not in the editor`);
  view.dispatch({ selection: { anchor: index + offset } });
  view.focus();
}

export const editorText = () => editorView().state.doc.toString();

/** Waits for the editor to show `file`. */
export async function waitForFile(file: string) {
  await screen.findByRole('textbox', { name: new RegExp(`${file.replace(/[.]/g, '\\.')}$`) });
}

/** Overrides of operations other areas own, with the demo data of this area (H3). */
export function otherAreas(extra: Overrides = {}): Overrides {
  return {
    listProjectReferences: () => ({ status: 200, body: { items: demoProjectReferences() } }),
    getTask: ({ generated, params }) => {
      const body = generated(200);
      return { status: 200, body: { ...body, id: params.taskId, stableKey: params.taskId === WRITING_TASK ? 'T-2.1' : body.stableKey } as typeof body };
    },
    ...extra,
  };
}

/** Moves builds of the test store forward (Queued → Running → Succeeded/Failed). */
export function completeBuilds(): void {
  finishBuilds(testStore());
}

export const main = () => within(screen.getByRole('main'));

export async function settle(): Promise<void> {
  await waitFor(() => undefined);
}
