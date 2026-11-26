// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// LaTeX editor of the Manuscript screen (PID-00115 S04, H22): CodeMirror 6 with the stex mode, one EditorState per
// open file (undo survives tab switches), Ctrl/Cmd+S, “go to line”, Change Proposal boxes as block widgets rendered
// by React portals (H11), citation marks (S05) and a citation suggestion list drawn by React so it can show an
// empty state with a link (EC29) and be driven by keyboard.

import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { Compartment, EditorSelection, EditorState, Prec, RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, highlightActiveLine, keymap, lineNumbers, WidgetType, type DecorationSet } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { citeKeys } from '../model';
import type { CursorRequest } from '../state';

export interface EditorBlock {
  /** Stable key (e.g. `proposal:<id>:<path>`). */
  key: string;
  /** Line after which the block sits; 0 = before the first line. */
  afterLine: number;
  render: () => ReactNode;
}

export type CiteState = 'ok' | 'unresolved' | 'revoked';

export interface CitationSupport {
  /** State of a cited key (marks of UX-MS-005 and MS-BIB-001). */
  stateOf: (key: string) => CiteState;
  /** Tooltip body of a marked key. */
  tooltip: (key: string) => ReactNode;
  /** Suggestion list for a typed prefix (UX-MS-001); `empty` replaces the list when there is nothing to suggest. */
  suggest: (prefix: string) => { options: CiteOption[]; empty?: ReactNode };
  /** Chosen option → key to insert (adds a bibliography entry first when needed); null inserts nothing. */
  pick: (option: CiteOption) => Promise<string | null>;
}

export interface CiteOption {
  key: string;
  label: string;
  detail?: string;
  /** Trusted Reference without entry yet: choosing it calls addBibliographyEntry (EC28). */
  needsEntry?: boolean;
}

export interface EditorProps {
  fileId: string;
  path: string;
  text: string;
  readOnly: boolean;
  label: string;
  onChange: (text: string) => void;
  onSave: () => void;
  cursor?: CursorRequest;
  blocks?: readonly EditorBlock[];
  citations?: CitationSupport;
  citationListLabel: string;
}

const latex = StreamLanguage.define(stex);

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--sires-brand)' },
  { tag: tags.tagName, color: 'var(--sires-brand)' },
  { tag: tags.comment, color: 'var(--sires-muted)', fontStyle: 'italic' },
  { tag: tags.bracket, color: 'var(--sires-muted)' },
  { tag: tags.atom, color: 'var(--sires-info, var(--sires-brand))' },
  { tag: tags.string, color: 'var(--sires-success)' },
  { tag: tags.number, color: 'var(--sires-warning)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: 'var(--sires-surface)', color: 'var(--sires-ink)' },
  '.cm-scroller': { fontFamily: 'var(--sires-font-mono)', lineHeight: '1.7' },
  '.cm-gutters': { backgroundColor: 'var(--sires-surface)', color: 'var(--sires-muted)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--sires-ground)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--sires-ground)' },
  '&.cm-focused': { outline: '2px solid var(--sires-focus, var(--sires-brand))', outlineOffset: '-2px' },
  '.cm-content': { caretColor: 'var(--sires-ink)' },
});

// ---- Citation marks (S05) ---------------------------------------------------------------------------------------

const setCiteInfo = StateEffect.define<CitationSupport['stateOf'] | null>();

const citeInfo = StateField.define<CitationSupport['stateOf'] | null>({
  create: () => null,
  update: (value, tr) => tr.effects.reduce((current, effect) => (effect.is(setCiteInfo) ? effect.value : current), value),
});

function citeDecorations(state: EditorState): DecorationSet {
  const stateOf = state.field(citeInfo);
  const builder = new RangeSetBuilder<Decoration>();
  if (!stateOf) return builder.finish();
  for (const cite of citeKeys(state.doc.toString())) {
    const kind = stateOf(cite.key);
    builder.add(cite.from, cite.to, Decoration.mark({ class: `ms-cite ms-cite--${kind}`, attributes: { 'data-cite': kind, 'data-key': cite.key } }));
  }
  return builder.finish();
}

const citeMarks = StateField.define<DecorationSet>({
  create: citeDecorations,
  update: (value, tr) => (tr.docChanged || tr.effects.some((effect) => effect.is(setCiteInfo)) ? citeDecorations(tr.state) : value),
  provide: (field) => EditorView.decorations.from(field),
});

// ---- Proposal blocks (S06) --------------------------------------------------------------------------------------

class PortalWidget extends WidgetType {
  constructor(readonly key: string, readonly container: HTMLElement) {
    super();
  }
  eq(other: PortalWidget) {
    return other.key === this.key && other.container === this.container;
  }
  toDOM() {
    return this.container;
  }
  ignoreEvent() {
    return true;
  }
}

const setBlocks = StateEffect.define<{ key: string; afterLine: number; container: HTMLElement }[]>();

const blockField = StateField.define<{ list: { key: string; afterLine: number; container: HTMLElement }[]; set: DecorationSet }>({
  create: () => ({ list: [], set: Decoration.none }),
  update(value, tr) {
    let list = value.list;
    for (const effect of tr.effects) if (effect.is(setBlocks)) list = effect.value;
    if (list === value.list && !tr.docChanged) return value;
    const builder = new RangeSetBuilder<Decoration>();
    const lines = tr.state.doc.lines;
    const placed = list
      .map((block) => {
        const line = Math.min(Math.max(block.afterLine, 0), lines);
        return { ...block, pos: line === 0 ? 0 : tr.state.doc.line(line).to, side: line === 0 ? -1 : 1 };
      })
      .sort((a, b) => a.pos - b.pos || a.side - b.side);
    for (const block of placed) builder.add(block.pos, block.pos, Decoration.widget({ widget: new PortalWidget(block.key, block.container), block: true, side: block.side }));
    return { list, set: builder.finish() };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.set),
});

// ---- Editor --------------------------------------------------------------------------------------------------------

/** Prefix of a citation being typed before the cursor: `\cite{lew` → `lew`, its start offset. */
function citePrefix(state: EditorState): { prefix: string; from: number } | null {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const before = line.text.slice(0, head - line.from);
  const match = /\\(?:cite|citep|citet|citeauthor|citeyear|citealp|citealt|nocite)\*?(?:\[[^\]]*\]){0,2}\{([^}]*)$/.exec(before);
  if (!match) return null;
  const inside = match[1]!;
  const part = inside.slice(inside.lastIndexOf(',') + 1);
  const prefix = part.trimStart();
  return { prefix, from: head - prefix.length };
}

function citeAt(state: EditorState, pos: number): string | undefined {
  const line = state.doc.lineAt(pos);
  const found = citeKeys(line.text).find((cite) => pos - line.from >= cite.from && pos - line.from <= cite.to);
  return found?.key;
}

interface Popup {
  prefix: string;
  from: number;
  index: number;
}

export function Editor(props: EditorProps) {
  const { fileId, text, readOnly, label, cursor, blocks, citations } = props;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const current = useRef(fileId);
  const latest = useRef(props);
  latest.current = props;
  const editable = useRef(new Compartment());
  const containers = useRef(new Map<string, HTMLElement>());
  const [, rerender] = useState(0);
  const [popup, setPopup] = useState<Popup | null>(null);
  const popupRef = useRef(popup);
  popupRef.current = popup;
  const [tip, setTip] = useState<{ key: string; left: number; top: number } | null>(null);
  const tipRef = useRef(tip);
  tipRef.current = tip;
  const [busy, setBusy] = useState(false);

  const extensions = (): Extension[] => [
    lineNumbers(),
    history(),
    highlightActiveLine(),
    latex,
    syntaxHighlighting(highlight),
    theme,
    EditorView.lineWrapping,
    citeInfo,
    citeMarks,
    blockField,
    editable.current.of([EditorState.readOnly.of(latest.current.readOnly), EditorView.editable.of(!latest.current.readOnly)]),
    EditorView.contentAttributes.of({ 'aria-label': latest.current.label, 'aria-multiline': 'true' }),
    Prec.highest(keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => { latest.current.onSave(); return true; } },
      { key: 'ArrowDown', run: () => movePopup(1) },
      { key: 'ArrowUp', run: () => movePopup(-1) },
      { key: 'Enter', run: () => choosePopup() },
      { key: 'Tab', run: () => choosePopup() },
      { key: 'Escape', run: () => closeOverlays() },
    ])),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && current.current === latest.current.fileId) latest.current.onChange(update.state.doc.toString());
      if (update.docChanged || update.selectionSet) {
        const found = latest.current.citations && !latest.current.readOnly ? citePrefix(update.state) : null;
        setPopup((open) => (found ? { prefix: found.prefix, from: found.from, index: open && open.from === found.from ? open.index : 0 } : null));
        // Focus on a marked key shows its tooltip, as hover does (UX-MS-005-AC01, EC55).
        const key = citeAt(update.state, update.state.selection.main.head);
        const kind = key && latest.current.citations?.stateOf(key);
        if (key && kind && kind !== 'ok') showTip(key, update.state.selection.main.head);
        else if (update.selectionSet) setTip((open) => (open?.key && key === open.key ? open : null));
      }
    }),
    EditorView.domEventHandlers({
      mouseover: (event) => {
        const mark = (event.target as HTMLElement | null)?.closest?.('[data-cite]') as HTMLElement | null;
        if (mark && mark.dataset.cite !== 'ok' && mark.dataset.key) showTip(mark.dataset.key, undefined, mark);
        return false;
      },
    }),
  ];

  function showTip(key: string, pos?: number, element?: HTMLElement) {
    const wrapper = host.current?.parentElement;
    let left = 0;
    let top = 0;
    try {
      const box = wrapper?.getBoundingClientRect();
      const rect = element?.getBoundingClientRect() ?? (pos !== undefined ? view.current?.coordsAtPos(pos) : null);
      if (box && rect) {
        left = Math.max(0, rect.left - box.left);
        top = rect.bottom - box.top + 4;
      }
    } catch {
      // No layout (tests): the tooltip sits at the top of the editor.
    }
    setTip({ key, left, top });
  }

  function closeOverlays(): boolean {
    if (popupRef.current || tipRef.current) {
      setPopup(null);
      setTip(null);
      return true;
    }
    return false;
  }

  function options() {
    const open = popupRef.current;
    return open && latest.current.citations ? latest.current.citations.suggest(open.prefix) : { options: [] };
  }

  function movePopup(step: number): boolean {
    const open = popupRef.current;
    if (!open) return false;
    const count = options().options.length;
    if (!count) return true;
    setPopup({ ...open, index: (open.index + step + count) % count });
    return true;
  }

  function choosePopup(index?: number): boolean {
    const open = popupRef.current;
    if (!open) return false;
    const option = options().options[index ?? open.index];
    if (!option) {
      setPopup(null);
      return false;
    }
    void insert(option, open);
    return true;
  }

  async function insert(option: CiteOption, open: Popup) {
    const support = latest.current.citations;
    const editor = view.current;
    if (!support || !editor) return;
    setBusy(true);
    try {
      const key = await support.pick(option);
      if (!key || view.current !== editor) return;
      const head = editor.state.selection.main.head;
      editor.dispatch({ changes: { from: open.from, to: head, insert: key }, selection: EditorSelection.cursor(open.from + key.length) });
      setPopup(null);
      editor.focus();
    } finally {
      setBusy(false);
    }
  }

  // Create the view once.
  useLayoutEffect(() => {
    if (!host.current) return undefined;
    const state = EditorState.create({ doc: latest.current.text, extensions: extensions() });
    const editor = new EditorView({ state, parent: host.current });
    view.current = editor;
    states.current.set(latest.current.fileId, state);
    return () => {
      editor.destroy();
      view.current = null;
    };
    // The view lives as long as the editor pane.
  }, []);

  // Switch documents: keep each file's state (undo history, selection).
  useLayoutEffect(() => {
    const editor = view.current;
    if (!editor || current.current === fileId) return;
    states.current.set(current.current, editor.state);
    current.current = fileId;
    const cached = states.current.get(fileId);
    editor.setState(cached && cached.doc.toString() === text ? cached : EditorState.create({ doc: text, extensions: extensions() }));
    setPopup(null);
    setTip(null);
  }, [fileId, text]);

  // Text changed outside the editor (restore draft, use server version, reload).
  useEffect(() => {
    const editor = view.current;
    if (!editor || current.current !== fileId) return;
    const now = editor.state.doc.toString();
    if (now !== text) editor.dispatch({ changes: { from: 0, to: now.length, insert: text } });
  }, [fileId, text]);

  useEffect(() => {
    view.current?.dispatch({ effects: editable.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]) });
  }, [readOnly, fileId]);

  useEffect(() => {
    view.current?.dispatch({ effects: setCiteInfo.of(citations ? citations.stateOf : null) });
  }, [citations, fileId]);

  // Proposal boxes: one DOM container per block key, filled by a React portal.
  useEffect(() => {
    const list = (blocks ?? []).map((block) => {
      let container = containers.current.get(block.key);
      if (!container) {
        container = document.createElement('div');
        container.className = 'ms-block';
        containers.current.set(block.key, container);
      }
      return { key: block.key, afterLine: block.afterLine, container };
    });
    for (const key of [...containers.current.keys()]) if (!list.some((block) => block.key === key)) containers.current.delete(key);
    view.current?.dispatch({ effects: setBlocks.of(list) });
    rerender((x) => x + 1);
  }, [blocks, fileId]);

  // Go to line (build log “Đi tới”, outline, history).
  useEffect(() => {
    const editor = view.current;
    if (!editor || !cursor || cursor.fileId !== fileId) return;
    const line = editor.state.doc.line(Math.min(Math.max(1, cursor.line), editor.state.doc.lines));
    editor.dispatch({ selection: EditorSelection.cursor(line.from), effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
    editor.focus();
  }, [cursor?.seq, cursor, fileId]);

  const list = popup && citations ? citations.suggest(popup.prefix) : null;
  const listId = `ms-cite-list-${fileId}`;

  return (
    <div className="ms-editor" onMouseLeave={() => setTip(null)}>
      <div ref={host} className="ms-editor__host" data-file={props.path} />
      {(blocks ?? []).map((block) => {
        const container = containers.current.get(block.key);
        return container ? createPortal(block.render(), container, block.key) : null;
      })}
      {tip && citations && (
        <div className="ms-cite-tip" role="tooltip" style={{ left: tip.left, top: tip.top }}>
          {citations.tooltip(tip.key)}
        </div>
      )}
      {list && (
        <div className="ms-cite-pop" aria-busy={busy || undefined}>
          {list.options.length ? (
            <ul role="listbox" id={listId} aria-label={props.citationListLabel} className="ms-cite-pop__list">
              {list.options.map((option, index) => (
                <li
                  key={option.key}
                  role="option"
                  aria-selected={index === popup!.index}
                  className="ms-cite-pop__item"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choosePopup(index);
                  }}
                >
                  <span className="sires-id">{option.label}</span>
                  {option.detail && <span className="ms-cite-pop__detail">{option.detail}</span>}
                </li>
              ))}
            </ul>
          ) : (
            list.empty ?? null
          )}
        </div>
      )}
    </div>
  );
}

/** The CodeMirror view inside an element (tests, and the outline that moves the cursor). */
export function viewOf(element: Element): EditorView | null {
  const dom = element.querySelector('.cm-editor');
  return dom ? EditorView.findFromDOM(dom as HTMLElement) : null;
}
